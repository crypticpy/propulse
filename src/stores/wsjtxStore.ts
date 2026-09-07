/**
 * Zustand store for WSJT-X decode state management
 * Manages real-time decodes, status, and connection state from WSJT-X
 * via the bridge WebSocket. This is transient data — not persisted.
 */

import { create } from "zustand";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WSJTXDecode {
  /** Original WSJT-X instance and bridge-captured dial context, never current-radio inference. */
  instanceId?: string;
  dialFrequencyHz?: number;
  dialMode?: string;
  offAir?: boolean;
  /** Whether this is a new (not previously seen) decode */
  isNew: boolean;
  /** Milliseconds since midnight UTC */
  time: number;
  /** Signal-to-noise ratio in dB */
  snr: number;
  /** Time offset in seconds */
  deltaTime: number;
  /** Frequency offset in Hz */
  deltaFrequency: number;
  /** Decoding mode (e.g., "FT8", "FT4", "JT65") */
  mode: string;
  /** Decoded message text */
  message: string;
  /** Whether this is a low-confidence decode */
  lowConfidence: boolean;
  /** Extracted callsign from the message, if parseable */
  callsign?: string;
  /** Extracted grid locator from the message, if present */
  grid?: string;
  /** Date.now() timestamp when this decode was received (for age tracking) */
  receivedAt: number;
}

export interface WSJTXStatus {
  instanceId?: string;
  /** Dial frequency in Hz */
  frequency: number;
  /** Operating mode (e.g., "FT8", "FT4") */
  mode: string;
  /** DX callsign being worked */
  dxCall?: string;
  /** DX grid locator */
  dxGrid?: string;
  /** Whether TX is enabled */
  txEnabled: boolean;
  /** Whether WSJT-X is currently decoding */
  decoding: boolean;
  /** RX audio frequency offset in Hz */
  rxDF: number;
  /** TX audio frequency offset in Hz */
  txDF: number;
  /** Timestamp of last status update */
  lastUpdate: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of decodes to keep in memory (FIFO eviction) */
const MAX_DECODES = 500;

/** Window for tracking unique callsigns (15 minutes in ms) */
const UNIQUE_CALLSIGN_WINDOW_MS = 15 * 60 * 1000;

/** Window for calculating decode rate (60 seconds in ms) */
const DECODE_RATE_WINDOW_MS = 60 * 1000;

// ─── Store State ────────────────────────────────────────────────────────────

interface WSJTXState {
  // State
  /** Current list of decodes (newest first, max MAX_DECODES) */
  decodes: WSJTXDecode[];
  /** Current WSJT-X application status */
  status: WSJTXStatus | null;
  /** Whether the bridge connection to WSJT-X is active */
  connected: boolean;
  /** Current decodes-per-minute rate */
  decodeRate: number;
  /** Unique callsigns heard in the last 15 minutes */
  uniqueCallsigns: Set<string>;

  // Actions
  /** Add a new decode to the list (FIFO, max 500) */
  addDecode: (decode: WSJTXDecode) => void;
  /** Update the WSJT-X application status */
  setStatus: (status: WSJTXStatus) => void;
  /** Set connection state */
  setConnected: (connected: boolean) => void;
  /** Clear all decodes and reset counters */
  clearDecodes: (instanceId?: string) => void;

  // Selectors
  /** Get decodes matching the current status frequency band */
  getDecodesByBand: (band: string) => WSJTXDecode[];
  /** Get decodes where the message starts with "CQ " (CQ-calling stations) */
  getDecodesByCQ: () => WSJTXDecode[];
  /** Get unique callsigns from recent decodes (last 15 minutes) */
  getRecentCallsigns: () => string[];
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useWSJTXStore = create<WSJTXState>()((set, get) => ({
  // Initial state
  decodes: [],
  status: null,
  connected: false,
  decodeRate: 0,
  uniqueCallsigns: new Set<string>(),

  addDecode: (decode) =>
    set((state) => {
      const now = Date.now();

      // Prepend new decode, enforce FIFO cap
      const newDecodes = [decode, ...state.decodes];
      if (newDecodes.length > MAX_DECODES) {
        newDecodes.length = MAX_DECODES;
      }

      // Recalculate unique callsigns within the 15-minute window
      const cutoff = now - UNIQUE_CALLSIGN_WINDOW_MS;
      const newUniqueCallsigns = new Set<string>();
      for (const d of newDecodes) {
        if (d.isNew && !d.offAir && d.receivedAt <= now && d.receivedAt >= cutoff && d.callsign) {
          newUniqueCallsigns.add(d.callsign);
        }
      }

      // Calculate decode rate: count decodes received in the last 60 seconds
      const rateCutoff = now - DECODE_RATE_WINDOW_MS;
      let recentCount = 0;
      for (const d of newDecodes) {
        if (d.isNew && !d.offAir && d.receivedAt <= now && d.receivedAt >= rateCutoff) {
          recentCount++;
        }
      }

      return {
        decodes: newDecodes,
        uniqueCallsigns: newUniqueCallsigns,
        decodeRate: recentCount,
      };
    }),

  setStatus: (status) => set({ status }),

  setConnected: (connected) =>
    set({
      connected,
      // Clear status when disconnecting
      ...(connected ? {} : { status: null }),
    }),

  clearDecodes: (instanceId) => set((state) => {
    const decodes = instanceId === undefined ? [] : state.decodes.filter(d => d.instanceId !== instanceId);
    const now = Date.now();
    return {
      decodes,
      decodeRate: decodes.filter(d => d.isNew && !d.offAir && d.receivedAt <= now && d.receivedAt >= now - DECODE_RATE_WINDOW_MS).length,
      uniqueCallsigns: new Set(decodes.filter(d => d.isNew && !d.offAir && d.receivedAt <= now && d.receivedAt >= now - UNIQUE_CALLSIGN_WINDOW_MS && d.callsign).map(d => d.callsign!)),
    };
  }),

  // Selectors
  getDecodesByBand: (band) => get().decodes.filter((decode) =>
    decode.isNew && !decode.offAir && Number.isSafeInteger(decode.dialFrequencyHz) &&
    decode.dialFrequencyHz! > 0 && bandFromFreq(decode.dialFrequencyHz! / 1000) === band,
  ),

  getDecodesByCQ: () => {
    const { decodes } = get();
    return decodes.filter((d) => d.message.startsWith("CQ "));
  },

  getRecentCallsigns: () => {
    const { decodes } = get();
    const cutoff = Date.now() - UNIQUE_CALLSIGN_WINDOW_MS;
    const callsigns = new Set<string>();
    for (const d of decodes) {
      if (d.receivedAt >= cutoff && d.callsign) {
        callsigns.add(d.callsign);
      }
    }
    return Array.from(callsigns).sort();
  },
}));
