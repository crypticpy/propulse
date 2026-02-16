/**
 * Zustand store for FT8/FT4 decode management.
 *
 * Combines transient runtime state (cycle progress, enabled flag, error)
 * with a write-through decode buffer backed by IndexedDB.
 * Not using Zustand persist middleware — IDB is the persistence layer.
 */

import { create } from "zustand";
import type { WsjtxDecode } from "@/lib/radio/protocol";
import type { Ft8Decode } from "@/lib/db/types";
import {
  addFt8Decodes,
  getRecentFt8Decodes,
  getFt8DecodeCount,
} from "@/lib/db/ft8DecodeStore";

/** Maximum number of decodes kept in the in-memory display buffer. */
const DISPLAY_BUFFER_CAP = 500;

export interface Ft8DecoderStats {
  totalDecodes: number;
  cyclesCompleted: number;
  lastCycleDecodes: number;
  workerReady: boolean;
}

interface Ft8DecoderStoreState {
  enabled: boolean;
  cycleProgress: number;
  stats: Ft8DecoderStats;
  error: string | null;

  /** In-memory display buffer of recent decodes (newest first, capped at 500). */
  decodes: WsjtxDecode[];

  setEnabled: (enabled: boolean) => void;
  setCycleProgress: (progress: number) => void;
  updateStats: (partial: Partial<Ft8DecoderStats>) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  /**
   * Prepend new decodes to the display buffer, persist to IndexedDB,
   * and update cumulative stats.
   */
  addDecodes: (
    decodes: WsjtxDecode[],
    freqHz?: number,
    band?: string,
    myCallsign?: string,
  ) => void;

  /** Load the most recent 500 decodes from IDB into the display buffer. */
  loadRecent: () => Promise<void>;

  /** Clear the in-memory display buffer (does not touch IDB). */
  clearDecodes: () => void;
}

const defaultStats: Ft8DecoderStats = {
  totalDecodes: 0,
  cyclesCompleted: 0,
  lastCycleDecodes: 0,
  workerReady: false,
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Convert a WsjtxDecode + context into an Ft8Decode record for IDB. */
function toFt8Decode(
  d: WsjtxDecode,
  freqHz?: number,
  band?: string,
  myCallsign?: string,
): Ft8Decode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    timestamp: now,
    time: d.time,
    snr: d.snr,
    deltaTime: d.deltaTime,
    deltaFrequency: d.deltaFrequency,
    mode: d.mode,
    message: d.message,
    callsign: d.callsign,
    grid: d.grid,
    isCQ: d.message.startsWith("CQ "),
    lowConfidence: d.lowConfidence,
    frequencyHz: freqHz != null ? freqHz + d.deltaFrequency : undefined,
    band,
    myCallsign,
    instanceId: d.instanceId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Convert an Ft8Decode record back to a WsjtxDecode for display. */
function toWsjtxDecode(d: Ft8Decode): WsjtxDecode {
  return {
    isNew: false,
    time: d.time,
    snr: d.snr,
    deltaTime: d.deltaTime,
    deltaFrequency: d.deltaFrequency,
    mode: d.mode,
    message: d.message,
    lowConfidence: d.lowConfidence,
    callsign: d.callsign,
    grid: d.grid,
    instanceId: d.instanceId,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFt8DecoderStore = create<Ft8DecoderStoreState>((set, get) => ({
  enabled: false,
  cycleProgress: 0,
  stats: defaultStats,
  error: null,
  decodes: [],

  setEnabled: (enabled) => set({ enabled }),

  setCycleProgress: (progress) => set({ cycleProgress: progress }),

  updateStats: (partial) => set((s) => ({ stats: { ...s.stats, ...partial } })),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      enabled: false,
      cycleProgress: 0,
      stats: defaultStats,
      error: null,
      decodes: [],
    }),

  addDecodes: (newDecodes, freqHz, band, myCallsign) => {
    if (newDecodes.length === 0) return;

    // Prepend to display buffer, cap at DISPLAY_BUFFER_CAP
    set((s) => {
      const merged = [...newDecodes, ...s.decodes].slice(0, DISPLAY_BUFFER_CAP);
      return {
        decodes: merged,
        stats: {
          ...s.stats,
          totalDecodes: s.stats.totalDecodes + newDecodes.length,
          lastCycleDecodes: newDecodes.length,
          cyclesCompleted: s.stats.cyclesCompleted + 1,
        },
      };
    });

    // Convert to IDB records and write-through (fire-and-forget)
    const idbRecords = newDecodes.map((d) =>
      toFt8Decode(d, freqHz, band, myCallsign),
    );
    addFt8Decodes(idbRecords).catch(console.error);
  },

  loadRecent: async () => {
    try {
      const [idbDecodes, totalCount] = await Promise.all([
        getRecentFt8Decodes(DISPLAY_BUFFER_CAP),
        getFt8DecodeCount(),
      ]);
      const displayDecodes = idbDecodes.map(toWsjtxDecode);
      set((s) => ({
        decodes: displayDecodes,
        stats: { ...s.stats, totalDecodes: totalCount },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      get().setError(`Failed to load decodes: ${msg}`);
    }
  },

  clearDecodes: () => set({ decodes: [] }),
}));
