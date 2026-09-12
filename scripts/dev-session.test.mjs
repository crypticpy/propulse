import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
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
  filterForeignDevServerLines,
  filterViteProcessLines,
  findDisallowedForwardedArgs,
  findForeignDevServers,
  findForwardedOverrideFlags,
  findUnmanagedViteProcesses,
  isDevSessionStartCommand,
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
  withReclaimLock,
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

// Round 10 P2 (fL9m): tests/support/sharedServer.ts's globalSetup translates
// PROPULSE_E2E_GUEST=1 into a required "connected" profile (guest.spec.ts
// needs disposable configured auth, not the local AuthGate bypass) and
// passes a `reason` naming guest mode so a mismatch doesn't just say
// "local" — a bare default-profile assert here would reject a correctly
// configured connected server the moment guest mode was on.
test("assertSharedServerIdentity accepts a connected profile when guest mode requires it", () => {
  assert.doesNotThrow(() =>
    assertSharedServerIdentity(
      { root: "/repo/checkout", profile: "connected" },
      {
        root: "/repo/checkout",
        profile: "connected",
        reason: "PROPULSE_E2E_GUEST=1 requires the guest suite's connected-profile server",
      },
    ),
  );
});

test("assertSharedServerIdentity refuses a local profile when guest mode requires connected, naming guest mode", () => {
  assert.throws(
    () =>
      assertSharedServerIdentity(
        { root: "/repo/checkout", profile: "local" },
        {
          root: "/repo/checkout",
          profile: "connected",
          reason: "PROPULSE_E2E_GUEST=1 requires the guest suite's connected-profile server",
        },
      ),
    /"local".*"connected".*PROPULSE_E2E_GUEST=1/s,
  );
});

test("assertSharedServerIdentity refuses a connected profile when the suite isn't in guest mode", () => {
  assert.throws(
    () =>
      assertSharedServerIdentity(
        { root: "/repo/checkout", profile: "connected" },
        {
          root: "/repo/checkout",
          profile: "local",
          reason: "both Playwright commands request --profile local for the AuthGate bypass",
        },
      ),
    /"connected".*"local".*AuthGate bypass/s,
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

// PR #894 round 9 P1: reclaiming an aged lock dir used to be check-then-`rm`
// — two callers could both `stat` the same aged dir before either acted,
// and the second (delayed) caller's `rm` could then delete the *first*
// caller's already-fresh (`mkdir`-recreated) lock, letting both enter the
// critical section at once. Stress this directly against withReclaimLock.
test("withReclaimLock: N=8 concurrent entries against one aged lock dir — exactly one holder at a time, and every caller eventually enters", async (t) => {
  const dir = await registry(t);
  const filename = path.join(dir, "target");
  const lockPath = `${filename}.lock`;
  await mkdir(lockPath);
  const old = new Date(Date.now() - 60_000);
  await utimes(lockPath, old, old);
  const N = 8;
  let holders = 0;
  let sawOverlap = false;
  const finished = [];

  async function run(i) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    await withReclaimLock(filename, async () => {
      holders++;
      if (holders > 1) sawOverlap = true;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
      holders--;
      finished.push(i);
    });
  }

  await Promise.all(Array.from({ length: N }, (_, i) => run(i)));
  assert.equal(sawOverlap, false);
  assert.equal(finished.length, N);
  const leftover = (await readdir(dir)).filter((name) =>
    name.startsWith("target."),
  );
  assert.deepEqual(leftover, []);
});

// PR #894 round 9 P1: a caller that loses the reclaim rename race on an aged
// lock dir (another caller already renamed it away first) must see ENOENT,
// treat it as "the lock is gone either way", and retry its own publish
// rather than propagating the ENOENT or giving up.
test("withReclaimLock retries and succeeds after losing a reclaim rename race on an aged lock dir (ENOENT)", async (t) => {
  const dir = await registry(t);
  const filename = path.join(dir, "target");
  const lockPath = `${filename}.lock`;
  await mkdir(lockPath);
  // Non-empty and marked with a definitely-dead pid: non-empty so a
  // publish's rename-into-place genuinely fails (ENOTEMPTY) and falls
  // through to the reclaim path instead of silently succeeding onto an
  // empty directory; a dead pid so isAgedReclaimLock reads it as aged
  // immediately, without waiting out the mtime bound.
  await writeFile(
    path.join(lockPath, "owner.json"),
    JSON.stringify({ pid: 999999, token: "dead-holder" }),
  );
  let reclaimCalls = 0;
  const renameFn = async (from, to) => {
    // Only the reclaim side (`lockPath` -> tombstone) is what this test
    // simulates losing; a publish attempt (tempDir -> lockPath) always runs
    // for real, or the lock could never actually be freed for a retry to
    // find.
    if (from === lockPath) {
      reclaimCalls++;
      if (reclaimCalls === 1) {
        const error = new Error(
          "simulated: another caller won the rename race",
        );
        error.code = "ENOENT";
        throw error;
      }
    }
    return rename(from, to);
  };
  const result = await withReclaimLock(filename, async () => "done", {
    renameFn,
  });
  assert.equal(result, "done");
  assert.ok(reclaimCalls >= 2, "expected the lost race to trigger a retry");
});

// PR #894 round 9 P1: if this call's own `fn()` runs long enough that
// another caller legitimately reclaims this lock as aged (renames it away,
// then `mkdir`s a fresh one of its own) before this call's `finally` block
// runs, that `finally` must not blow away the later caller's live lock — the
// marker file's pid+token comparison is what prevents that.
test("withReclaimLock's release does not remove a lock dir a later caller legitimately reclaimed", async (t) => {
  const dir = await registry(t);
  const filename = path.join(dir, "target");
  const lockPath = `${filename}.lock`;

  await withReclaimLock(filename, async () => {
    // Simulate a second caller legitimately reclaiming this lock as aged
    // while the first is still "running" fn(): perform the same
    // rename+mkdir+marker sequence a real reclaiming caller would.
    const tombstone = `${lockPath}.stale-${process.pid}-${Date.now()}-sim`;
    await rename(lockPath, tombstone);
    await rm(tombstone, { recursive: true, force: true });
    await mkdir(lockPath);
    await writeFile(
      path.join(lockPath, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "later-holder-token" }),
    );
  });

  // The original holder's release must have found its own marker replaced
  // by the "later holder"'s and skipped the rm — the later holder's
  // directory and marker must still be there.
  const marker = JSON.parse(
    await readFile(path.join(lockPath, "owner.json"), "utf8"),
  );
  assert.equal(marker.token, "later-holder-token");
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

// PR #894 round 12 P2: findOtherAccountSessions (round 11's fix) scanned
// every other account's registry directory for a live session, but
// claimSession creates each registry with mode 0700 (owner-only) — a
// foreign account's registry throws EACCES on read, which the old
// ENOENT-only `.catch` did not handle, so a foreign account's registry
// existing on the machine at all (even empty, even stale) could crash an
// otherwise-legitimate solo start outright. findForeignDevServers replaces
// it with a process-table scan: `ps -axo pid=,command=` lists every process
// on the machine regardless of which account owns it, so this invariant is
// enforced by what is actually running, not by which files this account
// can read.
test("isDevSessionStartCommand matches a real `dev:session start` invocation but not guard/status/vite", () => {
  const positive = [
    "node scripts/dev-session.mjs start --owner agent --task fixture",
    "node /repo/scripts/dev-session.mjs start",
    "node --inspect scripts/dev-session.mjs start --owner agent",
  ];
  for (const command of positive) {
    assert.ok(
      isDevSessionStartCommand(command),
      `expected match: ${command}`,
    );
  }
  const negative = [
    "node scripts/dev-session.mjs guard",
    "node scripts/dev-session.mjs status",
    "node scripts/dev-session.mjs help",
    "node scripts/dev-session.mjs vite",
    "node scripts/dev-session.mjs vite preview",
    "node watcher.js /tmp/dev-session.mjs start",
    "vite",
    "",
  ];
  for (const command of negative) {
    assert.ok(
      !isDevSessionStartCommand(command),
      `expected no match: ${command}`,
    );
  }
});

// A synthetic ps fixture standing in for a process on this machine under a
// different OS account: findForeignDevServers has no readdir/registry call
// at all, so which account owns the pid is irrelevant to whether it's
// detected — unlike the old registry scan, which could only ever see
// (and, on a locked-down registry, could crash on) accounts whose files
// this one can read.
test("findForeignDevServers detects both a foreign vite process and a foreign dev-session `start` process from a ps fixture, regardless of account", () => {
  const stdout = [
    "100 vim vite.config.ts",
    "200 node /home/other-account/repo/node_modules/.bin/vite",
    "201 node /home/other-account/repo/scripts/dev-session.mjs start --owner other",
    "202 node /home/other-account/repo/scripts/dev-session.mjs guard",
  ].join("\n");
  const result = filterForeignDevServerLines(stdout, { ownPid: -1 }).map(
    parsePidAndCommand,
  );
  assert.deepEqual(
    result.map((entry) => entry.pid),
    [200, 201],
  );
});

test("findForeignDevServers excludes this process's own pid and, when given, its own spawned child's pid", () => {
  const stdout = [
    "42 node /repo/node_modules/.bin/vite",
    "43 node /repo/scripts/dev-session.mjs start",
  ].join("\n");
  assert.deepEqual(filterForeignDevServerLines(stdout, { ownPid: 42 }).length, 1);
  assert.deepEqual(
    filterForeignDevServerLines(stdout, { ownPid: 42, ownChildPid: 43 }),
    [],
  );
});

// Integration-level check that the real detection path (ps) actually finds
// a real `dev:session start`-shaped process end to end, the same way
// "findUnmanagedViteProcesses detects a real vite process through the real
// ps command" already does for a real vite-shaped one — `start` runs Vite
// in-process, so this pattern is the only thing that lets a live `start`
// session be seen on the process table at all.
test("findForeignDevServers detects a real dev-session `start` process through the real ps command", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-ps-fixture-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const binPath = path.join(dir, "scripts", "dev-session.mjs");
  await mkdir(path.dirname(binPath), { recursive: true });
  await writeFile(binPath, "setTimeout(() => {}, 4000);\n");
  const child = spawn(process.execPath, [binPath, "start", "--owner", "fixture"], {
    stdio: "ignore",
  });
  t.after(() => {
    try {
      child.kill();
    } catch {
      // already exited
    }
  });
  let found;
  for (let attempt = 0; attempt < 40 && !found; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    found = findForeignDevServers({ ownPid: -1 }).find(
      (entry) => entry.pid === child.pid,
    );
  }
  assert.ok(found, `expected pid ${child.pid} among foreign dev servers`);
});

// The exact failure this round fixes: a foreign-account registry directory
// this account cannot read must never abort (or crash) a legitimate solo
// start — findForeignDevServers doesn't touch registry files at all, so
// this is true by construction, but this test exercises it end to end
// through startSession so a revert to registry-based detection (which
// would readdir/parse this exact directory) goes red.
test("startSession succeeds even when an unreadable foreign-account registry sits in the same tmpdir", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const foreignRegistry = path.join(
    os.tmpdir(),
    `propulse-dev-round12fixture${process.pid}`,
  );
  await mkdir(foreignRegistry, { recursive: true, mode: 0o700 });
  await chmod(foreignRegistry, 0o000);
  t.after(async () => {
    await chmod(foreignRegistry, 0o700).catch(() => {});
    await rm(foreignRegistry, { recursive: true, force: true }).catch(() => {});
  });
  await startSession({
    ...base,
    registry: dir,
    port,
    lockPath: await lockFile(t),
    importVite: () =>
      Promise.resolve({
        createServer: async () => ({
          listen: async () => {},
          close: async () => {},
        }),
      }),
    findUnmanaged: () => [],
  });
  const remaining = await readdir(dir);
  assert.equal(
    remaining.length,
    1,
    "a successful start must leave its own claim in place",
  );
});

// Integration-level coverage of the process-table fix through startSession
// itself: a fake `importVite` stands in for the real Vite dev server (never
// binds a real port), and `findUnmanaged` is injected so the test controls
// exactly what the post-bind rescan "sees" — red on revert: without the
// rescan, startSession has no way to notice a foreign session at all and
// this would hang waiting for a rejection that never comes.
test("startSession stops itself when the post-bind rescan finds a foreign process", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  let closed = false;
  // The pre-start guard and the post-bind rescan share this same injected
  // findUnmanaged (that's the fix: one process-table scanner, used twice) —
  // nothing found the first time (pre-start passes), a foreign process by
  // the second time (post-bind rescan catches it), the exact "appeared
  // while starting" scenario this closes.
  let calls = 0;
  const findUnmanaged = () => {
    calls++;
    return calls === 1
      ? []
      : [
          {
            pid: 999999,
            port: 5199,
            command: "node /elsewhere/scripts/dev-session.mjs start",
          },
        ];
  };
  await assert.rejects(
    startSession({
      ...base,
      registry: dir,
      port,
      lockPath: await lockFile(t),
      importVite: () =>
        Promise.resolve({
          createServer: async () => ({
            listen: async () => {},
            close: async () => {
              closed = true;
            },
          }),
        }),
      findUnmanaged,
    }),
    /Another dev server appeared while starting/,
  );
  assert.equal(closed, true, "the post-bind rescan must stop our own child");
  const remaining = await readdir(dir).catch(() => []);
  assert.deepEqual(
    remaining,
    [],
    "the post-bind rescan must release this session's claim",
  );
});

test("startSession succeeds when the post-bind rescan finds only itself", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  await startSession({
    ...base,
    registry: dir,
    port,
    lockPath: await lockFile(t),
    importVite: () =>
      Promise.resolve({
        createServer: async () => ({
          listen: async () => {},
          close: async () => {},
        }),
      }),
    findUnmanaged: () => [],
  });
  const remaining = await readdir(dir);
  assert.equal(
    remaining.length,
    1,
    "a successful start must leave its own claim in place",
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

// PR #894 round 9 P2: `node <script> <args...>` used to scan *every* token
// after `node` for something vite-path-shaped, so a script that merely
// passed a path named "vite" as one of its own arguments (or after a
// runtime option like `--loader`) was misclassified as a Vite server. Only
// the actual Node entry script — the first token that isn't a runtime
// option — decides this now; everything else is skipped or ignored.
test("isViteExecutableCommand identifies the real Node entry script, not any vite-ish token", () => {
  const positive = [
    "node --inspect node_modules/vite/bin/vite.js",
    "node -r dotenv/config ./node_modules/.bin/vite --port 5173",
    "node --inspect-brk=9229 node_modules/.bin/vite",
    "node --loader tsx node_modules/.bin/vite",
  ];
  for (const command of positive) {
    assert.ok(isViteExecutableCommand(command), `expected match: ${command}`);
  }
  const negative = [
    "node watcher.js /tmp/vite",
    "node --loader tsx scripts/x.ts vite",
    'node -e "require(\'/tmp/vite\')"',
    "node -p 1",
    "node --experimental-vm-modules watcher.js vite",
  ];
  for (const command of negative) {
    assert.ok(
      !isViteExecutableCommand(command),
      `expected no match: ${command}`,
    );
  }
});

// PR #894 round 13 P2: both detectors used to tokenize the whole command on
// whitespace and treat the very next token as the entire entry path, so a
// real checkout containing a space (e.g. a macOS "/tmp/My Project/...")
// silently truncated the entry at "/tmp/My" — a real foreign vite or
// dev-session process under such a path was missed entirely. Red on
// 284a74fb; matchEntryAcrossSpaces fixes it by extending the candidate
// across additional tokens as long as each next token still looks like a
// continuation of the same path.
test("isViteExecutableCommand and isDevSessionStartCommand match entries under a spaced checkout path", () => {
  assert.ok(
    isViteExecutableCommand(
      "node /tmp/My Project/node_modules/vite/bin/vite.js --port 5180",
    ),
    "expected match: spaced path to vite/bin/vite.js",
  );
  assert.ok(
    isViteExecutableCommand(
      "node /tmp/My Project/node_modules/.bin/vite --port 5180",
    ),
    "expected match: spaced path to the vite bin shim",
  );
  assert.ok(
    isDevSessionStartCommand(
      "node /tmp/My Project/scripts/dev-session.mjs start --owner agent",
    ),
    "expected match: spaced path to dev-session.mjs start",
  );
  // Control: an unrelated script under the same spaced checkout must not be
  // swept up by either detector.
  const unrelated = "node /tmp/My Project/server.js";
  assert.ok(
    !isViteExecutableCommand(unrelated),
    "expected no match: unrelated spaced-path script (vite)",
  );
  assert.ok(
    !isDevSessionStartCommand(unrelated),
    "expected no match: unrelated spaced-path script (dev-session)",
  );
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
  assert.deepEqual(findDisallowedForwardedArgs(["--strictPort"]), []);
  assert.deepEqual(findDisallowedForwardedArgs(["--no-strictPort"]), []);
});

// PR #894 round 8 P1: --strictPort is a pure boolean in Vite's own CLI — it
// never takes a value — but findDisallowedForwardedArgs treated it like
// --port/--host and unconditionally consumed the next token as "its value",
// letting a caller smuggle a positional root path in behind it and bypass
// the positional-argument refusal entirely. This must refuse (red on
// revert).
test("findDisallowedForwardedArgs refuses a positional smuggled behind --strictPort", () => {
  assert.ok(
    findDisallowedForwardedArgs(["--strictPort", "/tmp/other-root"]).length >
      0,
  );
});

test("findDisallowedForwardedArgs refuses a positional smuggled behind a safe boolean flag", () => {
  assert.ok(findDisallowedForwardedArgs(["--open", "src"]).length > 0);
});

test("findDisallowedForwardedArgs accepts a genuine value flag's value", () => {
  assert.deepEqual(findDisallowedForwardedArgs(["--logLevel", "warn"]), []);
});

test("findDisallowedForwardedArgs accepts --strictPort followed by another boolean flag", () => {
  assert.deepEqual(findDisallowedForwardedArgs(["--strictPort", "--open"]), []);
});

// --debug/-d take an *optional* value in Vite's own CLI, which is ambiguous
// from argv shape alone (the same ambiguity --strictPort's fix above
// closes). Classified boolean here rather than guessed at: --debug never
// consumes a following token, so a bare positional after it is still
// refused on its own.
test("findDisallowedForwardedArgs treats --debug as boolean and refuses a following bare positional", () => {
  assert.ok(findDisallowedForwardedArgs(["--debug", "hmr"]).length > 0);
});

// --host takes a genuine (optional) value in Vite's own CLI and is already
// gated separately by findForwardedOverrideFlags/the DEV_SERVER_ALLOW_EXTRA
// hatch, so consuming a following non-flag token as its address value here
// is correct and does not bypass anything.
test("findDisallowedForwardedArgs accepts --host with a following value", () => {
  assert.deepEqual(findDisallowedForwardedArgs(["--host", "/tmp/x"]), []);
});

// PR #894 round 5 P1: two concurrent DEV_SERVER_ALLOW_EXTRA=1 invocations
// targeting distinct ports could both pass refuseIfServerRunning's
// registry/port/process checks before either claimed or spawned anything —
// a TOCTOU race the per-port claim file cannot see. acquireStartupLock is
// the machine-wide critical section that closes it.
test("acquireStartupLock: a second acquire fails while held, and succeeds after release", async (t) => {
  const lockPath = await lockFile(t);
  const token = await acquireStartupLock(lockPath);
  await assert.rejects(acquireStartupLock(lockPath), /already starting up/);
  await releaseStartupLock(lockPath, token);
  const token2 = await acquireStartupLock(lockPath);
  await releaseStartupLock(lockPath, token2);
});

test("acquireStartupLock reclaims a lock left by a dead pid", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, JSON.stringify({ pid: 0, startedAt: Date.now() }));
  const token = await acquireStartupLock(lockPath);
  await releaseStartupLock(lockPath, token);
});

// PR #894 round 8 P2: a valid lock record's staleness is decided by pid
// liveness alone now, never by age — a live process legitimately holding
// this lock past any fixed timestamp bound (e.g. a slow `await
// import("vite")` under load) must not be reclaimed out from under itself,
// which used to let a second caller into the critical section at the same
// time as the first, still-running holder. Regression: this must NOT
// resolve (red on revert, since the old code reclaimed on age alone).
test("acquireStartupLock does not reclaim a lock with a live pid, no matter how old", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(
    lockPath,
    JSON.stringify({ pid: process.pid, startedAt: Date.now() - 120_000 }),
  );
  await assert.rejects(acquireStartupLock(lockPath), /already starting up/);
});

// The mtime-based fallback (round 7) still applies, but only to an
// unreadable/unparsable record, and with a much more generous bound than a
// valid record's age would ever need — it exists purely to recover from a
// writer that crashed before finishing content, never to expire a live
// holder's valid record.
test("acquireStartupLock reclaims an unreadable record only once it's older than the generous fallback bound", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, "");
  const past = new Date(Date.now() - 11 * 60_000);
  await utimes(lockPath, past, past);
  const token = await acquireStartupLock(lockPath);
  await releaseStartupLock(lockPath, token);
});

test("acquireStartupLock does not reclaim a recently-written unreadable record", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, "");
  await assert.rejects(acquireStartupLock(lockPath), /already starting up/);
});

// PR #894 round 8 P2: release used to unlink unconditionally — this call's
// own release could delete a *different*, later holder's lock (e.g. one
// that legitimately replaced this one via a stale-pid reclaim). A mismatched
// token must be a silent no-op, never an unlink.
test("releaseStartupLock does not unlink when given the wrong token", async (t) => {
  const lockPath = await lockFile(t);
  const token = await acquireStartupLock(lockPath);
  await releaseStartupLock(lockPath, "not-the-real-token");
  await assert.rejects(acquireStartupLock(lockPath), /already starting up/);
  await releaseStartupLock(lockPath, token);
});

// PR #894 round 7 P1: reclaiming a stale startup lock used to be
// check-then-unlink, so two callers could both observe the same stale lock
// and the second caller's unlink could delete the first caller's already
// fresh (`wx`-recreated) lock, letting both proceed into the critical
// section at once. Reclaiming now renames the stale lock to a
// pid+timestamp-unique tombstone first — atomic, and only one racing
// caller's rename can ever succeed — so ownership is only ever established
// by a subsequent successful `wx`, never by winning the rename itself.
test("acquireStartupLock: N=8 concurrent acquisitions against one dead-pid lock — exactly one owner at a time, and every caller eventually acquires after release", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, JSON.stringify({ pid: 0, startedAt: Date.now() }));
  const N = 8;
  let holders = 0;
  let sawOverlap = false;
  const finished = [];

  // acquireStartupLock itself fails fast (by design) against a lock another
  // caller is legitimately, currently holding — it never spin-waits. A
  // stress harness proving liveness under contention has to do that
  // retrying itself, exactly as a real caller who wants to wait would.
  async function acquireWithRetry() {
    for (;;) {
      try {
        return await acquireStartupLock(lockPath);
      } catch {
        await new Promise((resolve) =>
          setTimeout(resolve, 2 + Math.random() * 8),
        );
      }
    }
  }

  async function run(i) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    const token = await acquireWithRetry();
    holders++;
    if (holders > 1) sawOverlap = true;
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
    holders--;
    finished.push(i);
    await releaseStartupLock(lockPath, token);
  }

  await Promise.all(Array.from({ length: N }, (_, i) => run(i)));
  assert.equal(sawOverlap, false);
  assert.equal(finished.length, N);
});

// PR #894 round 7 P1: a caller that loses the rename race (another caller
// already renamed the stale lock away first) must see ENOENT, treat it as
// "the lock is gone either way", and retry `wx` itself rather than
// propagating the ENOENT or giving up.
test("acquireStartupLock retries and succeeds after losing a rename race on a stale lock (ENOENT)", async (t) => {
  const lockPath = await lockFile(t);
  await writeFile(lockPath, JSON.stringify({ pid: 0, startedAt: Date.now() }));
  let calls = 0;
  const renameFn = async (from, to) => {
    calls++;
    if (calls === 1) {
      const error = new Error("simulated: another caller won the rename race");
      error.code = "ENOENT";
      throw error;
    }
    return rename(from, to);
  };
  const token = await acquireStartupLock(lockPath, { renameFn });
  assert.ok(calls >= 2, "expected the lost race to trigger a retry");
  await releaseStartupLock(lockPath, token);
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
    waitForListening: async () => false,
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
    waitForListening: async () => false,
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
    waitForListening: async () => false,
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
    waitForListening: async () => false,
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
  await runManagedVite([], {
    spawnFn: fakeChildFactory([]),
    guard,
    lockPath,
    waitForListening: async () => false,
  });
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
    waitForListening: async () => false,
  });
  assert.deepEqual(guardCalls.at(-1), { port: 5180 });

  // An override with no explicit port value (e.g. bare --host) still has
  // nothing else to guard, so it falls back to the default port.
  await runManagedVite(["--host"], {
    spawnFn: fakeChildFactory([]),
    guard,
    lockPath,
    waitForListening: async () => false,
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
    waitForListening: async () => false,
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

// PR #894 round 12 P2: runManagedVite (the `npm run dev`/`npm run preview`
// wrapper) used to release its startup lock right after spawning and only
// await the child, so it never did the post-readiness rescan startSession
// already does after binding — a same-moment racer under a different OS
// account could pass the pre-start guard and both `npm run dev` before
// either noticed the other. `waitForListening` is faked here so the test
// never touches a real port; `findUnmanaged` stands in for the real
// process-table scan and controls exactly what the post-readiness rescan
// "sees" — red on revert: without the rescan+kill, the wrapper has no way
// to notice a foreign server at all and the spawned child is left running.
test("runManagedVite stops the child and exits non-zero when the post-readiness rescan finds a foreign process", async (t) => {
  let spawnedChild;
  const spawnFn = () => {
    const child = new EventEmitter();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    child.pid = 424242;
    spawnedChild = child;
    return child;
  };
  await assert.rejects(
    runManagedVite([], {
      spawnFn,
      guard: async () => {},
      lockPath: await lockFile(t),
      waitForListening: async () => true,
      findUnmanaged: () => [
        {
          pid: 999999,
          port: 5173,
          command: "node /elsewhere/scripts/dev-session.mjs start",
        },
      ],
    }),
    /Another dev server appeared while starting/,
  );
  assert.equal(
    spawnedChild.killed,
    true,
    "the post-readiness rescan must stop the spawned child",
  );
});

test("runManagedVite passes through when the post-readiness rescan finds nothing", async (t) => {
  const calls = [];
  await runManagedVite([], {
    spawnFn: fakeChildFactory(calls),
    guard: async () => {},
    lockPath: await lockFile(t),
    waitForListening: async () => true,
    findUnmanaged: () => [],
  });
  assert.equal(calls.length, 1, "vite still spawns and the wrapper passes through");
});
