import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
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
  acquireStartupLock,
  assertNoRunningServer,
  assertSharedServerIdentity,
  claimSession,
  filterViteProcessLines,
  findDisallowedForwardedArgs,
  findForwardedOverrideFlags,
  findUnmanagedViteProcesses,
  isViteExecutableCommand,
  listSessions,
  parseForwardedPort,
  parseOptions,
  portAvailable,
  refuseIfServerRunning,
  releaseSession,
  releaseStartupLock,
  runManagedVite,
  SHARED_PORT,
  startSession,
} from "./dev-session.mjs";

async function registry(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-session-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

// A throwaway path for the machine-wide startup lock, isolated per test so
// none of these ever touch the real STARTUP_LOCK_PATH (which a concurrently
// running real `dev:session start` on the same machine could be holding).
async function lockFile(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-lock-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "startup.lock");
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

// PR #894 round 6 P2: GNU/Linux `ps -axo pid=,command=` right-justifies the
// pid column (leading spaces), which stdout.trim() in filterViteProcessLines
// only strips from the very start/end of the whole blob, not per line — a
// raw single-line comparison against a captured ps line can pass on macOS
// (no padding) and fail on Linux. Comparing parsed {pid, command} pairs
// instead of raw line text is robust to that padding on both platforms.
function parsePidAndCommand(line) {
  const trimmed = line.trim();
  const firstSpace = trimmed.indexOf(" ");
  return {
    pid: Number(trimmed.slice(0, firstSpace)),
    command: trimmed.slice(firstSpace + 1),
  };
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
  assert.deepEqual(result.map(parsePidAndCommand), [
    parsePidAndCommand(viteLine),
  ]);
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
      claimSession({
        ...base,
        owner: "agent-one",
        registry: dir,
        ports: [port],
      }),
      claimSession({
        ...base,
        owner: "agent-two",
        registry: dir,
        ports: [port],
      }),
      claimSession({
        ...base,
        owner: "agent-three",
        registry: dir,
        ports: [port],
      }),
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
  const leftover = (await readdir(dir)).filter((name) =>
    name.endsWith(".lock"),
  );
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
    startSession({
      ...base,
      registry: dir,
      port,
      lockPath: await lockFile(t),
    }),
    /already running/,
  );
});

// PR #894 review thread: `\bvite\b` matched any command line containing the
// standalone word "vite" — including files/args that merely mention it, not
// an actual Vite invocation. isViteExecutableCommand restricts matching to
// real executable forms.
test("isViteExecutableCommand matches only real vite invocations, not lookalikes", () => {
  const positive = [
    "vite",
    "vite preview",
    "node node_modules/vite/bin/vite.js",
    "node node_modules/.bin/vite",
    "node node_modules/.bin/vite --port 5180",
    "/usr/local/bin/vite preview",
    "/usr/local/bin/vite",
    "npm exec vite",
    "npx vite",
  ];
  for (const command of positive) {
    assert.ok(isViteExecutableCommand(command), `expected match: ${command}`);
  }
  const negative = [
    "vim vite.config.ts",
    "tail -f vite.log",
    "vitest run",
    "grep vite package.json",
    "node scripts/dev-session.mjs guard",
    "",
  ];
  for (const command of negative) {
    assert.ok(
      !isViteExecutableCommand(command),
      `expected no match: ${command}`,
    );
  }
});

test("filterViteProcessLines matches only real vite invocations, not files or tools that merely mention vite", () => {
  const lines = [
    "100 vim vite.config.ts",
    "101 tail -f vite.log",
    "102 vitest run",
    "103 node node_modules/vite/bin/vite.js",
    "104 /usr/local/bin/vite preview",
    "105 grep vite package.json",
  ];
  const result = filterViteProcessLines(lines.join("\n"), { ownPid: -1 });
  assert.deepEqual(
    result.map((line) => Number(line.trim().split(/\s+/, 1)[0])),
    [103, 104],
  );
});

// PR #894 round 5 P1: the old pre-filter (`!/\bvitest\b/.test(line)`) dropped
// ANY line mentioning "vitest" as a substring, so a genuine vite process
// checked out under a "vitest"-containing path (e.g. a fixture app cloned to
// /tmp/vitest-app) was wrongly excluded. Classification must go through
// isViteExecutableCommand first, which looks only at the executable token.
test("filterViteProcessLines keeps a real vite executable even when its path contains the substring 'vitest'", async (t) => {
  const line = await captureRealProcessLine(
    t,
    path.join("vitest-fixture-app", "node_modules", ".bin", "vite"),
  );
  const result = filterViteProcessLines(line, { ownPid: -1 });
  assert.deepEqual(result.map(parsePidAndCommand), [parsePidAndCommand(line)]);
});

test("filterViteProcessLines excludes a real vitest invocation with a run argument", async (t) => {
  const line = await captureRealProcessLine(
    t,
    path.join("node_modules", ".bin", "vitest"),
  );
  const result = filterViteProcessLines(`${line} run`, { ownPid: -1 });
  assert.deepEqual(result, []);
});

test("filterViteProcessLines excludes node (vitest N) worker titles", () => {
  const stdout = "500 node (vitest 1)\n501 node (vitest 2)";
  assert.deepEqual(filterViteProcessLines(stdout, { ownPid: -1 }), []);
});

// PR #894 review thread: `npm run dev -- --port 5180` forwarded the override
// only to the underlying `vite` script, so predev guarded 5173 while Vite
// itself bound 5180. findForwardedOverrideFlags is the detector that lets
// runManagedVite refuse that instead of silently bypassing the guard.
test("findForwardedOverrideFlags catches port/host/strictPort overrides in every form", () => {
  const matching = [
    ["--port", "5180"],
    ["-p", "5180"],
    ["--port=5180"],
    ["--host"],
    ["--host=0.0.0.0"],
    ["--strictPort"],
    ["--strictPort", "false"],
  ];
  for (const args of matching) {
    assert.ok(
      findForwardedOverrideFlags(args).length > 0,
      `expected a match: ${JSON.stringify(args)}`,
    );
  }
  assert.deepEqual(findForwardedOverrideFlags(["--open"]), []);
  assert.deepEqual(findForwardedOverrideFlags([]), []);
});

// PR #894 round 4: an IPv6 --host value must not change how the override is
// detected or which port gets guarded — findForwardedOverrideFlags only
// looks at the flag token itself, and parseForwardedPort ignores --host
// entirely (it only ever extracts a port), so the equals and split forms of
// an IPv6 --host must behave identically to each other and to an IPv4 one.
test("an IPv6 --host value is detected identically in equals and split form, and never affects the parsed port", () => {
  const equalsForm = ["--host=::1", "--port=5180"];
  const splitForm = ["--host", "::1", "--port", "5180"];
  assert.equal(findForwardedOverrideFlags(equalsForm).length, 2);
  assert.equal(findForwardedOverrideFlags(splitForm).length, 2);
  assert.equal(parseForwardedPort(equalsForm), 5180);
  assert.equal(parseForwardedPort(splitForm), 5180);
});

// PR #894 round 6 P1: findForwardedOverrideFlags only recognized
// port/host/strictPort forms, so a forwarded --config, --root, --mode,
// --filter, or a bare positional root path could still reach the real vite
// binary and change which config/root Vite loads after the guard had
// already checked port 5173. findDisallowedForwardedArgs is an allowlist,
// not a bigger denylist, so an unrecognized flag is refused by default.
test("findDisallowedForwardedArgs refuses config/root/mode overrides and bare positional paths", () => {
  const refused = [
    ["--config", "x"],
    ["-c", "x"],
    ["--root", "x"],
    ["-r", "x"],
    ["--mode", "x"],
    ["-m", "x"],
    ["/tmp/some-other-root"],
    ["--config=x"],
  ];
  for (const args of refused) {
    assert.ok(
      findDisallowedForwardedArgs(args).length > 0,
      `expected a refusal: ${JSON.stringify(args)}`,
    );
  }
});

test("findDisallowedForwardedArgs accepts the safe flag allowlist", () => {
  assert.deepEqual(
    findDisallowedForwardedArgs(["--open", "--force", "--logLevel", "warn"]),
    [],
  );
  assert.deepEqual(findDisallowedForwardedArgs([]), []);
});

test("findDisallowedForwardedArgs never re-flags a port/host/strictPort override already handled by the hatch", () => {
  assert.deepEqual(findDisallowedForwardedArgs(["--port", "5180"]), []);
  assert.deepEqual(findDisallowedForwardedArgs(["--host", "0.0.0.0"]), []);
  assert.deepEqual(
    findDisallowedForwardedArgs(["--strictPort", "false"]),
    [],
  );
});

// PR #894 round 5 P1: two concurrent DEV_SERVER_ALLOW_EXTRA=1 invocations
// targeting distinct ports could both pass refuseIfServerRunning's
// registry/port/process checks before either claimed or spawned anything —
// a TOCTOU race the per-port claim file cannot see. acquireStartupLock is
// the machine-wide critical section that closes it.
test("acquireStartupLock: a second acquire fails while held, and succeeds after release", async (t) => {
  const lockPath = await lockFile(t);
  await acquireStartupLock(lockPath);
  await assert.rejects(acquireStartupLock(lockPath), /already starting up/);
  await releaseStartupLock(lockPath);
  await assert.doesNotReject(acquireStartupLock(lockPath));
  await releaseStartupLock(lockPath);
});

test("acquireStartupLock reclaims a lock left by a dead pid", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, JSON.stringify({ pid: 0, startedAt: Date.now() }));
  await assert.doesNotReject(acquireStartupLock(lockPath));
  await releaseStartupLock(lockPath);
});

test("acquireStartupLock reclaims a lock older than the staleness threshold, even with a live pid", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: Date.now() - 120_000 }),
  );
  await assert.doesNotReject(acquireStartupLock(lockPath));
  await releaseStartupLock(lockPath);
});

function fakeChildFactory(calls) {
  return (bin, args) => {
    calls.push({ bin, args });
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    setImmediate(() => child.emit("exit", 0, null));
    return child;
  };
}

test("runManagedVite guards, then spawns the real vite binary with a clean arg list", async (t) => {
  const calls = [];
  let guardCalls = 0;
  await runManagedVite([], {
    spawnFn: fakeChildFactory(calls),
    guard: async () => {
      guardCalls++;
    },
    lockPath: await lockFile(t),
  });
  assert.equal(guardCalls, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, []);
  assert.ok(calls[0].bin.endsWith(path.join("node_modules", ".bin", "vite")));
});

test("runManagedVite forwards the preview subcommand and strips it before the override check", async (t) => {
  const calls = [];
  await runManagedVite(["preview"], {
    spawnFn: fakeChildFactory(calls),
    guard: async () => {},
    lockPath: await lockFile(t),
  });
  assert.deepEqual(calls[0].args, ["preview"]);
});

test("runManagedVite refuses a forwarded port/host/strictPort override and never spawns vite", async (t) => {
  const calls = [];
  await assert.rejects(
    runManagedVite(["--port", "5180"], {
      spawnFn: fakeChildFactory(calls),
      guard: async () => {},
      lockPath: await lockFile(t),
    }),
    /Refusing to forward --port/,
  );
  assert.equal(calls.length, 0);
});

test("runManagedVite allows a forwarded override when DEV_SERVER_ALLOW_EXTRA=1", async (t) => {
  const prior = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (prior === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = prior;
  });
  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  const calls = [];
  await runManagedVite(["--port", "5180"], {
    spawnFn: fakeChildFactory(calls),
    guard: async () => {},
    lockPath: await lockFile(t),
  });
  assert.deepEqual(calls[0].args, ["--port", "5180"]);
});

// PR #894 round 6 P1: unlike the port/host/strictPort hatch above,
// DEV_SERVER_ALLOW_EXTRA=1 never permits a forwarded flag that could change
// the config/root Vite loads — the managed server always runs this
// checkout's checked-in vite.config.ts.
test("runManagedVite refuses a forwarded --config override even with DEV_SERVER_ALLOW_EXTRA=1, and never spawns vite", async (t) => {
  const prior = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (prior === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = prior;
  });
  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  const calls = [];
  await assert.rejects(
    runManagedVite(["--config", "/tmp/alternate.ts"], {
      spawnFn: fakeChildFactory(calls),
      guard: async () => {},
      lockPath: await lockFile(t),
    }),
    /Refusing to forward --config/,
  );
  assert.equal(calls.length, 0);
});

test("runManagedVite refuses a bare positional root argument", async (t) => {
  const calls = [];
  await assert.rejects(
    runManagedVite(["/tmp/some-other-root"], {
      spawnFn: fakeChildFactory(calls),
      guard: async () => {},
      lockPath: await lockFile(t),
    }),
    /Refusing to forward \/tmp\/some-other-root/,
  );
  assert.equal(calls.length, 0);
});

// Sweep: the preview path shares the same allowlist as dev.
test("runManagedVite refuses a forwarded --config override on the preview path too", async (t) => {
  const calls = [];
  await assert.rejects(
    runManagedVite(["preview", "--config", "/tmp/alternate.ts"], {
      spawnFn: fakeChildFactory(calls),
      guard: async () => {},
      lockPath: await lockFile(t),
    }),
    /Refusing to forward --config/,
  );
  assert.equal(calls.length, 0);
});

test("runManagedVite preview accepts the safe flag allowlist", async (t) => {
  const calls = [];
  await runManagedVite(["preview", "--open", "--force"], {
    spawnFn: fakeChildFactory(calls),
    guard: async () => {},
    lockPath: await lockFile(t),
  });
  assert.deepEqual(calls[0].args, ["preview", "--open", "--force"]);
});

test("runManagedVite propagates the guard's refusal without spawning vite", async (t) => {
  const calls = [];
  await assert.rejects(
    runManagedVite([], {
      spawnFn: fakeChildFactory(calls),
      guard: async () => {
        throw new Error("A dev server is already running: fixture");
      },
      lockPath: await lockFile(t),
    }),
    /already running/,
  );
  assert.equal(calls.length, 0);
});

// Round 3 (Codex P2): DEV_SERVER_ALLOW_EXTRA=1 with `--port 5180` used to
// still guard the hard-coded default port, so `npm run dev -- --port 5180`
// refused whenever the *default* port was busy — even though the hatch
// exists precisely so Vite can bind somewhere else. parseForwardedPort is
// the pure extractor that lets the guard target the real requested port.
test("parseForwardedPort extracts an explicit port from every accepted form", () => {
  assert.equal(parseForwardedPort(["--port", "5180"]), 5180);
  assert.equal(parseForwardedPort(["-p", "5180"]), 5180);
  assert.equal(parseForwardedPort(["--port=5180"]), 5180);
  assert.equal(parseForwardedPort(["--host", "--port", "5180"]), 5180);
});

test("parseForwardedPort returns null when no explicit port is present or the value isn't numeric", () => {
  assert.equal(parseForwardedPort([]), null);
  assert.equal(parseForwardedPort(["--host"]), null);
  assert.equal(parseForwardedPort(["--strictPort", "false"]), null);
  assert.equal(parseForwardedPort(["--port", "not-a-number"]), null);
  assert.equal(parseForwardedPort(["--port"]), null);
});

// Deliberate: `PORT` is NOT part of the resolution order. Neither the vite CLI
// nor this repo's vite.config.ts (`server.port: 5173, strictPort: true`) reads
// process.env.PORT, so honouring it here would guard a port vite never binds
// and let a second server take the shared one — the exact failure this whole
// PR exists to prevent. Only an explicit forwarded flag moves the guard.
test("parseForwardedPort ignores PORT in the environment, which vite never reads", (t) => {
  const prior = process.env.PORT;
  t.after(() => {
    if (prior === undefined) delete process.env.PORT;
    else process.env.PORT = prior;
  });
  process.env.PORT = "5180";
  assert.equal(parseForwardedPort([]), null);
  assert.equal(parseForwardedPort(["--host"]), null);
  // An explicit flag still wins, and PORT does not override it.
  assert.equal(parseForwardedPort(["--port", "5190"]), 5190);
});

test("runManagedVite guards the parsed forwarded port only when the escape hatch permits the override", async (t) => {
  const prior = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (prior === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = prior;
  });
  const guardCalls = [];
  const guard = async (opts) => {
    guardCalls.push(opts);
  };
  const lockPath = await lockFile(t);

  delete process.env.DEV_SERVER_ALLOW_EXTRA;
  await runManagedVite([], { spawnFn: fakeChildFactory([]), guard, lockPath });
  assert.deepEqual(guardCalls.at(-1), { port: SHARED_PORT });

  // Without the hatch, an override still guards the default port (then
  // refuses below) — it must never guard the requested port instead.
  await assert.rejects(
    runManagedVite(["--port", "5180"], {
      spawnFn: fakeChildFactory([]),
      guard,
      lockPath,
    }),
    /Refusing to forward --port/,
  );
  assert.deepEqual(guardCalls.at(-1), { port: SHARED_PORT });

  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  await runManagedVite(["--port", "5180"], {
    spawnFn: fakeChildFactory([]),
    guard,
    lockPath,
  });
  assert.deepEqual(guardCalls.at(-1), { port: 5180 });

  // An override with no explicit port value (e.g. bare --host) still has
  // nothing else to guard, so it falls back to the default port.
  await runManagedVite(["--host"], {
    spawnFn: fakeChildFactory([]),
    guard,
    lockPath,
  });
  assert.deepEqual(guardCalls.at(-1), { port: SHARED_PORT });
});

// Integration-level: exercises the real refuseIfServerRunning, not a spy, so
// this proves the fix end to end — the exact scenario from
// docs/guides/LOCAL-AGENT-TESTING.md:42-45 (the hatch moves the server past
// a busy default port).
test("runManagedVite (with the hatch): guards the requested port, not a busy default port, and proceeds when it's free", async (t) => {
  const dir = await registry(t);
  const busyOnDefault = await listener(t); // stands in for "the default port is occupied by something else"
  const requestedPort = await unusedPort(t);
  const prior = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (prior === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = prior;
  });
  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  const realGuard = (opts) =>
    refuseIfServerRunning({ ...opts, registry: dir, findUnmanaged: () => [] });
  const lockPath = await lockFile(t);

  // Requesting the already-occupied "default" port must still refuse.
  await assert.rejects(
    runManagedVite(["--port", String(busyOnDefault.address().port)], {
      spawnFn: fakeChildFactory([]),
      guard: realGuard,
      lockPath,
    }),
    /already in use/,
  );

  // Requesting the actually-free port proceeds and forwards it to vite.
  const calls = [];
  await runManagedVite(["--port", String(requestedPort)], {
    spawnFn: fakeChildFactory(calls),
    guard: realGuard,
    lockPath,
  });
  assert.deepEqual(calls[0].args, ["--port", String(requestedPort)]);
});

test("runManagedVite (with the hatch): still refuses when an unmanaged vite process is running anywhere", async (t) => {
  const dir = await registry(t);
  const requestedPort = await unusedPort(t);
  const prior = process.env.DEV_SERVER_ALLOW_EXTRA;
  t.after(() => {
    if (prior === undefined) delete process.env.DEV_SERVER_ALLOW_EXTRA;
    else process.env.DEV_SERVER_ALLOW_EXTRA = prior;
  });
  process.env.DEV_SERVER_ALLOW_EXTRA = "1";
  const calls = [];
  const guard = (opts) =>
    refuseIfServerRunning({
      ...opts,
      registry: dir,
      findUnmanaged: () => [
        {
          pid: 999999,
          command: "node /elsewhere/node_modules/.bin/vite",
          port: null,
        },
      ],
    });
  await assert.rejects(
    runManagedVite(["--port", String(requestedPort)], {
      spawnFn: fakeChildFactory(calls),
      guard,
      lockPath: await lockFile(t),
    }),
    /already running/,
  );
  assert.equal(calls.length, 0);
});
