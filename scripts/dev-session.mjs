#!/usr/bin/env node
/** Foreground Vite sessions with machine-wide, per-user port claims. */
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
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
export const DEFAULT_PORTS = Array.from({ length: 20 }, (_, i) => 5180 + i);

export function parseOptions(args) {
  const [command = "status", ...rest] = args;
  if (!["start", "status", "help"].includes(command)) {
    throw new Error("Use start, status, or help.");
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

export async function claimSession({
  owner,
  task,
  profile,
  root,
  ports = DEFAULT_PORTS,
  registry = REGISTRY,
}) {
  await mkdir(registry, { recursive: true, mode: 0o700 });
  for (const port of ports) {
    const filename = path.join(registry, `${port}.json`);
    let handle;
    try {
      handle = await open(filename, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
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
    "No requested port is free and unclaimed. Run status; choose another port or coordinate with the owner. No server was stopped.",
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

export async function startSession(options) {
  const root = await realpath(process.cwd());
  const manifest = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (manifest.name !== "propulse")
    throw new Error("Run from the ProPulse checkout/worktree root.");
  const existing = (await listSessions()).find(
    (entry) =>
      entry.root === root &&
      entry.owner === options.owner &&
      entry.task === options.task &&
      entry.profile === options.profile &&
      entry.processState === "running-or-starting",
  );
  if (existing) {
    throw new Error(
      `This owner/task already has session ${existing.id} at ${existing.url}. Verify its identity and reuse it; use a distinct task for an independent scenario.`,
    );
  }
  const session = await claimSession({
    ...options,
    root,
    ports: options.port ? [options.port] : DEFAULT_PORTS,
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
      plugins: [
        {
          name: "propulse-dev-session-identity",
          configureServer(viteServer) {
            viteServer.middlewares.use((req, res, next) => {
              if (req.url !== "/__propulse_dev_session") return next();
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              res.end(JSON.stringify(session));
            });
          },
        },
      ],
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
      "npm run dev:session -- status\nnpm run dev:session -- start --owner <agent-slug> --task <description> [--profile connected|local] [--port 5180]\nSee docs/guides/LOCAL-AGENT-TESTING.md. Servers run in the foreground; no takeover or automatic stale-claim deletion.",
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
