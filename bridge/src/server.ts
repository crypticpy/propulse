/**
 * ProPulse Bridge Server
 *
 * WebSocket server for CAT control, multi-operator synchronization,
 * DX cluster spots, WSJT-X decodes, and external integrations.
 * Binds to localhost only for security.
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import fs from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  createMessage,
  isMessageEnvelope,
  MessageEnvelope,
  MessageTypes,
} from "./types.js";
import type {
  ClusterConfig,
  ClusterNodeConfig,
  Ft8TxStartPayload,
  RigStatus,
  WSJTXConfig,
  WSJTXEmitConfig,
} from "./types.js";
import { DXClusterClient } from "./cluster.js";
import { WSJTXListener } from "./wsjtx.js";
import { WSJTXEmitter } from "./wsjtxEmitter.js";
import { RigController, type RigControllerConfig } from "./rig.js";
import { PttSafetyController } from "./pttSafety.js";
import { CivSpectrumClient, pixelToDb, type CivSpectrumLine } from "./civ.js";
import { AudioCapture } from "./audioCapture.js";
import { scanForIcomRadios } from "./discovery.js";
import { resolveAudioDevice } from "./audioResolver.js";
import { handleApiRequest } from "./apiMount.js";
import { handleSettingsSyncRequest } from "./settingsSync.js";
import { startLanDiscovery, stopLanDiscovery } from "./lanDiscovery.js";

// ============================================================================
// Configuration
// ============================================================================

interface ServerConfig {
  port: number;
  host: string;
}

function loadConfig(): ServerConfig {
  const port = parseInt(process.env.BRIDGE_PORT ?? "9867", 10);
  const host = process.env.BRIDGE_HOST ?? "127.0.0.1";

  // Security: Only allow localhost bindings
  const allowedHosts = ["127.0.0.1", "localhost", "::1"];
  if (!allowedHosts.includes(host)) {
    throw new Error(
      `Security Error: Bridge server can only bind to localhost. ` +
        `Attempted to bind to '${host}'. ` +
        `Allowed values: ${allowedHosts.join(", ")}`,
    );
  }

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${process.env.BRIDGE_PORT}`);
  }

  return { port, host };
}

// ============================================================================
// Static File Server
// ============================================================================

const STATIC_PORT = parseInt(process.env.BRIDGE_STATIC_PORT ?? "3173", 10);
if (isNaN(STATIC_PORT) || STATIC_PORT < 1 || STATIC_PORT > 65535) {
  throw new Error(
    `Invalid static port number: ${process.env.BRIDGE_STATIC_PORT}`,
  );
}

// The static/API server stays localhost-only unless explicitly opened to the
// LAN. Unlike the rig-control WebSocket (which never leaves localhost), the
// static server only serves the SPA and public-data proxies.
const STATIC_HOST = process.env.BRIDGE_STATIC_HOST ?? "127.0.0.1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve frontend dist: monorepo layout (../../dist) or standalone (../frontend-dist)
const DIST_DIR = fs.existsSync(path.resolve(__dirname, "../../dist"))
  ? path.resolve(__dirname, "../../dist")
  : path.resolve(__dirname, "../frontend-dist");

let staticServer: http.Server | null = null;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

/**
 * Handle a single static file request asynchronously.
 * Uses fs/promises to avoid blocking the event loop during file reads.
 */
async function handleStaticRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const filePath = path.join(
    DIST_DIR,
    url.pathname === "/" ? "index.html" : url.pathname,
  );

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(DIST_DIR + path.sep) && resolved !== DIST_DIR) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const cacheControl =
    ext === ".html" || ext === ".webmanifest"
      ? "no-cache"
      : "public, max-age=31536000, immutable";

  try {
    const content = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(content);
  } catch {
    // SPA fallback: if file doesn't exist and has no extension, serve index.html
    if (!ext) {
      try {
        const indexContent = await readFile(path.join(DIST_DIR, "index.html"));
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(indexContent);
        return;
      } catch {
        // fall through to 404
      }
    }
    res.writeHead(404);
    res.end("Not Found");
  }
}

function startStaticServer(): void {
  if (!fs.existsSync(DIST_DIR)) {
    logger.info("No dist/ directory found — static server disabled", {
      expected: DIST_DIR,
    });
    return;
  }

  const server = http.createServer((req, res) => {
    handleSettingsSyncRequest(req, res)
      .then((handled) => {
        if (handled) return true;
        return handleApiRequest(req, res, logger);
      })
      .then((handled) => {
        if (!handled) return handleStaticRequest(req, res);
      })
      .catch((err: unknown) => {
        logger.error("Static file server request error", {
          error: err instanceof Error ? err.message : String(err),
        });
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      });
  });

  server.listen(STATIC_PORT, STATIC_HOST, () => {
    logger.info("Static file server listening", {
      host: STATIC_HOST,
      port: STATIC_PORT,
      distDir: DIST_DIR,
    });
    if (STATIC_HOST !== "127.0.0.1" && STATIC_HOST !== "localhost") {
      logger.info(
        "Static server is reachable from the LAN — serving SPA + public-data API only",
        { host: STATIC_HOST },
      );
      startLanDiscovery(STATIC_PORT, logger);
    }
  });

  server.on("error", (err) => {
    logger.error("Static file server error", { error: err.message });
  });

  staticServer = server;
}

// ============================================================================
// Logging
// ============================================================================

type LogLevel = "info" | "warn" | "error" | "debug";

interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

function createLogger(): Logger {
  const log = (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data }),
    };

    const output = JSON.stringify(logEntry);

    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  };

  return {
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    debug: (message, data) => log("debug", message, data),
  };
}

const logger = createLogger();

// ============================================================================
// Client Management
// ============================================================================

interface ConnectedClient {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  remoteAddress: string;
}

const clients = new Map<string, ConnectedClient>();

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Broadcast a message envelope to all connected clients */
function broadcast(envelope: MessageEnvelope): void {
  const json = JSON.stringify(envelope);
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(json);
    }
  }
}

/** Send a message envelope to a single client */
function sendToClient(
  client: ConnectedClient,
  envelope: MessageEnvelope,
): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(envelope));
  }
}

// ============================================================================
// Integration Modules
// ============================================================================

let clusterClient: DXClusterClient | null = null;
let wsjtxListener: WSJTXListener | null = null;
let rigController: RigController | null = null;
let rigControllerStopping: RigController | null = null;
let lastRigConfig: RigControllerConfig | undefined;
let rigStartingPromise: Promise<import("./rig.js").RigBackend> | null = null;

// Event handler disposers (prevent accumulation on reconnect cycles)
let rigStatusDispose: (() => void) | null = null;
let rigErrorDispose: (() => void) | null = null;
let rigSmeterDispose: (() => void) | null = null;
let clusterSpotDispose: (() => void) | null = null;
let clusterStatusDispose: (() => void) | null = null;
let clusterErrorDispose: (() => void) | null = null;
let wsjtxStatusDispose: (() => void) | null = null;
let wsjtxDecodeDispose: (() => void) | null = null;
let wsjtxQsoDispose: (() => void) | null = null;
let wsjtxClearDispose: (() => void) | null = null;
let wsjtxErrorDispose: (() => void) | null = null;
let wsjtxEmitter: WSJTXEmitter | null = null;

// CI-V spectrum streaming state
let civClient: CivSpectrumClient | null = null;
let civSpectrumDispose: (() => void) | null = null;
let civStatusDispose: (() => void) | null = null;
let civErrorDispose: (() => void) | null = null;
const fftSubscribers = new Set<string>();

// Audio capture streaming state
let audioCapture: AudioCapture | null = null;
let audioPcmDispose: (() => void) | null = null;
const audioSubscribers = new Set<string>();

// Grace-period timers — delay stream cleanup to survive brief reconnects
// (e.g. React StrictMode double-mount in dev mode)
let fftCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let audioCleanupTimer: ReturnType<typeof setTimeout> | null = null;
const STREAM_CLEANUP_GRACE_MS = 3000;

// ICOM built-in spectrum state (when using icom-serial or icom-network backend)
let icomSpectrumDispose: (() => void) | null = null;

// ICOM network audio state (when using icom-network backend)
let icomAudioDispose: (() => void) | null = null;

// FT8 TX state
let activeTxTimer: ReturnType<typeof setTimeout> | null = null;
let txActive = false;
let ft8TxGeneration = 0;

/** Maximum TX duration safety limit in milliseconds */
const FT8_TX_MAX_DURATION_MS = 20_000;
/** Minimum TX duration in milliseconds */
const FT8_TX_MIN_DURATION_MS = 1_000;
/** Manual PTT is always bounded so a lost browser cannot key a rig forever. */
const MANUAL_PTT_MAX_DURATION_MS = 180_000;

const pttSafety = new PttSafetyController(
  async (enabled) => {
    if (!enabled && !rigControllerStopping && !rigController) return;
    const controller = enabled
      ? await ensureRigController()
      : (rigControllerStopping ?? rigController);
    await controller?.setPTT(enabled);
  },
  MANUAL_PTT_MAX_DURATION_MS,
  (reason, error) => {
    logger.error("Failed to release manual PTT", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  },
);

async function releaseManualPtt(reason: string): Promise<void> {
  try {
    if (await pttSafety.release(reason)) {
      logger.info("Manual PTT released", { reason });
    }
  } catch (err: unknown) {
    logger.error("Failed to release manual PTT", {
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function setManualPtt(clientId: string, enabled: boolean): Promise<void> {
  await pttSafety.setManualPtt(clientId, enabled);
}

async function configurePttSafety(lockout: boolean): Promise<void> {
  await pttSafety.configure(lockout);
  if (lockout) {
    ft8TxGeneration += 1;
    await cancelActiveTx();
  }
}

// --------------------------------------------------------------------------
// DX Cluster Integration
// --------------------------------------------------------------------------

function startCluster(config: ClusterConfig): void {
  // Disconnect existing client if any
  stopCluster();

  const node = config.nodes[0];
  if (!node) {
    logger.warn("Cluster connect requested but no nodes provided");
    return;
  }

  if (config.nodes.length > 1) {
    logger.warn(
      "Multiple cluster nodes provided but only the first will be used; multi-node failover is not yet implemented",
      { nodeCount: config.nodes.length, activeNode: node.name },
    );
  }

  clusterClient = new DXClusterClient({
    host: node.host,
    port: node.port,
    callsign: config.callsign,
    password: config.password,
    filters: config.filters,
  });

  clusterSpotDispose = clusterClient.onSpot((spot) => {
    broadcast(createMessage(MessageTypes.CLUSTER_SPOT, spot));
  });

  clusterStatusDispose = clusterClient.onStatus((status) => {
    broadcast(createMessage(MessageTypes.CLUSTER_STATUS, status));
  });

  clusterErrorDispose = clusterClient.onError((error) => {
    logger.error("DX Cluster error", { error: error.message });
  });

  clusterClient.connect();

  logger.info("DX Cluster client started", {
    host: node.host,
    port: node.port,
    callsign: config.callsign,
  });
}

function stopCluster(): void {
  clusterSpotDispose?.();
  clusterSpotDispose = null;
  clusterStatusDispose?.();
  clusterStatusDispose = null;
  clusterErrorDispose?.();
  clusterErrorDispose = null;

  if (clusterClient) {
    clusterClient.disconnect();
    clusterClient = null;
    logger.info("DX Cluster client stopped");
  }
}

// --------------------------------------------------------------------------
// WSJT-X Integration
// --------------------------------------------------------------------------

function startWSJTX(config: WSJTXConfig): void {
  stopWSJTX();

  if (!config.enabled) return;

  wsjtxListener = new WSJTXListener(config.port);

  wsjtxStatusDispose = wsjtxListener.onStatus((status, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_STATUS, { ...status, instanceId }),
    );
  });

  wsjtxDecodeDispose = wsjtxListener.onDecode((decode, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_DECODE, { ...decode, instanceId }),
    );
  });

  wsjtxQsoDispose = wsjtxListener.onQSOLogged((qso, instanceId) => {
    broadcast(
      createMessage(MessageTypes.WSJTX_QSO_LOGGED, { ...qso, instanceId }),
    );
  });

  wsjtxClearDispose = wsjtxListener.onClear((window, instanceId) => {
    broadcast(createMessage(MessageTypes.WSJTX_CLEAR, { window, instanceId }));
  });

  wsjtxErrorDispose = wsjtxListener.onError((error) => {
    logger.error("WSJT-X listener error", { error: error.message });
  });

  wsjtxListener.start();

  logger.info("WSJT-X listener started", { port: config.port });
}

function stopWSJTX(): void {
  wsjtxStatusDispose?.();
  wsjtxStatusDispose = null;
  wsjtxDecodeDispose?.();
  wsjtxDecodeDispose = null;
  wsjtxQsoDispose?.();
  wsjtxQsoDispose = null;
  wsjtxClearDispose?.();
  wsjtxClearDispose = null;
  wsjtxErrorDispose?.();
  wsjtxErrorDispose = null;

  if (wsjtxListener) {
    wsjtxListener.stop();
    wsjtxListener = null;
    logger.info("WSJT-X listener stopped");
  }
}

// --------------------------------------------------------------------------
// WSJT-X Emitter Integration (outbound UDP to external apps)
// --------------------------------------------------------------------------

function startWSJTXEmitter(config: WSJTXEmitConfig): void {
  stopWSJTXEmitter();

  if (!config.enabled) return;

  wsjtxEmitter = new WSJTXEmitter(config.port);
  wsjtxEmitter.start();

  logger.info("WSJT-X emitter started", { port: config.port });
}

function stopWSJTXEmitter(): void {
  if (wsjtxEmitter) {
    wsjtxEmitter.stop();
    wsjtxEmitter = null;
    logger.info("WSJT-X emitter stopped");
  }
}

// --------------------------------------------------------------------------
// Rig Control Integration
// --------------------------------------------------------------------------

async function startRig(
  config?: RigControllerConfig,
): Promise<import("./rig.js").RigBackend> {
  // Cancel any in-flight startup before tearing down
  rigStartingPromise = null;
  stopRig();

  // Remember config so ensureRigController can reuse it
  if (config) lastRigConfig = config;

  rigController = new RigController(config);

  rigStatusDispose = rigController.onStatus((status) => {
    // Bridge-protocol broadcast (envelope format)
    broadcast(createMessage(MessageTypes.RIG_STATUS, status));
    // Compatibility: some frontend code still listens for rig.update.
    broadcast(createMessage(MessageTypes.RIG_UPDATE, status));

    // Daemon-protocol broadcast (flat format for SDR Console)
    broadcastDaemonRadioState(status);
  });

  rigErrorDispose = rigController.onError((error) => {
    logger.error("Rig controller error", { error: error.message });
  });

  rigSmeterDispose = rigController.onSmeter((dbm) => {
    broadcastSmeter(dbm);
  });

  const startPromise = rigController.start();
  rigStartingPromise = startPromise;

  try {
    const backend = await startPromise;
    logger.info("Rig controller started", { backend });
    return backend;
  } finally {
    // Only clear if this is still the active startup
    if (rigStartingPromise === startPromise) {
      rigStartingPromise = null;
    }
  }
}

function stopRig(): void {
  ft8TxGeneration += 1;
  if (activeTxTimer) {
    clearTimeout(activeTxTimer);
    activeTxTimer = null;
  }
  if (txActive) {
    txActive = false;
    broadcast(
      createMessage(MessageTypes.FT8_TX_STATUS, {
        active: false,
        timeRemainingMs: 0,
      }),
    );
  }

  rigStatusDispose?.();
  rigStatusDispose = null;
  rigErrorDispose?.();
  rigErrorDispose = null;
  rigSmeterDispose?.();
  rigSmeterDispose = null;

  if (rigController) {
    const controller = rigController;
    // Detach synchronously so a new start cannot observe or reuse a controller
    // that is already shutting down.
    rigController = null;
    const retainedForPttRelease =
      pttSafety.owner !== null && rigControllerStopping === null;
    if (retainedForPttRelease) rigControllerStopping = controller;

    const finishStop = () => {
      if (rigControllerStopping === controller && pttSafety.owner !== null) {
        setTimeout(finishStop, 250);
        return;
      }
      if (rigControllerStopping === controller) rigControllerStopping = null;
      controller.stop();
      logger.info("Rig controller stopped");
    };

    void releaseManualPtt("rig stopped")
      .then(() => controller.setPTT(false))
      .catch((err: unknown) => {
        logger.warn("PTT release during rig stop failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(finishStop);
  }
}

// ============================================================================
// Payload Normalizers & Validators
// ============================================================================

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toPortNumber(value: unknown): number | undefined {
  const port = toNumber(value);
  if (typeof port !== "number") return undefined;
  const normalized = Math.trunc(port);
  if (normalized < 1 || normalized > 65535) return undefined;
  return normalized;
}

function toBandNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+)/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

/** Validate and coerce a frequency value from untrusted input */
function validateFrequency(value: unknown): number {
  const freq = toNumber(value);
  if (freq === undefined || freq < 0 || freq > 1e12) {
    throw new Error(`Invalid frequency: ${JSON.stringify(value)}`);
  }
  return freq;
}

/** Validate a mode string from untrusted input (alphanumeric + hyphen only) */
function validateMode(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid mode: ${JSON.stringify(value)}`);
  }
  const mode = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(mode)) {
    throw new Error(`Invalid mode characters: ${JSON.stringify(value)}`);
  }
  return mode;
}

function normalizeClusterConfig(payload: unknown): ClusterConfig | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;

  const callsign =
    typeof p.callsign === "string" ? p.callsign.trim().toUpperCase() : "";
  if (!callsign) return null;

  const nodes: ClusterNodeConfig[] = [];
  if (Array.isArray(p.nodes)) {
    for (const node of p.nodes) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;
      const host = typeof n.host === "string" ? n.host.trim() : "";
      const port = toNumber(n.port);
      const name =
        typeof n.name === "string" && n.name.trim().length > 0
          ? n.name.trim()
          : host;
      if (!host || !port || port < 1 || port > 65535) continue;
      nodes.push({ host, port, name });
    }
  } else {
    const host = typeof p.host === "string" ? p.host.trim() : "";
    const port = toNumber(p.port);
    const name =
      typeof p.name === "string" && p.name.trim().length > 0
        ? p.name.trim()
        : host;
    if (host && port && port >= 1 && port <= 65535) {
      nodes.push({ host, port, name });
    }
  }

  if (nodes.length === 0) return null;

  let bands: number[] | undefined;
  let modes: string[] | undefined;
  let minSNR: number | undefined;

  if (typeof p.filters === "object" && p.filters !== null) {
    const filters = p.filters as Record<string, unknown>;

    if (Array.isArray(filters.bands)) {
      const normalized = filters.bands
        .map((b) => toBandNumber(b))
        .filter((b): b is number => typeof b === "number");
      if (normalized.length > 0) bands = normalized;
    }

    if (Array.isArray(filters.modes)) {
      const normalized = filters.modes
        .filter((m): m is string => typeof m === "string")
        .map((m) => m.trim().toUpperCase())
        .filter((m) => m.length > 0);
      if (normalized.length > 0) modes = normalized;
    }

    const min = toNumber(filters.minSNR);
    if (typeof min === "number") minSNR = min;
  }

  return {
    nodes,
    callsign,
    password:
      typeof p.password === "string" && p.password.length > 0
        ? p.password
        : undefined,
    filters:
      bands || modes || minSNR !== undefined
        ? { bands, modes, minSNR }
        : undefined,
  };
}

function parseRigControllerConfig(payload: unknown): {
  backend:
    | "auto"
    | "hamlib"
    | "flrig"
    | "icom-serial"
    | "icom-network"
    | "none";
  config?: RigControllerConfig;
} {
  if (typeof payload !== "object" || payload === null) {
    return { backend: "auto" };
  }

  const p = payload as Record<string, unknown>;
  const backendRaw =
    typeof p.backend === "string" ? p.backend.toLowerCase() : "auto";
  const host = typeof p.host === "string" ? p.host.trim() : undefined;
  const port = toPortNumber(p.port);

  if (backendRaw === "none") {
    return { backend: "none" };
  }

  if (backendRaw === "hamlib") {
    return {
      backend: "hamlib",
      config: {
        hamlibHost: host || "127.0.0.1",
        hamlibPort: port ?? 4533,
      },
    };
  }

  if (backendRaw === "flrig") {
    return {
      backend: "flrig",
      config: {
        flrigHost: host || "127.0.0.1",
        flrigPort: port ?? 12345,
      },
    };
  }

  if (backendRaw === "icom-serial") {
    const serialPort =
      typeof p.serialPort === "string" ? p.serialPort.trim() : undefined;
    const baudRate = toNumber(p.baudRate) ?? 19200;
    const radioAddress = toNumber(p.radioAddress) ?? 0x94;

    if (!serialPort) {
      return { backend: "auto" };
    }

    return {
      backend: "icom-serial",
      config: {
        icomSerial: {
          port: serialPort,
          baudRate,
          radioAddress,
        },
      },
    };
  }

  if (backendRaw === "icom-network") {
    const networkHost = typeof p.host === "string" ? p.host.trim() : undefined;
    const username =
      typeof p.username === "string" ? p.username.trim() : undefined;
    const password = typeof p.password === "string" ? p.password : undefined;
    const radioAddress = toNumber(p.radioAddress) ?? 0x94;

    if (!networkHost || !username || !password) {
      return { backend: "auto" };
    }

    return {
      backend: "icom-network",
      config: {
        icomNetwork: {
          host: networkHost,
          username,
          password,
          radioAddress,
          controlPort: toPortNumber(p.controlPort) ?? undefined,
          civPort: toPortNumber(p.civPort) ?? undefined,
          audioPort: toPortNumber(p.audioPort) ?? undefined,
        },
      },
    };
  }

  if (backendRaw === "icom-network") {
    const networkHost = typeof p.host === "string" ? p.host.trim() : undefined;
    const username = typeof p.username === "string" ? p.username : "";
    const password = typeof p.password === "string" ? p.password : "";

    if (!networkHost) {
      return { backend: "auto" };
    }

    return {
      backend: "icom-network",
      config: {
        icomNetwork: {
          host: networkHost,
          username,
          password,
        },
      },
    };
  }

  return { backend: "auto" };
}

function getRigStatusSnapshot(): RigStatus {
  return rigController?.getStatusSnapshot() ?? { connected: false };
}

// ============================================================================
// Daemon Protocol Support (flat JSON for SDR Console / useRadioDaemon)
// ============================================================================

const DAEMON_DEVICE_ID = "rig-0";

/**
 * Detect flat daemon-protocol commands.
 * These have a `type` string but NO `payload` key and NO `ts`/`timestamp`.
 * The type always contains a colon (e.g., "devices:enumerate", "radio:tune").
 */
function isDaemonCommand(
  obj: Record<string, unknown>,
): obj is { type: string; id?: string; [k: string]: unknown } {
  if (typeof obj.type !== "string") return false;
  // Daemon commands never have payload/ts/timestamp (bridge envelope fields)
  if (
    obj.payload !== undefined ||
    obj.ts !== undefined ||
    obj.timestamp !== undefined
  ) {
    return false;
  }
  // Daemon commands use colon-namespaced types OR "hello"
  return obj.type.includes(":") || obj.type === "hello";
}

/** Send a flat daemon-protocol JSON message to a client. */
function sendDaemonMessage(
  client: ConnectedClient,
  msg: Record<string, unknown>,
): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(msg));
  }
}

/** Send a daemon-protocol command response. */
function sendDaemonResponse(
  client: ConnectedClient,
  id: string | undefined,
  success: boolean,
  error?: string,
): void {
  if (!id) return;
  sendDaemonMessage(client, { type: "response", id, success, error });
}

/** Build a DeviceInfo object from the current rig state. */
function buildDaemonDeviceInfo(): {
  device_id: string;
  name: string;
  driver: string;
  type: "transceiver";
  available: boolean;
  capabilities: {
    can_transmit: boolean;
    can_stream_iq: boolean;
    can_stream_fft: boolean;
    can_stream_audio: boolean;
    antennas: string[];
    modes: string[];
    frequency_range: [number, number];
    sample_rates: number[];
    gain_stages: Array<{
      name: string;
      label: string;
      min: number;
      max: number;
      step: number;
    }>;
    commands: Record<string, boolean>;
  };
} {
  const backend = rigController?.getBackend() ?? "none";
  const controller = rigController;
  const status = controller?.getStatusSnapshot();
  const hasFullControl =
    backend === "hamlib" ||
    backend === "icom-serial" ||
    backend === "icom-network";
  const hasBasicControl = hasFullControl || backend === "flrig";
  return {
    device_id: DAEMON_DEVICE_ID,
    name:
      backend === "icom-serial"
        ? `${rigController?.getIcomModelName() ?? "ICOM"} (Direct CI-V)`
        : backend === "icom-network"
          ? `${rigController?.getIcomModelName() ?? "ICOM"} (RS-BA1 Network)`
          : backend === "hamlib"
            ? "Hamlib Rig (via WFView)"
            : backend === "flrig"
              ? "Flrig Rig"
              : "No Rig Detected",
    driver: backend,
    type: "transceiver",
    available: backend !== "none",
    capabilities: {
      can_transmit: hasFullControl,
      can_stream_iq: false,
      can_stream_fft: controller?.hasBuiltinSpectrum ?? false,
      can_stream_audio: controller?.hasBuiltinAudio ?? false,
      antennas: [],
      modes: status?.mode ? [status.mode] : [],
      frequency_range: [30000, 470000000],
      sample_rates: [],
      // Hamlib does not expose reliable per-level ranges/values through the
      // bridge today, so do not render sliders with invented values.
      gain_stages: [],
      commands: {
        tune: hasBasicControl,
        mode: hasBasicControl,
        gain: hasFullControl,
        squelch: false,
        agc: hasFullControl,
        antenna: hasFullControl,
        filter: hasFullControl,
        nr: hasFullControl,
        nb: hasFullControl,
        ptt: hasFullControl,
        vfo: hasBasicControl,
        rit: hasFullControl,
        xit: hasFullControl,
        split: hasFullControl,
        anf: hasFullControl,
        qsk: hasFullControl,
        vox: hasFullControl,
        if_shift: hasFullControl,
        cw_speed: hasFullControl,
      },
    },
  };
}

/** Convert a bridge RigStatus into a daemon-protocol RadioState. */
function rigStatusToDaemonState(status: RigStatus): {
  connected: boolean;
  freq: number;
  mode: string;
  vfo: "A" | "B";
  antenna: string;
  gains: Record<string, number>;
  agc: boolean;
  agcMode?: number;
  ptt: boolean;
  signal_dbm?: number;
  split?: boolean;
  rit?: { enabled: boolean; offsetHz: number };
  xit?: { enabled: boolean; offsetHz: number };
  anf?: boolean;
  qsk?: boolean;
  vox?: boolean;
  txAntenna?: string;
  txMeter?: { powerW?: number; swr?: number; alc?: number };
  cwSpeed?: number;
  ifShift?: number;
} {
  return {
    connected: status.connected,
    freq: status.frequency ?? 0,
    mode: status.mode ?? "USB",
    vfo: status.vfo ?? "A",
    antenna: "ANT1",
    gains: {},
    agc: (status.agcMode ?? 0) > 0, // Derive boolean from mode
    agcMode: status.agcMode,
    ptt: status.ptt ?? false,
    signal_dbm: status.smeter,
    split: status.split,
    rit: status.rit,
    xit: status.xit,
    anf: status.anf,
    qsk: status.qsk,
    vox: status.vox,
    txAntenna: status.txAntenna,
    txMeter: status.txMeter,
    cwSpeed: status.cwSpeed,
    ifShift: status.ifShift,
  };
}

/** Broadcast daemon-protocol radio:state to all connected clients. */
function broadcastDaemonRadioState(status: RigStatus): void {
  const msg = {
    type: "radio:state",
    device_id: DAEMON_DEVICE_ID,
    state: rigStatusToDaemonState(status),
  };
  const serialized = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(serialized);
    }
  }
}

/** Broadcast a radio:smeter message to all connected clients. */
function broadcastSmeter(dbm: number): void {
  const msg = JSON.stringify({
    type: "radio:smeter",
    device_id: DAEMON_DEVICE_ID,
    dbm,
  });
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(msg);
    }
  }
}

/**
 * Broadcast a binary FFT frame to all clients subscribed to FFT streaming.
 * Frame layout (little-endian):
 *   [0x01 type] [0x00 devIdx] [f64 centerHz] [f64 spanHz] [...f32 dBm bins]
 */
let fftFrameCount = 0;
const FFT_MAX_BUFFERED_BYTES = 512 * 1024;
function broadcastBinaryFftFrame(line: CivSpectrumLine): void {
  if (fftSubscribers.size === 0) return;

  const targets: WebSocket[] = [];
  for (const clientId of fftSubscribers) {
    const client = clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) continue;
    if (client.socket.bufferedAmount > FFT_MAX_BUFFERED_BYTES) continue;
    targets.push(client.socket);
  }
  if (targets.length === 0) return;

  fftFrameCount++;
  if (fftFrameCount <= 5 || fftFrameCount % 100 === 0) {
    logger.debug("FFT frame broadcast", {
      frame: fftFrameCount,
      bins: line.pixels.length,
      centerHz: line.centerHz,
      spanHz: line.spanHz,
      subscribers: fftSubscribers.size,
    });
  }

  const binCount = line.pixels.length;
  const byteLength = 1 + 1 + 8 + 8 + binCount * 4; // 18 + bins*4
  const buffer = Buffer.alloc(byteLength);

  // Header
  buffer[0] = 0x01; // FRAME_TYPE_FFT
  buffer[1] = 0x00; // devIdx = 0 (rig-0)

  // Center frequency and span as float64 LE
  buffer.writeDoubleLE(line.centerHz, 2);
  buffer.writeDoubleLE(line.spanHz, 10);

  // Convert pixels (0-200) to dBm float32 values
  for (let i = 0; i < binCount; i++) {
    const dBm = pixelToDb(line.pixels[i]);
    buffer.writeFloatLE(dBm, 18 + i * 4);
  }

  // Send binary to all FFT subscribers
  for (const socket of targets) {
    socket.send(buffer);
  }
}

/**
 * Broadcast a binary audio frame to all clients subscribed to audio streaming.
 * Frame layout (little-endian):
 *   [0x02 type] [0x00 devIdx] [u32 sampleRate] [...i16 PCM samples]
 */
let audioFrameCount = 0;
const AUDIO_MAX_BUFFERED_BYTES = 1024 * 1024;
function broadcastBinaryAudioFrame(
  samples: Int16Array,
  sampleRate: number,
): void {
  if (audioSubscribers.size === 0) return;

  const targets: WebSocket[] = [];
  for (const clientId of audioSubscribers) {
    const client = clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) continue;
    if (client.socket.bufferedAmount > AUDIO_MAX_BUFFERED_BYTES) continue;
    targets.push(client.socket);
  }
  if (targets.length === 0) return;

  audioFrameCount++;
  if (audioFrameCount <= 5 || audioFrameCount % 500 === 0) {
    logger.debug("Audio frame broadcast", {
      frame: audioFrameCount,
      samples: samples.length,
      sampleRate,
      subscribers: audioSubscribers.size,
    });
  }

  const headerBytes = 6; // type(1) + devIdx(1) + sampleRate(4)
  const byteLength = headerBytes + samples.length * 2;
  const buffer = Buffer.alloc(byteLength);

  buffer[0] = 0x02; // FRAME_TYPE_AUDIO
  buffer[1] = 0x00; // devIdx = 0
  buffer.writeUInt32LE(sampleRate, 2);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], headerBytes + i * 2);
  }

  for (const socket of targets) {
    socket.send(buffer);
  }
}

/** Start ffmpeg audio capture as fallback when ICOM built-in audio is unavailable. */
function startFfmpegAudioCapture(
  client: ConnectedClient,
  id: string | undefined,
  cmd: Record<string, unknown>,
): void {
  const audioSampleRate =
    typeof cmd.sample_rate === "number" ? cmd.sample_rate : 48000;

  // Use explicit device from command, fall back to auto-resolution
  void (async () => {
    let audioDevice =
      typeof cmd.audio_device === "string" && cmd.audio_device
        ? cmd.audio_device
        : null;

    // Auto-resolve audio device if not explicitly provided
    if (!audioDevice) {
      try {
        const backend = rigController?.getBackend();
        const serialPort =
          backend === "icom-serial"
            ? (lastRigConfig as Record<string, unknown>)?.serialPort
            : undefined;
        if (typeof serialPort === "string") {
          const resolved = await resolveAudioDevice(serialPort, "ICOM");
          if (resolved) {
            audioDevice = resolved.deviceId;
            logger.info("Auto-resolved audio device for ffmpeg", {
              device: resolved.deviceName,
              deviceId: resolved.deviceId,
              method: resolved.matchMethod,
            });
          }
        }
      } catch (err: unknown) {
        logger.warn("Audio device auto-resolution failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!audioDevice) {
      audioSubscribers.delete(client.id);
      sendDaemonResponse(
        client,
        id,
        false,
        "No audio input device was configured or matched to the radio",
      );
      return;
    }

    // Recover from a stale ffmpeg capture instance (process exited but object lingered).
    if (audioCapture && !audioCapture.isRunning()) {
      logger.warn("Audio capture was not running; recreating ffmpeg capture");
      audioPcmDispose?.();
      audioPcmDispose = null;
      audioCapture.stop();
      audioCapture = null;
    }

    if (!audioCapture) {
      audioCapture = new AudioCapture({
        device: audioDevice,
        sampleRate: audioSampleRate,
      });

      audioPcmDispose = audioCapture.onPcm((samples, sr) => {
        broadcastBinaryAudioFrame(samples, sr);
      });

      audioCapture.start();
      logger.info("Audio capture started (ffmpeg)", {
        device: audioDevice,
        sampleRate: audioSampleRate,
      });
    }

    sendDaemonResponse(client, id, true);
  })();
}

/** Stop audio capture and clean up resources. */
function stopAudioCapture(): void {
  audioPcmDispose?.();
  audioPcmDispose = null;
  if (audioCapture) {
    audioCapture.stop();
    audioCapture = null;
  }
  audioSubscribers.clear();
  logger.info("Audio capture stopped");
}

/** Stop the CI-V spectrum client and clean up all resources. */
function stopCiv(): void {
  // Clean up ICOM built-in spectrum
  if (icomSpectrumDispose) {
    icomSpectrumDispose();
    icomSpectrumDispose = null;
  }

  civSpectrumDispose?.();
  civSpectrumDispose = null;
  civStatusDispose?.();
  civStatusDispose = null;
  civErrorDispose?.();
  civErrorDispose = null;

  if (civClient) {
    civClient.disconnect();
    civClient = null;
    logger.info("CI-V spectrum client stopped");
  }
  fftSubscribers.clear();
}

/** Handle a daemon-protocol command from the SDR Console. */
function handleDaemonCommand(
  client: ConnectedClient,
  cmd: { type: string; id?: string; [k: string]: unknown },
): void {
  const { type, id } = cmd;

  switch (type) {
    // ----------------------------------------------------------------
    // Device enumeration
    // ----------------------------------------------------------------
    case "devices:enumerate": {
      const backend = rigController?.getBackend() ?? "none";
      const devices = backend !== "none" ? [buildDaemonDeviceInfo()] : [];
      sendDaemonMessage(client, { type: "devices:list", devices });
      break;
    }

    // ----------------------------------------------------------------
    // Radio connect
    // ----------------------------------------------------------------
    case "radio:connect": {
      (async () => {
        try {
          // If the client provides backend config, parse and use it
          // to start the rig controller (same logic as envelope RIG_CONNECT)
          let controller: RigController | null = null;
          const hasConfig =
            typeof cmd.backend === "string" && cmd.backend !== "auto";
          if (hasConfig) {
            const { config: rigConfig } = parseRigControllerConfig(cmd);
            if (rigConfig) {
              logger.info("radio:connect with config", {
                backend: cmd.backend,
              });
              const backend = await startRig(rigConfig);
              // If startRig succeeded with a real backend, use it directly
              if (backend !== "none" && rigController) {
                controller = rigController;
              }
            }
          }

          if (!controller) {
            controller = await ensureRigController();
          }
          const status = controller.getStatusSnapshot();
          sendDaemonResponse(client, id, true);
          // Send initial state
          sendDaemonMessage(client, {
            type: "radio:state",
            device_id: DAEMON_DEVICE_ID,
            state: rigStatusToDaemonState(status),
          });
          // Re-enumerate so the client sees the device
          const backend = controller.getBackend();
          const devices = backend !== "none" ? [buildDaemonDeviceInfo()] : [];
          sendDaemonMessage(client, { type: "devices:list", devices });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Radio disconnect — actually stop the rig controller
    // ----------------------------------------------------------------
    case "radio:disconnect": {
      stopRig();
      sendDaemonResponse(client, id, true);
      broadcastDaemonRadioState({ connected: false });
      break;
    }

    // ----------------------------------------------------------------
    // Tune (set frequency)
    // ----------------------------------------------------------------
    case "radio:tune": {
      const freq = toNumber(cmd.freq);
      if (freq === undefined || freq < 0) {
        sendDaemonResponse(client, id, false, "Invalid frequency");
        break;
      }
      (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setFrequency(freq);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Set mode
    // ----------------------------------------------------------------
    case "radio:mode": {
      const mode =
        typeof cmd.mode === "string" ? cmd.mode.trim().toUpperCase() : "";
      if (!mode) {
        sendDaemonResponse(client, id, false, "Invalid mode");
        break;
      }
      (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setMode(mode);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // PTT
    // ----------------------------------------------------------------
    case "radio:ptt": {
      const active =
        typeof cmd.active === "boolean"
          ? cmd.active
          : cmd.active === "true" || cmd.active === 1;
      (async () => {
        try {
          await setManualPtt(client.id, active);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    case "safety:configure": {
      const lockout = cmd.ptt_lockout === true;
      void configurePttSafety(lockout)
        .then(() => sendDaemonResponse(client, id, true))
        .catch((err: unknown) =>
          sendDaemonResponse(
            client,
            id,
            false,
            err instanceof Error ? err.message : String(err),
          ),
        );
      break;
    }

    // ----------------------------------------------------------------
    // DSP controls — NB, NR, AGC forwarded to rig via Hamlib
    // ----------------------------------------------------------------
    case "radio:nb": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setNb(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    case "radio:nr": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setNr(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    case "radio:agc": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          // Accept mode (number 0-3) or enabled (boolean for backwards compat)
          let mode: number;
          if (typeof cmd.mode === "number") {
            mode = Math.max(0, Math.min(3, Math.floor(cmd.mode)));
          } else {
            // Backwards compatibility: enabled boolean → mode 3 (SLOW) or 0 (OFF)
            mode = cmd.enabled ? 3 : 0;
          }
          await controller.setAgc(mode);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // VFO — switch active VFO
    // ----------------------------------------------------------------
    case "radio:vfo": {
      const vfo = cmd.vfo === "B" ? "B" : "A";
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setVFO(vfo as "A" | "B");
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Gain — set a Hamlib level by stage name
    // ----------------------------------------------------------------
    case "radio:gain": {
      const stage =
        typeof cmd.stage === "string" ? cmd.stage.trim().toUpperCase() : "";
      const value = toNumber(cmd.value);
      if (!stage || value === undefined) {
        sendDaemonResponse(client, id, false, "Invalid gain stage or value");
        break;
      }
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setGainLevel(stage, value);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Filter — set passband width via Hamlib
    // ----------------------------------------------------------------
    case "radio:filter": {
      const low = toNumber(cmd.low);
      const high = toNumber(cmd.high);
      if (low === undefined || high === undefined) {
        sendDaemonResponse(client, id, false, "Invalid filter range");
        break;
      }
      const passbandHz = Math.max(0, Math.round(high - low));
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setPassband(passbandHz);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Antenna — set antenna port via Hamlib
    // ----------------------------------------------------------------
    case "radio:antenna": {
      const port = typeof cmd.port === "string" ? cmd.port.trim() : "";
      // Extract antenna number from port name (e.g., "ANT1" → 1, "ANT2" → 2)
      const antMatch = port.match(/(\d+)/);
      const antIndex = antMatch ? parseInt(antMatch[1], 10) : 0;
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setAntenna(antIndex);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Squelch — set squelch level via Hamlib
    // ----------------------------------------------------------------
    case "radio:squelch": {
      const level = toNumber(cmd.level);
      if (level === undefined) {
        sendDaemonResponse(client, id, false, "Invalid squelch level");
        break;
      }
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setGainLevel("SQL", level);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // RIT — enable/disable and set offset
    // ----------------------------------------------------------------
    case "radio:rit": {
      const enabled = !!cmd.enabled;
      const offsetHz = toNumber(cmd.offsetHz);
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setRit(enabled, offsetHz);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // XIT — enable/disable and set offset
    // ----------------------------------------------------------------
    case "radio:xit": {
      const enabled = !!cmd.enabled;
      const offsetHz = toNumber(cmd.offsetHz);
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setXit(enabled, offsetHz);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Split — enable/disable split operation
    // ----------------------------------------------------------------
    case "radio:split": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setSplit(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // ANF — Auto Notch Filter
    // ----------------------------------------------------------------
    case "radio:anf": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setAnf(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // QSK — Full break-in CW
    // ----------------------------------------------------------------
    case "radio:qsk": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setQsk(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // VOX — Voice-operated transmit
    // ----------------------------------------------------------------
    case "radio:vox": {
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setVox(!!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // Generic function toggle — future-proof for any Hamlib function
    // ----------------------------------------------------------------
    case "radio:func": {
      const func =
        typeof cmd.func === "string" ? cmd.func.trim().toUpperCase() : "";
      if (!func) {
        sendDaemonResponse(client, id, false, "Invalid function name");
        break;
      }
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setFunction(func, !!cmd.enabled);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // IF Shift — set IF shift in Hz
    // ----------------------------------------------------------------
    case "radio:ifshift": {
      const hz = toNumber(cmd.hz);
      if (hz === undefined) {
        sendDaemonResponse(client, id, false, "Invalid IF shift value");
        break;
      }
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setIfShift(hz);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // CW Speed — set keyer speed in WPM
    // ----------------------------------------------------------------
    case "radio:cwspeed": {
      const wpm = toNumber(cmd.wpm);
      if (wpm === undefined || wpm < 1 || wpm > 99) {
        sendDaemonResponse(client, id, false, "Invalid CW speed (1-99 WPM)");
        break;
      }
      void (async () => {
        try {
          const controller = await ensureRigController();
          await controller.setCwSpeed(wpm);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // FFT stream control — connects to WFView CI-V TCP server
    // ----------------------------------------------------------------
    case "stream:fft:start": {
      const civHost =
        typeof cmd.civ_host === "string" ? cmd.civ_host : "127.0.0.1";
      const civPort =
        typeof cmd.civ_port === "number" && cmd.civ_port > 0
          ? cmd.civ_port
          : 4580;

      // Track this client as an FFT subscriber
      fftSubscribers.add(client.id);

      // Cancel any pending grace-period cleanup (reconnect within grace window)
      if (fftCleanupTimer) {
        clearTimeout(fftCleanupTimer);
        fftCleanupTimer = null;
      }

      logger.info("stream:fft:start", {
        hasBuiltinSpectrum: rigController?.hasBuiltinSpectrum ?? false,
        backend: rigController?.getBackend() ?? "none",
        icomSpectrumActive: !!icomSpectrumDispose,
      });

      // If ICOM serial backend is active, use its built-in spectrum.
      // Retry the scope enable command periodically if no frames arrive,
      // since some radios need the scope display active or take time to
      // start outputting CI-V scope data.
      if (rigController?.hasBuiltinSpectrum && !icomSpectrumDispose) {
        let gotFrame = false;
        let retryCount = 0;
        const MAX_RETRIES = 5;
        const RETRY_INTERVAL_MS = 5_000;
        const rc = rigController;
        icomSpectrumDispose = rc.onSpectrum((line) => {
          if (!gotFrame) {
            gotFrame = true;
            logger.info("First ICOM scope frame received — spectrum active");
          }
          broadcastBinaryFftFrame(line);
        });
        void rc.startSpectrum().catch((err: unknown) => {
          logger.error("ICOM spectrum start error", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
        sendDaemonResponse(client, id, true);

        // Retry scope enable periodically if no frames arrive.
        // Some radios need the scope display toggled or a second enable.
        const retryTimer = setInterval(() => {
          if (gotFrame || retryCount >= MAX_RETRIES) {
            clearInterval(retryTimer);
            if (!gotFrame) {
              logger.warn(
                `No scope frames after ${MAX_RETRIES} retries — radio scope display may be off. ` +
                  "Ensure the SCOPE button on the radio is active.",
              );
            }
            return;
          }
          retryCount++;
          logger.info(
            `No scope frames yet — retrying scope enable (${retryCount}/${MAX_RETRIES})`,
          );
          void rc.startSpectrum().catch(() => {});
        }, RETRY_INTERVAL_MS);

        // Clean up retry timer if spectrum is stopped externally
        const origDispose = icomSpectrumDispose;
        icomSpectrumDispose = () => {
          clearInterval(retryTimer);
          if (origDispose) origDispose();
        };
        break;
      }

      // If ICOM spectrum already running, just ack (subscriber already added)
      if (icomSpectrumDispose) {
        sendDaemonResponse(client, id, true);
        break;
      }

      // Start CIV client if not already running (WFView TCP fallback)
      if (!civClient) {
        civClient = new CivSpectrumClient({
          host: civHost,
          port: civPort,
        });

        civSpectrumDispose = civClient.onSpectrum((line) => {
          broadcastBinaryFftFrame(line);
        });

        civErrorDispose = civClient.onError((error) => {
          logger.error("CI-V spectrum error", { error: error.message });
        });

        civStatusDispose = civClient.onStatus((connected) => {
          logger.info("CI-V spectrum connection", { connected });
        });

        civClient.connect();
        logger.info("CI-V spectrum client started", {
          host: civHost,
          port: civPort,
        });
      }

      sendDaemonResponse(client, id, true);
      break;
    }

    case "stream:fft:stop": {
      fftSubscribers.delete(client.id);

      // If no more subscribers, clean up spectrum sources
      if (fftSubscribers.size === 0) {
        // Clean up ICOM built-in spectrum
        if (icomSpectrumDispose) {
          icomSpectrumDispose();
          icomSpectrumDispose = null;
          void rigController?.stopSpectrum().catch(() => {});
        }
        // Clean up WFView CI-V client
        if (civClient) {
          stopCiv();
        }
      }

      sendDaemonResponse(client, id, true);
      break;
    }

    // ----------------------------------------------------------------
    // Audio stream control — captures from USB audio device via ffmpeg
    // ----------------------------------------------------------------
    case "stream:audio:start": {
      audioSubscribers.add(client.id);

      // Cancel any pending grace-period cleanup (reconnect within grace window)
      if (audioCleanupTimer) {
        clearTimeout(audioCleanupTimer);
        audioCleanupTimer = null;
      }

      // If ICOM audio already running, just ack (subscriber already added)
      if (icomAudioDispose) {
        sendDaemonResponse(client, id, true);
        break;
      }

      // If ICOM backend is active, try its built-in audio stream
      if (rigController?.hasBuiltinAudio) {
        void (async () => {
          try {
            const started = await rigController!.startAudio();
            if (started) {
              icomAudioDispose = rigController!.onAudio((samples, sr) => {
                broadcastBinaryAudioFrame(samples, sr);
              });
              logger.info("ICOM built-in audio started");
              sendDaemonResponse(client, id, true);
            } else {
              // Built-in audio failed (no audio device found) — fall back to ffmpeg
              logger.warn(
                "ICOM built-in audio device not found, falling back to ffmpeg",
              );
              startFfmpegAudioCapture(client, id, cmd);
            }
          } catch (err: unknown) {
            logger.error("ICOM audio start error", {
              error: err instanceof Error ? err.message : String(err),
            });
            // Fall back to ffmpeg
            startFfmpegAudioCapture(client, id, cmd);
          }
        })();
        break;
      }

      // Fallback: USB audio device via ffmpeg
      startFfmpegAudioCapture(client, id, cmd);
      break;
    }

    case "stream:audio:stop": {
      audioSubscribers.delete(client.id);

      if (audioSubscribers.size === 0) {
        // Clean up ICOM network audio
        if (icomAudioDispose) {
          icomAudioDispose();
          icomAudioDispose = null;
          rigController?.stopAudio();
        }
        // Clean up USB audio capture
        if (audioCapture) {
          stopAudioCapture();
        }
      }

      sendDaemonResponse(client, id, true);
      break;
    }

    // ----------------------------------------------------------------
    // Radio connection test — probe a radio and return its state
    // ----------------------------------------------------------------
    case "rig:test": {
      void (async () => {
        try {
          const backend =
            typeof cmd.backend === "string" ? cmd.backend : "auto";
          logger.info("[rig:test] handler entered", { backend, cmd });

          let payload = { ...cmd };
          if (
            (backend === "icom-serial" || backend === "auto") &&
            typeof payload.serialPort !== "string"
          ) {
            const discovered = await scanForIcomRadios();
            const first = discovered[0];
            if (first) {
              payload = {
                ...payload,
                backend: "icom-serial",
                serialPort: first.port,
                baudRate: first.baudRate,
                radioAddress: first.radioAddress,
              };
            } else if (backend === "icom-serial") {
              throw new Error("No ICOM radio found on USB");
            }
          }

          const parsed = parseRigControllerConfig(payload);
          if (parsed.backend === "none" || !parsed.config) {
            throw new Error(`Incomplete ${backend} connection settings`);
          }

          const probe = new RigController(parsed.config);
          try {
            const detectedBackend = await probe.start();
            if (detectedBackend === "none") {
              throw new Error(`No ${backend} radio backend responded`);
            }
            if (backend !== "auto" && detectedBackend !== backend) {
              throw new Error(
                `Requested ${backend}, but only ${detectedBackend} responded`,
              );
            }

            const status = probe.getStatusSnapshot();
            if (!status.connected) {
              throw new Error(`${detectedBackend} responded without a connected radio`);
            }

            sendDaemonMessage(client, {
              type: "rig:test:ack",
              id,
              payload: {
                success: true,
                backend: detectedBackend,
                rigModel: probe.getIcomModelName() ?? detectedBackend,
                frequency: status.frequency,
                mode: status.mode,
                hasSpectrum: probe.hasBuiltinSpectrum,
                hasAudio: probe.hasBuiltinAudio,
              },
            });
          } finally {
            probe.stop();
          }
        } catch (err: unknown) {
          logger.error("[rig:test] Outer error", {
            error: err instanceof Error ? err.message : String(err),
          });
          sendDaemonMessage(client, {
            type: "rig:test:error",
            id,
            payload: {
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          });
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // ICOM radio scanning — discover connected ICOM radios via USB
    // ----------------------------------------------------------------
    case "devices:scan": {
      void (async () => {
        try {
          const radios = await scanForIcomRadios();

          // Resolve audio device for each discovered radio
          const radiosWithAudio = await Promise.all(
            radios.map(async (radio) => {
              const audioDevice = await resolveAudioDevice(radio.port, "ICOM");
              return { ...radio, audioDevice };
            }),
          );

          sendDaemonMessage(client, {
            type: "devices:scan:result",
            id,
            radios: radiosWithAudio,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
      break;
    }

    // ----------------------------------------------------------------
    // mDNS discovery — return empty (single-daemon mode)
    // ----------------------------------------------------------------
    case "discovery:mdns:browse": {
      sendDaemonMessage(client, { type: "discovery:daemons", daemons: [] });
      break;
    }

    // ----------------------------------------------------------------
    // Hello / auth — acknowledge
    // ----------------------------------------------------------------
    case "hello": {
      sendDaemonMessage(client, {
        type: "hello",
        version: "1.1.0",
        daemon_id: "propulse-bridge",
        features: [
          "command-capabilities",
          "correlated-responses",
          "ptt-safety",
          "stream-subscriptions",
          "cat-scan",
        ],
      });
      break;
    }

    // ----------------------------------------------------------------
    // Default: reject unknown daemon commands
    // ----------------------------------------------------------------
    default: {
      logger.debug("Unhandled daemon command", { type });
      sendDaemonResponse(client, id, false, `Unknown command: ${type}`);
      break;
    }
  }
}

// ============================================================================
// Message Routing
// ============================================================================

function handleMessage(client: ConnectedClient, rawMessage: string): void {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    logger.warn("Received invalid JSON from client", {
      clientId: client.id,
      preview: rawMessage.substring(0, 100),
    });

    sendToClient(
      client,
      createMessage("error", {
        code: "INVALID_JSON",
        message: "Message must be valid JSON",
      }),
    );
    return;
  }

  // Check for daemon-protocol commands (flat JSON from SDR Console)
  // before applying the bridge envelope check.
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    isDaemonCommand(parsed as Record<string, unknown>)
  ) {
    const cmd = parsed as { type: string; id?: string; [k: string]: unknown };
    logger.debug("Received daemon command", {
      clientId: client.id,
      commandType: cmd.type,
    });
    handleDaemonCommand(client, cmd);
    return;
  }

  if (!isMessageEnvelope(parsed)) {
    logger.warn("Received message with invalid envelope", {
      clientId: client.id,
    });

    sendToClient(
      client,
      createMessage("error", {
        code: "INVALID_ENVELOPE",
        message:
          "Message must have a non-empty type, a defined payload, and a timestamp field (ts or timestamp)",
      }),
    );
    return;
  }

  const parsedEnvelope = parsed as MessageEnvelope & { timestamp?: number };
  const message: MessageEnvelope = {
    ...parsedEnvelope,
    ts:
      typeof parsedEnvelope.ts === "string"
        ? parsedEnvelope.ts
        : new Date(parsedEnvelope.timestamp ?? Date.now()).toISOString(),
  };

  logger.debug("Received message", {
    clientId: client.id,
    messageType: message.type,
    messageId: message.id,
  });

  routeMessage(client, message);
}

function routeMessage(client: ConnectedClient, message: MessageEnvelope): void {
  const respondWithRigSnapshot = (messageType: string) => {
    sendToClient(
      client,
      createMessage(messageType, getRigStatusSnapshot(), message.id),
    );
  };

  switch (message.type) {
    // ------------------------------------------------------------------
    // Bridge keepalive/subscriptions
    // ------------------------------------------------------------------
    case MessageTypes.BRIDGE_PING: {
      sendToClient(
        client,
        createMessage(
          MessageTypes.BRIDGE_PONG,
          { timestamp: Date.now() },
          message.id,
        ),
      );
      break;
    }

    case MessageTypes.BRIDGE_SUBSCRIBE:
    case MessageTypes.BRIDGE_UNSUBSCRIBE: {
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { ok: true }, message.id),
      );
      break;
    }

    // ------------------------------------------------------------------
    // DX Cluster
    // ------------------------------------------------------------------
    case MessageTypes.CLUSTER_CONNECT: {
      const config = normalizeClusterConfig(message.payload);
      if (!config) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_CLUSTER_CONFIG",
              message:
                "cluster.connect requires callsign and either nodes[] or host/port",
            },
            message.id,
          ),
        );
        break;
      }

      startCluster(config);
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { started: true }, message.id),
      );
      break;
    }

    case MessageTypes.CLUSTER_DISCONNECT: {
      stopCluster();
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { stopped: true }, message.id),
      );
      break;
    }

    // ------------------------------------------------------------------
    // WSJT-X
    // ------------------------------------------------------------------
    case MessageTypes.WSJTX_CONFIGURE: {
      const p =
        typeof message.payload === "object" && message.payload !== null
          ? (message.payload as Record<string, unknown>)
          : null;

      if (!p) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_WSJTX_CONFIG",
              message: "wsjtx.configure requires an object payload",
            },
            message.id,
          ),
        );
        break;
      }

      const port = toPortNumber(p.port);
      const enabled = typeof p.enabled === "boolean" ? p.enabled : false;

      if (port === undefined) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_WSJTX_CONFIG",
              message: "wsjtx.configure requires a valid port number (1-65535)",
            },
            message.id,
          ),
        );
        break;
      }

      startWSJTX({ port, enabled });
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { configured: true }, message.id),
      );
      break;
    }

    case MessageTypes.WSJTX_EMIT_CONFIGURE: {
      const p =
        typeof message.payload === "object" && message.payload !== null
          ? (message.payload as Record<string, unknown>)
          : null;

      if (!p) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_WSJTX_EMIT_CONFIG",
              message: "wsjtx.emit.configure requires an object payload",
            },
            message.id,
          ),
        );
        break;
      }

      const port = toPortNumber(p.port);
      const enabled = typeof p.enabled === "boolean" ? p.enabled : false;

      if (port === undefined) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_WSJTX_EMIT_CONFIG",
              message:
                "wsjtx.emit.configure requires a valid port number (1-65535)",
            },
            message.id,
          ),
        );
        break;
      }

      startWSJTXEmitter({ port, enabled });
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { configured: true }, message.id),
      );
      break;
    }

    case MessageTypes.WSJTX_EMIT_DECODE: {
      if (!wsjtxEmitter || !wsjtxEmitter.active) {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "WSJTX_EMITTER_NOT_ACTIVE",
              message: "WSJT-X emitter is not active; configure it first",
            },
            message.id,
          ),
        );
        break;
      }

      const p =
        typeof message.payload === "object" && message.payload !== null
          ? (message.payload as Record<string, unknown>)
          : null;

      if (!p || typeof p.message !== "string") {
        sendToClient(
          client,
          createMessage(
            "error",
            {
              code: "INVALID_WSJTX_EMIT_DECODE",
              message:
                "wsjtx.emit.decode requires a payload with at least a message string",
            },
            message.id,
          ),
        );
        break;
      }

      wsjtxEmitter.emitDecode({
        isNew: typeof p.isNew === "boolean" ? p.isNew : true,
        time: typeof p.time === "number" ? p.time : 0,
        snr: typeof p.snr === "number" ? p.snr : 0,
        deltaTime: typeof p.deltaTime === "number" ? p.deltaTime : 0,
        deltaFrequency:
          typeof p.deltaFrequency === "number" ? p.deltaFrequency : 0,
        mode: typeof p.mode === "string" ? p.mode : "~",
        message: p.message as string,
        lowConfidence:
          typeof p.lowConfidence === "boolean" ? p.lowConfidence : false,
      });
      break;
    }

    // ------------------------------------------------------------------
    // Rig Control
    // ------------------------------------------------------------------
    case MessageTypes.RIG_STATUS:
    case MessageTypes.RIG_UPDATE: {
      // Pure read: return current snapshot without side effects.
      // If no rig is connected, the snapshot shows { connected: false }.
      respondWithRigSnapshot(message.type);
      break;
    }

    case MessageTypes.RIG_CONNECT: {
      const { backend, config } = parseRigControllerConfig(message.payload);

      if (backend === "none") {
        stopRig();
        sendToClient(
          client,
          createMessage(
            `${message.type}.ack`,
            { connected: false, backend: "none" },
            message.id,
          ),
        );
        break;
      }

      startRig(config)
        .then((resolvedBackend) => {
          sendToClient(
            client,
            createMessage(
              `${message.type}.ack`,
              {
                connected: resolvedBackend !== "none",
                backend: resolvedBackend,
              },
              message.id,
            ),
          );
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendToClient(
            client,
            createMessage(
              "error",
              { code: "RIG_CONNECT_FAILED", message: errMsg },
              message.id,
            ),
          );
        });
      break;
    }

    case MessageTypes.RIG_DISCONNECT: {
      stopRig();
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { disconnected: true },
          message.id,
        ),
      );
      break;
    }

    case MessageTypes.RIG_TEST: {
      const { backend, config } = parseRigControllerConfig(message.payload);
      if (backend === "none") {
        sendToClient(
          client,
          createMessage(
            "error",
            { code: "RIG_TEST_FAILED", message: "No radio backend selected" },
            message.id,
          ),
        );
        break;
      }

      const testController = new RigController(config);
      testController
        .start()
        .then((resolvedBackend) => {
          if (resolvedBackend === "none") {
            throw new Error("No radio backend responded");
          }
          if (backend !== "auto" && resolvedBackend !== backend) {
            throw new Error(
              `Requested ${backend}, but only ${resolvedBackend} responded`,
            );
          }
          const status = testController.getStatusSnapshot();
          if (!status.connected) {
            throw new Error(`${resolvedBackend} responded without a connected radio`);
          }
          sendToClient(
            client,
            createMessage(
              `${message.type}.ack`,
              {
                success: true,
                backend: resolvedBackend,
                connected: true,
                frequency: status.frequency,
                mode: status.mode,
                hasSpectrum: testController.hasBuiltinSpectrum,
                hasAudio: testController.hasBuiltinAudio,
              },
              message.id,
            ),
          );
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendToClient(
            client,
            createMessage(
              "error",
              { code: "RIG_TEST_FAILED", message: errMsg },
              message.id,
            ),
          );
        })
        .finally(() => {
          testController.stop();
        });
      break;
    }

    case "devices:scan": {
      void scanForIcomRadios()
        .then((radios) =>
          sendToClient(
            client,
            createMessage(
              "devices:scan:result",
              { radios },
              message.id,
            ),
          ),
        )
        .catch((err: unknown) =>
          sendToClient(
            client,
            createMessage(
              "error",
              {
                code: "DEVICE_SCAN_FAILED",
                message: err instanceof Error ? err.message : String(err),
              },
              message.id,
            ),
          ),
        );
      break;
    }

    case MessageTypes.RIG_SET: {
      handleRigSet(client, message);
      break;
    }

    case MessageTypes.RIG_SET_FREQUENCY: {
      handleRigSetFrequency(client, message);
      break;
    }

    case MessageTypes.RIG_SET_MODE: {
      handleRigSetMode(client, message);
      break;
    }

    case MessageTypes.RIG_SET_PTT: {
      handleRigSetPTT(client, message);
      break;
    }

    case "safety.configure": {
      const payload =
        typeof message.payload === "object" && message.payload !== null
          ? (message.payload as Record<string, unknown>)
          : {};
      const lockout =
        payload.pttLockout === true || payload.ptt_lockout === true;
      void configurePttSafety(lockout)
        .then(() =>
          sendToClient(
            client,
            createMessage(
              `${message.type}.ack`,
              { success: true, pttLockout: pttSafety.lockout },
              message.id,
            ),
          ),
        )
        .catch((err: unknown) =>
          sendToClient(
            client,
            createMessage(
              "error",
              {
                code: "PTT_SAFETY_FAILED",
                message: err instanceof Error ? err.message : String(err),
              },
              message.id,
            ),
          ),
        );
      break;
    }

    // ------------------------------------------------------------------
    // FT8 TX Control
    // ------------------------------------------------------------------
    case MessageTypes.FT8_TX_START: {
      handleFt8TxStart(client, message);
      break;
    }

    case MessageTypes.FT8_TX_STOP: {
      handleFt8TxStop(client, message);
      break;
    }

    // ------------------------------------------------------------------
    // Default: reject unknown message types
    // ------------------------------------------------------------------
    default: {
      logger.warn("Unhandled message type", {
        messageType: message.type,
      });
      sendToClient(
        client,
        createMessage(
          "error",
          {
            code: "UNKNOWN_MESSAGE_TYPE",
            message: `Unknown message type: ${message.type}`,
          },
          message.id,
        ),
      );
      break;
    }
  }
}

// --------------------------------------------------------------------------
// Rig Command Handlers
// --------------------------------------------------------------------------

/**
 * Get the active rig controller, or throw if unavailable.
 * If a startup is already in progress (from a concurrent radio:connect),
 * wait for it instead of starting a new one — prevents the race condition
 * where two concurrent startRig() calls kill each other's serial port.
 */
async function ensureRigController(): Promise<RigController> {
  // Fast path: already running with a real backend
  if (rigController && rigController.getBackend() !== "none") {
    return rigController;
  }

  // If another call to startRig() is already in flight, wait for it
  if (rigStartingPromise) {
    try {
      await rigStartingPromise;
    } catch {
      // Startup failed — fall through to try ourselves
    }
    if (rigController && rigController.getBackend() !== "none") {
      return rigController;
    }
  }

  // Reuse the last successful config (e.g. icom-serial from radio:connect)
  const backend = await startRig(lastRigConfig);
  if (backend === "none" || !rigController) {
    throw new Error("No rig backend available");
  }
  return rigController;
}

/**
 * Handle rig.set: set frequency and/or mode.
 * Commands are executed sequentially (not in parallel) because Hamlib's
 * rigctld protocol only supports one command in flight at a time.
 */
function handleRigSet(client: ConnectedClient, message: MessageEnvelope): void {
  const p =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as Record<string, unknown>)
      : {};

  (async () => {
    try {
      const controller = await ensureRigController();

      // Validate before executing any commands
      const frequency =
        p.frequency !== undefined ? validateFrequency(p.frequency) : undefined;
      const mode = p.mode !== undefined ? validateMode(p.mode) : undefined;

      // Execute sequentially to respect Hamlib's single-command constraint
      if (frequency !== undefined) {
        await controller.setFrequency(frequency);
      }
      if (mode !== undefined) {
        await controller.setMode(mode);
      }

      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { success: true }, message.id),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

function handleRigSetFrequency(
  client: ConnectedClient,
  message: MessageEnvelope,
): void {
  const p =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as Record<string, unknown>)
      : {};

  (async () => {
    try {
      const frequency = validateFrequency(p.frequency);
      const controller = await ensureRigController();
      await controller.setFrequency(frequency);

      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, frequency },
          message.id,
        ),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

function handleRigSetMode(
  client: ConnectedClient,
  message: MessageEnvelope,
): void {
  const p =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as Record<string, unknown>)
      : {};

  (async () => {
    try {
      const mode = validateMode(p.mode);
      const controller = await ensureRigController();
      await controller.setMode(mode);

      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, mode },
          message.id,
        ),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

function handleRigSetPTT(
  client: ConnectedClient,
  message: MessageEnvelope,
): void {
  const p =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as Record<string, unknown>)
      : {};

  const enabled =
    typeof p.enabled === "boolean"
      ? p.enabled
      : typeof p.ptt === "boolean"
        ? p.ptt
        : undefined;

  if (enabled === undefined) {
    sendToClient(
      client,
      createMessage(
        "error",
        {
          code: "INVALID_PAYLOAD",
          message: "rig.setPTT requires a boolean 'enabled' or 'ptt' field",
        },
        message.id,
      ),
    );
    return;
  }

  (async () => {
    try {
      await setManualPtt(client.id, enabled);

      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, ptt: enabled },
          message.id,
        ),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "RIG_COMMAND_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

// --------------------------------------------------------------------------
// FT8 TX Command Handlers
// --------------------------------------------------------------------------

/**
 * Cancel any active FT8 TX cycle: clear the timer, release PTT, and broadcast
 * an inactive status to all connected clients.
 */
async function cancelActiveTx(): Promise<void> {
  if (activeTxTimer) {
    clearTimeout(activeTxTimer);
    activeTxTimer = null;
  }
  if (txActive) {
    txActive = false;
    try {
      const controller = await ensureRigController();
      await controller.setPTT(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to release PTT during TX cancel", { error: errMsg });
    }
    broadcast(
      createMessage(MessageTypes.FT8_TX_STATUS, {
        active: false,
        timeRemainingMs: 0,
      }),
    );
  }
}

function handleFt8TxStart(
  client: ConnectedClient,
  message: MessageEnvelope,
): void {
  const p =
    typeof message.payload === "object" && message.payload !== null
      ? (message.payload as Ft8TxStartPayload)
      : ({} as Partial<Ft8TxStartPayload>);

  const durationMs = typeof p.durationMs === "number" ? p.durationMs : 0;
  const preDelayMs =
    typeof p.preDelayMs === "number" && p.preDelayMs > 0 ? p.preDelayMs : 0;

  if (pttSafety.lockout) {
    sendToClient(
      client,
      createMessage(
        "error",
        {
          code: "PTT_LOCKED_OUT",
          message: "PTT safety lockout is enabled",
        },
        message.id,
      ),
    );
    return;
  }

  // Validate duration within safety bounds
  if (
    durationMs < FT8_TX_MIN_DURATION_MS ||
    durationMs > FT8_TX_MAX_DURATION_MS
  ) {
    sendToClient(
      client,
      createMessage(
        "error",
        {
          code: "INVALID_PAYLOAD",
          message: `ft8.tx.start durationMs must be ${FT8_TX_MIN_DURATION_MS}-${FT8_TX_MAX_DURATION_MS}, got ${durationMs}`,
        },
        message.id,
      ),
    );
    return;
  }

  const generation = ++ft8TxGeneration;

  (async () => {
    try {
      // If TX is already active, stop the current cycle first
      await cancelActiveTx();
      await releaseManualPtt("FT8 TX start");

      const controller = await ensureRigController();

      // Optional pre-delay for timing alignment
      if (preDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, preDelayMs));
      }

      if (pttSafety.lockout) {
        throw new Error("PTT safety lockout was enabled before transmit");
      }
      if (generation !== ft8TxGeneration) {
        throw new Error("FT8 transmit request was superseded or cancelled");
      }

      // Assert PTT
      await controller.setPTT(true);
      if (generation !== ft8TxGeneration) {
        await controller.setPTT(false);
        throw new Error("FT8 transmit request was superseded or cancelled");
      }
      txActive = true;

      // Broadcast TX active status
      broadcast(
        createMessage(MessageTypes.FT8_TX_STATUS, {
          active: true,
          timeRemainingMs: durationMs,
        }),
      );

      // Acknowledge to the requesting client
      sendToClient(
        client,
        createMessage(
          `${message.type}.ack`,
          { success: true, durationMs },
          message.id,
        ),
      );

      // Schedule PTT release after the TX duration
      activeTxTimer = setTimeout(async () => {
        activeTxTimer = null;
        if (generation !== ft8TxGeneration) return;
        txActive = false;
        try {
          await controller.setPTT(false);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error("Failed to release PTT after TX timer", {
            error: errMsg,
          });
        }
        broadcast(
          createMessage(MessageTypes.FT8_TX_STATUS, {
            active: false,
            timeRemainingMs: 0,
          }),
        );
      }, durationMs);
    } catch (err: unknown) {
      if (generation === ft8TxGeneration) txActive = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("FT8 TX start failed", { error: errMsg });
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "FT8_TX_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

function handleFt8TxStop(
  client: ConnectedClient,
  message: MessageEnvelope,
): void {
  ft8TxGeneration += 1;
  (async () => {
    try {
      await cancelActiveTx();
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { success: true }, message.id),
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error("FT8 TX stop failed", { error: errMsg });
      sendToClient(
        client,
        createMessage(
          "error",
          { code: "FT8_TX_STOP_FAILED", message: errMsg },
          message.id,
        ),
      );
    }
  })();
}

// ============================================================================
// Server Setup
// ============================================================================

/**
 * Start the WebSocket server.
 *
 * SECURITY MODEL: The bridge binds exclusively to localhost (127.0.0.1/::1).
 * This means only processes on the same machine can connect. No authentication
 * is required because:
 * 1. Localhost binding prevents remote connections entirely
 * 2. The bridge controls local rig hardware (CAT/CI-V) — no sensitive data
 * 3. Adding auth would complicate the setup for ham operators
 * If network-exposed operation is ever needed, add token-based auth first.
 */
function startServer(): void {
  const config = loadConfig();

  const wss = new WebSocketServer({
    port: config.port,
    host: config.host,
  });

  logger.info("ProPulse Bridge server starting", {
    host: config.host,
    port: config.port,
  });

  wss.on("listening", () => {
    startStaticServer();

    logger.info("ProPulse Bridge server listening", {
      host: config.host,
      port: config.port,
      securityNote: "Bound to localhost only - remote connections blocked",
    });

    // Auto-start rig controller (non-blocking — if no rig is found, that is fine)
    startRig().catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn("Rig controller auto-start failed (will retry on demand)", {
        error: errMsg,
      });
    });
  });

  wss.on("connection", (socket, request) => {
    const clientId = generateClientId();
    const remoteAddress = request.socket.remoteAddress ?? "unknown";

    const client: ConnectedClient = {
      id: clientId,
      socket,
      connectedAt: new Date(),
      remoteAddress,
    };

    clients.set(clientId, client);

    logger.info("Client connected", {
      clientId,
      remoteAddress,
      totalClients: clients.size,
    });

    // Send welcome message with expanded capabilities
    const welcomeMessage = createMessage("bridge.welcome", {
      clientId,
      serverVersion: "0.3.0",
      capabilities: ["rig", "contest", "sync", "cluster", "wsjtx", "static", "api"],
      staticServerUrl: fs.existsSync(DIST_DIR)
        ? `http://127.0.0.1:${STATIC_PORT}`
        : null,
      rigBackend: rigController?.getBackend() ?? "none",
      clusterConnected: clusterClient?.getStatus().connected ?? false,
      wsjtxListening: wsjtxListener !== null,
      wsjtxEmitterActive: wsjtxEmitter?.active ?? false,
    });

    socket.send(JSON.stringify(welcomeMessage));

    socket.on("message", (data) => {
      const messageString = data.toString();
      handleMessage(client, messageString);
    });

    socket.on("close", (code, reason) => {
      clients.delete(clientId);

      void pttSafety
        .releaseIfOwnedBy(clientId, "owning client disconnected")
        .catch((error) => {
          logger.error("Failed to release PTT for disconnected owner", {
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // Clean up FFT subscription for this client (grace period)
      fftSubscribers.delete(clientId);
      if (fftSubscribers.size === 0 && (icomSpectrumDispose || civClient)) {
        if (fftCleanupTimer) clearTimeout(fftCleanupTimer);
        fftCleanupTimer = setTimeout(() => {
          fftCleanupTimer = null;
          if (fftSubscribers.size === 0) {
            if (icomSpectrumDispose) {
              icomSpectrumDispose();
              icomSpectrumDispose = null;
              void rigController?.stopSpectrum().catch(() => {});
            }
            if (civClient) {
              stopCiv();
            }
            logger.info(
              "FFT stream stopped (no subscribers after grace period)",
            );
          }
        }, STREAM_CLEANUP_GRACE_MS);
      }

      // Clean up audio subscription for this client (grace period)
      audioSubscribers.delete(clientId);
      if (audioSubscribers.size === 0 && (icomAudioDispose || audioCapture)) {
        if (audioCleanupTimer) clearTimeout(audioCleanupTimer);
        audioCleanupTimer = setTimeout(() => {
          audioCleanupTimer = null;
          if (audioSubscribers.size === 0) {
            if (icomAudioDispose) {
              icomAudioDispose();
              icomAudioDispose = null;
              rigController?.stopAudio();
            }
            if (audioCapture) {
              stopAudioCapture();
            }
            logger.info(
              "Audio stream stopped (no subscribers after grace period)",
            );
          }
        }, STREAM_CLEANUP_GRACE_MS);
      }

      logger.info("Client disconnected", {
        clientId,
        code,
        reason: reason.toString() || "No reason provided",
        totalClients: clients.size,
      });
    });

    socket.on("error", (error) => {
      logger.error("Client socket error", {
        clientId,
        error: error.message,
      });
    });
  });

  wss.on("error", (error) => {
    logger.error("WebSocket server error", {
      error: error.message,
    });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info("Shutdown signal received", { signal });

    // Cancel any active FT8 TX and release PTT before tearing down rig
    if (activeTxTimer) {
      clearTimeout(activeTxTimer);
      activeTxTimer = null;
    }
    if (txActive && rigController) {
      rigController.setPTT(false).catch(() => {});
      txActive = false;
    }

    // Clean up integration modules
    stopCluster();
    stopWSJTX();
    stopWSJTXEmitter();
    stopRig();
    stopCiv();
    if (icomSpectrumDispose) {
      icomSpectrumDispose();
      icomSpectrumDispose = null;
    }
    if (icomAudioDispose) {
      icomAudioDispose();
      icomAudioDispose = null;
    }

    // Close static file server
    if (staticServer) {
      staticServer.close();
      logger.info("Static file server closed");
    }

    // Close all client connections (with readyState check)
    for (const client of clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        const shutdownMessage = createMessage("bridge.shutdown", {
          reason: "Server shutting down",
        });
        client.socket.send(JSON.stringify(shutdownMessage));
        client.socket.close(1001, "Server shutting down");
      }
    }

    stopLanDiscovery();

    wss.close(() => {
      logger.info("Server closed gracefully");
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logger.warn("Forcing shutdown after timeout");
      process.exit(1);
    }, 5000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============================================================================
// Entry Point
// ============================================================================

startServer();
