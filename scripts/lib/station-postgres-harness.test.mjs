import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parseStationPostgresArgs, readStationSqlFiles, runStationPostgresHarness, STATION_POSTGRES_IMAGE, verifyStationContainer } from "./station-postgres-harness.mjs";

test("requires explicit disposable confirmation and individual station SQL paths", () => {
  assert.throws(() => parseStationPostgresArgs([]), /confirm-disposable/);
  assert.throws(() => parseStationPostgresArgs(["--all-migrations"]), /Unsupported/);
  assert.throws(() => parseStationPostgresArgs(["--confirm-disposable-station-postgres", "--fixture"]), /explicit SQL/);
  assert.deepEqual(parseStationPostgresArgs(["--confirm-disposable-station-postgres", "--migration", "station-workbench-a.sql", "--fixture", "station-workbench-b.sql"]).files,
    [{ kind: "migration", path: "station-workbench-a.sql" }, { kind: "fixture", path: "station-workbench-b.sql" }]);
});

test("rejects outside-checkout symlinks, directories, unrelated migrations before Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-input-"));
  try {
    const checkout = join(root, "checkout");
    await mkdir(checkout);
    await writeFile(join(root, "station-workbench-outside.sql"), "select 1;");
    await symlink(join(root, "station-workbench-outside.sql"), join(checkout, "station-workbench-link.sql"));
    await writeFile(join(checkout, "legacy.sql"), "select 1;");
    await mkdir(join(checkout, "station-workbench-directory.sql"));
    let calls = 0;
    for (const path of ["station-workbench-link.sql", "../station-workbench-outside.sql", "legacy.sql", "station-workbench-directory.sql"]) {
      await assert.rejects(runStationPostgresHarness({ root: checkout, files: [{ kind: "fixture", path }], command: async () => { calls += 1; } }));
    }
    assert.equal(calls, 0);
    await writeFile(join(checkout, "station-workbench-good.sql"), "select '🚀';");
    assert.deepEqual(await readStationSqlFiles(checkout, [{ kind: "fixture", path: "station-workbench-good.sql" }]), [{ kind: "fixture", path: "station-workbench-good.sql", sql: "select '🚀';" }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("accepts only delimited workbench SQL names with an optional timestamp", async () => {
  const root = await mkdtemp(join(tmpdir(), "station-harness-names-"));
  try {
    const accepted = ["station_workbench.sql", "station-workbench.sql", "station_workbench_schema.sql",
      "station-workbench-fixture.sql", "20260905012345_station_workbench_schema.sql", "20260905012345-station-workbench-fixture.sql"];
    const rejected = ["20260716015000_stationcast_beta_telemetry_utc.sql", "stationcast.sql", "station.sql",
      "mystation_workbench.sql", "station_workbenchcast.sql", "station-workbenchcast.sql", "station_other.sql",
      "20260905_station_workbench.sql", "station_workbench.sql.bak"];
    let calls = 0;
    for (const path of [...accepted, ...rejected]) await writeFile(join(root, path), "SELECT 1;");
    for (const path of accepted) assert.equal((await readStationSqlFiles(root, [{ kind: "fixture", path }]))[0].path, path);
    for (const path of rejected) await assert.rejects(runStationPostgresHarness({ root,
      files: [{ kind: "migration", path }], command: async () => { calls += 1; },
    }), /station_workbench or station-workbench/);
    assert.equal(calls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fakeDocker({ failCreate = false, failSql = false, signal = false, tamperCleanup = false, completion = "valid", noCid = false, inspectFailure, recoverMismatch = false, delayedAppearance = false } = {}) {
  const calls = [];
  let metadata;
  let visible = !delayedAppearance;
  const command = async (args, options) => {
    calls.push({ args, options });
    if (args[0] === "create") {
      const get = (flag) => args[args.indexOf(flag) + 1];
      const labels = args.flatMap((arg, index) => arg === "--label" ? [args[index + 1].split("=")] : []);
      metadata = { id: "a".repeat(64), name: `/${get("--name")}`, labels: Object.fromEntries(labels), image: STATION_POSTGRES_IMAGE,
        network: get("--network"), ports: {}, mounts: [], user: get("--user"), capDrop: [get("--cap-drop")], securityOpt: [get("--security-opt")] };
      assert.equal(get("--pull"), "never");
      for (const prohibited of ["--volume", "-v", "--mount", "--publish", "-p", "--privileged"]) assert.ok(!args.includes(prohibited));
      if (!noCid) await writeFile(get("--cidfile"), metadata.id);
      if (failCreate) throw new Error(failCreate === "timeout" ? "Docker create timed out" : "synthetic create client failure");
      return metadata.id;
    }
    if (args[0] === "inspect") {
      if (args.at(-1) === metadata.name.slice(1)) {
        if (inspectFailure === "absent" || !visible) throw Object.assign(new Error("synthetic absent"), {
          exitCode: 1, stderr: `Error response from daemon: No such container: ${args.at(-1)}`,
        });
        if (inspectFailure) throw inspectFailure;
        return JSON.stringify(recoverMismatch ? { ...metadata, network: "bridge" } : metadata);
      }
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
  return { command, calls, completeCreate: () => { visible = true; } };
}

for (const failure of [true, "timeout"]) {
  test(`recovers a no-CID ambiguous create (${failure === true ? "client failure" : failure}) by exact UUID name, verifies, then removes by ID`, async () => {
    const fake = fakeDocker({ failCreate: failure, noCid: true });
    await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: () => {} }), /synthetic create client failure|Docker create timed out/);
    const create = fake.calls[0].args;
    const name = create[create.indexOf("--name") + 1];
    assert.match(name, /^propulse-station-postgres-test-[a-f0-9-]{36}$/);
    assert.deepEqual(fake.calls.map(({ args }) => [args[0], args.at(-1)]), [
      ["create", create.at(-1)], ["inspect", name], ["inspect", "a".repeat(64)], ["rm", "a".repeat(64)],
    ]);
    assert.equal(fake.calls[1].args[2], "container");
    await assert.rejects(readFile(create[create.indexOf("--cidfile") + 1]), { code: "ENOENT" });
  });
}

test("retains cleanup diagnostics when an exact name is absent after a no-CID create failure", async () => {
  const fake = fakeDocker({ failCreate: true, noCid: true, inspectFailure: "absent" });
  let scratch;
  try {
    await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: () => {} }), /cleanup failed.*Cleanup uncertain.*creation may still complete/);
    assert.deepEqual(fake.calls.map(({ args }) => args[0]), ["create", "inspect"]);
    const create = fake.calls[0].args;
    scratch = dirname(create[create.indexOf("--cidfile") + 1]);
    const diagnostic = JSON.parse(await readFile(join(scratch, "ownership.json"), "utf8"));
    assert.equal(diagnostic.name, create[create.indexOf("--name") + 1]);
  } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
});

test("retained ownership details identify a delayed container after the runner reports uncertain cleanup", async () => {
  const fake = fakeDocker({ failCreate: "timeout", noCid: true, delayedAppearance: true });
  const logs = [];
  let scratch;
  try {
    await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: (message) => logs.push(message) }), /cleanup failed.*Cleanup uncertain/);
    assert.deepEqual(fake.calls.map(({ args }) => args[0]), ["create", "inspect"]);
    assert.deepEqual(logs, []);
    const create = fake.calls[0].args;
    const cidfile = create[create.indexOf("--cidfile") + 1];
    scratch = dirname(cidfile);
    const diagnosticPath = join(scratch, "ownership.json");
    const saved = await readFile(diagnosticPath, "utf8");
    const diagnostic = JSON.parse(saved);
    assert.equal(diagnostic.name, create[create.indexOf("--name") + 1]);
    assert.equal(diagnostic.name, `${diagnostic.purpose}-${diagnostic.runId}`);
    assert.equal(diagnostic.image, STATION_POSTGRES_IMAGE);
    assert.equal(diagnostic.context, "desktop-linux");
    assert.equal(diagnostic.id, "");
    await assert.rejects(readFile(cidfile), { code: "ENOENT" });

    // Deterministically complete the simulated daemon create only after the
    // runner exits. Retained details allow an exact-name ownership check later.
    fake.completeCreate();
    const earlierInspect = fake.calls[1].args;
    assert.equal(earlierInspect.at(-1), diagnostic.name);
    const appeared = JSON.parse(await fake.command(earlierInspect));
    verifyStationContainer(appeared, { ...diagnostic, id: appeared.id });
    assert.equal(await readFile(diagnosticPath, "utf8"), saved);
    assert.ok(fake.calls.every(({ args }) => args[0] !== "rm"));
  } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
});

for (const scenario of ["inspection failure", "inspection timeout", "unproven absence", "ownership mismatch"]) {
  test(`retains no-CID ownership diagnostics and refuses cleanup on ${scenario}`, async () => {
    const inspectFailure = scenario === "inspection failure" ? Object.assign(new Error("daemon unavailable"), { exitCode: 1, stderr: "Cannot connect to daemon" })
      : scenario === "inspection timeout" ? new Error("Docker inspect timed out")
      : scenario === "unproven absence" ? Object.assign(new Error("not found elsewhere"), { exitCode: 1, stderr: "Error response from daemon: No such container: unrelated" })
      : undefined;
    const fake = fakeDocker({ failCreate: true, noCid: true, inspectFailure, recoverMismatch: scenario === "ownership mismatch" });
    let scratch;
    try {
      await assert.rejects(runStationPostgresHarness({ root: process.cwd(), command: fake.command, log: () => {} }), /cleanup failed; ownership diagnostic retained/);
      assert.deepEqual(fake.calls.map(({ args }) => args[0]), ["create", "inspect"]);
      const create = fake.calls[0].args;
      scratch = dirname(create[create.indexOf("--cidfile") + 1]);
      const diagnostic = JSON.parse(await readFile(join(scratch, "ownership.json"), "utf8"));
      assert.equal(diagnostic.name, create[create.indexOf("--name") + 1]);
      assert.equal(diagnostic.name, `${diagnostic.purpose}-${diagnostic.runId}`);
      assert.equal(diagnostic.image, STATION_POSTGRES_IMAGE);
      assert.equal(diagnostic.context, "desktop-linux");
      assert.equal(diagnostic.id, "");
    } finally { if (scratch) await rm(scratch, { recursive: true, force: true }); }
  });
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
    await writeFile(join(root, "station-workbench-one.sql"), "SELECT 'explicit first';");
    await writeFile(join(root, "station-workbench-two.sql"), "SELECT 'explicit second';");
    await writeFile(join(root, "station-workbench-unselected.sql"), "SELECT 'must not run';");
    const fake = fakeDocker();
    await runStationPostgresHarness({ root, command: fake.command, log: () => {}, files: [
      { kind: "migration", path: "station-workbench-one.sql" }, { kind: "fixture", path: "station-workbench-two.sql" },
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
    await writeFile(join(root, "station-workbench-open-transaction.sql"), source);
    const fake = fakeDocker();
    await runStationPostgresHarness({ root, command: fake.command, log: () => {}, files: [
      { kind: "migration", path: "station-workbench-open-transaction.sql" },
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
      "\\quit 0\nSELECT 1/0;", "\\set ON_ERROR_STOP off\nSELECT 1/0;", "\\i station-workbench-hidden.sql",
      "SELECT 1; \\quit 0\nSELECT 1/0;", "-- heading\n \t\\set\nON_ERROR_STOP off\nSELECT 1/0;",
      "SELECT 'literal \\ slash';", "-- comment with \\quit\nSELECT 1;", "SELECT 1;\0SELECT 1/0;",
    ]) {
      await writeFile(join(root, "station-workbench-control.sql"), sql);
      await assert.rejects(runStationPostgresHarness({ root, files: [{ kind: "fixture", path: "station-workbench-control.sql" }], command: async () => { calls += 1; } }), /pure SQL without backslashes|NUL bytes/);
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
