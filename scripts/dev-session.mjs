#!/usr/bin/env node
/**
 * One shared foreground Vite dev server per machine, on port 5173.
 * `start` refuses when any other server (managed or unmanaged) is already
 * running. Agents never start their own; the human or orchestrator owns the
 * single shared session. `npm run dev` / `npm run preview` route through this
 * script's `vite` / `vite preview` subcommands, which run the same guard,
 * refuse to forward any `--port`/`--host`/`--strictPort` override to the real
 * Vite binary unless DEV_SERVER_ALLOW_EXTRA=1 is set (otherwise a forwarded
 * `npm run dev -- --port 5180` would guard 5173 and then bind 5180 anyway),
 * and — regardless of that hatch — refuse any other forwarded flag or
 * positional argument that isn't on a small allowlist known to be incapable
 * of changing the port/host/root/config Vite loads
 * (findDisallowedForwardedArgs; a `--config`/`--root`/`--mode` override, for
 * example, would let Vite bind a different port after the guard already
 * checked 5173).
 * See docs/guides/LOCAL-AGENT-TESTING.md.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY = path.join(
  os.tmpdir(),
  `propulse-dev-${os.userInfo().uid}`,
);
export const SHARED_PORT = 5173;
export const DEFAULT_PORTS = [SHARED_PORT];
export const SINGLE_SERVER_RULE =
  "One dev server per machine. Use http://localhost:5173 (shared). Ask the orchestrator if it is not running.";

export function parseOptions(args) {
  const [command = "status", ...rest] = args;
  if (!["start", "status", "help", "guard"].includes(command)) {
    throw new Error("Use start, status, guard, or help.");
  }
  const options = { command, profile: "connected" };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, "");
    const value = rest[i + 1];
    if (
      !rest[i]?.startsWith("--") ||
      !["owner", "task", "port", "profile"].includes(key) ||
      !value ||
      value.startsWith("--")
    ) {
      throw new Error(`Invalid option: ${rest[i]}`);
    }
    options[key] = value;
  }
  if (options.port !== undefined) {
    if (
      !/^\d+$/.test(options.port) ||
      Number(options.port) < 1024 ||
      Number(options.port) > 65535
    ) {
      throw new Error("Port must be an integer from 1024 through 65535.");
    }
    options.port = Number(options.port);
  }
  if (!["connected", "local"].includes(options.profile)) {
    throw new Error("Profile must be connected or local.");
  }
  if (
    command === "start" &&
    (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.owner ?? "") ||
      !options.task?.trim() ||
      options.task.length > 160)
  ) {
    throw new Error(
      "Start requires --owner <short-slug> and --task <description, up to 160 characters>.",
    );
  }
  if (command === "start") {
    if (options.port === undefined) options.port = SHARED_PORT;
    if (
      options.port !== SHARED_PORT &&
      process.env.DEV_SERVER_ALLOW_EXTRA !== "1"
    ) {
      throw new Error(
        `Only port ${SHARED_PORT} is allowed: ${SINGLE_SERVER_RULE} ` +
          "DEV_SERVER_ALLOW_EXTRA=1 moves the single server to a different port " +
          "(owner-only escape hatch); it never permits a second, simultaneous server.",
      );
    }
  }
  return options;
}

export function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

function canBind(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else if (
        host === "::1" &&
        ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)
      )
        resolve(true);
      else reject(error);
    });
    probe.listen({ port, host, exclusive: true }, () =>
      probe.close(() => resolve(true)),
    );
  });
}

export async function portAvailable(port) {
  // localhost can resolve to either family; do not reuse another server's port.
  return (await canBind(port, "127.0.0.1")) && (await canBind(port, "::1"));
}

// Shared by tests/support/sharedServer.ts's globalSetup: the identity a
// browser suite fetched from /__propulse_dev_session must both belong to
// this worktree AND be running the profile that suite requires (Playwright
// requests --profile local so AuthGate is bypassed, except when
// PROPULSE_E2E_GUEST=1 enables tests/home/guest.spec.ts, which needs a
// `connected`-profile server for its disposable configured auth; a
// mismatched session would otherwise pass the root check and still fail
// every test downstream at AuthGate instead of naming the real cause).
// Throws with a message naming the found and required profile (plus the
// caller-supplied reason, when given), or the found and expected root, on
// mismatch.
export function assertSharedServerIdentity(
  identity,
  { root, profile = "local", reason } = {},
) {
  if (identity?.profile !== profile) {
    throw new Error(
      `The shared dev server is running profile "${identity?.profile ?? "unknown"}" ` +
        `(owner=${identity?.owner ?? "unknown"}, url=${identity?.url ?? "unknown"}); ` +
        `this suite requires profile "${profile}"${reason ? ` (${reason})` : ""}. ` +
        "Ask the server's owner or the orchestrator to restart it with the " +
        "required profile — never start a second server to work around this.",
    );
  }
  if (identity?.root !== root) {
    throw new Error(
      "The shared dev server is serving a different tree than this one " +
        `(owner=${identity?.owner ?? "unknown"}, url=${identity?.url ?? "unknown"}). ` +
        `Served: ${identity?.root ?? "unknown"}. This worktree: ${root}. Ask its ` +
        "owner or the orchestrator to restart it against this branch, or run " +
        "these tests from the worktree it already serves — never start a " +
        "second server to work around this.",
    );
  }
}

// A claim file whose pid is confirmed dead is safe to reclaim automatically
// (a crashed/SIGKILLed session, not a race with another process still
// writing it). An unreadable/unparsable file is ambiguous — never touched.
async function isStaleClaim(filename) {
  try {
    const record = JSON.parse(await readFile(filename, "utf8"));
    return !isAlive(record.pid);
  } catch {
    return false;
  }
}

// PR #894 round 7 P2: a rename that commits *after* the lock protecting the
// stale-reclaim decision has already been released is content-blind — a
// delayed loser's rename can land after the winner already established a
// live claim, silently displacing it (found and fixed once already,
// empirically, as an intermittent race). The fix isn't "never rename"; it's
// never releasing the lock between deciding a claim is stale and committing
// its replacement. withReclaimLock is a true critical section, serialized
// per port by an exclusive `mkdir` lock directory — `mkdir` with no
// `recursive` option fails EEXIST if the lock is already held, which is the
// same atomicity guarantee `open(..., "wx")` gives for file creation.
// claimPort (below) performs the *entire* decide-stale + write + commit
// sequence for a reclaim inside one held lock, so no second caller can ever
// observe the same stale record and race a commit against this one.
//
// PR #894 round 9 P1: reclaiming the lock *directory itself* when it's aged
// used to be check-then-`rm` — two callers could both `stat` the same aged
// dir before either acted; the first caller's `rm` cleared the way and its
// `mkdir` created a fresh, live lock, but the second (delayed) caller's own
// `rm` — issued against the decision it made against the now-superseded dir,
// and content-blind about whatever currently sits at that path — then
// deleted that fresh lock out from under its new holder, letting both
// callers' `mkdir` eventually succeed and enter the critical section at
// once.
//
// A first fix-up (rename-to-tombstone instead of `rm`, gated by re-checking
// staleness on the captured copy) closed the destructive half of that race
// but not all of it, for a reason specific to a bare `mkdir` lock: `mkdir`
// and the ownership marker written inside it afterward are two separate
// syscalls, so for the gap between them a live, legitimately-held lock is
// observably indistinguishable from an abandoned one — empty, no marker
// yet. A challenger's aged-check can catch exactly that gap, capture the
// live (but momentarily marker-less) directory, and — even after correctly
// restoring it once it notices — a *third* caller can `mkdir` the
// momentarily-empty path in between, entering alongside the original,
// now-orphaned holder (reproduced empirically, ~1 run in 30, once the more
// obviously destructive half of the race was fixed).
//
// The actual fix: never let a lock be observable in a half-built state at
// all. A claim is fully assembled — directory plus its `owner.json` marker
// — in a uniquely-named temp directory first, then published with a single
// `rename(tempDir, lockPath)`. Rename is atomic, so `lockPath` can only ever
// be seen as "doesn't exist" or "exists, complete with its marker" — never
// in between. This also gives mutual exclusion on the publish step itself
// for free: renaming onto a *non-empty* directory fails (`EEXIST`/
// `ENOTEMPTY`), and a claim's directory is never empty by the time it's
// rename-targeted at `lockPath`, so at most one racing publish can land;
// every loser's rename fails and it falls through to the aged-check-and-
// retry path below, the same as an ordinary contested lock.
//
// Reclaiming an aged lock still moves it out of the way with
// `rename(lockPath, tombstone)` rather than `rm`ing it directly, and still
// re-verifies staleness against the captured copy before deciding to delete
// vs. restore it (see reclaimIfAged) — that half of the round 9 fix-up is
// unchanged and still matters for the reclaim side, which the publish-side
// fix above doesn't touch.
//
// A successful publish alone still isn't a safe-enough ownership proof at
// *release* time: if this call's own `fn()` runs long enough for a later
// caller to legitimately see this lock as aged and reclaim it (rename it
// away, then publish a fresh one of its own), this call's `finally` block
// would otherwise `rm` whatever now sits at `lockPath` — the later caller's
// live lock, not the one this call created. Re-checking the marker's pid
// and token before that `rm` (the same rule releaseStartupLock applies to
// the file-based lock) is what makes that safe.
const LOCK_STALE_MS = 10_000;
const MAX_LOCK_ATTEMPTS = 40;
const LOCK_RETRY_DELAY_MS = 50;

async function readReclaimLockMarker(lockPath) {
  try {
    return JSON.parse(
      await readFile(path.join(lockPath, "owner.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

// PR #894 round 9 P1 (fix-up): an mtime-only staleness verdict is itself the
// TOCTOU this round set out to close, one level up — deciding "aged" against
// `lockPath`'s current mtime and then acting on that decision moments later
// is exactly the check-then-act gap that let a legitimate, freshly
// `mkdir`ed live lock get swept up and destroyed (reproduced empirically as
// an intermittent double-entry in the N=8 stress test). Once a lock has an
// owner marker, pid liveness is the same fix isStaleStartupLock already
// applies to the file-based lock, for the same reason: a live pid can't
// stop being alive and then alive again in the gap between two checks the
// way an mtime comparison against a mutable path can flip. Only a marker
// that can't be read at all — the `mkdir` and the marker's own
// `open("wx")` are two separate syscalls, so a caller can observe a
// directory mid-creation — falls back to the same generous, timestamp-only
// bound the file lock uses for the same "ambiguous, not abandoned" reason.
// reclaimIfAged (below) re-runs this exact check against the *captured*
// copy after renaming it, so the same non-racy pid signal also backstops
// the rare cross-process case where this check's own aged verdict was made
// against a lock that gets legitimately replaced before this call's rename
// executes.
async function isAgedReclaimLock(lockPath) {
  const marker = await readReclaimLockMarker(lockPath);
  if (marker && typeof marker.pid === "number") {
    return !isAlive(marker.pid);
  }
  try {
    const info = await stat(lockPath);
    return Date.now() - info.mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

// PR #894 round 9 P1 (fix-up): even a pid-liveness-based verdict is decided
// against `lockPath` and then acted on a moment later — still a check-then-
// act gap, just a much narrower one. As a backstop for the rare case where a
// legitimate reclaim-and-recreate cycle by someone else lands in that gap,
// re-run the *exact same* isAgedReclaimLock check against the captured copy
// once it's safely parked under a tombstone name nobody else can reach —
// rename preserves both the marker file and the directory's mtime, so the
// recheck sees the true, unchanged verdict for whatever was actually
// captured, not for whatever currently happens to sit at `lockPath`. Only
// delete on a confirmed-aged verdict; a live lock scooped up by mistake is
// handed back immediately so its rightful holder's release still finds its
// own lock and marker in place.
async function reclaimIfAged(lockPath, renameFn) {
  const tombstone = `${lockPath}.stale-${process.pid}-${Date.now()}`;
  try {
    await renameFn(lockPath, tombstone);
  } catch (renameError) {
    if (renameError.code !== "ENOENT") throw renameError;
    // Lost the race to another caller's rename (or the owner's own
    // concurrent release) — the lock at this path is gone either way, so
    // fall through and retry `mkdir`.
    return;
  }
  if (await isAgedReclaimLock(tombstone)) {
    // The tombstone path is unique to this pid+timestamp, so no other
    // caller could have produced or be racing to touch it — always safe to
    // remove.
    await rm(tombstone, { recursive: true, force: true }).catch(() => {});
    return;
  }
  // We captured a live lock by mistake. Put it back immediately so its
  // rightful holder's eventual release still finds its own lock (and
  // ownership marker) at `lockPath`. If something else has already claimed
  // `lockPath` in the meantime, leave the tombstone rather than clobber
  // that new claim.
  await renameFn(tombstone, lockPath).catch(() => {});
}

export async function withReclaimLock(filename, fn, { renameFn = rename } = {}) {
  const lockPath = `${filename}.lock`;
  const markerPath = path.join(lockPath, "owner.json");
  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    // Build the claim fully — directory plus its ownership marker — under a
    // uniquely-named temp path *before* it's ever published at `lockPath`,
    // so no other caller can ever observe it half-built (see the comment
    // above this function).
    const token = randomUUID();
    const tempDir = `${lockPath}.claim-${process.pid}-${randomUUID()}`;
    await mkdir(tempDir);
    const handle = await open(path.join(tempDir, "owner.json"), "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
    } finally {
      await handle.close();
    }
    try {
      await renameFn(tempDir, lockPath);
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      // Someone else holds (or abandoned) the lock — never true of the temp
      // dir we just cleaned up, since its name is unique to this attempt.
      if (await isAgedReclaimLock(lockPath)) {
        await reclaimIfAged(lockPath, renameFn);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
      continue;
    }
    try {
      return await fn();
    } finally {
      const marker = await readFile(markerPath, "utf8")
        .then(JSON.parse)
        .catch(() => null);
      if (marker && marker.pid === process.pid && marker.token === token) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
  throw new Error(
    `Timed out waiting for the reclaim lock on ${filename} ` +
      `(held by another claimant for over ${MAX_LOCK_ATTEMPTS * LOCK_RETRY_DELAY_MS}ms).`,
  );
}

// A second, coarser lock than withReclaimLock's per-port critical section:
// serializes the entire check-then-claim-then-spawn sequence machine-wide, so
// two concurrent `start`/`vite`/`vite preview` invocations targeting distinct
// ports (e.g. both with DEV_SERVER_ALLOW_EXTRA=1) cannot both pass
// refuseIfServerRunning before either has claimed or spawned anything — a
// TOCTOU race the per-port claim file cannot see, since each invocation
// checks/claims a *different* port. Recorded as pid+startedAt+token JSON in a
// single `wx`-created file. A lock with a parseable, valid record is stale
// only when its pid is dead; an unreadable/unparsable record (a lock another
// caller is still in the middle of writing — see isStaleStartupLock) falls
// back to a generous mtime bound instead, since it has no pid to check.
//
// PR #894 round 8 P2: staleness used to also fire on a valid record whose
// timestamp was merely older than a fixed 60s bound, even when its pid was
// still alive — a live holder legitimately taking longer than that (e.g. a
// slow `await import("vite")` under load) got reclaimed out from under
// itself, letting a second caller into the critical section at the same
// time. Only a dead pid can't produce that false positive, so a valid
// record's staleness is decided by pid liveness alone now. That in turn
// made unconditional release dangerous: acquireStartupLock now writes a
// random `token` into the record and returns it, and releaseStartupLock
// requires the matching pid+token before unlinking — so one holder's
// `finally`-block release can never delete a *different*, later holder's
// lock that legitimately replaced it (the same ownership check
// releaseSession already does for per-port claims via `current.id`).
//
// PR #894 round 7 P1: reclaiming used to be check-then-unlink — two callers
// could both observe the same stale lock, and the second caller's unlink
// would delete the *first* caller's already-fresh (`wx`-recreated) lock,
// letting both proceed into the critical section at once (reproduced under
// a concurrent stress run). `unlink` is now never used to reclaim a lock
// this call did not itself rename into place first: on a stale lock,
// `rename(lockPath, tombstone)` is attempted, where `tombstone` embeds this
// process's pid and a timestamp so it can never collide with another
// caller's tombstone. Rename is atomic and the source path exists exactly
// once, so at most one racing caller's rename can succeed; every other
// caller's rename fails ENOENT (the source is already gone) and simply
// loops back to retry `wx` itself, the same as the winner does after
// unlinking its own tombstone. Ownership is therefore only ever
// established by a successful `wx`, never by winning the rename race — the
// rename only clears the way. A genuinely live (non-stale) lock still
// fails fast with no retry loop, matching the existing "surface immediately"
// behavior; the bounded retry loop exists only to let racing callers settle
// a stale-lock reclaim, and fails closed with the same refusal message if
// it is somehow never able to.
// Scoped to this account's uid, same as REGISTRY: it only ever serializes
// same-account starts. Cross-account serialization is NOT this lock's job —
// see findForeignDevServers and its post-`server.listen()`/post-readiness
// use in startSession and runManagedVite, which closes that gap from the
// other side instead, via the process table rather than a file this
// account may not be able to read.
export const STARTUP_LOCK_PATH = path.join(
  os.tmpdir(),
  `propulse-dev-session-${os.userInfo().uid}.lock`,
);
// Applies only to an unreadable/unparsable record (see below) — a valid
// record's staleness is decided by pid liveness alone, never by age.
const STARTUP_LOCK_UNREADABLE_STALE_MS = 10 * 60_000;

async function readStartupLockRecord(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

async function isStaleStartupLock(lockPath) {
  const record = await readStartupLockRecord(lockPath);
  if (record && typeof record.pid === "number") {
    // PR #894 round 8 P2: this used to also treat a valid record as stale
    // once its `startedAt` was older than a fixed 60s bound, even with a
    // live pid — a legitimately slow holder (e.g. a slow `await
    // import("vite")` under load) could exceed that bound and get reclaimed
    // out from under itself, letting a second caller into the critical
    // section at the same time as the first (reproduced: a live-pid lock
    // older than the old bound was wrongly reclaimed). A dead pid is the
    // only signal here that can't produce that false positive.
    return !isAlive(record.pid);
  }
  // Found during round 7 N=8 stress testing: `open(..., "wx")` and the
  // content `writeFile` that follows it are two separate syscalls, so a
  // reader can observe an empty/unparsable lock file in the narrow window
  // between them, for a lock another caller is actively, legitimately
  // finishing right now — not an abandoned one. Treating "unreadable" as
  // automatically stale (as this used to) let a second caller reclaim a
  // lock the first caller hadn't finished writing yet, producing exactly
  // the double-ownership this lock exists to prevent. Mirror isStaleClaim's
  // safer default for unreadable content — ambiguous, so judge it by the
  // file's own age (like an abandoned reclaim lock dir) instead of content
  // that may simply not exist yet. There's no pid to check liveness of on
  // this path, so the bound stays timestamp-based — just a much more
  // generous one (STARTUP_LOCK_UNREADABLE_STALE_MS) than a valid record
  // would ever need, wide enough that it only fires for a writer that
  // crashed before finishing, never one still actively writing.
  try {
    const info = await stat(lockPath);
    return Date.now() - info.mtimeMs > STARTUP_LOCK_UNREADABLE_STALE_MS;
  } catch {
    return false;
  }
}

const STARTUP_LOCK_MAX_ATTEMPTS = 20;

function startupLockBusyError() {
  return new Error(
    "Another `dev:session start`/`npm run dev`/`npm run preview` is " +
      `already starting up on this machine. ${SINGLE_SERVER_RULE} Wait ` +
      "for it to finish and try again.",
  );
}

export async function acquireStartupLock(
  lockPath = STARTUP_LOCK_PATH,
  { renameFn = rename } = {},
) {
  for (let attempt = 0; attempt < STARTUP_LOCK_MAX_ATTEMPTS; attempt++) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      // Found during round 7 N=8 stress testing: deciding "stale" and then
      // renaming are two separate steps, and rename is content-blind — it
      // replaces whatever currently sits at the path, without checking
      // it's still the same record the decision was made against. Without
      // serialization, a caller that read an *earlier* generation of this
      // file (e.g. the original dead-pid lock) could still rename away a
      // *different* caller's newer, live lock that had since replaced it,
      // producing the very double-ownership this lock exists to prevent.
      // The decision and any resulting reclaim now happen entirely inside
      // withReclaimLock's per-path critical section (the same mkdir-based
      // lock claimPort uses for port claims) — never released in between —
      // so at most one caller can ever be deciding this file's fate at a
      // time, and by the time it decides, the file it's looking at cannot
      // be superseded out from under it.
      const stillLive = await withReclaimLock(lockPath, async () => {
        if (!(await isStaleStartupLock(lockPath))) return true;
        const tombstone = `${lockPath}.stale-${process.pid}-${Date.now()}`;
        try {
          await renameFn(lockPath, tombstone);
          // We won the reclaim: the tombstone path is unique to this
          // pid+timestamp, so no other caller could have produced or be
          // racing to touch it — always safe to unlink.
          await unlink(tombstone).catch(() => {});
        } catch (renameError) {
          if (renameError.code !== "ENOENT") throw renameError;
          // Lost a race to something outside this lock's own protection
          // (e.g. the owner's own concurrent release) — the lock is gone
          // either way, so fall through and retry `wx`.
        }
        return false;
      });
      if (stillLive) {
        // Live lock: fail fast, no retry loop — a genuinely busy startup
        // should surface immediately as a clear refusal, not retry.
        throw startupLockBusyError();
      }
      continue;
    }
    // A random token, not just the pid: releaseStartupLock re-checks this
    // before unlinking (see below), and a pid alone isn't a safe-enough
    // ownership check across a reclaim — after a stale reclaim, some other,
    // later process could in principle reuse the same pid.
    const token = randomUUID();
    try {
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: Date.now(), token }),
      );
    } finally {
      await handle.close();
    }
    return token;
  }
  throw startupLockBusyError();
}

// `token` must be the value acquireStartupLock returned for this same lock
// acquisition. PR #894 round 8 P2: release used to unlink unconditionally —
// if this call's own holder ran long enough that a *different* caller's
// legitimate stale-pid reclaim (see isStaleStartupLock) replaced the file
// first, this release would delete that replacement's fresh lock instead of
// its own, letting a third caller in while the second still believed it
// held exclusive access. Re-reading the record and requiring both the pid
// and the token to match what this call itself wrote closes that gap —
// mirroring releaseSession's `current.id === session.id` check for per-port
// claims. A mismatch (or a missing/unreadable record) means this call no
// longer owns the lock, so it must not unlink anything.
export async function releaseStartupLock(lockPath = STARTUP_LOCK_PATH, token) {
  const record = await readStartupLockRecord(lockPath);
  if (!record || record.pid !== process.pid || record.token !== token) return;
  await unlink(lockPath).catch(() => {});
}

// Attempts to claim `filename` for one port, writing `buildSession()`'s
// result as the claim's content. Returns null when the port is held by a
// live (non-stale) claim — the caller should try the next requested port.
// Returns { session, filename } on success.
//
// PR #894 round 7 P2: claim creation and reclaim-replacement both happen
// entirely inside withReclaimLock's per-port critical section — there is no
// fast `wx` attempt outside the lock. The prior fast path (an unlocked
// `open(filename, "wx")` tried before ever taking the lock) could win a
// create in the exact window a *different*, lock-holding caller had just
// unlinked the same stale claim but not yet recreated it, so the
// lock-holder's own follow-up `open(..., "wx")` failed with a raw,
// unhandled EEXIST instead of the normal "unavailable" result (this is
// what made the `three racing claimants` stress test fail intermittently).
// Reclaiming a stale claim also no longer unlinks then creates: it writes
// the replacement to a temp path unique to this pid+call, then commits with
// one `rename` over the stale file. Because the temp write and the rename
// both happen without ever releasing the lock in between, no other caller
// can be mid-decision on the same stale record when the rename lands, so
// the "content-blind" rename race described above withReclaimLock can't
// recur even though rename (unlike `wx`) will silently replace a target
// that changed underneath it — that's the property the lock is protecting.
async function claimPort(filename, buildSession) {
  return withReclaimLock(filename, async () => {
    let handle;
    try {
      handle = await open(filename, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      handle = null;
    }
    if (handle) {
      const session = buildSession();
      try {
        await handle.writeFile(`${JSON.stringify(session, null, 2)}\n`);
        await handle.close();
      } catch (error) {
        await handle.close().catch(() => {});
        await unlink(filename).catch(() => {});
        throw error;
      }
      return { session, filename };
    }
    if (!(await isStaleClaim(filename))) return null;
    const tempPath = `${filename}.tmp-${process.pid}-${randomUUID()}`;
    const tempHandle = await open(tempPath, "wx", 0o600);
    const session = buildSession();
    try {
      await tempHandle.writeFile(`${JSON.stringify(session, null, 2)}\n`);
      await tempHandle.close();
      await rename(tempPath, filename);
    } catch (error) {
      await tempHandle.close().catch(() => {});
      await unlink(tempPath).catch(() => {});
      throw error;
    }
    return { session, filename };
  });
}

export async function claimSession({
  owner,
  task,
  profile,
  root,
  ports = DEFAULT_PORTS,
  registry = REGISTRY,
}) {
  await mkdir(registry, { recursive: true, mode: 0o700 });
  const attempted = [];
  for (const port of ports) {
    const filename = path.join(registry, `${port}.json`);
    attempted.push(filename);
    const claimed = await claimPort(filename, () => ({
      id: randomUUID(),
      owner,
      task,
      profile,
      root,
      port,
      url: `http://127.0.0.1:${port}`,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }));
    if (claimed === null) continue;
    const { session } = claimed;
    if (!(await portAvailable(port))) {
      await unlink(filename);
      continue;
    }
    return { ...session, filename };
  }
  throw new Error(
    `No requested port is free and unclaimed (checked: ${attempted.join(", ")}). ` +
      "A dead-pid claim is reclaimed automatically; if this still fails, run " +
      "status, confirm the owning pid is actually gone (ps -p <pid>), and " +
      "delete that exact file yourself — never delete the whole registry " +
      "while sessions may be active.",
  );
}

export async function releaseSession(session) {
  try {
    const current = JSON.parse(await readFile(session.filename, "utf8"));
    if (current.id === session.id) await unlink(session.filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function listSessions(registry = REGISTRY) {
  const files = await readdir(registry).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return Promise.all(
    files
      .filter((name) => /^\d+\.json$/.test(name))
      .sort()
      .map(async (name) => {
        const filename = path.join(registry, name);
        try {
          const session = JSON.parse(await readFile(filename, "utf8"));
          const alive = isAlive(session.pid);
          return {
            ...session,
            filename,
            processState: alive
              ? "running-or-starting"
              : "stale-check-before-removing",
          };
        } catch {
          return {
            filename,
            processState: "unreadable-or-being-created-do-not-reclaim",
          };
        }
      }),
  );
}

// Any live managed session, regardless of owner/task/root: this tool enforces
// exactly one dev server for the whole machine, not just per owner/task.
export async function findLiveSession(registry = REGISTRY) {
  const sessions = await listSessions(registry);
  return (
    sessions.find((entry) => entry.processState === "running-or-starting") ??
    null
  );
}

// Node runtime options that can appear before the entry script in
// `node <options...> <entry-script> <args...>`, and must be skipped rather
// than mistaken for the script itself. `-r`/`--require`, `--loader`,
// `--import`, `-C`/`--conditions`, and `--title` each take a separate
// following value that must be skipped too; every other runtime/V8 flag
// here (`--inspect[-brk][=...]`, `--experimental-*`, `--no-warnings`,
// `--max-old-space-size=...`, `--enable-source-maps`, `--env-file=...`, and
// any other `-`/`--` flag) is self-contained. `-e`/`--eval`/`-p` mean Node
// runs an inline expression with no script at all.
const NODE_VALUE_OPTIONS = new Set([
  "-r",
  "--require",
  "--loader",
  "--import",
  "-C",
  "--conditions",
  "--title",
]);
const NODE_NO_SCRIPT_OPTIONS = new Set(["-e", "--eval", "-p"]);

// PR #894 round 9 P2: this used to scan *every* token after `node` for
// something vite-path-shaped, so `node watcher.js /tmp/vite` — a script
// merely passed a path named "vite" as one of its own arguments — was
// misclassified as a Vite server. Only the actual Node entry script (the
// first token that isn't a runtime option) determines what Node will run;
// everything after it is the script's own argv and is never inspected.
// Returns null when there is no entry script at all (`-e`/`--eval`/`-p`, or
// the option list runs out without finding one).
function findNodeEntryScript(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (NODE_NO_SCRIPT_OPTIONS.has(token)) return null;
    if (NODE_VALUE_OPTIONS.has(token)) {
      i++; // also skip this option's separate value
      continue;
    }
    if (token.startsWith("-")) continue;
    return token;
  }
  return null;
}

// Matches only actual Vite invocations, never a command that merely mentions
// "vite" (`vim vite.config.ts`, `tail -f vite.log`, `grep vite package.json`).
// `command` is the command line with the leading pid already stripped.
// Recognized forms: a path segment ending in `/vite` or `/vite.js` (covers
// `node_modules/.bin/vite` and `vite/bin/vite.js`), a bare `vite` or
// `vite preview` as the first token, `node [options] <path>/vite[.js] ...`
// (options skipped via findNodeEntryScript, never scanned for a vite-ish
// path), and `npm exec vite` / `npx vite`.
export function isViteExecutableCommand(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const isVitePath = (token) => /(^|\/)vite(\.js)?$/.test(token);
  if (tokens[0] === "node" || /\/node$/.test(tokens[0])) {
    const entry = findNodeEntryScript(tokens.slice(1));
    return entry !== null && isVitePath(entry);
  }
  if (isVitePath(tokens[0])) return true;
  if (tokens[0] === "npm" && tokens[1] === "exec" && tokens[2] === "vite") {
    return true;
  }
  if (tokens[0] === "npx" && tokens[1] === "vite") return true;
  return false;
}

// This tool's own `dev:session start` runs Vite in-process (createServer()
// + server.listen(), inside startSession) rather than spawning a separate
// `vite` child, so a live `start` session never appears as a line
// isViteExecutableCommand matches — it looks like `node .../dev-session.mjs
// start ...`. Matches only the `start` subcommand: `guard`/`status`/`help`
// exit immediately (never a running server) and the `vite`/`vite preview`
// subcommands (the npm run dev/preview wrapper) spawn a real vite child
// that isViteExecutableCommand already matches separately, so counting the
// wrapper's own `dev-session.mjs vite` line here too would double-count it.
export function isDevSessionStartCommand(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const isDevSessionScript = (token) => /(^|\/)dev-session\.mjs$/.test(token);
  let rest;
  if (tokens[0] === "node" || /\/node$/.test(tokens[0])) {
    const argTokens = tokens.slice(1);
    const entry = findNodeEntryScript(argTokens);
    if (entry === null || !isDevSessionScript(entry)) return false;
    rest = argTokens.slice(argTokens.indexOf(entry) + 1);
  } else if (isDevSessionScript(tokens[0])) {
    rest = tokens.slice(1);
  } else {
    return false;
  }
  return rest[0] === "start";
}

// Pure filter over `ps -axo pid=,command=` output (full command line on both
// macOS and Linux — unlike `pgrep -l`, whose GNU procps build prints only the
// process *name* ("node"), never the vite path/args, so it could never match
// "vite" for a `node .../vite` invocation). Drops this process's own pid; the
// remaining lines are matched against isViteExecutableCommand, which
// classifies the executable itself rather than testing the whole line for a
// substring, so a real vite process under a path that happens to contain
// "vitest" (e.g. `/tmp/vitest-app/node_modules/.bin/vite`) is kept, while
// `vim vite.config.ts`, `tail -f vite.log`, a real `node_modules/.bin/vitest
// run`, and `node (vitest 1)` worker titles are all excluded.
export function filterViteProcessLines(stdout, { ownPid = process.pid } = {}) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const pid = Number(line.trim().split(/\s+/, 1)[0]);
      return pid !== ownPid;
    })
    .filter((line) => {
      const trimmed = line.trim();
      const firstSpace = trimmed.indexOf(" ");
      const command = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1);
      return isViteExecutableCommand(command);
    });
}

function parseUnmanagedProcessLine(line) {
  const trimmed = line.trim();
  const firstSpace = trimmed.indexOf(" ");
  const pid = Number(trimmed.slice(0, firstSpace));
  const command = trimmed.slice(firstSpace + 1).trim();
  const portMatch = command.match(/--port[=\s]+(\d+)/);
  return { pid, command, port: portMatch ? Number(portMatch[1]) : null };
}

// Detection of an unmanaged Vite process (e.g. a plain `npm run dev`, or one
// on a different port), which the registry cannot see. `ps` being
// unavailable, or matching nothing, must not itself throw — refuseIfServerRunning
// decides whether a match is a refusal.
export function findUnmanagedViteProcesses() {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
    });
    return filterViteProcessLines(out).map(parseUnmanagedProcessLine);
  } catch {
    return [];
  }
}

// PR #894 round 12 P2: findOtherAccountSessions used to scan every other OS
// account's registry directory (`propulse-dev-<uid>`) for a live session,
// but claimSession creates each registry with mode 0700 (owner-only) — this
// account can't read a foreign account's registry at all. That's not just a
// blind spot: `readdir`/JSON-parsing a 0700 directory throws EACCES, which
// the old ENOENT-only `.catch` let propagate, so a foreign account's
// registry existing on the machine at all (even empty, even stale) could
// crash an otherwise-legitimate solo start outright. The process table has
// no such barrier — `ps -axo pid=,command=` lists every process on the
// machine regardless of which account owns it — so this replaces the
// registry scan with one that matches either a real `vite` process
// (isViteExecutableCommand) or a `dev:session start` process
// (isDevSessionStartCommand, since that path runs Vite in-process and never
// shows up as a separate "vite" line), and excludes both this process's own
// pid and — for a caller that has spawned a real child of its own (the
// `npm run dev`/`npm run preview` wrapper) — that child's pid, so a caller
// never mistakes its own server for a foreign one. Used for BOTH the
// pre-start guard (refuseIfServerRunning, below) and the post-bind rescan
// (startSession, runManagedVite): the invariant "at most one dev server per
// machine" is enforced by what is actually running, not by which files this
// account happens to be allowed to read — so it holds across accounts.
// Pure filter mirroring filterViteProcessLines, but matching either form a
// foreign dev server can take on the process table: a real Vite process
// (isViteExecutableCommand) or this tool's own in-process `dev:session
// start` (isDevSessionStartCommand). Excludes this process's own pid and —
// for a caller that has spawned a real child of its own (the `npm run
// dev`/`npm run preview` wrapper) — that child's pid too, so a caller never
// mistakes its own server for a foreign one.
export function filterForeignDevServerLines(
  stdout,
  { ownPid = process.pid, ownChildPid = null } = {},
) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const pid = Number(line.trim().split(/\s+/, 1)[0]);
      return pid !== ownPid && pid !== ownChildPid;
    })
    .filter((line) => {
      const trimmed = line.trim();
      const firstSpace = trimmed.indexOf(" ");
      const command = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1);
      return (
        isViteExecutableCommand(command) || isDevSessionStartCommand(command)
      );
    });
}

export function findForeignDevServers({
  ownPid = process.pid,
  ownChildPid = null,
} = {}) {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
    });
    return filterForeignDevServerLines(out, { ownPid, ownChildPid }).map(
      parseUnmanagedProcessLine,
    );
  } catch {
    return [];
  }
}

// Registry-only check: unit-testable in isolation from the real machine's
// process table (see assertPortFree for the authoritative OS-level port
// check, and findUnmanagedViteProcesses for the process-name check that
// catches an unmanaged server on a *different* port).
export async function assertNoRunningServer(registry = REGISTRY) {
  const live = await findLiveSession(registry);
  if (live) {
    throw new Error(
      `A dev server is already running: owner=${live.owner} task=${live.task} at ${live.url}. ${SINGLE_SERVER_RULE}`,
    );
  }
}

// An occupied port means a server (this tool's or not) is already there,
// regardless of what the registry or the process table say.
export async function assertPortFree(port = SHARED_PORT) {
  if (!(await portAvailable(port))) {
    throw new Error(
      `Port ${port} is already in use by another process. ${SINGLE_SERVER_RULE}`,
    );
  }
}

// Composite guard shared by `start` and `guard`: registry, port, and any
// unmanaged vite-looking process (e.g. one already running on a different
// port, which assertPortFree cannot see) all refuse. DEV_SERVER_ALLOW_EXTRA
// only ever changes which port `start` itself binds — it does not bypass
// this check; a second server is a second server regardless of who set it.
export async function refuseIfServerRunning({
  registry = REGISTRY,
  port = SHARED_PORT,
  findUnmanaged = findForeignDevServers,
} = {}) {
  await assertNoRunningServer(registry);
  await assertPortFree(port);
  const unmanaged = findUnmanaged();
  if (unmanaged.length) {
    const details = unmanaged
      .map(
        (p) => `pid=${p.pid} port=${p.port ?? "unknown"} command=${p.command}`,
      )
      .join("\n");
    throw new Error(
      `A dev server is already running (unmanaged by this tool):\n${details}\n` +
        `${SINGLE_SERVER_RULE} Run \`npm run dev:session -- status\` and ask ` +
        "the orchestrator to use or stop that process — never stop or start " +
        "a server yourself.",
    );
  }
}

// Shared by startSession (its in-process server is "ready" the instant
// server.listen() resolves) and runManagedVite (whose spawned child's
// readiness is detected externally — see waitForChildListening below):
// once the server backing this session is confirmed up, re-run
// findUnmanaged() and, on any hit, throw the same named message so the
// caller stops itself rather than let two dev servers coexist. See
// findForeignDevServers's own comment for why this holds across OS
// accounts even though STARTUP_LOCK_PATH/REGISTRY do not.
async function rescanAndYieldIfForeignServerFound({ findUnmanaged, pid, port }) {
  const foreign = await findUnmanaged();
  if (!foreign.length) return;
  const details = foreign
    .map(
      (proc) =>
        `pid=${proc.pid} port=${proc.port ?? "unknown"} command=${proc.command}`,
    )
    .join("\n");
  throw new Error(
    `Another dev server appeared while starting (pid=${pid} ` +
      `port=${port}):\n${details}\n${SINGLE_SERVER_RULE} This ` +
      "session is stopping itself so at most one remains — retry once " +
      "only one server is left.",
  );
}

export async function startSession(options) {
  const root = await realpath(process.cwd());
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (manifest.name !== "propulse")
    throw new Error("Run from the ProPulse checkout/worktree root.");
  const registry = options.registry ?? REGISTRY;
  const lockPath = options.lockPath ?? STARTUP_LOCK_PATH;
  const importVite = options.importVite ?? (() => import("vite"));
  const findUnmanaged = options.findUnmanaged ?? findForeignDevServers;
  // Held from the first check through claim + spawn, released in `finally` —
  // see the startup-lock comment above claimPort. Not held across the
  // server's running lifetime: once spawned, refuseIfServerRunning's own
  // registry/port checks are what keep a later `start` out.
  const startupLockToken = await acquireStartupLock(lockPath);
  try {
    await refuseIfServerRunning({
      registry,
      port: options.port ?? SHARED_PORT,
      findUnmanaged,
    });
    const session = await claimSession({
      ...options,
      root,
      ports: options.port ? [options.port] : DEFAULT_PORTS,
      registry,
    });
    let server;
    let shuttingDown = false;
    let interrupted = false;
    const finish = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      try {
        await server?.close();
        await releaseSession(session);
        delete process.env.PROPULSE_DEV_SESSION;
      } catch (error) {
        console.error(
          `Cleanup failed; inspect ${session.filename}: ${error.message}`,
        );
        process.exitCode = 1;
      }
    };
    const onSignal = () => {
      interrupted = true;
      if (server)
        void finish().then(() => process.exit(process.exitCode ?? 0));
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    try {
      if (options.profile === "local") {
        // Existing unconfigured-client path, scoped to this process; never edit .env.
        process.env.VITE_SUPABASE_URL = "";
        process.env.VITE_SUPABASE_ANON_KEY = "";
      }
      // The identity middleware lives once, in vite.config.ts, so a plain
      // `npm run dev` answers /__propulse_dev_session too. createServer() below
      // loads that same config file; this env var lets its plugin tell a
      // managed session's real identity apart from the plain-`npm run dev`
      // fallback, without registering a second copy of the middleware here.
      process.env.PROPULSE_DEV_SESSION = JSON.stringify(session);
      const { createServer } = await importVite();
      server = await createServer({
        root,
        cacheDir: path.join(
          root,
          "node_modules",
          ".vite-sessions",
          String(session.port),
        ),
        server: {
          host: "127.0.0.1",
          port: session.port,
          strictPort: true,
          open: false,
        },
      });
      if (interrupted) {
        await finish();
        return;
      }
      await server.listen();
      // PR #894 round 11 P2, round 12 P2: the startup lock above only
      // serializes starts under this same OS account, so a same-moment
      // racer under a different account (each with DEV_SERVER_ALLOW_EXTRA=1
      // and a distinct port) can pass refuseIfServerRunning and bind before
      // either sees the other. This closes that race from the other side:
      // now that our own Vite has bound, re-run findUnmanaged() (the
      // process-table scan — see findForeignDevServers) excluding this
      // session itself and throw the same named message on a hit. Both
      // racers can find each other here and both yield; that is fine, since
      // the invariant is "at most one", and the next `start` after either
      // exits succeeds. This check is a process-table scan, not a
      // file/registry one, so it holds across OS accounts: a foreign
      // account's dev server is a real process either way, and `ps` has no
      // permission barrier the way a foreign account's 0700 registry
      // directory does.
      await rescanAndYieldIfForeignServerFound({
        findUnmanaged,
        pid: session.pid,
        port: session.port,
      });
      console.log(JSON.stringify({ ...session, state: "ready" }, null, 2));
      console.log(
        "Keep this foreground session for handoff. Ctrl-C stops only this server. Never put credentials in owner/task metadata.",
      );
    } catch (error) {
      await finish();
      throw error;
    }
  } finally {
    await releaseStartupLock(lockPath, startupLockToken);
  }
}

// Matches any argv token that would let a forwarded `npm run dev -- ...` (or
// `npm run preview -- ...`) change which port/host the real Vite binary binds
// to, in every form Vite/CLI convention accepts it: `-p`, `--port`,
// `--port=5180`, `--host`, `--host=0.0.0.0`, `--strictPort`,
// `--no-strictPort` (cac, Vite's own CLI parser, auto-generates the negated
// form for every boolean flag), and `--strictPort false` (Vite itself takes
// `--strictPort`/`--no-strictPort` as bare boolean flags, but a caller could
// still pass a following value; catch that shape too).
const FORWARDED_OVERRIDE_FLAG =
  /^(-p|--port|--host|--strictPort|--no-strictPort)(=.*)?$/;

export function findForwardedOverrideFlags(args) {
  return args.filter((arg) => FORWARDED_OVERRIDE_FLAG.test(arg));
}

// Of the flags FORWARDED_OVERRIDE_FLAG recognizes, only -p/--port/--host
// take a value; --strictPort/--no-strictPort are pure booleans in Vite's own
// CLI. PR #894 round 8 P1: findDisallowedForwardedArgs used to call
// consumesValue() unconditionally for every FORWARDED_OVERRIDE_FLAG match,
// so `--strictPort <path>` swallowed the following token as if it were
// --strictPort's "value" — hiding a smuggled positional root path (which
// Vite would parse as `vite [root]`, not as anything belonging to
// --strictPort) from the positional-argument refusal below entirely.
const FORWARDED_OVERRIDE_VALUE_FLAGS = new Set(["-p", "--port", "--host"]);

// Extracts an explicit `-p <n>`, `--port <n>`, or `--port=<n>` value from a
// forwarded arg list, or null when none is present (or its value isn't a
// plain integer). Used only to pick which port to guard when
// DEV_SERVER_ALLOW_EXTRA=1 legitimately moves the single server elsewhere —
// never to decide whether an override is allowed at all.
export function parseForwardedPort(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const equals = /^--port=(\d+)$/.exec(arg);
    if (equals) return Number(equals[1]);
    if (arg === "-p" || arg === "--port") {
      const value = args[i + 1];
      if (value !== undefined && /^\d+$/.test(value)) return Number(value);
    }
  }
  return null;
}

function isFlagToken(token) {
  return token.startsWith("-");
}

// Flags that cannot change which port/host/root/config Vite loads, safe to
// forward unconditionally (never gated by DEV_SERVER_ALLOW_EXTRA — that
// hatch only ever moves the single server to a different port, never its
// config or working root).
//
// --debug/-d take an *optional* value in Vite's own CLI (a feature-filter
// string, e.g. `--debug hmr`), which makes "does the next token belong to
// --debug, or is it a smuggled positional/unknown flag" ambiguous from argv
// shape alone — the same shape of ambiguity --strictPort's fix above closes
// by never consuming. Rather than guess from the next token's shape (a
// leading `/`, a `.`, etc.), --debug/-d are classified boolean here: they
// never consume a following token, so `--debug hmr` forwards only `--debug`
// and separately refuses the bare positional `hmr` below. --debug's own
// `=`-value form (`--debug=hmr`) still works, since that never depends on
// token consumption.
const ALLOWED_FORWARDED_BOOLEAN_FLAGS = new Set([
  "--open",
  "--force",
  "--clearScreen",
  "--no-clearScreen",
  "--profile",
  "--cors",
  "--no-cors",
  "--debug",
  "-d",
]);
const ALLOWED_FORWARDED_VALUE_FLAGS = new Set([
  "--logLevel",
  "-l",
  "--filter",
  "-f",
]);

// An allowlist, not a denylist: every forwarded arg must be either a
// port/host/strictPort flag (handled separately by
// findForwardedOverrideFlags/parseForwardedPort/the DEV_SERVER_ALLOW_EXTRA
// hatch above) or one of the flags above known to be incapable of changing
// the port/host/root/config Vite loads. Anything else — an unrecognized
// flag such as `--config`/`-c`, `--root`/`-r`, or `--mode`/`-m` (which could
// point Vite at a different config, working root, or env-loaded
// `VITE_PORT`-style value), or a bare positional argument (Vite's
// `vite [root]`) — is refused by default instead of silently forwarded. A
// value flag consumes exactly one following non-flag token as its value so
// it's never itself re-examined as a stray positional or unknown flag; an
// unrecognized flag does the same, so the refusal names the flag once
// rather than also flagging its argument as a second, confusing positional.
export function findDisallowedForwardedArgs(args) {
  const disallowed = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const consumesValue = () => {
      if (
        !arg.includes("=") &&
        args[i + 1] !== undefined &&
        !isFlagToken(args[i + 1])
      ) {
        i++;
      }
    };
    const [flag] = arg.split("=");
    if (FORWARDED_OVERRIDE_FLAG.test(arg)) {
      if (FORWARDED_OVERRIDE_VALUE_FLAGS.has(flag)) consumesValue();
      continue;
    }
    if (ALLOWED_FORWARDED_BOOLEAN_FLAGS.has(flag)) continue;
    if (ALLOWED_FORWARDED_VALUE_FLAGS.has(flag)) {
      consumesValue();
      continue;
    }
    disallowed.push(arg);
    if (isFlagToken(arg)) consumesValue();
  }
  return disallowed;
}

// PR #894 round 12 P2: unlike startSession, which awaits an in-process
// server.listen(), runManagedVite spawns a real OS child — there is no
// promise that resolves once it's actually listening. Polls
// portAvailable(port) (bound === no longer available) until it reports
// bound or `exited` settles first (a startup failure — nothing to rescan
// for, and no point waiting out the rest of the timeout), whichever comes
// first, bounded by a timeout so a child that never listens and never
// exits can't hang the wrapper forever. Returns false (never ready) on a
// timeout or an early exit.
const WRAPPER_READY_TIMEOUT_MS = 10_000;
const WRAPPER_READY_POLL_MS = 50;

async function waitForChildListening(
  port,
  exited,
  { timeoutMs = WRAPPER_READY_TIMEOUT_MS, pollMs = WRAPPER_READY_POLL_MS } = {},
) {
  let childExited = false;
  exited.then(
    () => {
      childExited = true;
    },
    () => {
      childExited = true;
    },
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childExited) return false;
    if (!(await portAvailable(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

// Runs `vite` or `vite preview` for real, but only after the same guard
// `start` uses, and only after confirming the caller isn't trying to sneak a
// port/host/strictPort override past that guard (see module doc comment).
// `guard` and `spawnFn` are injectable so tests never touch the real machine's
// process table or actually spawn Vite. `findUnmanaged` is injectable the
// same way startSession's is, for the post-readiness rescan below
// (rescanAndYieldIfForeignServerFound); its default excludes this
// wrapper's own spawned child (ownChildPid) as well as this process itself,
// so the wrapper never mistakes its own vite child for a foreign server.
export async function runManagedVite(
  args,
  {
    spawnFn = spawn,
    guard = refuseIfServerRunning,
    lockPath = STARTUP_LOCK_PATH,
    findUnmanaged,
    waitForListening = waitForChildListening,
  } = {},
) {
  const isPreview = args[0] === "preview";
  const forwarded = isPreview ? args.slice(1) : args;
  // Unconditional, and checked before anything else: unlike the
  // port/host/strictPort override below, no hatch ever permits a forwarded
  // flag or positional argument that could change the config/root Vite
  // loads — the managed server always runs this checkout's checked-in
  // vite.config.ts.
  const disallowedArgs = findDisallowedForwardedArgs(forwarded);
  if (disallowedArgs.length) {
    throw new Error(
      `Refusing to forward ${disallowedArgs.join(", ")} to vite: the managed ` +
        `server always runs this checkout's checked-in vite.config.ts on ` +
        `${SHARED_PORT}. Edit vite.config.ts for a config change, or move the ` +
        "single server to a different port with DEV_SERVER_ALLOW_EXTRA=1 " +
        "through dev:session — never a forwarded flag that could change " +
        "its config, root, or working directory.",
    );
  }
  const overrides = findForwardedOverrideFlags(forwarded);
  const hatchSet = process.env.DEV_SERVER_ALLOW_EXTRA === "1";
  // Without the hatch, an override is always refused below regardless of
  // what's on the default port, so guard the default port as usual. With the
  // hatch AND an override, guard the port Vite will actually bind instead —
  // the default port may legitimately be occupied by something else in
  // exactly this scenario (that's the documented reason the hatch exists).
  // Either way, refuseIfServerRunning's unmanaged-process scan is machine-wide
  // and its registry check is port-independent, so "one server per machine"
  // still holds no matter which port is passed here.
  const targetPort =
    overrides.length && hatchSet
      ? (parseForwardedPort(forwarded) ?? SHARED_PORT)
      : SHARED_PORT;
  // Held from the guard check through the post-readiness rescan below —
  // longer than before round 12 P2, which released it right after spawn
  // and never rescanned at all (see waitForChildListening's comment). Still
  // released before awaiting the (potentially long-lived, foreground)
  // child — see the startup-lock comment above claimPort.
  const startupLockToken = await acquireStartupLock(lockPath);
  let child;
  let exited;
  try {
    await guard({ port: targetPort });
    if (overrides.length && !hatchSet) {
      throw new Error(
        `Refusing to forward ${overrides.join(", ")} to vite: ${SINGLE_SERVER_RULE} ` +
          "DEV_SERVER_ALLOW_EXTRA=1 is the owner-only escape hatch that moves the " +
          "single server to a different port/host; it never permits a second, " +
          "simultaneous server.",
      );
    }
    const root = await realpath(process.cwd());
    const bin = path.join(root, "node_modules", ".bin", "vite");
    child = spawnFn(bin, isPreview ? ["preview", ...forwarded] : forwarded, {
      stdio: "inherit",
    });
    // Attached synchronously, in the same tick as spawn: awaiting readiness
    // below is async, and a child that exits immediately (e.g. a missing
    // binary, or a test's fake child) must never be able to fire "exit"
    // before a listener exists to catch it.
    exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    // PR #894 round 12 P2: this wrapper spawns a real vite child rather
    // than awaiting an in-process server.listen() the way startSession
    // does, and used to release the startup lock and move straight to
    // awaiting the child — it never rescanned for a foreign server the way
    // startSession does after binding. A same-moment racer under a
    // different OS account (each with DEV_SERVER_ALLOW_EXTRA=1 and a
    // distinct port) could pass the guard above and both `npm run dev`
    // before either noticed the other. waitForListening polls the child's
    // port for readiness (there is no listen() promise to await), then the
    // same rescanAndYieldIfForeignServerFound helper startSession uses
    // re-runs findUnmanaged() excluding this wrapper's own child (so it
    // never mistakes its own vite for a foreign one) and throws on a hit —
    // caught below, which stops the child before propagating.
    const listening = await waitForListening(targetPort, exited);
    if (listening) {
      const scanForForeign =
        findUnmanaged ?? (() => findForeignDevServers({ ownChildPid: child.pid }));
      await rescanAndYieldIfForeignServerFound({
        findUnmanaged: scanForForeign,
        pid: child.pid,
        port: targetPort,
      });
    }
  } catch (error) {
    if (child && !child.killed) child.kill();
    throw error;
  } finally {
    await releaseStartupLock(lockPath, startupLockToken);
  }
  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);
  try {
    const { code, signal } = await exited;
    process.exitCode = signal
      ? 128 + (os.constants.signals[signal] ?? 0)
      : (code ?? 1);
  } finally {
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "vite") {
    await runManagedVite(argv.slice(1));
    return;
  }
  const options = parseOptions(argv);
  if (options.command === "help") {
    console.log(
      `npm run dev:session -- status\nnpm run dev:session -- start --owner <agent-slug> --task <description> [--profile connected|local]\nnpm run dev:session -- guard\n` +
        `${SINGLE_SERVER_RULE}\n` +
        "start (and guard, run automatically by `npm run dev` and `npm run preview`, which route " +
        "through this script's `vite` and `vite preview` subcommands) refuses if any dev " +
        "server is already running: an occupied port 5173, a live registry entry, or an unmanaged " +
        "`vite`-looking process anywhere on this machine (any port) all refuse. Port is always 5173; " +
        "DEV_SERVER_ALLOW_EXTRA=1 moves the single server to a different port (owner-only escape " +
        "hatch); it does not bypass any of these checks and never permits a second server. The " +
        "`vite`/`vite preview` subcommands additionally refuse to forward a `--port`, `--host`, or " +
        "`--strictPort` override to the real Vite binary unless DEV_SERVER_ALLOW_EXTRA=1 is set. See " +
        "docs/guides/LOCAL-AGENT-TESTING.md.",
    );
  } else if (options.command === "status") {
    console.log(
      JSON.stringify(
        { registry: REGISTRY, sessions: await listSessions() },
        null,
        2,
      ),
    );
    console.log(
      "Registry covers managed sessions only. Also inspect listeners with: lsof -nP -iTCP -sTCP:LISTEN",
    );
  } else if (options.command === "guard") {
    await refuseIfServerRunning();
    console.log(`Port ${SHARED_PORT} is free; no managed session is live.`);
  } else {
    await startSession(options);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
