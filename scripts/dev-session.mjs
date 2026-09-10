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
// requests --profile local so AuthGate is bypassed; a `connected` or
// `manual` session would otherwise pass the root check and still fail every
// test downstream at AuthGate). Throws with a message naming the found and
// required profile, or the found and expected root, on mismatch.
export function assertSharedServerIdentity(
  identity,
  { root, profile = "local" } = {},
) {
  if (identity?.profile !== profile) {
    throw new Error(
      `The shared dev server is running profile "${identity?.profile ?? "unknown"}" ` +
        `(owner=${identity?.owner ?? "unknown"}, url=${identity?.url ?? "unknown"}); ` +
        `this suite requires profile "${profile}". Ask the server's owner or ` +
        "the orchestrator to restart it with the required profile — never " +
        "start a second server to work around this.",
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

// A rename-then-create reclaim is atomic per-call but content-blind: a
// delayed loser's rename can land after the winner already recreated the
// claim file, silently displacing a live claim (found and fixed once
// already, empirically, as an intermittent race). Rather than keep chasing
// that class of bug, the reclaim decision (stale? unlink, then create) is
// now a true critical section, serialized per port by an exclusive `mkdir`
// lock directory — `mkdir` with no `recursive` option fails EEXIST if the
// lock is already held, which is the same atomicity guarantee `open(...,
// "wx")` gives for file creation.
const LOCK_STALE_MS = 10_000;
const MAX_LOCK_ATTEMPTS = 40;
const LOCK_RETRY_DELAY_MS = 50;

async function removeAbandonedLock(lockPath) {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      await rm(lockPath, { recursive: true, force: true });
    }
  } catch {
    // Already gone, or a transient stat error — the next mkdir attempt
    // will surface anything that still matters.
  }
}

async function withReclaimLock(filename, fn) {
  const lockPath = `${filename}.lock`;
  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    try {
      await mkdir(lockPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await removeAbandonedLock(lockPath);
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
      continue;
    }
    try {
      return await fn();
    } finally {
      await rm(lockPath, { recursive: true, force: true }).catch(() => {});
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
// checks/claims a *different* port. Recorded as pid+timestamp JSON in a
// single `wx`-created file; a lock whose pid is dead or whose timestamp is
// older than STARTUP_LOCK_STALE_MS is stale and is removed then retried once
// (not the long retry loop withReclaimLock uses — a stuck startup lock should
// surface immediately as a clear refusal, not silently retry for seconds).
export const STARTUP_LOCK_PATH = path.join(
  os.tmpdir(),
  `propulse-dev-session-${os.userInfo().uid}.lock`,
);
const STARTUP_LOCK_STALE_MS = 60_000;

async function readStartupLockRecord(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return null;
  }
}

async function isStaleStartupLock(lockPath) {
  const record = await readStartupLockRecord(lockPath);
  if (!record || typeof record.pid !== "number") return true;
  if (!isAlive(record.pid)) return true;
  return (
    typeof record.startedAt !== "number" ||
    Date.now() - record.startedAt > STARTUP_LOCK_STALE_MS
  );
}

export async function acquireStartupLock(lockPath = STARTUP_LOCK_PATH) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (attempt === 0 && (await isStaleStartupLock(lockPath))) {
        await unlink(lockPath).catch(() => {});
        continue;
      }
      throw new Error(
        "Another `dev:session start`/`npm run dev`/`npm run preview` is " +
          `already starting up on this machine. ${SINGLE_SERVER_RULE} Wait ` +
          "for it to finish and try again.",
      );
    }
    try {
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
      );
    } finally {
      await handle.close();
    }
    return;
  }
}

export async function releaseStartupLock(lockPath = STARTUP_LOCK_PATH) {
  await unlink(lockPath).catch(() => {});
}

// Attempts to claim `filename` for one port. Returns null when the port is
// held by a live (non-stale) claim — the caller should try the next
// requested port. Returns { handle } on success: the freshly opened
// exclusive-create file handle for the new claim.
async function claimPort(filename) {
  try {
    return { handle: await open(filename, "wx", 0o600) };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  // Contended: the fast uncontended path above failed, so re-examine and
  // (if warranted) reclaim `filename` entirely inside the lock, re-reading
  // its state fresh rather than trusting anything observed before we held
  // it.
  return withReclaimLock(filename, async () => {
    try {
      return { handle: await open(filename, "wx", 0o600) };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    if (!(await isStaleClaim(filename))) return null;
    await unlink(filename).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return { handle: await open(filename, "wx", 0o600) };
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
    const claimed = await claimPort(filename);
    if (claimed === null) continue;
    const { handle } = claimed;
    const session = {
      id: randomUUID(),
      owner,
      task,
      profile,
      root,
      port,
      url: `http://127.0.0.1:${port}`,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    try {
      await handle.writeFile(`${JSON.stringify(session, null, 2)}\n`);
      await handle.close();
      if (!(await portAvailable(port))) {
        await unlink(filename);
        continue;
      }
      return { ...session, filename };
    } catch (error) {
      await handle.close().catch(() => {});
      await unlink(filename).catch(() => {});
      throw error;
    }
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

// Matches only actual Vite invocations, never a command that merely mentions
// "vite" (`vim vite.config.ts`, `tail -f vite.log`, `grep vite package.json`).
// `command` is the command line with the leading pid already stripped.
// Recognized forms: a path segment ending in `/vite` or `/vite.js` (covers
// `node_modules/.bin/vite` and `vite/bin/vite.js`), a bare `vite` or
// `vite preview` as the first token, `node <path>/vite[.js] ...`, and
// `npm exec vite` / `npx vite`.
export function isViteExecutableCommand(command) {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const isVitePath = (token) => /(^|\/)vite(\.js)?$/.test(token);
  if (tokens[0] === "node" || /\/node$/.test(tokens[0])) {
    return tokens.slice(1).some(isVitePath);
  }
  if (isVitePath(tokens[0])) return true;
  if (tokens[0] === "npm" && tokens[1] === "exec" && tokens[2] === "vite") {
    return true;
  }
  if (tokens[0] === "npx" && tokens[1] === "vite") return true;
  return false;
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
  findUnmanaged = findUnmanagedViteProcesses,
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

export async function startSession(options) {
  const root = await realpath(process.cwd());
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (manifest.name !== "propulse")
    throw new Error("Run from the ProPulse checkout/worktree root.");
  const registry = options.registry ?? REGISTRY;
  const lockPath = options.lockPath ?? STARTUP_LOCK_PATH;
  // Held from the first check through claim + spawn, released in `finally` —
  // see the startup-lock comment above claimPort. Not held across the
  // server's running lifetime: once spawned, refuseIfServerRunning's own
  // registry/port checks are what keep a later `start` out.
  await acquireStartupLock(lockPath);
  try {
    await refuseIfServerRunning({
      registry,
      port: options.port ?? SHARED_PORT,
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
      const { createServer } = await import("vite");
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
      console.log(JSON.stringify({ ...session, state: "ready" }, null, 2));
      console.log(
        "Keep this foreground session for handoff. Ctrl-C stops only this server. Never put credentials in owner/task metadata.",
      );
    } catch (error) {
      await finish();
      throw error;
    }
  } finally {
    await releaseStartupLock(lockPath);
  }
}

// Matches any argv token that would let a forwarded `npm run dev -- ...` (or
// `npm run preview -- ...`) change which port/host the real Vite binary binds
// to, in every form Vite/CLI convention accepts it: `-p`, `--port`,
// `--port=5180`, `--host`, `--host=0.0.0.0`, `--strictPort`, and
// `--strictPort false` (Vite itself takes `--strictPort` as a bare boolean
// flag, but a caller could still pass a value; catch that shape too).
const FORWARDED_OVERRIDE_FLAG = /^(-p|--port|--host|--strictPort)(=.*)?$/;

export function findForwardedOverrideFlags(args) {
  return args.filter((arg) => FORWARDED_OVERRIDE_FLAG.test(arg));
}

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
const ALLOWED_FORWARDED_BOOLEAN_FLAGS = new Set([
  "--open",
  "--force",
  "--clearScreen",
  "--no-clearScreen",
  "--profile",
  "--cors",
  "--no-cors",
]);
const ALLOWED_FORWARDED_VALUE_FLAGS = new Set([
  "--logLevel",
  "-l",
  "--debug",
  "-d",
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
    if (FORWARDED_OVERRIDE_FLAG.test(arg)) {
      consumesValue();
      continue;
    }
    const [flag] = arg.split("=");
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

// Runs `vite` or `vite preview` for real, but only after the same guard
// `start` uses, and only after confirming the caller isn't trying to sneak a
// port/host/strictPort override past that guard (see module doc comment).
// `guard` and `spawnFn` are injectable so tests never touch the real machine's
// process table or actually spawn Vite.
export async function runManagedVite(
  args,
  {
    spawnFn = spawn,
    guard = refuseIfServerRunning,
    lockPath = STARTUP_LOCK_PATH,
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
  // Held only from the guard check through the spawn call, released before
  // awaiting the (potentially long-lived, foreground) child — see the
  // startup-lock comment above claimPort.
  await acquireStartupLock(lockPath);
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
    // Attached synchronously, in the same tick as spawn: releasing the lock
    // below is async, and a child that exits immediately (e.g. a missing
    // binary, or a test's fake child) must never be able to fire "exit"
    // before a listener exists to catch it.
    exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    await releaseStartupLock(lockPath);
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
