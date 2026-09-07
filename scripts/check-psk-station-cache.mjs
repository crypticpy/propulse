/** Disposable, network-disabled PostgreSQL check; never uses a configured database URL. */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
const exec = promisify(execFile);
assert.deepEqual(process.argv.slice(2), ["--confirm-disposable-psk-postgres"]);
const image = "public.ecr.aws/supabase/postgres@sha256:28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518";
const runId = randomUUID();
const name = `propulse-psk-test-${runId}`;
const scratch = await mkdtemp(join(tmpdir(), "propulse-psk-test-"));
const cidfile = join(scratch, "container-id");
const bin = 'bin_dir=$(dirname "$(readlink -f /nix/var/nix/profiles/default/bin/postgres)"); export PATH="$bin_dir:$PATH";';
const docker = async (args) => (await exec("docker", ["--context", "desktop-linux", ...args], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 })).stdout;
let id;
async function sql(text) {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["--context", "desktop-linux", "exec", "-i", id, "/bin/sh", "-ec", `${bin} exec psql -h /tmp -U postgres -v ON_ERROR_STOP=1 -qAt`], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = "";
    const timeout = globalThis.setTimeout(() => child.kill(), 30_000);
    child.stdout.on("data", b => { output += b; }); child.stderr.on("data", b => { error += b; });
    child.on("error", reject);
    child.on("close", code => { clearTimeout(timeout); if (code === 0) resolve(output); else reject(new Error(error || `psql exited ${code}`)); });
    child.stdin.end(text);
  });
}
try {
  await docker(["create", "--pull", "never", "--name", name, "--cidfile", cidfile,
    "--label", `org.propulse.test.run-id=${runId}`, "--label", "org.propulse.test.purpose=psk-station-cache",
    "--network", "none", "--user", "100:101", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
    "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--entrypoint", "/bin/sh", image, "-ec",
    `${bin} initdb -D /tmp/psk-pg -U postgres --locale=C -E UTF8 --auth-local=trust --auth-host=reject; exec postgres -D /tmp/psk-pg -c listen_addresses='' -c unix_socket_directories=/tmp -c shared_preload_libraries='' -c cron.launch_active_jobs=off -c shared_buffers=64MB -c max_connections=20`]);
  id = (await readFile(cidfile, "utf8")).trim(); assert.match(id, /^[a-f0-9]{64}$/);
  const metadata = JSON.parse(await docker(["inspect", id]))[0];
  assert.equal(metadata.Name, `/${name}`); assert.equal(metadata.Config.Labels["org.propulse.test.run-id"], runId);
  assert.equal(metadata.HostConfig.NetworkMode, "none"); assert.deepEqual(metadata.Mounts, []);
  assert.equal(Object.keys(metadata.HostConfig.PortBindings ?? {}).length, 0);
  await docker(["start", id]);
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try { await sql("SELECT 1;"); ready = true; break; } catch { await setTimeout(250); }
  }
  assert.ok(ready, "Owned PostgreSQL did not become ready");
  await sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await sql(await readFile(new URL("../supabase/migrations/20260907010000_psk_station_cache.sql", import.meta.url), "utf8"));
  await sql(await readFile(new URL("../supabase/tests/psk_station_cache.sql", import.meta.url), "utf8"));
  const claims = await Promise.all(Array.from({ length: 10 }, (_, n) => sql(`SELECT public.psk_station_claim('N${n}TEST');`)));
  assert.equal(claims.map(s => JSON.parse(s.trim())).filter(c => c.token !== null).length, 1, "Exactly one concurrent caller may start upstream");
  await sql(await readFile(new URL("../supabase/migrations/20260907010000_psk_station_cache.sql", import.meta.url), "utf8"));
  assert.equal(JSON.parse((await sql("SELECT public.psk_station_claim('W1AW');")).trim()).token, null, "Reapplying migration must preserve cooldown");
  console.log("PSK cache SQL: permissions, reuse, failure cooldown, fencing, capacity and 10-client concurrency passed.");
} finally {
  if (id) {
    const owned = (await docker(["inspect", "--format", '{{index .Config.Labels "org.propulse.test.run-id"}}', id])).trim();
    assert.equal(owned, runId, "Refusing cleanup of an unowned container");
    await docker(["rm", "-f", id]);
  }
  await rm(scratch, { recursive: true, force: true });
}
