/**
 * Blitzortung Lightning Strike Collector
 *
 * Connects to the Blitzortung WebSocket server and buffers recent
 * lightning strikes in memory. Strikes older than MAX_AGE_MS are
 * pruned on each incoming message and every PRUNE_INTERVAL_MS.
 *
 * The buffer is served via the collector's HTTP server at GET /lightning.
 *
 * Blitzortung WebSocket protocol:
 * - Connect to wss://wsN.blitzortung.org:3000/ (N = 1,5,6,7)
 * - Send initialization message: {"time": 0} to start receiving data
 * - Server streams JSON messages per strike: { time, lat, lon, alt, pol, mds, mcg, sig }
 * - `time` is nanosecond timestamp since epoch
 * - `sig` is an array of detecting stations (length correlates with strength)
 *
 * Compliant with Blitzortung terms: server-side proxy, non-commercial use.
 */

import WebSocket from "ws";
import { log } from "../logger.js";
import { reportHealth } from "../health.js";

// =============================================================================
// Types
// =============================================================================

/** Blitzortung raw WebSocket message */
interface BlitzortungMessage {
  time: number; // nanoseconds since epoch
  lat: number;
  lon: number;
  alt?: number;
  pol?: number; // polarity: -1 (CG-) or +1 (CG+)
  mds?: number;
  mcg?: number;
  sig?: unknown[]; // array of detecting station signals
}

/** Normalized strike in the buffer */
export interface BufferedStrike {
  lat: number;
  lon: number;
  time: number; // milliseconds since epoch
  current_kA: number; // estimated from station count
}

// =============================================================================
// Constants
// =============================================================================

/** WebSocket server URLs — cycle through on reconnect (trailing slash required) */
const WS_SERVERS = [
  "wss://ws1.blitzortung.org:3000/",
  "wss://ws5.blitzortung.org:3000/",
  "wss://ws6.blitzortung.org:3000/",
  "wss://ws7.blitzortung.org:3000/",
];

/** Maximum age of strikes to keep in buffer (10 minutes) */
const MAX_AGE_MS = 10 * 60_000;

/** Maximum number of strikes in buffer */
const MAX_BUFFER_SIZE = 5000;

/** Prune interval (every 30 seconds) */
const PRUNE_INTERVAL_MS = 30_000;

/** Base reconnect delay (doubles on each consecutive failure, max 60s) */
const BASE_RECONNECT_MS = 2_000;
const MAX_RECONNECT_MS = 60_000;

/** Ping interval to keep connection alive */
const PING_INTERVAL_MS = 30_000;

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
let strikesReceived = 0;
let running = false;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Estimate peak current (kA) from the number of detecting stations.
 * More stations detecting a strike generally correlates with stronger
 * peak current. This is a rough approximation — Blitzortung doesn't
 * provide direct current measurements via WebSocket.
 *
 * Maps station count to ~20-200 kA range.
 */
function estimateCurrentKA(stationCount: number): number {
  return Math.min(200, Math.max(10, stationCount * 12));
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
        "User-Agent": "Propulse/1.0 (Ham Radio Propagation Dashboard)",
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
    strikesReceived = 0;
    reportHealth("lightning", "ok", 0);

    // Send initialization message — Blitzortung requires this to start streaming
    ws!.send(JSON.stringify({ time: 0 }));

    // Start ping keepalive
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL_MS);
  });

  ws.on("message", (data) => {
    try {
      const msg: BlitzortungMessage = JSON.parse(data.toString());

      // Validate required fields
      if (
        typeof msg.lat !== "number" ||
        typeof msg.lon !== "number" ||
        typeof msg.time !== "number"
      ) {
        return;
      }

      // Convert nanosecond timestamp to milliseconds
      const timeMs =
        msg.time > 1e15
          ? Math.floor(msg.time / 1e6) // nanoseconds → ms
          : msg.time > 1e12
            ? msg.time // already ms
            : msg.time * 1000; // seconds → ms

      const stationCount = Array.isArray(msg.sig) ? msg.sig.length : 1;

      buffer.push({
        lat: msg.lat,
        lon: msg.lon,
        time: timeMs,
        current_kA: estimateCurrentKA(stationCount),
      });

      strikesReceived++;

      // Inline prune every 500 strikes to prevent unbounded growth
      if (strikesReceived % 500 === 0) {
        pruneBuffer();
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

/** Start the Blitzortung WebSocket consumer */
export function startLightning(): void {
  if (running) return;
  running = true;

  log("info", "Lightning: starting consumer");

  // Start periodic prune
  pruneTimer = setInterval(pruneBuffer, PRUNE_INTERVAL_MS);

  connect();
}

/** Stop the Blitzortung WebSocket consumer */
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
