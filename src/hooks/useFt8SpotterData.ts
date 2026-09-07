/**
 * FT8 Spotter data hook
 *
 * Merges FT8/FT4 decode data from two sources (native WASM decoder and
 * WSJT-X bridge) and resolves decoded stations to globe coordinates for
 * the FT8 Spotter globe visualization layer.
 */

import { useMemo, useRef } from "react";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { wsjtxDecodedAt, wsjtxFrequencyHz } from "@/lib/radio/wsjtxIngestion";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";

// ─── Constants ──────────────────────────────────────────────────────────────

/** FT8 cycle duration in milliseconds */
const FT8_CYCLE_MS = 15_000;

/** FT4 cycle duration in milliseconds */
const FT4_CYCLE_MS = 7_500;

/** Maximum decodes kept per cycle */
const MAX_PER_CYCLE = 100;

/** Maximum total recent decodes (for heatmap buffer) */
const MAX_RECENT = 500;

/** Recent window: 5 minutes in milliseconds (ms-since-midnight units) */
const RECENT_WINDOW_MS = 5 * 60 * 1000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Ft8SpotterDecode {
  callsign: string;
  grid: string | null;
  snr: number;
  mode: string;
  /** Milliseconds since midnight UTC */
  time: number;
  deltaFrequency: number;
  lat: number;
  lon: number;
  /** True if coordinates came from a grid locator (not prefix fallback) */
  resolved: boolean;
  /** Cycle identifier: Math.floor(time / cycleDurationMs) */
  cycleId: number;
  source: "native" | "bridge";
}

export interface Ft8SpotterData {
  /** Decodes from the current (most recent) cycle only */
  currentCycleDecodes: Ft8SpotterDecode[];
  /** All recent decoded stations (last ~5 minutes, for heatmap) */
  allRecentDecodes: Ft8SpotterDecode[];
  /** 0-1 progress through current cycle */
  cycleProgress: number;
  /** Total decode count across both sources */
  totalDecodes: number;
  /** Unique callsigns in recent buffer */
  uniqueStations: number;
  /** True on the render where cycleId incremented */
  isNewCycle: boolean;
  /** Current operating band (e.g. "20m") or null */
  currentBand: string | null;
  /** Current mode from decoder */
  currentMode: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get cycle duration for a mode string */
function cycleDurationMs(mode: string): number {
  return mode.toUpperCase() === "FT4" ? FT4_CYCLE_MS : FT8_CYCLE_MS;
}

/** Compute cycleId from time and mode */
function computeCycleId(time: number, mode: string): number {
  return Math.floor(time / cycleDurationMs(mode));
}

/**
 * Resolve a callsign + optional grid to lat/lon.
 * Returns null when no location can be determined.
 */
function resolveLocation(
  callsign: string | undefined,
  grid: string | undefined,
): { lat: number; lon: number; resolved: boolean } | null {
  // Priority 1: Valid Maidenhead grid
  if (grid && isValidGrid(grid) && grid.length >= 4) {
    try {
      const pos = gridToLatLon(grid);
      return { lat: pos.lat, lon: pos.lon, resolved: true };
    } catch {
      // Fall through to prefix lookup
    }
  }

  // Priority 2: Callsign prefix lookup
  if (callsign) {
    const prefix = extractPrefixFromCallsign(callsign);
    const loc = getLocationFromPrefix(prefix);
    if (loc) {
      return { lat: loc.lat, lon: loc.lon, resolved: false };
    }
  }

  return null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useFt8SpotterData(): Ft8SpotterData {
  // Pull raw data from both stores
  const nativeDecodes = useFt8DecoderStore((s) => s.decodes);
  const nativeStats = useFt8DecoderStore((s) => s.stats);
  const bridgeDecodes = useWSJTXStore((s) => s.decodes);
  const bridgeStatus = useWSJTXStore((s) => s.status);

  // Persistent refs for cycle boundary detection
  const prevCycleIdRef = useRef<number>(-1);

  return useMemo(() => {
    // ── Determine current mode and band ───────────────────────────────────
    // Prefer bridge status (more authoritative) over inferring from decodes
    let currentMode: string | null = bridgeStatus?.mode ?? null;
    let currentBand: string | null = null;

    if (bridgeStatus?.frequency) {
      // Bridge frequency is in Hz, bandFromFreq expects kHz
      currentBand = bandFromFreq(bridgeStatus.frequency / 1000);
    }

    // Fallback: infer mode from the most recent decode
    if (!currentMode) {
      const firstNative = nativeDecodes[0];
      const firstBridge = bridgeDecodes[0];
      currentMode = firstNative?.mode ?? firstBridge?.mode ?? null;
    }

    const mode = currentMode ?? "FT8";
    const cycleDur = cycleDurationMs(mode);

    // ── Merge and deduplicate ─────────────────────────────────────────────
    // Track seen callsign+cycle combos for dedup.
    // Native decoder has priority when both report the same callsign+cycle.
    const seen = new Set<string>();
    const merged: Ft8SpotterDecode[] = [];

    // Process native decodes first (higher priority)
    for (const d of nativeDecodes) {
      if (!d.callsign) continue;

      const location = resolveLocation(d.callsign, d.grid);
      if (!location) continue;

      const cycleId = computeCycleId(d.time, d.mode || mode);
      const key = `${d.callsign}_${cycleId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      merged.push({
        callsign: d.callsign,
        grid: d.grid ?? null,
        snr: d.snr,
        mode: d.mode || mode,
        time: d.time,
        deltaFrequency: d.deltaFrequency,
        lat: location.lat,
        lon: location.lon,
        resolved: location.resolved,
        cycleId,
        source: "native",
      });
    }

    // Then process bridge decodes (lower priority — skipped if already seen)
    for (const d of bridgeDecodes) {
      const decodedAt = wsjtxDecodedAt(d);
      if (!d.callsign || d.lowConfidence || wsjtxFrequencyHz(d) === null || decodedAt === null) continue;
      const decodeMode = d.dialMode || d.mode;

      const location = resolveLocation(d.callsign, d.grid);
      if (!location) continue;

      const cycleId = computeCycleId(decodedAt, decodeMode);
      const key = `${d.callsign}_${cycleId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      merged.push({
        callsign: d.callsign,
        grid: d.grid ?? null,
        snr: d.snr,
        mode: decodeMode,
        time: decodedAt,
        deltaFrequency: d.deltaFrequency,
        lat: location.lat,
        lon: location.lon,
        resolved: location.resolved,
        cycleId,
        source: "bridge",
      });
    }

    // ── Sort by time descending (newest first) ────────────────────────────
    merged.sort((a, b) => b.time - a.time);

    // ── Determine current cycle ───────────────────────────────────────────
    const latestTime = merged.length > 0 ? merged[0].time : 0;
    const currentCycleId =
      latestTime > 0 ? computeCycleId(latestTime, mode) : 0;

    // Detect cycle boundary
    const isNewCycle =
      prevCycleIdRef.current !== -1 &&
      currentCycleId !== prevCycleIdRef.current;
    prevCycleIdRef.current = currentCycleId;

    // Cycle progress: use the latest decode's time offset within its cycle
    const cycleProgress =
      latestTime > 0 ? (latestTime % cycleDur) / cycleDur : 0;

    // ── Filter into current cycle and recent buffers ──────────────────────
    const currentCycleDecodes: Ft8SpotterDecode[] = [];
    const allRecentDecodes: Ft8SpotterDecode[] = [];
    const recentCutoff = latestTime - RECENT_WINDOW_MS;
    const uniqueCallsigns = new Set<string>();

    for (const d of merged) {
      // Current cycle (capped)
      if (
        d.cycleId === currentCycleId &&
        currentCycleDecodes.length < MAX_PER_CYCLE
      ) {
        currentCycleDecodes.push(d);
      }

      // Recent buffer (capped)
      if (d.time >= recentCutoff && allRecentDecodes.length < MAX_RECENT) {
        allRecentDecodes.push(d);
        uniqueCallsigns.add(d.callsign);
      }
    }

    // ── Compute totals ────────────────────────────────────────────────────
    const totalDecodes = nativeStats.totalDecodes + bridgeDecodes.length;

    return {
      currentCycleDecodes,
      allRecentDecodes,
      cycleProgress,
      totalDecodes,
      uniqueStations: uniqueCallsigns.size,
      isNewCycle,
      currentBand,
      currentMode,
    };
  }, [nativeDecodes, nativeStats, bridgeDecodes, bridgeStatus]);
}
