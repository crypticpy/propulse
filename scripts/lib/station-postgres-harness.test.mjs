import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parseStationPostgresArgs, readStationSqlFiles, runStationPostgresHarness, STATION_POSTGRES_IMAGE, verifyStationContainer } from "./station-postgres-harness.mjs";

test("requires explicit disposable confirmation and individual station SQL paths", () => {
  assert.throws(() => parseStationPostgresArgs([]), /confirm-disposable/);
  assert.throws(() => parseStationPostgresArgs(["--all-migrations"]), /Unsupported/);
  assert.throws(() => parseStationPostgresArgs(["--confirm-disposable-station-postgres", "--fixture"]), /explicit SQL/);
  assert.deepEqual(parseStationPostgresArgs(["--confirm-disposable-station-postgres", "--migration", "station-a.sql", "--fixture", "station-b.sql"]).files,
    [{ kind: "migration", path: "station-a.sql" }, { kind: "fixture", path: "station-b.sql" }]);
});

test("rejects outside-checkout symlinks, directories, unrelated migrations before Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-input-"));
  try {
    const checkout = join(root, "checkout");
    await mkdir(checkout);
    await writeFile(join(root, "station-outside.sql"), "select 1;");
    await symlink(join(root, "station-outside.sql"), join(checkout, "station-link.sql"));
    await writeFile(join(checkout, "legacy.sql"), "select 1;");
    await mkdir(join(checkout, "station-directory.sql"));
    let calls = 0;
    for (const path of ["station-link.sql", "../station-outside.sql", "legacy.sql", "station-directory.sql"]) {
      await assert.rejects(runStationPostgresHarness({ root: checkout, files: [{ kind: "fixture", path }], command: async () => { calls += 1; } }));
    }
    assert.equal(calls, 0);
    await writeFile(join(checkout, "station-good.sql"), "select '🚀';");
    assert.deepEqual(await readStationSqlFiles(checkout, [{ kind: "fixture", path: "station-good.sql" }]), [{ kind: "fixture", path: "station-good.sql", sql: "select '🚀';" }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fakeDocker({ failCreate = false, failSql = false, signal = false, tamperCleanup = false, completion = "valid" } = {}) {
  const calls = [];
  let metadata;
  const command = async (args, options) => {
    calls.push({ args, options });
    if (args[0] === "create") {
      const get = (flag) => args[args.indexOf(flag) + 1];
      const labels = args.flatMap((arg, index) => arg === "--label" ? [args[index + 1].split("=")] : []);
      metadata = { id: "a".repeat(64), name: `/${get("--name")}`, labels: Object.fromEntries(labels), image: STATION_POSTGRES_IMAGE,
        network: get("--network"), ports: {}, mounts: [], user: get("--user"), capDrop: [get("--cap-drop")], securityOpt: [get("--security-opt")] };
      assert.equal(get("--pull"), "never");
      for (const prohibited of ["--volume", "-v", "--mount", "--publish", "-p", "--privileged"]) assert.ok(!args.includes(prohibited));
      await writeFile(get("--cidfile"), metadata.id);
      if (failCreate) throw new Error("synthetic create client failure");
      return metadata.id;
    }
    if (args[0] === "inspect") {
      assert.equal(args.at(-1), metadata.id);
      return JSON.stringify(metadata);
    }
    if (args[0] === "exec" && options?.input) {
      if (signal) process.emit("SIGTERM");
      if (tamperCleanup) metadata.labels = {};
      if (failSql) throw new Error("synthetic SQL failure");
      assert.match(args.at(-1), /psql -X -qAt -v ON_ERROR_STOP=1/);
      const sentinel = options.input.match(/SELECT '(station_harness_completed_[a-f0-9-]+)';\n$/)?.[1];
      assert.ok(sentinel, "Every SQL call must append a fresh completion sentinel");
      if (completion === "missing") return "SELECT 1";
      if (completion === "wrong") return "station_harness_completed_wrong";
      if (completion === "not-final") return `${sentinel}\ntrailing output`;
      return sentinel;
    }
    return "";
  };
  return { command, calls };
}

test("refuses container deletion after ownership mismatch and retains CID for diagnosis", async () => {
  const fake = fakeDocker({ failSql: true, tamperCleanup: true });
  try {
    await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: () => {} }), /cleanup failed.*Container purpose mismatch/);
    assert.equal(fake.calls.filter(({ args }) => args[0] === "rm").length, 0);
  } finally {
    const args = fake.calls.find(({ args }) => args[0] === "create").args;
    await rm(dirname(args[args.indexOf("--cidfile") + 1]), { recursive: true, force: true });
  }
});

test("executes only detached explicit SQL files in supplied order with marker checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-selected-"));
  try {
    await writeFile(join(root, "station-one.sql"), "SELECT 'explicit first';");
    await writeFile(join(root, "station-two.sql"), "SELECT 'explicit second';");
    await writeFile(join(root, "station-unselected.sql"), "SELECT 'must not run';");
    const fake = fakeDocker();
    await runStationPostgresHarness({ root, command: fake.command, log: () => {}, files: [
      { kind: "migration", path: "station-one.sql" }, { kind: "fixture", path: "station-two.sql" },
    ] });
    const sql = fake.calls.filter(({ options }) => options?.input).map(({ options }) => options.input);
    assert.equal(sql.length, 4); // Bootstrap, smoke, two explicit files with same-session checks.
    assert.match(sql[2], /ownership marker mismatch[\s\S]*explicit first[\s\S]*ownership marker mismatch[\s\S]*station_harness_completed_/);
    assert.match(sql[3], /ownership marker mismatch[\s\S]*explicit second[\s\S]*ownership marker mismatch[\s\S]*station_harness_completed_/);
    assert.ok(sql.every((body) => !body.includes("must not run")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("commits an open selected transaction before its ownership and completion checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-transaction-"));
  try {
    const source = "BEGIN; CREATE TABLE station_open_tx(id int);";
    await writeFile(join(root, "station-open-transaction.sql"), source);
    const fake = fakeDocker();
    await runStationPostgresHarness({ root, command: fake.command, log: () => {}, files: [
      { kind: "migration", path: "station-open-transaction.sql" },
    ] });
    const sql = fake.calls.find(({ options }) => options?.input?.includes(source)).options.input;
    const sourceEnd = sql.indexOf(source) + source.length;
    const commit = sql.indexOf("COMMIT;", sourceEnd);
    const postCheck = sql.indexOf("Station harness ownership marker mismatch", sourceEnd);
    const completion = sql.indexOf("SELECT 'station_harness_completed_", sourceEnd);
    assert.ok(commit > sourceEnd && postCheck > commit && completion > postCheck);
    assert.equal(sql.slice(sourceEnd, commit).trim(), ";");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects psql controls everywhere, NUL and literal backslashes before Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-pure-sql-"));
  try {
    let calls = 0;
    for (const sql of [
      "\\quit 0\nSELECT 1/0;", "\\set ON_ERROR_STOP off\nSELECT 1/0;", "\\i station-hidden.sql",
      "SELECT 1; \\quit 0\nSELECT 1/0;", "-- heading\n \t\\set\nON_ERROR_STOP off\nSELECT 1/0;",
      "SELECT 'literal \\ slash';", "-- comment with \\quit\nSELECT 1;", "SELECT 1;\0SELECT 1/0;",
    ]) {
      await writeFile(join(root, "station-control.sql"), sql);
      await assert.rejects(runStationPostgresHarness({ root, files: [{ kind: "fixture", path: "station-control.sql" }], command: async () => { calls += 1; } }), /pure SQL without backslashes|NUL bytes/);
    }
    assert.equal(calls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const completion of ["missing", "wrong", "not-final"]) {
  test(`exit0 without valid final completion (${completion}) fails and cleans up`, async () => {
    const fake = fakeDocker({ completion });
    const messages = [];
    await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: (message) => messages.push(message) }), /did not acknowledge completion/);
    assert.ok(messages.every((message) => !message.startsWith("PASS")));
    assert.deepEqual(fake.calls.filter(({ args }) => args[0] === "rm").map(({ args }) => args), [["rm", "--force", "a".repeat(64)]]);
  });
}

for (const scenario of ["success", "create client failure", "SQL failure", "SIGTERM"]) {
  test(`removes only verified exact owned container after ${scenario}`, async () => {
    const fake = fakeDocker({ failCreate: scenario === "create client failure", failSql: scenario === "SQL failure", signal: scenario === "SIGTERM" });
    const run = runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: () => {} });
    if (scenario === "success") assert.equal((await run).completed, true);
    else await assert.rejects(run, /synthetic|Interrupted by SIGTERM/);
    const removals = fake.calls.filter(({ args }) => args[0] === "rm");
    assert.deepEqual(removals.map(({ args }) => args), [["rm", "--force", "a".repeat(64)]]);
    const removalIndex = fake.calls.indexOf(removals[0]);
    assert.equal(fake.calls[removalIndex - 1].args[0], "inspect");
    assert.equal(fake.calls.filter(({ args }) => args[0] === "create").length, 1);
    assert.ok(fake.calls.every(({ args }) => !["ps", "context", "stop", "kill", "prune"].includes(args[0])));
  });
}

test("ownership/isolation validator fails closed before destructive cleanup", () => {
  const identity = { id: "b".repeat(64), name: "propulse-station-postgres-test-test", runId: "uuid" };
  const metadata = { ...identity, name: `/${identity.name}`, labels: { "org.propulse.test.purpose": "propulse-station-postgres-test", "org.propulse.test.run-id": identity.runId },
    image: STATION_POSTGRES_IMAGE, network: "none", mounts: [], ports: {}, user: "100:101", capDrop: ["ALL"], securityOpt: ["no-new-privileges"] };
  verifyStationContainer(metadata, identity);
  for (const change of [{ id: "c".repeat(64) }, { name: "/existing-project" }, { labels: {} }, { network: "bridge" },
    { mounts: [{ Source: "/host" }] }, { ports: { "5432/tcp": [] } }, { image: "postgres:latest" }, { user: "root" }]) {
    assert.throws(() => verifyStationContainer({ ...metadata, ...change }, identity));
  }
});
