/**
 * Heat-map baseline — per-cell same-UTC-hour baseline and the ratio-diverging
 * encoding (cockpit audit §16). Pure math: the caller supplies hourly
 * aggregates (e.g. from `band_hourly_stats`/`path_hourly_stats`); this
 * module never fetches anything itself.
 *
 * Ratio formula: `log2((count + 1) / (meanCount + 1))`. The +1 smoothing
 * avoids `log2(0)` / divide-by-zero when either side is a true zero and has
 * a negligible effect once counts are in the double digits (the range the
 * "crowded" floor cares about). A ratio of 0 means "exactly at baseline";
 * positive is busier than usual, negative is quieter.
 *
 * "Crowded" needs both a relative and an absolute signal (audit §16): a
 * cell at 2x its baseline of 1 spot is not a pileup. `ratio > 2x baseline`
 * is expressed as `ratio > CROWDED_RATIO_THRESHOLD` (log2(2) = 1) against
 * the same smoothed ratio used for the encoding, so the two never disagree.
 */

import type { Continent } from "@/lib/utils/multipliers";

/** One hourly baseline aggregate row supplied by the caller. */
export interface BaselineInput {
  band: string;
  continent: Continent;
  /** Hour of day in UTC, 0-23. */
  utcHour: number;
  /** Mean deduplicated DX count for this band/continent/hour. */
  meanCount: number;
}

/** Lookup built by `buildBaselineLookup`, keyed by `baselineKey`. */
export type BaselineLookup = ReadonlyMap<string, number>;

/** log2(2) — the "more than double baseline" floor for the crowded flag. */
export const CROWDED_RATIO_THRESHOLD = 1;

/** The absolute floor: a cell needs at least this many DX before it can be
 * called crowded, no matter how far above baseline the ratio reads. */
export const CROWDED_MIN_COUNT = 10;

export function baselineKey(
  band: string,
  continent: Continent,
  utcHour: number,
): string {
  return `${band}|${continent}|${utcHour}`;
}

/**
 * Build a `band|continent|utcHour -> meanCount` lookup from raw rows. Rows
 * that share a key are averaged rather than the last one winning, so a
 * caller can pass multiple samples per cell without pre-aggregating.
 */
export function buildBaselineLookup(rows: BaselineInput[]): BaselineLookup {
  const sums = new Map<string, { total: number; n: number }>();
  for (const row of rows) {
    const key = baselineKey(row.band, row.continent, row.utcHour);
    const entry = sums.get(key) ?? { total: 0, n: 0 };
    entry.total += row.meanCount;
    entry.n += 1;
    sums.set(key, entry);
  }

  const lookup = new Map<string, number>();
  for (const [key, { total, n }] of sums) {
    lookup.set(key, total / n);
  }
  return lookup;
}

/** Read the baseline mean for a cell, or null when no row covers it. */
export function lookupBaseline(
  lookup: BaselineLookup,
  band: string,
  continent: Continent,
  utcHour: number,
): number | null {
  const value = lookup.get(baselineKey(band, continent, utcHour));
  return value ?? null;
}

/**
 * log2 ratio of `count` against `meanCount`. Null when there is no baseline
 * to compare against — the caller renders the raw count without a ratio
 * claim, same convention as `classifyActivityLevel` in bandActivity.ts.
 */
export function computeRatio(
  count: number,
  meanCount: number | null,
): number | null {
  if (meanCount === null) return null;
  return Math.log2((count + 1) / (meanCount + 1));
}

/** Absolute-floor crowded flag: see the module doc for the reasoning. */
export function isCrowded(ratio: number | null, count: number): boolean {
  return (
    ratio !== null && ratio > CROWDED_RATIO_THRESHOLD && count >= CROWDED_MIN_COUNT
  );
}
