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
  RigStatus,
  WSJTXConfig,
} from "./types.js";
import { DXClusterClient } from "./cluster.js";
import { WSJTXListener } from "./wsjtx.js";
import { RigController, type RigControllerConfig } from "./rig.js";
import { CivSpectrumClient, pixelToDb, type CivSpectrumLine } from "./civ.js";
import { AudioCapture } from "./audioCapture.js";

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
  if (!resolved.startsWith(DIST_DIR)) {
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
    handleStaticRequest(req, res).catch((err: unknown) => {
      logger.error("Static file server request error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(STATIC_PORT, "127.0.0.1", () => {
    logger.info("Static file server listening", {
      host: "127.0.0.1",
      port: STATIC_PORT,
      distDir: DIST_DIR,
    });
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
// Rig Control Integration
// --------------------------------------------------------------------------

async function startRig(
  config?: RigControllerConfig,
): Promise<"hamlib" | "flrig" | "none"> {
  stopRig();

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

  const backend = await rigController.start();
  logger.info("Rig controller started", { backend });
  return backend;
}

function stopRig(): void {
  rigStatusDispose?.();
  rigStatusDispose = null;
  rigErrorDispose?.();
  rigErrorDispose = null;
  rigSmeterDispose?.();
  rigSmeterDispose = null;

  if (rigController) {
    rigController.stop();
    rigController = null;
    logger.info("Rig controller stopped");
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
  backend: "auto" | "hamlib" | "flrig" | "none";
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

/** Standard gain stages exposed to the frontend. Hamlib level names as keys. */
const GAIN_STAGES = [
  { name: "AF", label: "AF Gain", min: 0, max: 1, step: 0.01 },
  { name: "RF", label: "RF Gain", min: 0, max: 1, step: 0.01 },
  { name: "SQL", label: "Squelch", min: 0, max: 1, step: 0.01 },
  { name: "RFPOWER", label: "TX Power", min: 0, max: 1, step: 0.01 },
  { name: "MICGAIN", label: "MIC Gain", min: 0, max: 1, step: 0.01 },
  { name: "MONITOR_GAIN", label: "Monitor", min: 0, max: 1, step: 0.01 },
  { name: "COMP", label: "Compression", min: 0, max: 1, step: 0.01 },
  { name: "VOXGAIN", label: "VOX Gain", min: 0, max: 1, step: 0.01 },
  { name: "PREAMP", label: "Preamp", min: 0, max: 20, step: 10 },
  { name: "ATT", label: "Attenuator", min: 0, max: 20, step: 10 },
] as const;

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
  };
} {
  const backend = rigController?.getBackend() ?? "none";
  return {
    device_id: DAEMON_DEVICE_ID,
    name:
      backend === "hamlib"
        ? "Hamlib Rig (via WFView)"
        : backend === "flrig"
          ? "Flrig Rig"
          : "No Rig Detected",
    driver: backend,
    type: "transceiver",
    available: backend !== "none",
    capabilities: {
      can_transmit: true,
      can_stream_iq: false,
      can_stream_fft: true,
      can_stream_audio: true,
      antennas: ["ANT1", "ANT2"],
      modes: [
        "LSB",
        "USB",
        "CW",
        "CW-R",
        "RTTY",
        "RTTY-R",
        "AM",
        "FM",
        "WFM",
        "DV",
        "FT8",
        "FT4",
        "PSK",
        "SSB",
      ],
      frequency_range: [30000, 470000000],
      sample_rates: [],
      gain_stages: backend !== "none" ? [...GAIN_STAGES] : [],
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
  ptt: boolean;
  signal_dbm?: number;
} {
  return {
    connected: status.connected,
    freq: status.frequency ?? 0,
    mode: status.mode ?? "USB",
    vfo: status.vfo ?? "A",
    antenna: "ANT1",
    gains: {},
    agc: false,
    ptt: status.ptt ?? false,
    signal_dbm: status.smeter,
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
function broadcastBinaryFftFrame(line: CivSpectrumLine): void {
  if (fftSubscribers.size === 0) return;

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
  for (const clientId of fftSubscribers) {
    const client = clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(buffer);
    }
  }
}

/**
 * Broadcast a binary audio frame to all clients subscribed to audio streaming.
 * Frame layout (little-endian):
 *   [0x02 type] [0x00 devIdx] [u32 sampleRate] [...i16 PCM samples]
 */
function broadcastBinaryAudioFrame(
  samples: Int16Array,
  sampleRate: number,
): void {
  if (audioSubscribers.size === 0) return;

  const headerBytes = 6; // type(1) + devIdx(1) + sampleRate(4)
  const byteLength = headerBytes + samples.length * 2;
  const buffer = Buffer.alloc(byteLength);

  buffer[0] = 0x02; // FRAME_TYPE_AUDIO
  buffer[1] = 0x00; // devIdx = 0
  buffer.writeUInt32LE(sampleRate, 2);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], headerBytes + i * 2);
  }

  for (const clientId of audioSubscribers) {
    const client = clients.get(clientId);
    if (client && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(buffer);
    }
  }
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
          const controller = await ensureRigController();
          const status = controller.getStatusSnapshot();
          sendDaemonResponse(client, id, true);
          // Send initial state
          sendDaemonMessage(client, {
            type: "radio:state",
            device_id: DAEMON_DEVICE_ID,
            state: rigStatusToDaemonState(status),
          });
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
          const controller = await ensureRigController();
          await controller.setPTT(active);
          sendDaemonResponse(client, id, true);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          sendDaemonResponse(client, id, false, errMsg);
        }
      })();
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
          await controller.setAgc(!!cmd.enabled);
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

      // Start CIV client if not already running
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

      // If no more subscribers, disconnect CI-V client
      if (fftSubscribers.size === 0 && civClient) {
        stopCiv();
      }

      sendDaemonResponse(client, id, true);
      break;
    }

    // ----------------------------------------------------------------
    // Audio stream control — captures from USB audio device via ffmpeg
    // ----------------------------------------------------------------
    case "stream:audio:start": {
      // Default to device "2" (USB Audio Device = IC-7300)
      // Can be overridden via command params
      const audioDevice =
        typeof cmd.audio_device === "string" ? cmd.audio_device : "2";
      const audioSampleRate =
        typeof cmd.sample_rate === "number" ? cmd.sample_rate : 48000;

      audioSubscribers.add(client.id);

      if (!audioCapture) {
        audioCapture = new AudioCapture({
          device: audioDevice,
          sampleRate: audioSampleRate,
        });

        audioPcmDispose = audioCapture.onPcm((samples, sr) => {
          broadcastBinaryAudioFrame(samples, sr);
        });

        audioCapture.start();
        logger.info("Audio capture started", {
          device: audioDevice,
          sampleRate: audioSampleRate,
        });
      }

      sendDaemonResponse(client, id, true);
      break;
    }

    case "stream:audio:stop": {
      audioSubscribers.delete(client.id);

      if (audioSubscribers.size === 0 && audioCapture) {
        stopAudioCapture();
      }

      sendDaemonResponse(client, id, true);
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
        version: "0.3.0",
        daemon_id: "propulse-bridge",
      });
      break;
    }

    // ----------------------------------------------------------------
    // Default: acknowledge unknown daemon commands
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
            `${message.type}.ack`,
            { success: true, backend: "none", connected: false },
            message.id,
          ),
        );
        break;
      }

      const testController = new RigController(config);
      testController
        .start()
        .then((resolvedBackend) => {
          sendToClient(
            client,
            createMessage(
              `${message.type}.ack`,
              {
                success: resolvedBackend !== "none",
                backend: resolvedBackend,
                connected: resolvedBackend !== "none",
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

    // ------------------------------------------------------------------
    // Default: acknowledge unknown message types
    // ------------------------------------------------------------------
    default: {
      logger.debug("Unhandled message type, sending ack", {
        messageType: message.type,
      });
      sendToClient(
        client,
        createMessage(`${message.type}.ack`, { received: true }, message.id),
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
 * Unlike the previous callback-based ensureRigController, this is a simple
 * async function that either returns a controller or throws.
 */
async function ensureRigController(): Promise<RigController> {
  if (rigController && rigController.getBackend() !== "none") {
    return rigController;
  }

  const backend = await startRig();
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
      const controller = await ensureRigController();
      await controller.setPTT(enabled);

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
      capabilities: ["rig", "contest", "sync", "cluster", "wsjtx", "static"],
      staticServerUrl: fs.existsSync(DIST_DIR)
        ? `http://127.0.0.1:${STATIC_PORT}`
        : null,
      rigBackend: rigController?.getBackend() ?? "none",
      clusterConnected: clusterClient?.getStatus().connected ?? false,
      wsjtxListening: wsjtxListener !== null,
    });

    socket.send(JSON.stringify(welcomeMessage));

    socket.on("message", (data) => {
      const messageString = data.toString();
      handleMessage(client, messageString);
    });

    socket.on("close", (code, reason) => {
      clients.delete(clientId);

      // Clean up FFT subscription for this client
      fftSubscribers.delete(clientId);
      if (fftSubscribers.size === 0 && civClient) {
        stopCiv();
      }

      // Clean up audio subscription for this client
      audioSubscribers.delete(clientId);
      if (audioSubscribers.size === 0 && audioCapture) {
        stopAudioCapture();
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

    // Clean up integration modules
    stopCluster();
    stopWSJTX();
    stopRig();
    stopCiv();

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
