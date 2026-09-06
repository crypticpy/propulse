import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const STATION_POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres@sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518";
const CONTEXT = "desktop-linux";
const PURPOSE = "propulse-station-postgres-test";
const BIN = 'bin_dir=$(dirname "$(readlink -f /nix/var/nix/profiles/default/bin/postgres)"); export PATH="$bin_dir:$PATH";';
// Deliberately select ownership/isolation fields, never image/container environment values.
const INSPECT_FORMAT = '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"image":{{json .Config.Image}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"user":{{json .Config.User}},"capDrop":{{json .HostConfig.CapDrop}},"securityOpt":{{json .HostConfig.SecurityOpt}}}';

export function parseStationPostgresArgs(args) {
  const files = [];
  let confirmed = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--confirm-disposable-station-postgres") confirmed = true;
    else if (arg === "--migration" || arg === "--fixture") {
      const path = args[++index];
      assert.ok(path && !path.startsWith("--"), `${arg} requires one explicit SQL file`);
      files.push({ kind: arg.slice(2), path });
    } else throw new Error(`Unsupported argument: ${arg}`);
  }
  assert.ok(confirmed, "Pass --confirm-disposable-station-postgres to create one disposable PostgreSQL container");
  return { files };
}

export async function readStationSqlFiles(root, files) {
  const checkout = await realpath(root);
  return Promise.all(files.map(async ({ kind, path }) => {
    const resolved = await realpath(isAbsolute(path) ? path : join(checkout, path));
    const local = relative(checkout, resolved);
    assert.ok(local && !isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`), "SQL files must resolve inside this checkout");
    assert.match(basename(resolved), /^(?:\d{14}[_-])?station(?:_workbench|-workbench)(?:[_-][a-z0-9][a-z0-9_-]*)?\.sql$/i, "Supply a station_workbench or station-workbench SQL file (optional 14-digit timestamp prefix), never another station namespace or the complete migration directory");
    const info = await stat(resolved);
    assert.ok(info.isFile() && info.size <= 16 * 1024 * 1024, "SQL input must be a regular file of at most 16 MiB");
    const sql = await readFile(resolved, "utf8");
    // A deliberately restricted pure-SQL subset, not a partial psql lexer.
    // Reject even backslashes in comments/literals so embedded/multiline meta
    // commands cannot override ON_ERROR_STOP, include files, or exit early.
    assert.ok(!sql.includes("\\"), `${local}: selected files must be pure SQL without backslashes; psql meta commands are unsupported (use SQL chr(92) for a literal backslash)`);
    assert.ok(!sql.includes("\0"), `${local}: SQL input must not contain NUL bytes`);
    return { kind, path: local, sql };
  }));
}

export function verifyStationContainer(metadata, identity) {
  assert.match(identity.id, /^[a-f0-9]{64}$/);
  assert.equal(metadata.id, identity.id, "Container ID changed");
  assert.equal(metadata.name, `/${identity.name}`, "Container name changed");
  assert.equal(metadata.labels?.["org.propulse.test.purpose"], PURPOSE, "Container purpose mismatch");
  assert.equal(metadata.labels?.["org.propulse.test.run-id"], identity.runId, "Container ownership mismatch");
  assert.equal(metadata.image, STATION_POSTGRES_IMAGE, "Unexpected PostgreSQL image");
  assert.equal(metadata.network, "none", "Test container must have no network");
  assert.deepEqual(metadata.mounts, [], "Test container must have no volumes or mounts");
  assert.equal(Object.keys(metadata.ports ?? {}).length, 0, "Test container must not publish ports");
  assert.equal(metadata.user, "100:101");
  assert.ok(metadata.capDrop?.includes("ALL"));
  assert.ok(metadata.securityOpt?.some((option) => option === "no-new-privileges" || option === "no-new-privileges:true"));
}

export function stationContainerCreateArgs(identity, cidfile) {
  return ["create", "--pull", "never", "--name", identity.name, "--cidfile", cidfile,
    "--label", `org.propulse.test.purpose=${PURPOSE}`, "--label", `org.propulse.test.run-id=${identity.runId}`,
    "--network", "none", "--user", "100:101", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--entrypoint", "/bin/sh", STATION_POSTGRES_IMAGE,
    "-ec", `${BIN}
      initdb -D /tmp/station-pg -U postgres --locale=C -E UTF8 --auth-local=trust --auth-host=reject
      exec postgres -D /tmp/station-pg -c listen_addresses='' -c unix_socket_directories=/tmp \
        -c shared_preload_libraries='' -c cron.launch_active_jobs=off -c wal_level=logical \
        -c shared_buffers=64MB -c max_connections=20`];
}

function dockerCommand(args, { input, timeout = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["--context", CONTEXT, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let failure;
    const timer = setTimeout(() => {
      failure = new Error(`Docker ${args[0]} timed out`);
      child.kill("SIGKILL");
    }, timeout);
    const collect = (stream, chunk) => {
      if (stream === "stdout") stdout += chunk;
      else stderr += chunk;
      if (stdout.length + stderr.length > 2 * 1024 * 1024) {
        failure = new Error("Docker output exceeded the harness limit");
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.stdin.on("error", () => { /* Early command exits are reported by close. */ });
    child.on("error", (error) => { failure = error; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure ?? Object.assign(new Error(`Docker ${args[0]} failed (${code}): ${stderr.trim()}`), { exitCode: code, stderr: stderr.trim() }));
      else resolve(stdout.trim());
    });
    child.stdin.end(input);
  });
}

/** Only creates, inspects, executes in, and removes the exact container created here.
 * Each selected file's remaining transaction is committed before its completion
 * check. Fixtures must explicitly ROLLBACK their own transient test changes. */
export async function runStationPostgresHarness({ root, files = [], log = console.log, command = dockerCommand }) {
  const docker = command;
  // Resolve/detach every explicitly selected file before touching Docker.
  const selected = await readStationSqlFiles(root, files);
  const runId = randomUUID();
  const identity = { runId, name: `${PURPOSE}-${runId}`, id: "" };
  const scratch = await mkdtemp(join(tmpdir(), `${PURPOSE}-`));
  const cidfile = join(scratch, "container-id");
  const diagnostic = join(scratch, "ownership.json");
  let createAttempted = false;
  let interrupted;
  const onSignal = (signal) => { interrupted ??= new Error(`Interrupted by ${signal}; removing owned test container`); };
  const onInt = () => onSignal("SIGINT");
  const onTerm = () => onSignal("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  const checkSignal = () => { if (interrupted) throw interrupted; };
  const verify = async () => verifyStationContainer(JSON.parse(await docker(["inspect", "--type", "container", "--format", INSPECT_FORMAT, identity.id])), identity);
  const sql = async (body) => {
    checkSignal();
    await verify();
    const completion = `station_harness_completed_${randomUUID()}`;
    const output = await docker(["exec", "-i", identity.id, "/bin/sh", "-ec", `${BIN} exec psql -X -qAt -v ON_ERROR_STOP=1 -h /tmp -U postgres -d postgres -f -`], {
      input: `${body}\n;\nSELECT '${completion}';\n`,
    });
    assert.equal(output.split(/\r?\n/).at(-1), completion, "SQL session did not acknowledge completion; refusing to report PASS");
  };
  const markerCheck = `DO $$ BEGIN
    IF (SELECT run_id FROM station_harness.ownership) IS DISTINCT FROM '${runId}' THEN
      RAISE EXCEPTION 'Station harness ownership marker mismatch';
    END IF;
  END $$;`;
  let completed = false;
  try {
    await writeFile(diagnostic, JSON.stringify({ ...identity, context: CONTEXT, image: STATION_POSTGRES_IMAGE, purpose: PURPOSE }));
    checkSignal();
    createAttempted = true;
    identity.id = await docker(stationContainerCreateArgs(identity, cidfile));
    assert.equal((await readFile(cidfile, "utf8")).trim(), identity.id, "Docker create/cidfile mismatch");
    await verify();
    checkSignal();
    log(`Created owned container ${identity.id} (${identity.name}); network=none, ports=none, mounts=none`);
    await docker(["start", identity.id]);
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      checkSignal();
      try {
        await docker(["exec", identity.id, "/bin/sh", "-ec", `${BIN} exec pg_isready -q -h /tmp -U postgres -d postgres`], { timeout: 5_000 });
        ready = true;
        break;
      } catch {
        await delay(250);
      }
    }
    assert.ok(ready, "Owned PostgreSQL container did not become ready");
    // Apply only the pinned image's initial role/extension and auth bootstrap.
    // Full image migrations, GoTrue migrations and Storage bootstrap are excluded.
    await sql(`CREATE ROLE supabase_admin LOGIN SUPERUSER;
      \\i /docker-entrypoint-initdb.d/init-scripts/00000000000000-initial-schema.sql
      \\i /docker-entrypoint-initdb.d/init-scripts/00000000000001-auth-schema.sql
      CREATE SCHEMA station_harness;
      REVOKE ALL ON SCHEMA station_harness FROM PUBLIC, anon, authenticated, service_role;
      CREATE TABLE station_harness.ownership (run_id text PRIMARY KEY);
      INSERT INTO station_harness.ownership VALUES ('${runId}');`);
    await sql(`${markerCheck}
      DO $$ BEGIN
        IF current_setting('server_version_num')::integer / 10000 <> 17 THEN RAISE EXCEPTION 'Expected PostgreSQL 17'; END IF;
        IF current_setting('listen_addresses') <> '' OR current_setting('shared_preload_libraries') <> ''
          OR current_setting('cron.launch_active_jobs') <> 'off' THEN RAISE EXCEPTION 'Unexpected server isolation'; END IF;
        IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_admin','supabase_auth_admin')) <> 5
          THEN RAISE EXCEPTION 'Auth roles missing'; END IF;
        IF to_regclass('auth.users') IS NULL THEN RAISE EXCEPTION 'Auth users table missing'; END IF;
      END $$;
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
      DO $$ BEGIN
        IF auth.uid() IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'auth.uid mismatch'; END IF;
      END $$;
      ROLLBACK;`);
    log("PASS PostgreSQL 17, isolated settings, initial auth roles/schema, authenticated auth.uid() singular claim");
    for (const file of selected) {
      // Both ownership checks and the completion sentinel execute in this file's
      // session. Commit a remaining transaction so successful work cannot be
      // silently rolled back on disconnect; transient fixtures must ROLLBACK.
      await sql(`${markerCheck}\n${file.sql}\n;\nCOMMIT;\n${markerCheck}`);
      log(`PASS ${file.kind}: ${file.path}`);
    }
    checkSignal();
    completed = true;
  } finally {
    try {
      // A timed-out create may have written its CID before the client failed.
      if (!identity.id) {
        try { identity.id = (await readFile(cidfile, "utf8")).trim(); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!identity.id && createAttempted) {
        // The daemon may have created the container before the client wrote a
        // CID. Inspect only this run's exact UUID name; never enumerate others.
        let metadata;
        try {
          metadata = JSON.parse(await docker(["inspect", "--type", "container", "--format", INSPECT_FORMAT, identity.name]));
        } catch (error) {
          const notFound = error.exitCode === 1 && [
            `Error: No such object: ${identity.name}`,
            `Error response from daemon: No such container: ${identity.name}`,
          ].includes(error.stderr);
          // Daemon, permission, timeout and malformed-output errors are not
          // evidence of absence. Keep the diagnostic rather than claim cleanup.
          if (!notFound) throw error;
        }
        if (metadata !== undefined) {
          const recovered = { ...identity, id: metadata?.id };
          verifyStationContainer(metadata, recovered);
          identity.id = recovered.id;
          await writeFile(cidfile, identity.id);
        }
      }
      if (identity.id) {
        await verify();
        await docker(["rm", "--force", identity.id]);
        log(`Removed owned container ${identity.id}`);
      }
      await rm(scratch, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Owned-container cleanup failed; ownership diagnostic retained at ${diagnostic} (CID path ${cidfile}): ${error.message}`, { cause: error });
    } finally {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    }
  }
  if (interrupted) throw interrupted;
  return { completed, containerId: identity.id, files: selected.map(({ kind, path }) => ({ kind, path })) };
}
