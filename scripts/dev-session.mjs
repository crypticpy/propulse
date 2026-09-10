#!/usr/bin/env node
/**
 * One shared foreground Vite dev server per machine, on port 5173.
 * `start` refuses when any other server (managed or unmanaged) is already
 * running. Agents never start their own; the human or orchestrator owns the
 * single shared session. See docs/guides/LOCAL-AGENT-TESTING.md.
 */
import { execFileSync } from "node:child_process";
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
      `The shared dev server is running profile "${identity?.profile ?? "unknown"}"; ` +
        `this suite requires "${profile}". Restart it with ` +
        `\`npm run dev:session -- start --profile ${profile} ...\`, or ask its owner to.`,
    );
  }
  if (identity?.root !== root) {
    throw new Error(
      `The shared dev server is serving a different tree than this one. ` +
        `Served: ${identity?.root ?? "unknown"}. This worktree: ${root}. Ask its ` +
        "owner to restart against this branch, or run these tests from the " +
        "worktree it already serves — never start a second server to work " +
        "around this.",
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

// Pure filter over `ps -axo pid=,command=` output (full command line on both
// macOS and Linux — unlike `pgrep -l`, whose GNU procps build prints only the
// process *name* ("node"), never the vite path/args, so it could never match
// "vite" for a `node .../vite` invocation). Drops vitest workers and this
// process's own pid; everything else containing "vite" is reported as an
// unmanaged Vite-looking process.
export function filterViteProcessLines(
  stdout,
  { ownPid = process.pid } = {},
) {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((line) => !/\bvitest\b/.test(line))
    .filter((line) => {
      const pid = Number(line.trim().split(/\s+/, 1)[0]);
      return pid !== ownPid;
    })
    .filter((line) => /\bvite\b/.test(line));
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
      .map((p) => `pid=${p.pid} port=${p.port ?? "unknown"} command=${p.command}`)
      .join("\n");
    throw new Error(
      `A dev server is already running (unmanaged by this tool):\n${details}\n` +
        `${SINGLE_SERVER_RULE} Run \`npm run dev:session -- status\` and use the ` +
        "existing server, or stop that process yourself.",
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
  await refuseIfServerRunning({ registry, port: options.port ?? SHARED_PORT });
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
    if (server) void finish().then(() => process.exit(process.exitCode ?? 0));
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
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === "help") {
    console.log(
      `npm run dev:session -- status\nnpm run dev:session -- start --owner <agent-slug> --task <description> [--profile connected|local]\nnpm run dev:session -- guard\n` +
        `${SINGLE_SERVER_RULE}\n` +
        "start (and guard, run automatically before `npm run dev` via predev) refuses if any dev " +
        "server is already running: an occupied port 5173, a live registry entry, or an unmanaged " +
        "`vite`-looking process anywhere on this machine (any port) all refuse. Port is always 5173; " +
        "DEV_SERVER_ALLOW_EXTRA=1 moves the single server to a different port (owner-only escape " +
        "hatch); it does not bypass any of these checks and never permits a second server. See " +
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
