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
 * StrictMode's double-invoke and only samples on genuine value changes. */
export function useHamClockSessionTrend(
  key: string,
  value: number | null,
): SessionTrendPoint[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (value === null || !Number.isFinite(value)) return;
    const now = Date.now();
    const existing = sessionTrendBuffers.get(key) ?? [];
    const last = existing[existing.length - 1];
    if (
      last &&
      last.value === value &&
      now - Date.parse(last.timestamp) < 60_000
    ) {
      return;
    }
    const next = [
      ...existing,
      { timestamp: new Date(now).toISOString(), value },
    ]
      .filter((p) => now - Date.parse(p.timestamp) <= SESSION_TREND_WINDOW_MS)
      .slice(-SESSION_TREND_MAX_POINTS);
    sessionTrendBuffers.set(key, next);
    setTick((n) => n + 1);
  }, [key, value]);
  return sessionTrendBuffers.get(key) ?? [];
}
