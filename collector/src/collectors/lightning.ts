/**
 * Lightning Strike Collector via LightningMaps.org WebSocket
 *
 * Connects to the LightningMaps.org WebSocket server (which relays
 * Blitzortung data) and buffers recent lightning strikes in memory.
 * Strikes older than MAX_AGE_MS are pruned periodically.
 *
 * The buffer is served via the collector's HTTP server at GET /lightning.
 *
 * WebSocket protocol:
 * - Connect to wss://live.lightningmaps.org:443/
 * - Send subscription JSON with viewport bounds for global coverage
 * - Server sends challenge (k field) — respond with computed value
 * - Server streams batches of strikes in { strokes: [...] } messages
 * - Strike format: { time (ms), lat, lon, src, srv, id, del, dev }
 *
 * Compliant with server-side proxy pattern for non-commercial use.
 */

import WebSocket from "ws";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

// =============================================================================
// Types
// =============================================================================

/** Strike as received from the LightningMaps.org WebSocket */
interface LMStroke {
  time: number; // milliseconds since epoch
  lat: number;
  lon: number;
  src?: number; // source network
  srv?: number; // server ID
  id?: number; // strike ID
  del?: number; // delay in ms
  dev?: number; // deviation
}

/** Server message from LightningMaps.org */
interface LMMessage {
  strokes?: LMStroke[];
  k?: number; // challenge value
  time?: number; // server time
  reload?: number; // reload request
  cid?: number;
  con?: number;
  port?: string;
  flags?: unknown;
}

/** Normalized strike in the buffer */
export interface BufferedStrike {
  lat: number;
  lon: number;
  time: number; // milliseconds since epoch
  current_kA: number; // estimated intensity
}

// =============================================================================
// Constants
// =============================================================================

/** WebSocket server URLs — cycle through on reconnect */
const WS_SERVERS = [
  "wss://live.lightningmaps.org:443/",
  "wss://live2.lightningmaps.org:443/",
];

/** Maximum age of strikes to keep in buffer (10 minutes) */
const MAX_AGE_MS = 10 * 60_000;

/** Maximum number of strikes in buffer */
const MAX_BUFFER_SIZE = 5000;

/** Prune interval (every 30 seconds) */
const PRUNE_INTERVAL_MS = 30_000;

/** Base reconnect delay (doubles on each consecutive failure, max 60s) */
const BASE_RECONNECT_MS = 3_000;
const MAX_RECONNECT_MS = 60_000;

/** Ping interval to keep connection alive */
const PING_INTERVAL_MS = 25_000;

/** Re-subscribe interval to maintain data flow */
const RESUBSCRIBE_INTERVAL_MS = 60_000;

/** Protocol version expected by LightningMaps.org */
const LM_VERSION = 24;

// =============================================================================
// State
// =============================================================================

let ws: WebSocket | null = null;
let buffer: BufferedStrike[] = [];
let serverIndex = 0;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let resubscribeTimer: ReturnType<typeof setInterval> | null = null;
let strikesReceived = 0;
let running = false;
const lastIds: Record<string, number> = {};
let serverTime = 0;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Estimate peak current (kA) from deviation value.
 * Higher deviation values roughly correlate with stronger strikes.
 * Maps deviation (typically 500-5000) to ~20-200 kA range.
 */
function estimateCurrentKA(dev: number | undefined): number {
  if (!dev || dev <= 0) return 30;
  return Math.min(200, Math.max(15, Math.round(dev / 25)));
}

/** Remove strikes older than MAX_AGE_MS and enforce buffer cap */
function pruneBuffer(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  buffer = buffer.filter((s) => s.time >= cutoff);

  // If still over cap, keep only the most recent
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_BUFFER_SIZE);
  }
}

/** Build subscription message for global coverage */
function buildSubscription(): string {
  return JSON.stringify({
    v: LM_VERSION,
    i: lastIds,
    s: false,
    x: 0,
    w: 0,
    tx: 0,
    tw: 1,
    a: 4, // source mask (all networks)
    z: 3, // zoom level (low = global)
    b: true, // visible
    h: "",
    l: 0,
    t: serverTime,
    from_lightningmaps_org: true,
    p: [90, 180, -90, -180], // global viewport bounds [NE_lat, NE_lng, SW_lat, SW_lng]
  });
}

// =============================================================================
// WebSocket Connection
// =============================================================================

function connect(): void {
  if (!running) return;

  const url = WS_SERVERS[serverIndex % WS_SERVERS.length];
  log("info", `Lightning: connecting to ${url}`);

  try {
    ws = new WebSocket(url, {
      headers: {
        Origin: "https://www.lightningmaps.org",
        "User-Agent":
          "Mozilla/5.0 (compatible; Propulse/1.0; Ham Radio Propagation)",
      },
      handshakeTimeout: 10_000,
    });
  } catch (err) {
    log("error", "Lightning: WebSocket creation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    log("info", "Lightning: connected", { server: url });
    reconnectAttempts = 0;
    reportHealth("lightning", "ok", 0);

    // Send initial subscription for global coverage
    ws!.send(buildSubscription());

    // Start ping keepalive
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL_MS);

    // Re-subscribe periodically to maintain data flow
    if (resubscribeTimer) clearInterval(resubscribeTimer);
    resubscribeTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(buildSubscription());
      }
    }, RESUBSCRIBE_INTERVAL_MS);
  });

  ws.on("message", (data) => {
    try {
      const msg: LMMessage = JSON.parse(data.toString());

      // Handle challenge-response (k field)
      if (msg.k !== undefined && ws?.readyState === WebSocket.OPEN) {
        const response = ((msg.k * 3604) % 7081) * (Date.now() / 100);
        ws.send(JSON.stringify({ k: response }));
      }

      // Track server time
      if (msg.time !== undefined) {
        serverTime = msg.time;
      }

      // Process strike data
      if (msg.strokes && Array.isArray(msg.strokes)) {
        for (const stroke of msg.strokes) {
          if (
            typeof stroke.lat !== "number" ||
            typeof stroke.lon !== "number" ||
            typeof stroke.time !== "number"
          ) {
            continue;
          }

          buffer.push({
            lat: stroke.lat,
            lon: stroke.lon,
            time: stroke.time,
            current_kA: estimateCurrentKA(stroke.dev),
          });

          strikesReceived++;

          // Track last ID per server
          if (stroke.srv !== undefined && stroke.id !== undefined) {
            lastIds[String(stroke.srv)] = stroke.id;
          }
        }

        // Update health on each batch
        reportHealth("lightning", "ok", strikesReceived);

        // Inline prune every 500 strikes to prevent unbounded growth
        if (strikesReceived % 500 === 0) {
          pruneBuffer();
        }
      }
    } catch {
      // Skip unparseable messages silently
    }
  });

  ws.on("close", (code, reason) => {
    log("warn", "Lightning: disconnected", {
      code,
      reason: reason.toString(),
    });
    cleanup();
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    log("error", "Lightning: WebSocket error", { error: err.message });
    // 'close' event will follow — reconnect handled there
  });
}

function cleanup(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (resubscribeTimer) {
    clearInterval(resubscribeTimer);
    resubscribeTimer = null;
  }
  ws = null;
}

function scheduleReconnect(): void {
  if (!running) return;

  const delay = Math.min(
    MAX_RECONNECT_MS,
    BASE_RECONNECT_MS * Math.pow(2, reconnectAttempts),
  );
  reconnectAttempts++;
  serverIndex++; // Try next server on reconnect

  log("info", `Lightning: reconnecting in ${delay}ms`, {
    attempt: reconnectAttempts,
    nextServer: WS_SERVERS[serverIndex % WS_SERVERS.length],
  });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// =============================================================================
// Public API
// =============================================================================

/** Start the lightning WebSocket consumer */
export function startLightning(): void {
  if (running) return;
  running = true;

  log("info", "Lightning: starting consumer");

  // Start periodic prune
  pruneTimer = setInterval(pruneBuffer, PRUNE_INTERVAL_MS);

  connect();
}

/** Stop the lightning WebSocket consumer */
export function stopLightning(): void {
  running = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (resubscribeTimer) {
    clearInterval(resubscribeTimer);
    resubscribeTimer = null;
  }
  if (ws) {
    ws.close(1000, "shutdown");
    ws = null;
  }

  log("info", "Lightning: consumer stopped", {
    bufferedStrikes: buffer.length,
  });
}

/**
 * Get buffered lightning strikes (last 10 minutes, max 5000).
 * Returns strikes sorted newest-first.
 */
export function getBufferedStrikes(): BufferedStrike[] {
  pruneBuffer();
  // Return a copy, newest first
  return buffer.slice().reverse();
}

/** Get current buffer stats for health reporting */
export function getLightningStats(): {
  connected: boolean;
  bufferSize: number;
  strikesReceived: number;
} {
  return {
    connected: ws?.readyState === WebSocket.OPEN,
    bufferSize: buffer.length,
    strikesReceived,
  };
}
