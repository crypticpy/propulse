/**
 * Heat-map widget types (workspace #653) — a band x continent grid of DX
 * activity. Pure types only: no React, no store, no network. See
 * `compute.ts` for how a cell is built and `baseline.ts` for the ratio
 * math.
 */

import type { Continent } from "@/lib/utils/multipliers";
import type { LadderState } from "@/lib/verdict/ladder";

/** Re-exported so consumers don't need to know the ladder lives elsewhere. */
export type { Continent, LadderState };

/** The six continents a DXCC prefix can resolve to (no AN — no ham DXCC there). */
export const HEATMAP_CONTINENTS: readonly Continent[] = [
  "NA",
  "SA",
  "EU",
  "AF",
  "AS",
  "OC",
];

/**
 * Minimal structural spot shape this lib needs. Deliberately narrower than
 * `DXSpot` (`src/types/dxcluster.ts`) so tests don't need full spot
 * fixtures; a real caller can pass a `DXSpot` directly since its shape is a
 * superset, or use `dxSpotToHeatmapInput` from `compute.ts`.
 */
export interface HeatmapSpotInput {
  /** Callsign of the spotted DX station. */
  dx: string;
  /** Callsign of the station that posted the spot. */
  spotter: string;
  /** Band designator, e.g. "20m" — must match `BAND_ORDER` in bandRanges.ts. */
  band: string;
  /** Spot timestamp. Arrives as `Date` from app state but as a string once
   * it has crossed JSON (network payload, IndexedDB, etc.) — always narrow
   * with `instanceof Date` before calling `.getTime()`. */
  time: Date | string;
  /** Continent of the DX station, if the caller already knows it (skips a
   * callsign-prefix lookup). Falls back to `getContinent(dx)` when omitted. */
  dxContinent?: Continent | null;
}

/** The analysis window a cell was computed over, in epoch ms. */
export interface HeatmapWindow {
  startMs: number;
  endMs: number;
}

/**
 * One band x continent cell. Both encodings (ladder verdict and baseline
 * ratio) are always computed — which one renders is a display setting made
 * by a later PR, not a choice made in this layer.
 */
export interface HeatmapCell {
  band: string;
  continent: Continent;
  /** Distinct DX callsigns spotted on this band from this continent in the
   * window (same callsign from multiple spotters counts once). */
  count: number;
  /** Distinct spotter callsigns behind `count`. */
  reporters: number;
  /** Band Health ladder verdict for this cell (`evaluateLadder` from
   * `@/lib/verdict/ladder`, not reimplemented here). */
  ladder: LadderState;
  /** log2 same-UTC-hour baseline ratio; null when no baseline row covers
   * this band/continent/hour. See `baseline.ts` for the formula. */
  ratio: number | null;
  /** Absolute-floor crowded flag: ratio > 2x baseline AND count >= 10. Never
   * true when `ratio` is null. */
  crowded: boolean;
  window: HeatmapWindow;
}

/**
 * Which raw number a scale buckets. `"ladder"` uses `LADDER_RANK` (0..4) as
 * its numeric value, so thresholds for it are ladder-rank cut points, not
 * counts.
 */
export type HeatMapMetric = "count" | "reporters" | "ratio" | "ladder";

/**
 * A pure bucketing rule for one metric. `thresholds` are ascending cut
 * points; `bucketFor` (compute.ts) returns an index in `0..thresholds.length`
 * inclusive, so a scale with N thresholds has N+1 buckets. This is the
 * "which bucket" step only — no colour lives here. Rendering (which encoding
 * to show, and the actual thresholds/colours a user picks) is a display
 * setting owned by a later PR.
 */
export interface HeatMapScale {
  metric: HeatMapMetric;
  thresholds: number[];
}

/**
 * One out-of-the-box scale + colour mapping. `bucketColors[i]` is the colour
 * for bucket `i`; length must equal `scale.thresholds.length + 1`. Colours
 * are CSS colour tokens referencing the existing station palette variables
 * (`src/index.css` / `tailwind.config.*`, e.g. `--su-success-rgb`), never
 * raw hex and never pure white.
 */
export interface HeatMapPreset {
  id: string;
  label: string;
  scale: HeatMapScale;
  bucketColors: string[];
}
