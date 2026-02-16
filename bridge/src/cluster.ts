/**
 * ProPulse Bridge — DX Cluster Telnet Client
 *
 * Connects to DX Spider cluster nodes over telnet (net.Socket),
 * parses spot lines, deduplicates, and emits typed events.
 */

import { Socket } from "node:net";
import type { ClusterSpot, ClusterStatus } from "./types.js";

// ============================================================================
// Well-Known DX Spider Nodes
// ============================================================================

export const WELL_KNOWN_NODES = [
  { host: "dxc.ve7cc.net", port: 7300, name: "VE7CC" },
  { host: "dxc.nc7j.com", port: 7373, name: "NC7J" },
  { host: "spider.ham-radio.ch", port: 7300, name: "HB9DRV" },
] as const;

// ============================================================================
// Types
// ============================================================================

export interface DXClusterClientConfig {
  host: string;
  port: number;
  callsign: string;
  password?: string;
  filters?: {
    bands?: number[];
    modes?: string[];
    minSNR?: number;
  };
}

type SpotHandler = (spot: ClusterSpot) => void;
type StatusHandler = (status: ClusterStatus) => void;
type ErrorHandler = (error: Error) => void;

// ============================================================================
// Spot Deduplication
// ============================================================================

interface DedupeEntry {
  hash: string;
  expiresAt: number;
}

const DEDUPE_WINDOW_MS = 60_000;

function spotDedupeHash(dx: string, frequency: number): string {
  const freqRounded = Math.round(frequency);
  return `${dx.toUpperCase()}_${freqRounded}`;
}

// ============================================================================
// DX Spider Line Parser
// ============================================================================

/**
 * Parse a DX Spider spot line.
 *
 * Format:
 *   DX de W3LPL:     14074.0  JA1ABC       FT8 -10 dB 1234Z
 *
 * Regex breakdown:
 *   DX de <spotter>:\s+<freq>\s+<dx>\s+<comment>\s+<time>Z
 */
const DX_SPOT_REGEX =
  /^DX\s+de\s+([A-Z0-9/]+):\s+([\d.]+)\s+([A-Z0-9/]+)\s+(.*?)\s+(\d{4})Z\s*$/i;

function parseSpotLine(line: string): ClusterSpot | null {
  const match = line.match(DX_SPOT_REGEX);
  if (!match) return null;

  const [, spotter, freqStr, dx, comment, timeStr] = match;

  const frequency = parseFloat(freqStr);
  if (isNaN(frequency)) return null;

  // Derive band from frequency (kHz)
  const band = frequencyToBand(frequency);

  // Try to extract mode from comment
  const mode = extractMode(comment);

  const now = new Date();
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  const spotTime = new Date(now);
  spotTime.setUTCHours(hours, minutes, 0, 0);
  // If the time is in the future, assume it was yesterday
  if (spotTime.getTime() > now.getTime() + 60_000) {
    spotTime.setUTCDate(spotTime.getUTCDate() - 1);
  }

  return {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    spotter,
    dx,
    frequency,
    mode,
    comment: comment.trim(),
    time: spotTime.toISOString(),
    band,
  };
}

function frequencyToBand(freqKHz: number): string | undefined {
  if (freqKHz >= 1800 && freqKHz <= 2000) return "160m";
  if (freqKHz >= 3500 && freqKHz <= 4000) return "80m";
  if (freqKHz >= 5330 && freqKHz <= 5410) return "60m";
  if (freqKHz >= 7000 && freqKHz <= 7300) return "40m";
  if (freqKHz >= 10100 && freqKHz <= 10150) return "30m";
  if (freqKHz >= 14000 && freqKHz <= 14350) return "20m";
  if (freqKHz >= 18068 && freqKHz <= 18168) return "17m";
  if (freqKHz >= 21000 && freqKHz <= 21450) return "15m";
  if (freqKHz >= 24890 && freqKHz <= 24990) return "12m";
  if (freqKHz >= 28000 && freqKHz <= 29700) return "10m";
  if (freqKHz >= 50000 && freqKHz <= 54000) return "6m";
  if (freqKHz >= 144000 && freqKHz <= 148000) return "2m";
  return undefined;
}

function extractMode(comment: string): string | undefined {
  const upper = comment.toUpperCase();
  const modes = [
    "FT8",
    "FT4",
    "CW",
    "SSB",
    "RTTY",
    "PSK31",
    "JT65",
    "JT9",
    "MSK144",
    "JS8",
  ];
  for (const mode of modes) {
    if (upper.includes(mode)) return mode;
  }
  return undefined;
}

// ============================================================================
// DXClusterClient
// ============================================================================

export class DXClusterClient {
  private readonly config: DXClusterClientConfig;
  private socket: Socket | null = null;
  private buffer = "";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  private loginComplete = false;

  // Deduplication
  private readonly dedupeCache = new Map<string, DedupeEntry>();
  private dedupeCleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Statistics
  private spotsReceived = 0;
  private lastSpotTime: string | undefined;

  // Event handlers
  private spotHandlers: SpotHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  constructor(config: DXClusterClientConfig) {
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Event Registration
  // --------------------------------------------------------------------------

  onSpot(handler: SpotHandler): () => void {
    this.spotHandlers.push(handler);
    return () => {
      const idx = this.spotHandlers.indexOf(handler);
      if (idx >= 0) this.spotHandlers.splice(idx, 1);
    };
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      const idx = this.statusHandlers.indexOf(handler);
      if (idx >= 0) this.statusHandlers.splice(idx, 1);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const idx = this.errorHandlers.indexOf(handler);
      if (idx >= 0) this.errorHandlers.splice(idx, 1);
    };
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

  connect(): void {
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.startDedupeCleanup();
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.dedupeCleanupTimer) {
      clearInterval(this.dedupeCleanupTimer);
      this.dedupeCleanupTimer = null;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.loginComplete = false;
    this.buffer = "";
    this.dedupeCache.clear();

    this.emitStatus({
      connected: false,
      spotsReceived: this.spotsReceived,
      lastSpotTime: this.lastSpotTime,
    });
  }

  getStatus(): ClusterStatus {
    return {
      connected: this.socket !== null && this.loginComplete,
      node: `${this.config.host}:${this.config.port}`,
      spotsReceived: this.spotsReceived,
      lastSpotTime: this.lastSpotTime,
    };
  }

  // --------------------------------------------------------------------------
  // Internal Connection Logic
  // --------------------------------------------------------------------------

  private doConnect(): void {
    if (this.intentionalDisconnect) return;

    this.socket = new Socket();
    this.buffer = "";
    this.loginComplete = false;

    this.socket.setEncoding("utf-8");
    this.socket.setTimeout(300_000);

    this.socket.on("connect", () => {
      this.reconnectAttempt = 0;
      // Wait for the login prompt — data handler will detect it
    });

    this.socket.on("data", (data: string) => {
      this.buffer += data;
      this.processBuffer();
    });

    this.socket.on("timeout", () => {
      this.emitError(new Error("Connection timed out"));
      this.socket?.destroy();
    });

    this.socket.on("error", (err: Error) => {
      this.emitError(err);
    });

    this.socket.on("close", () => {
      this.socket = null;
      this.loginComplete = false;

      this.emitStatus({
        connected: false,
        node: `${this.config.host}:${this.config.port}`,
        spotsReceived: this.spotsReceived,
        lastSpotTime: this.lastSpotTime,
      });

      if (!this.intentionalDisconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.connect(this.config.port, this.config.host);
  }

  private processBuffer(): void {
    // Split on newlines, keeping the last partial line in the buffer
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Handle login sequence
      if (!this.loginComplete) {
        this.handleLoginLine(trimmed);
        continue;
      }

      // Parse spot lines
      const spot = parseSpotLine(trimmed);
      if (spot) {
        this.handleSpot(spot);
      }
    }
  }

  private handleLoginLine(line: string): void {
    const lower = line.toLowerCase();

    if (
      lower.includes("login:") ||
      lower.includes("call:") ||
      lower.includes("callsign:") ||
      lower.includes("please enter your call")
    ) {
      this.socket?.write(this.config.callsign + "\r\n");
      return;
    }

    if (lower.includes("password:") && this.config.password) {
      this.socket?.write(this.config.password + "\r\n");
      return;
    }

    // Detect successful connection — most clusters greet with the callsign
    // or send "Hello" / cluster name after login
    if (
      lower.includes("hello") ||
      lower.includes("welcome") ||
      lower.includes(this.config.callsign.toLowerCase()) ||
      lower.includes("dx spider")
    ) {
      this.loginComplete = true;

      this.emitStatus({
        connected: true,
        node: `${this.config.host}:${this.config.port}`,
        spotsReceived: this.spotsReceived,
        lastSpotTime: this.lastSpotTime,
      });
    }
  }

  private handleSpot(spot: ClusterSpot): void {
    // Apply filters
    if (!this.passesFilters(spot)) return;

    // Deduplication
    const hash = spotDedupeHash(spot.dx, spot.frequency);
    const now = Date.now();
    const existing = this.dedupeCache.get(hash);
    if (existing && existing.expiresAt > now) {
      return; // duplicate within the dedup window
    }
    this.dedupeCache.set(hash, { hash, expiresAt: now + DEDUPE_WINDOW_MS });

    this.spotsReceived++;
    this.lastSpotTime = spot.time;

    this.emitSpot(spot);
  }

  private passesFilters(spot: ClusterSpot): boolean {
    const filters = this.config.filters;
    if (!filters) return true;

    // Band filter: convert band string to approximate frequency range
    if (filters.bands && filters.bands.length > 0 && spot.band) {
      const bandNum = parseInt(spot.band, 10);
      if (!isNaN(bandNum) && !filters.bands.includes(bandNum)) {
        return false;
      }
    }

    // Mode filter
    if (filters.modes && filters.modes.length > 0 && spot.mode) {
      if (!filters.modes.includes(spot.mode.toUpperCase())) {
        return false;
      }
    }

    // SNR filter — extract from comment if present
    if (filters.minSNR !== undefined) {
      const snrMatch = spot.comment.match(/([+-]?\d+)\s*dB/i);
      if (snrMatch) {
        const snr = parseInt(snrMatch[1], 10);
        if (snr < filters.minSNR) return false;
      }
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Reconnection with Exponential Backoff
  // --------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;

    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempt),
      30_000,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  // --------------------------------------------------------------------------
  // Deduplication Maintenance
  // --------------------------------------------------------------------------

  private startDedupeCleanup(): void {
    if (this.dedupeCleanupTimer) return;

    this.dedupeCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.dedupeCache) {
        if (entry.expiresAt <= now) {
          this.dedupeCache.delete(key);
        }
      }
    }, 30_000);
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitSpot(spot: ClusterSpot): void {
    for (const handler of this.spotHandlers) {
      try {
        handler(spot);
      } catch {
        // Swallow handler errors to protect the client loop
      }
    }
  }

  private emitStatus(status: ClusterStatus): void {
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // Swallow handler errors
      }
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Swallow handler errors
      }
    }
  }
}
