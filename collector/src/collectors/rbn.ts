import net, { type Socket } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SpotBatcher } from "../lib/spot-batcher.js";
import { log } from "../logger.js";
import { frequencyToBand } from "../transforms/bands.js";
import type { NormalizedSpot } from "../types.js";

const RBN_HOST = "telnet.reversebeacon.net";
const RBN_PORTS = [7000, 7001] as const;
const RECONNECT_DELAY_MS = 10_000;

const sockets = new Map<number, Socket>();
const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
const connectedPorts = new Set<number>();
let batcher: SpotBatcher | null = null;
let stopped = false;
let rbnCallsign = "";

export function normalizeRbnCallsign(value: string | undefined): string {
  const callsign = value?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9/]{3,16}$/.test(callsign)) {
    throw new Error("RBN_LOGIN_CALLSIGN must be a valid receive-only callsign");
  }
  return callsign;
}

export function rbnSpottedAt(nowMs: number, ageSeconds: number): string {
  const rawTimestamp = nowMs - Math.max(0, ageSeconds) * 1000;
  const flooredTimestamp = Math.floor(rawTimestamp / 15_000) * 15_000;
  return new Date(flooredTimestamp).toISOString();
}

function rbnTimestamp(hhmm: string, nowMs: number): string | null {
  if (!/^\d{4}$/.test(hhmm)) return null;
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2));
  if (hour > 23 || minute > 59) return null;

  const now = new Date(nowMs);
  const timestamp = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
    ),
  );
  if (timestamp.getTime() > nowMs + 60_000) {
    timestamp.setUTCDate(timestamp.getUTCDate() - 1);
  }
  return timestamp.toISOString();
}

export function parseRbnLine(
  line: string,
  defaultMode: "CW" | "FT8",
  nowMs = Date.now(),
): NormalizedSpot | null {
  const match = line.match(
    /^DX de\s+([^:]+):\s+([\d.]+)\s+(\S+)\s+(.*?)\s+(\d{4})Z\s*$/i,
  );
  if (!match) return null;

  const [, rawSpotter, rawFrequency, rawDx, comment, hhmm] = match;
  const spotter = rawSpotter.trim().replace(/-#$/, "").toUpperCase();
  const dx = rawDx.trim().toUpperCase();
  const frequencyKhz = Number(rawFrequency);
  const band = frequencyToBand(frequencyKhz);
  const spottedAt = rbnTimestamp(hhmm, nowMs);
  if (!spotter || !dx || !Number.isFinite(frequencyKhz) || !band || !spottedAt) {
    return null;
  }

  const mode =
    comment.match(/\b(FT8|FT4|RTTY|CW)\b/i)?.[1]?.toUpperCase() || defaultMode;
  const snrMatch = comment.match(/(-?\d+(?:\.\d+)?)\s*dB\b/i);
  const wpmMatch = comment.match(/(\d+)\s*WPM\b/i);
  const snr = snrMatch ? Number(snrMatch[1]) : null;
  const wpm = wpmMatch ? Number(wpmMatch[1]) : null;

  return {
    source: "rbn",
    spotted_at: spottedAt,
    tx_callsign: dx,
    tx_grid: null,
    tx_lat: null,
    tx_lon: null,
    rx_callsign: spotter,
    rx_grid: null,
    rx_lat: null,
    rx_lon: null,
    frequency_khz: Math.round(frequencyKhz * 10) / 10,
    band,
    mode,
    snr: snr !== null && Number.isFinite(snr) ? snr : null,
    wpm: wpm !== null && Number.isFinite(wpm) ? wpm : null,
    comment: comment.trim() || null,
    dxcc: null,
    continent: null,
  };
}

export function shouldSampleRbn(line: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;

  let hash = 2_166_136_261;
  for (let index = 0; index < line.length; index += 1) {
    hash ^= line.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 10_000 < percent * 100;
}

function samplePercent(): number {
  const value = Number(process.env.RBN_SAMPLE_PERCENT ?? "5");
  if (!Number.isFinite(value)) return 5;
  return Math.min(100, Math.max(0.1, value));
}

function updateConnectionHealth(): void {
  batcher?.setConnected(connectedPorts.size === RBN_PORTS.length);
}

function scheduleReconnect(port: number): void {
  if (stopped || reconnectTimers.has(port)) return;
  const timer = setTimeout(() => {
    reconnectTimers.delete(port);
    connectPort(port);
  }, RECONNECT_DELAY_MS);
  reconnectTimers.set(port, timer);
}

function connectPort(port: number): void {
  if (stopped || sockets.has(port)) return;

  const mode = port === 7001 ? "FT8" : "CW";
  const percent = samplePercent();
  let remainder = "";
  const socket = net.createConnection({ host: RBN_HOST, port });
  sockets.set(port, socket);
  socket.setKeepAlive(true, 30_000);
  socket.setTimeout(2 * 60_000);

  socket.on("connect", () => {
    socket.write(`${rbnCallsign}\r\n`);
    connectedPorts.add(port);
    updateConnectionHealth();
    log("info", "RBN relay connected", { port, mode, samplePercent: percent });
  });

  socket.on("data", (chunk) => {
    const lines = (remainder + chunk.toString("utf8")).split(/\r?\n/);
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (!shouldSampleRbn(line, percent)) continue;
      const spot = parseRbnLine(line, mode);
      if (spot) batcher?.enqueue(spot);
    }
  });

  socket.on("timeout", () => socket.destroy(new Error("RBN relay timeout")));
  socket.on("error", (error) => {
    log("warn", "RBN relay connection error", { port, error: error.message });
  });
  socket.on("close", () => {
    sockets.delete(port);
    connectedPorts.delete(port);
    updateConnectionHealth();
    if (!stopped) {
      log("warn", "RBN relay disconnected; reconnect scheduled", { port });
      scheduleReconnect(port);
    }
  });
}

export function startRbn(db: SupabaseClient): void {
  if (batcher) return;
  rbnCallsign = normalizeRbnCallsign(process.env.RBN_LOGIN_CALLSIGN);
  stopped = false;
  batcher = new SpotBatcher({ db, source: "rbn" });
  batcher.start();
  for (const port of RBN_PORTS) connectPort(port);
}

export function stopRbn(): void {
  stopped = true;
  for (const timer of reconnectTimers.values()) clearTimeout(timer);
  reconnectTimers.clear();
  for (const socket of sockets.values()) socket.destroy();
  sockets.clear();
  connectedPorts.clear();
  batcher?.stop();
  batcher = null;
}
