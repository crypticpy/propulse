/**
 * useFateSnrTrend — Per-callsign SNR history tracker for the Fate skin.
 *
 * Maintains a sliding window of the last N SNR readings per callsign,
 * keyed by uppercase callsign string. Designed to feed inline sparkline
 * charts in the decode table rows.
 *
 * - Uses useRef-based storage so history persists across renders without
 *   causing unnecessary re-renders.
 * - Deduplicates by cycleId — only the latest SNR per callsign per cycle
 *   is recorded (prevents inflated history from duplicate decode messages).
 * - LRU eviction caps the map at MAX_CALLSIGNS to bound memory.
 * - Clears all history on band change so stale cross-band data never leaks.
 */

import { useRef, useMemo } from "react";
import type { EnrichedDecode } from "./useFateDecodes";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum SNR readings kept per callsign (ring buffer depth). */
const MAX_HISTORY = 10;

/** Maximum number of callsigns tracked before LRU eviction kicks in. */
const MAX_CALLSIGNS = 200;

// ─── Internal types ───────────────────────────────────────────────────────────

interface CallsignEntry {
  /** Ring buffer of SNR values (oldest first, newest last). */
  snrValues: number[];
  /** The cycleId of the most recently recorded SNR for dedup. */
  lastCycleId: number;
  /** Monotonic counter bumped on every access — used for LRU eviction. */
  lastAccess: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Track per-callsign SNR history across decode cycles.
 *
 * @param decodes  - Enriched decode array from `useFateDecodes`.
 * @param activeBand - Current active band string (e.g. "20m"). History is
 *   cleared when this value changes.
 * @returns A `Map<string, number[]>` keyed by uppercase callsign, where each
 *   value is an array of up to {@link MAX_HISTORY} SNR readings (oldest first).
 *   Only callsigns with at least one recorded reading appear in the map.
 */
export function useFateSnrTrend(
  decodes: EnrichedDecode[],
  activeBand: string | null,
): Map<string, number[]> {
  // Persistent storage — survives re-renders, does NOT trigger re-renders.
  const historyRef = useRef<Map<string, CallsignEntry>>(new Map());
  const accessCounterRef = useRef(0);
  const prevBandRef = useRef<string | null>(activeBand);

  // Snapshot the current trend data into a new Map whenever decodes change.
  const trendMap = useMemo(() => {
    const history = historyRef.current;

    // ── Band-change reset ──────────────────────────────────────────────
    if (activeBand !== prevBandRef.current) {
      history.clear();
      prevBandRef.current = activeBand;
    }

    // ── Ingest new decodes ─────────────────────────────────────────────
    for (const d of decodes) {
      const call = d.parsedCallsign?.toUpperCase();
      if (!call) continue;

      const entry = history.get(call);

      if (entry) {
        // Bump LRU access counter
        entry.lastAccess = ++accessCounterRef.current;

        // Deduplicate: only record one SNR per callsign per cycle.
        // If we already have a reading for this cycle, overwrite the
        // last value (latest decode in the cycle wins).
        if (entry.lastCycleId === d.cycleId) {
          entry.snrValues[entry.snrValues.length - 1] = d.snr;
        } else {
          // New cycle — append to ring buffer
          entry.snrValues.push(d.snr);
          if (entry.snrValues.length > MAX_HISTORY) {
            entry.snrValues.shift();
          }
          entry.lastCycleId = d.cycleId;
        }
      } else {
        // First sighting of this callsign
        history.set(call, {
          snrValues: [d.snr],
          lastCycleId: d.cycleId,
          lastAccess: ++accessCounterRef.current,
        });

        // ── LRU eviction ─────────────────────────────────────────────
        if (history.size > MAX_CALLSIGNS) {
          let oldestKey: string | null = null;
          let oldestAccess = Infinity;
          for (const [key, val] of history) {
            if (val.lastAccess < oldestAccess) {
              oldestAccess = val.lastAccess;
              oldestKey = key;
            }
          }
          if (oldestKey) {
            history.delete(oldestKey);
          }
        }
      }
    }

    // ── Build output snapshot ──────────────────────────────────────────
    const result = new Map<string, number[]>();
    for (const [call, entry] of history) {
      // Return a copy so consumers can't mutate internal state
      result.set(call, [...entry.snrValues]);
    }
    return result;
  }, [decodes, activeBand]);

  return trendMap;
}
