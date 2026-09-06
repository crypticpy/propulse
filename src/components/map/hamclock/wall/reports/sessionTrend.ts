import { useEffect, useState } from "react";

/**
 * Module-level ring buffers for reports with no native history feed
 * (weather, emcomm, band activity, best band). Keyed so several series can
 * be sampled at once (e.g. one per band); survives remounts across page
 * navigation so a chart doesn't restart empty every time its tile remounts.
 * Split out of `WallReport.tsx` so exporting a hook alongside components
 * there doesn't trip `react-refresh/only-export-components`.
 */
export interface SessionTrendPoint {
  timestamp: string;
  value: number;
}

const SESSION_TREND_WINDOW_MS = 2 * 60 * 60 * 1000;
const SESSION_TREND_MAX_POINTS = 120;
const sessionTrendBuffers = new Map<string, SessionTrendPoint[]>();

/** Samples `value` under `key` into a session-only ring buffer and returns
 * the trimmed series so far. Effect-based (not memo) so it is safe under
 * StrictMode's double-invoke and only samples on genuine value changes.
 *
 * `stamp` is an optional source timestamp (e.g. React Query's
 * `dataUpdatedAt`, or a reading's own `observedAt`/`fetchedAt`). When
 * supplied, it is added to the effect's dependencies, so a feed refresh that
 * returns an unchanged `value` still advances the stamp and appends a new
 * sample — without it, a stable feed would otherwise plateau at one point
 * forever. Callers with no natural stamp keep the original dedupe-by-value
 * behaviour. */
export function useHamClockSessionTrend(
  key: string,
  value: number | null,
  stamp?: number,
): SessionTrendPoint[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return;
    const now = Date.now();
    const existing = sessionTrendBuffers.get(key) ?? [];
    const last = existing[existing.length - 1];
    if (
      stamp === undefined &&
      last &&
      last.value === value &&
      now - Date.parse(last.timestamp) < 60_000
    ) {
      return;
    }
    // A stamped reading is one sample: StrictMode's double-invoke, a remount
    // or a stale stamp must not append it again.
    if (stamp !== undefined && last && Date.parse(last.timestamp) >= stamp) {
      return;
    }
    const timestamp =
      stamp !== undefined
        ? new Date(stamp).toISOString()
        : new Date(now).toISOString();
    const next = [...existing, { timestamp, value }]
      .filter((p) => now - Date.parse(p.timestamp) <= SESSION_TREND_WINDOW_MS)
      .slice(-SESSION_TREND_MAX_POINTS);
    sessionTrendBuffers.set(key, next);
    setTick((n) => n + 1);
  }, [key, value, stamp]);
  return sessionTrendBuffers.get(key) ?? [];
}
