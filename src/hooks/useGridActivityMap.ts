/**
 * useGridActivityMap Hook
 *
 * Maintains a rolling-window Map of active 4-char Maidenhead grid squares
 * based on live spot activity. Converts lat/lon spot positions to 4-char
 * grids (e.g. "EM10", "FN31") and tracks per-grid activity density.
 *
 * Activity density drives a color ramp:
 *   1 spot  → blue (#3b82f6)
 *   5+ spots → cyan (#06b6d4)
 *   15+ spots → green (#22c55e)
 *   30+ spots → yellow (#eab308)
 *   50+ spots → red (#ef4444)
 *
 * Stale entries (older than windowMinutes) are pruned on each update.
 */

import { useRef, useMemo, useState, useEffect } from "react";

// =============================================================================
// TYPES
// =============================================================================

/** Minimal spot data required by this hook — lat/lon position + timestamp. */
export interface ActivitySpot {
  lat: number;
  lon: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/** Per-grid aggregated activity state. */
export interface GridActivity {
  /** 4-char Maidenhead grid square (e.g. "EM10") */
  gridSquare: string;
  /** Number of spots within the rolling window */
  spotCount: number;
  /** Timestamp of the most recent spot (ms) */
  lastSpotTime: number;
  /** Density-derived hex color string */
  color: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Color ramp thresholds — evaluated top-down, first match wins. */
const COLOR_RAMP: Array<{ minCount: number; color: string }> = [
  { minCount: 50, color: "#ef4444" }, // red
  { minCount: 30, color: "#eab308" }, // yellow
  { minCount: 15, color: "#22c55e" }, // green
  { minCount: 5, color: "#06b6d4" }, // cyan
  { minCount: 1, color: "#3b82f6" }, // blue
];

/** Default rolling window duration in minutes. */
const DEFAULT_WINDOW_MINUTES = 30;

/** How often stale entries are pruned when no new spots arrive (ms). */
const PRUNE_INTERVAL_MS = 30_000;

// =============================================================================
// COORDINATE HELPERS
// =============================================================================

/**
 * Convert a lat/lon position to a 4-char Maidenhead grid square.
 *
 * Grid encoding:
 * - Char 1 (A-R): longitude field, each 20deg wide, starting at -180
 * - Char 2 (A-R): latitude field, each 10deg tall, starting at -90
 * - Char 3 (0-9): longitude square, each 2deg wide within field
 * - Char 4 (0-9): latitude square, each 1deg tall within field
 */
function latLonToGrid4(lat: number, lon: number): string {
  const lonField = Math.floor((lon + 180) / 20);
  const latField = Math.floor((lat + 90) / 10);
  const lonSquare = Math.floor(((lon + 180) % 20) / 2);
  const latSquare = Math.floor(((lat + 90) % 10) / 1);
  return (
    String.fromCharCode(65 + lonField) +
    String.fromCharCode(65 + latField) +
    lonSquare.toString() +
    latSquare.toString()
  );
}

/**
 * Determine the display color for a given spot count using the density ramp.
 */
function colorForCount(count: number): string {
  for (const tier of COLOR_RAMP) {
    if (count >= tier.minCount) return tier.color;
  }
  return COLOR_RAMP[COLOR_RAMP.length - 1].color;
}

// =============================================================================
// INTERNAL TRACKING
// =============================================================================

/**
 * Internal per-grid accumulator — stores individual spot timestamps so we can
 * precisely prune the rolling window without losing count accuracy.
 */
interface GridAccumulator {
  gridSquare: string;
  /** Sorted list of spot timestamps (ms) within the rolling window */
  timestamps: number[];
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Maintains a rolling-window Map of active Maidenhead grid squares derived
 * from spot lat/lon positions.
 *
 * @param spots - Array of spot-like objects with lat, lon, and timestamp.
 * @param windowMinutes - Rolling window duration (default 30).
 * @returns Map keyed by 4-char grid square to GridActivity.
 */
export function useGridActivityMap(
  spots: ActivitySpot[],
  windowMinutes: number = DEFAULT_WINDOW_MINUTES,
): Map<string, GridActivity> {
  // Mutable accumulator — not in React state to avoid per-frame re-renders.
  // Updated imperatively when the spots array changes.
  const accRef = useRef<Map<string, GridAccumulator>>(new Map());
  const resultRef = useRef<Map<string, GridActivity>>(new Map());

  // Track the previous spots array reference and length to detect new data.
  const prevSpotsRef = useRef<ActivitySpot[]>([]);
  const processedCountRef = useRef(0);

  // Clock-driven prune tick — without this, entries older than the window
  // linger indefinitely whenever the spot feed goes quiet (the memo below
  // only re-runs when the spots array changes).
  const [pruneTick, setPruneTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPruneTick((t) => t + 1), PRUNE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Compute the activity map — this runs on every render but is cheap:
  // it only processes newly added spots and prunes stale entries.
  const activityMap = useMemo(() => {
    const acc = accRef.current;
    const windowMs = windowMinutes * 60 * 1000;
    const now = Date.now();
    const cutoff = now - windowMs;

    // Detect when the spots array reference changes (new data from parent)
    if (spots !== prevSpotsRef.current) {
      prevSpotsRef.current = spots;
      processedCountRef.current = 0;
    }

    // Process newly added spots
    const startIdx = processedCountRef.current;
    for (let i = startIdx; i < spots.length; i++) {
      const spot = spots[i];

      // Validate lat/lon bounds
      if (
        spot.lat < -90 ||
        spot.lat > 90 ||
        spot.lon < -180 ||
        spot.lon > 180
      ) {
        continue;
      }

      const grid = latLonToGrid4(spot.lat, spot.lon);

      let entry = acc.get(grid);
      if (!entry) {
        entry = { gridSquare: grid, timestamps: [] };
        acc.set(grid, entry);
      }

      entry.timestamps.push(spot.timestamp);
    }
    processedCountRef.current = spots.length;

    // Prune stale timestamps and remove empty grids
    const gridsToRemove: string[] = [];

    for (const [grid, entry] of acc) {
      // Filter out timestamps older than the rolling window
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

      if (entry.timestamps.length === 0) {
        gridsToRemove.push(grid);
      }
    }

    for (const grid of gridsToRemove) {
      acc.delete(grid);
    }

    // Build the output GridActivity map
    const result = new Map<string, GridActivity>();

    for (const [grid, entry] of acc) {
      const count = entry.timestamps.length;
      const lastSpotTime = Math.max(...entry.timestamps);

      result.set(grid, {
        gridSquare: grid,
        spotCount: count,
        lastSpotTime,
        color: colorForCount(count),
      });
    }

    resultRef.current = result;
    return result;
    // Re-compute when spots array ref or length changes, the window changes,
    // or the periodic prune tick fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, spots.length, windowMinutes, pruneTick]);

  return activityMap;
}
