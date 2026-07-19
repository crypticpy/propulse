/**
 * useFateSnrTrend — Per-callsign SNR history tracker for the Fate skin.
 *
 * Maintains a sliding window of the last N SNR readings per callsign,
 * keyed by uppercase callsign string. Designed to feed inline sparkline
 * charts in the decode table rows.
 *
 * - Uses useRef-based storage so history persists across renders; ingestion
 *   happens in a useEffect (not a useMemo) so StrictMode's double render can't
 *   double-append. A pure useState snapshot is published for consumers.
 * - Deduplicates by cycle identity — each callsign records at most one SNR per
 *   decode cycle. Cycle identity is the epochMs-derived `cycleId`, which is
 *   monotonic across UTC midnight, so already-ingested cycles are skipped
 *   instead of being re-pushed as garbage.
 * - Values are appended oldest-first (index 0 = oldest) so sparklines read
 *   left-to-right in time and trend arrows point the right way.
 * - LRU eviction caps the map at MAX_CALLSIGNS to bound memory.
 * - Clears all history on band change so stale cross-band data never leaks.
 */

import { useRef, useEffect, useState } from "react";
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
  /**
   * Highest cycle identity already ingested for this callsign. Decodes at or
   * below this cycle are skipped (already recorded). Monotonic because cycleId
   * is epochMs-derived.
   */
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

  // Published snapshot consumed by sparklines. Updated only from the effect.
  const [trendMap, setTrendMap] = useState<Map<string, number[]>>(
    () => new Map(),
  );

  // Ingest happens in an effect (post-commit), not a memo, so StrictMode's
  // double render can't double-append. Ingestion is also idempotent on its own:
  // the "skip cycles at or below lastCycleId" guard means re-running over the
  // same decode buffer records nothing new.
  useEffect(() => {
    const history = historyRef.current;

    // ── Band-change reset ──────────────────────────────────────────────
    if (activeBand !== prevBandRef.current) {
      history.clear();
      prevBandRef.current = activeBand;
    }

    // ── Ingest new decodes, oldest-first ───────────────────────────────
    // The decode buffer is newest-first; iterate in reverse so cycles are
    // ingested in chronological order and appended oldest-first.
    for (let i = decodes.length - 1; i >= 0; i--) {
      const d = decodes[i];
      const call = d.parsedCallsign?.toUpperCase();
      if (!call) continue;

      const entry = history.get(call);

      if (entry) {
        // Bump LRU access counter
        entry.lastAccess = ++accessCounterRef.current;

        // Skip cycles we have already ingested for this callsign (including
        // the current highest). Only genuinely newer cycles append.
        if (d.cycleId <= entry.lastCycleId) continue;

        entry.snrValues.push(d.snr);
        if (entry.snrValues.length > MAX_HISTORY) {
          entry.snrValues.shift();
        }
        entry.lastCycleId = d.cycleId;
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

    // ── Publish output snapshot ────────────────────────────────────────
    const result = new Map<string, number[]>();
    for (const [call, entry] of history) {
      // Copy so consumers can't mutate internal state
      result.set(call, [...entry.snrValues]);
    }
    setTrendMap(result);
  }, [decodes, activeBand]);

  return trendMap;
}
