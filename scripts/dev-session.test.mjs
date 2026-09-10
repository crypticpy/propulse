import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNoRunningServer,
  assertSharedServerIdentity,
  claimSession,
  filterViteProcessLines,
  findUnmanagedViteProcesses,
  listSessions,
  parseOptions,
  portAvailable,
  refuseIfServerRunning,
  releaseSession,
  SHARED_PORT,
  startSession,
} from "./dev-session.mjs";

async function registry(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-session-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function listener(t, host = "127.0.0.1") {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  t.after(() => server.close());
  return server;
}

async function unusedPort(t) {
  const server = await listener(t);
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Spawns a real, harmless node process whose command line contains
// `relativeBinPath` (never binding any port), then captures its REAL line
// out of the live `ps -axo pid=,command=` output — not a hand-typed string —
// for use as a filterViteProcessLines fixture. Kills the process afterward.
async function captureRealProcessLine(t, relativeBinPath) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-ps-fixture-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binPath = path.join(dir, relativeBinPath);
  await mkdir(path.dirname(binPath), { recursive: true });
  await writeFile(binPath, "setTimeout(() => {}, 4000);\n");
  const child = spawn(process.execPath, [binPath], { stdio: "ignore" });
  t.after(() => {
    try {
      child.kill();
    } catch {
      // already exited
    }
  });
  let line = null;
  for (let attempt = 0; attempt < 40 && !line; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const out = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
    });
    line = out
      .split("\n")
      .find((candidate) => candidate.trim().startsWith(`${child.pid} `));
  }
  // Left alive (killed only by the t.after above): callers may want to
  // query the real process table for this pid again after this returns.
  assert.ok(line, `did not observe pid ${child.pid} in real ps output`);
  return line;
}

const base = {
  owner: "agent-one",
  task: "map-check",
  profile: "local",
  root: "/test/checkout",
};

test("simultaneous agents cannot claim the same port", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const claims = await Promise.allSettled([
    claimSession({ ...base, registry: dir, ports: [port] }),
    claimSession({ ...base, owner: "agent-two", registry: dir, ports: [port] }),
  ]);
  assert.equal(
    claims.filter((claim) => claim.status === "fulfilled").length,
    1,
  );
  assert.equal(claims.filter((claim) => claim.status === "rejected").length, 1);
  assert.equal((await listSessions(dir)).length, 1);
});

test("unmanaged IPv4 listeners survive refused claims", async (t) => {
  const dir = await registry(t);
  const server = await listener(t);
  const port = server.address().port;
  await assert.rejects(
    claimSession({ ...base, registry: dir, ports: [port] }),
    /No requested port/,
  );
  assert.equal(server.listening, true);
  assert.deepEqual(await listSessions(dir), []);
});

test("IPv6 localhost also makes a port unavailable", async (t) => {
  let server;
  try {
    server = await listener(t, "::1");
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code))
      return t.skip("IPv6 unavailable");
    throw error;
  }
  assert.equal(await portAvailable(server.address().port), false);
  assert.equal(server.listening, true);
});

test("allocation skips an occupied port and release is identity guarded", async (t) => {
  const dir = await registry(t);
  const occupied = await listener(t);
  const free = await unusedPort(t);
  const claim = await claimSession({
    ...base,
    registry: dir,
    ports: [occupied.address().port, free],
  });
  assert.equal(claim.port, free);
  assert.equal(claim.root, base.root);
  await releaseSession({ ...claim, id: "another-agent" });
  assert.equal(JSON.parse(await readFile(claim.filename, "utf8")).id, claim.id);
  await releaseSession(claim);
  assert.deepEqual(await listSessions(dir), []);
});

test("a partial/unparsable record is listed but never automatically taken over", async (t) => {
  // Unlike a confirmed-dead-pid claim (see "claimSession reclaims a dead-pid
  // claim" above), an unparsable file is ambiguous — it may be another
  // process mid-write — and claimSession must never reclaim it.
  const dir = await registry(t);
  const port = await unusedPort(t);
  const filename = path.join(dir, `${port}.json`);
  await writeFile(filename, "{");
  assert.equal(
    (await listSessions(dir))[0].processState,
    "unreadable-or-being-created-do-not-reclaim",
  );
  await assert.rejects(
    claimSession({ ...base, registry: dir, ports: [port] }),
    /No requested port/,
  );
});

test("options validate ownership, profiles and strict numeric ports", () => {
  assert.equal(parseOptions([]).command, "status");
  assert.equal(
    parseOptions(["start", "--owner", "hamclock", "--task", "UI review"])
      .profile,
    "connected",
  );
  for (const port of ["5173;exit", "1", "65536", "5.5"]) {
    assert.throws(
      () =>
        parseOptions([
          "start",
          "--owner",
          "test",
          "--task",
          "test",
          "--port",
          port,
        ]),
      /Port/,
    );
  }
  assert.throws(() => parseOptions(["start"]), /requires/);
  assert.throws(
    () => parseOptions(["start", "--profile", "production"]),
    /Profile/,
  );
});

test("start defaults to the shared port and rejects any other port", (t) => {
  assert.equal(
    parseOptions(["start", "--owner", "agent", "--task", "check"]).port,
    SHARED_PORT,
  );
  assert.throws(
    () =>
      parseOptions([
        "start",
        "--owner",
        "agent",
        "--task",
        "check",
        "--port",
        "5180",
      ]),
    /Only port 5173 is allowed/,
  );
  const priorFlag = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (priorFlag === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = priorFlag;
  });
  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  assert.equal(
    parseOptions([
      "start",
      "--owner",
      "agent",
      "--task",
      "check",
      "--port",
      "5180",
    ]).port,
    5180,
  );
});

test("assertNoRunningServer refuses when a live session is registered", async (t) => {
  const dir = await registry(t);
  await assert.doesNotReject(assertNoRunningServer(dir));

  const claim = await claimSession({ ...base, registry: dir });
  await assert.rejects(
    assertNoRunningServer(dir),
    /A dev server is already running: owner=agent-one task=map-check.*One dev server per machine\. Use http:\/\/localhost:5173 \(shared\)/s,
  );
  await releaseSession(claim);
  await assert.doesNotReject(assertNoRunningServer(dir));
});

test("claimSession reclaims a dead-pid claim and retries once", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const filename = path.join(dir, `${port}.json`);
  await writeFile(filename, JSON.stringify({ ...base, pid: 0, port }));
  assert.equal(
    (await listSessions(dir))[0].processState,
    "stale-check-before-removing",
  );
  const claim = await claimSession({ ...base, registry: dir, ports: [port] });
  assert.equal(claim.port, port);
  assert.equal(claim.pid, process.pid);
  assert.equal((await listSessions(dir)).length, 1);
});

// Codex P1 (825n): GNU procps `pgrep -l` prints only the process NAME
// ("node"), never the full command, so a path/args-based filter over it can
// never see "vite". Switching detection to `ps -axo pid=,command=` (same
// full-command-line shape on macOS and Linux) fixes that; these fixtures are
// REAL lines captured from real spawned processes, not hand-typed strings.
test("filterViteProcessLines keeps a real vite-path process and drops a real vitest-path process", async (t) => {
  const [vitestLine, viteLine] = await Promise.all([
    captureRealProcessLine(t, path.join("node_modules", ".bin", "vitest")),
    captureRealProcessLine(t, path.join("node_modules", ".bin", "vite")),
  ]);
  const stdout = [vitestLine, viteLine].join("\n");
  const result = filterViteProcessLines(stdout, { ownPid: -1 });
  assert.deepEqual(result, [viteLine]);
});

// Integration-level check that the real detection path (ps, not the old
// pgrep -fl) actually finds a real vite-looking process end to end: pgrep's
// `-l` output column is name-only on some builds even combined with `-f`
// (the exact GNU-procps defect in 825n), so exercising the real function
// against a real process — not just the pure filter — is the fix that
// matters.
test("findUnmanagedViteProcesses detects a real vite process through the real ps command", async (t) => {
  const line = await captureRealProcessLine(
    t,
    path.join("node_modules", ".bin", "vite"),
  );
  const pid = Number(line.trim().split(/\s+/, 1)[0]);
  const result = findUnmanagedViteProcesses();
  assert.ok(
    result.some((entry) => entry.pid === pid),
    `expected pid ${pid} among ${JSON.stringify(result)}`,
  );
});

test("filterViteProcessLines excludes its own pid", () => {
  const stdout = "42 node /repo/node_modules/.bin/vite";
  assert.deepEqual(filterViteProcessLines(stdout, { ownPid: 42 }), []);
  assert.equal(filterViteProcessLines(stdout, { ownPid: 43 }).length, 1);
});

// Codex P1 (825p... 825t naming aside — this is the 825n follow-up): an
// unmanaged vite-looking process must refuse start, not just warn, even when
// it's listening on a different port than the one being requested.
test("refuseIfServerRunning refuses when an unmanaged vite process is found, even on a different port", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const findUnmanaged = () => [
    {
      pid: 999999,
      command: "node /some/other/checkout/node_modules/.bin/vite --port 5180",
      port: 5180,
    },
  ];
  await assert.rejects(
    refuseIfServerRunning({ registry: dir, port, findUnmanaged }),
    /already running.*pid=999999 port=5180/s,
  );
});

test("refuseIfServerRunning passes through when no unmanaged process is found", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  await assert.doesNotReject(
    refuseIfServerRunning({ registry: dir, port, findUnmanaged: () => [] }),
  );
});

// Codex P1 (9zJ3): the identity check must also refuse a shared server
// running the wrong profile, not just the wrong worktree — a `connected` or
// `manual` server would pass the root check and then fail every test at
// AuthGate instead of the local bypass Playwright's --profile local asks for.
test("assertSharedServerIdentity accepts a matching root and profile", () => {
  assert.doesNotThrow(() =>
    assertSharedServerIdentity(
      { root: "/repo/checkout", profile: "local" },
      { root: "/repo/checkout" },
    ),
  );
});

test("assertSharedServerIdentity refuses a non-local profile, naming both profiles", () => {
  assert.throws(
    () =>
      assertSharedServerIdentity(
        { root: "/repo/checkout", profile: "connected" },
        { root: "/repo/checkout" },
      ),
    /"connected".*"local"/s,
  );
});

test("assertSharedServerIdentity refuses a mismatched root even with the right profile", () => {
  assert.throws(
    () =>
      assertSharedServerIdentity(
        { root: "/other/checkout", profile: "local" },
        { root: "/repo/checkout" },
      ),
    /different tree/,
  );
});

// Codex P2 (825t..., then 9zKC): claimants racing to reclaim the same
// dead-pid claim must never let more than one win it. The reclaim decision
// (stale? unlink, then create) is a critical section serialized per port by
// an exclusive `mkdir` lock directory; a losing claimant blocks on the lock
// (or the earlier `open(..., "wx")`) and re-reads fresh state rather than
// racing a rename against the winner. Run several times: this is exactly
// the kind of race that passes most of the time by luck.
for (let run = 0; run < 10; run++) {
  test(`three racing claimants on one stale record: exactly one wins (run ${run})`, async (t) => {
    const dir = await registry(t);
    const port = await unusedPort(t);
    const filename = path.join(dir, `${port}.json`);
    await writeFile(filename, JSON.stringify({ ...base, pid: 0, port }));
    const claims = await Promise.allSettled([
      claimSession({ ...base, owner: "agent-one", registry: dir, ports: [port] }),
      claimSession({ ...base, owner: "agent-two", registry: dir, ports: [port] }),
      claimSession({ ...base, owner: "agent-three", registry: dir, ports: [port] }),
    ]);
    const fulfilled = claims.filter((claim) => claim.status === "fulfilled");
    const rejected = claims.filter((claim) => claim.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 2);
    for (const claim of rejected) {
      assert.match(claim.reason.message, /No requested port/);
    }
    const sessions = await listSessions(dir);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].pid, process.pid);
    const leftover = (await readdir(dir)).filter(
      (name) => name.includes(".stale-") || name.endsWith(".lock"),
    );
    assert.deepEqual(leftover, []);
  });
}

test("an abandoned reclaim lock dir is cleared rather than blocking forever", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const filename = path.join(dir, `${port}.json`);
  await writeFile(filename, JSON.stringify({ ...base, pid: 0, port }));
  const lockPath = `${filename}.lock`;
  await mkdir(lockPath);
  // Back-date the lock dir well past the 10s abandoned-lock threshold.
  const old = new Date(Date.now() - 60_000);
  await utimes(lockPath, old, old);
  const session = await claimSession({ ...base, registry: dir, ports: [port] });
  assert.equal(session.port, port);
  const leftover = (await readdir(dir)).filter((name) => name.endsWith(".lock"));
  assert.deepEqual(leftover, []);
});

test("a held reclaim lock makes a second claimant wait rather than proceed", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const filename = path.join(dir, `${port}.json`);
  await writeFile(filename, JSON.stringify({ ...base, pid: 0, port }));
  const lockPath = `${filename}.lock`;
  await mkdir(lockPath);
  const claimPromise = claimSession({ ...base, registry: dir, ports: [port] });
  // Give the claim attempt time to hit the held lock and start retrying,
  // then release it — the claimant must still succeed, proving it waited
  // rather than tripping over the lock directory as if it were the claim.
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rm(lockPath, { recursive: true, force: true });
  const session = await claimPromise;
  assert.equal(session.port, port);
});

// F10(a): startSession must thread { registry } through to the guard and
// refuse — with a message matching /already running/ — before it ever
// imports vite. Uses a throwaway port (never 5173) so this never touches a
// real shared server.
test("startSession accepts { registry } and rejects an already-claimed port before importing vite", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  await claimSession({ ...base, registry: dir, ports: [port] });
  await assert.rejects(
    startSession({ ...base, registry: dir, port }),
    /already running/,
  );
});
