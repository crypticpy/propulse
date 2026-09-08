/**
 * Heat-map compute (workspace #653) — turns a plain array of spots into a
 * full band x continent matrix. Pure function: no React, no store, no
 * network. Both encodings (Band Health ladder verdict and baseline ratio)
 * are always computed on every cell; which one renders is a display
 * setting made by a later PR (`WORKSPACE-CONCEPT.md` §8/§10).
 *
 * Dedup (per cell, within the window): the same DX callsign counts once
 * toward `count` no matter how many spotters reported it; each distinct
 * spotter callsign increments `reporters`.
 *
 * Ladder verdict: this lib has no physics forecast of its own (it is fed
 * plain arrays, never a network call), so `evaluateLadder` from
 * `@/lib/verdict/ladder` — reused, not reimplemented — is called with
 * `physicsScore` from the optional `physicsScores` lookup, defaulting to 0
 * (closed) when the caller has no forecast for that cell. `obs20m` /
 * `reporters20m` come from the dedup above; the window is split at its
 * midpoint for `count10mRecent` / `count10mPrior` so a 20-minute window
 * (the default, matching the ladder's own trailing-20-min convention)
 * yields the ladder's expected two 10-minute trend halves.
 */

import { BAND_ORDER } from "@/lib/data/bandRanges";
import { getContinent, type Continent } from "@/lib/utils/multipliers";
import { evaluateLadder, LADDER_RANK } from "@/lib/verdict/ladder";
import type { DXSpot } from "@/types/dxcluster";
import {
  computeRatio,
  isCrowded,
  lookupBaseline,
  type BaselineLookup,
} from "./baseline";
import {
  HEATMAP_CONTINENTS,
  type HeatmapCell,
  type HeatMapMetric,
  type HeatMapPreset,
  type HeatMapScale,
  type HeatmapSpotInput,
} from "./types";

/** Matches the ladder's own "trailing 20 min" obs window (see ladder.ts). */
export const DEFAULT_HEATMAP_WINDOW_MS = 20 * 60 * 1000;

export interface ComputeHeatmapOptions {
  /** End of the analysis window, epoch ms. Defaults to `Date.now()`. */
  now?: number;
  /** Window length in ms. Defaults to `DEFAULT_HEATMAP_WINDOW_MS`. */
  windowMs?: number;
  /** 0..1 physics forecast per cell, keyed by `physicsScoreKey(band, continent)`.
   * Cells with no entry use 0 (no forecast signal available). */
  physicsScores?: Record<string, number>;
  /** Baseline lookup from `buildBaselineLookup` (baseline.ts). Omit to get
   * `ratio: null` / `crowded: false` on every cell. */
  baseline?: BaselineLookup;
}

/** Key for `ComputeHeatmapOptions.physicsScores`. */
export function physicsScoreKey(band: string, continent: Continent): string {
  return `${band}|${continent}`;
}

interface CellAccumulator {
  dx: Set<string>;
  spotters: Set<string>;
  recentDx: Set<string>;
  priorDx: Set<string>;
}

function toEpochMs(time: Date | string): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

/**
 * Compute the full band x continent matrix for the given spots. Every
 * (band in BAND_ORDER) x (continent in HEATMAP_CONTINENTS) pair is present
 * in the result, even with zero activity, so a grid widget never has to
 * guess about a missing cell.
 */
export function computeHeatmap(
  spots: HeatmapSpotInput[],
  options: ComputeHeatmapOptions = {},
): HeatmapCell[] {
  const now = options.now ?? Date.now();
  const windowMs = options.windowMs ?? DEFAULT_HEATMAP_WINDOW_MS;
  const startMs = now - windowMs;
  const midMs = now - windowMs / 2;
  const window = { startMs, endMs: now };
  const utcHour = new Date(now).getUTCHours();

  const cells = new Map<string, CellAccumulator>();
  const cellKey = (band: string, continent: Continent) => `${band}|${continent}`;

  for (const spot of spots) {
    const t = toEpochMs(spot.time);
    if (!Number.isFinite(t) || t < startMs || t > now) continue;

    const continent = spot.dxContinent ?? getContinent(spot.dx);
    if (!continent) continue;

    const key = cellKey(spot.band, continent);
    let acc = cells.get(key);
    if (!acc) {
      acc = { dx: new Set(), spotters: new Set(), recentDx: new Set(), priorDx: new Set() };
      cells.set(key, acc);
    }

    const dxCall = spot.dx.toUpperCase();
    acc.dx.add(dxCall);
    acc.spotters.add(spot.spotter.toUpperCase());
    if (t >= midMs) acc.recentDx.add(dxCall);
    else acc.priorDx.add(dxCall);
  }

  const empty = (): CellAccumulator => ({
    dx: new Set(),
    spotters: new Set(),
    recentDx: new Set(),
    priorDx: new Set(),
  });

  const result: HeatmapCell[] = [];
  for (const band of BAND_ORDER) {
    for (const continent of HEATMAP_CONTINENTS) {
      const acc = cells.get(cellKey(band, continent)) ?? empty();
      const count = acc.dx.size;
      const reporters = acc.spotters.size;

      const meanCount = options.baseline
        ? lookupBaseline(options.baseline, band, continent, utcHour)
        : null;
      const ratio = computeRatio(count, meanCount);
      const crowded = isCrowded(ratio, count);

      const physicsScore = options.physicsScores?.[physicsScoreKey(band, continent)] ?? 0;
      const ladder = evaluateLadder({
        physicsScore,
        obs20m: count,
        reporters20m: reporters,
        count10mRecent: acc.recentDx.size,
        count10mPrior: acc.priorDx.size,
      }).state;

      result.push({ band, continent, count, reporters, ladder, ratio, crowded, window });
    }
  }

  return result;
}

/**
 * Adapter from the app's real `DXSpot` (`@/types/dxcluster`) to this lib's
 * minimal input shape. Returns null for spots with no derived band, which
 * this lib cannot place in the grid.
 */
export function dxSpotToHeatmapInput(spot: DXSpot): HeatmapSpotInput | null {
  if (!spot.band) return null;
  return {
    dx: spot.dx,
    spotter: spot.spotter,
    band: spot.band,
    time: spot.time,
  };
}

/**
 * Pure bucketing step for a `HeatMapScale` — the only thing that decides
 * *how many* buckets and *where* the cut points fall. Colour choice and
 * which metric to render are both a display setting (owner decision,
 * #653 follow-up): this function and the `PRESETS` below only ever produce
 * numbers, never paint anything.
 *
 * `thresholds` are ascending cut points; a value exactly equal to a
 * threshold belongs to the bucket *above* it, so `bucketFor` returns
 * `thresholds.filter((t) => value >= t).length` — an index in
 * `0..thresholds.length` inclusive.
 */
export function bucketFor(cell: HeatmapCell, scale: HeatMapScale): number {
  const value = metricValue(cell, scale.metric);
  return scale.thresholds.filter((threshold) => value >= threshold).length;
}

function metricValue(cell: HeatmapCell, metric: HeatMapMetric): number {
  switch (metric) {
    case "count":
      return cell.count;
    case "reporters":
      return cell.reporters;
    case "ratio":
      // No baseline for this cell reads as the quietest possible value, so
      // it always lands in bucket 0 rather than an arbitrary middle bucket.
      return cell.ratio ?? Number.NEGATIVE_INFINITY;
    case "ladder":
      return LADDER_RANK[cell.ladder];
  }
}

/**
 * Default preset: hue follows the Band Health ladder verdict (closed ->
 * forecast -> stirring -> verified -> hot), one bucket per rung.
 */
export const LADDER_HUE_PRESET: HeatMapPreset = {
  id: "ladderHue",
  label: "Band Health ladder",
  scale: { metric: "ladder", thresholds: [1, 2, 3, 4] },
  bucketColors: [
    "rgb(var(--su-muted-rgb))", // closed
    "rgb(var(--su-success-rgb) / 0.5)", // forecast
    "rgb(var(--su-warning-rgb))", // stirring
    "rgb(var(--su-success-rgb))", // verified
    "rgb(var(--su-accent-rgb))", // hot
  ],
};

/**
 * Alternative preset: per-cell same-UTC-hour baseline ratio (audit §16),
 * diverging quiet-grey -> workable-green -> crowded-orange/red.
 */
export const RATIO_DIVERGING_PRESET: HeatMapPreset = {
  id: "ratioDiverging",
  label: "Baseline ratio",
  scale: { metric: "ratio", thresholds: [-1, -0.5, 0.5, 1, 2] },
  bucketColors: [
    "rgb(var(--su-muted-rgb))", // < -1: well below baseline
    "rgb(var(--su-muted-rgb) / 0.7)", // -1..-0.5: quiet
    "rgb(var(--su-success-rgb))", // -0.5..0.5: workable / normal
    "rgb(var(--su-warning-rgb) / 0.7)", // 0.5..1: getting busy
    "rgb(var(--su-warning-rgb))", // 1..2: crowded
    "rgb(var(--su-danger-rgb))", // > 2: very crowded
  ],
};

/** Built-in presets, `ladderHue` first as the default. */
export const PRESETS: readonly HeatMapPreset[] = [
  LADDER_HUE_PRESET,
  RATIO_DIVERGING_PRESET,
];
