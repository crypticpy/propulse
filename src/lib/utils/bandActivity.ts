/**
 * Band Activity Index — pure classification math (BH1).
 *
 * Levels compare the trailing 60-min raw spot count against the climatology
 * percentiles for this band × UTC hour-of-day (same count(*) population,
 * DEV-PLAN-BAND-HEALTH §5). Trend compares the trailing 10-min rate to the
 * prior 10 min with a ±20 % dead band so noise reads as steady.
 */

export type ActivityLevel = "quiet" | "normal" | "busy" | "exceptional";
export type ActivityTrend = "rising" | "steady" | "falling";

export interface ActivityThresholds {
  p25: number;
  p75: number;
  p95: number;
}

/**
 * A climatology cell needs about two weeks of samples for its percentiles
 * to mean anything; below this the gauge shows counts without a level.
 */
export const MIN_CLIMATOLOGY_SAMPLES = 14;

/** Trend dead band: ±20 % around the prior window reads as steady. */
export const TREND_DEAD_BAND = 0.2;

export interface BandActivityEntry {
  band: string;
  count60m: number;
  obs20m: number;
  reporters20m: number;
  count10mRecent: number;
  count10mPrior: number;
  sourceCounts60m: Record<string, number>;
  thresholds: ActivityThresholds | null;
  sampleCount: number | null;
}

/**
 * Classify the trailing 60-min count against this hour's climatology.
 * Returns null when there is no trustworthy baseline (missing cell or too
 * few samples) — the caller renders raw counts without a percentile claim.
 */
export function classifyActivityLevel(
  count60m: number,
  thresholds: ActivityThresholds | null,
  sampleCount: number | null,
): ActivityLevel | null {
  if (
    thresholds === null ||
    sampleCount === null ||
    sampleCount < MIN_CLIMATOLOGY_SAMPLES
  ) {
    return null;
  }
  // An empty band is quiet by definition — without this, a cell whose
  // percentiles are all zero would classify silence as "exceptional".
  if (count60m === 0) return "quiet";
  if (count60m >= thresholds.p95) return "exceptional";
  if (count60m >= thresholds.p75) return "busy";
  if (count60m < thresholds.p25) return "quiet";
  return "normal";
}

/**
 * Crowded badge: at or above the 95th percentile for this band + hour.
 * A cell whose p95 is zero has no congestion history at all — a few spots
 * on a normally-dead band are notable (the level still reads exceptional)
 * but not "crowded".
 */
export function isCrowded(
  count60m: number,
  thresholds: ActivityThresholds | null,
  sampleCount: number | null,
): boolean {
  return (
    classifyActivityLevel(count60m, thresholds, sampleCount) ===
      "exceptional" &&
    thresholds !== null &&
    thresholds.p95 > 0
  );
}

/**
 * Trend of the live rate: trailing 10 min vs the prior 10 min. A silent
 * prior window is only "rising" if traffic actually appeared; two empty
 * windows are steady (a dead band ratio against zero is undefined).
 */
export function computeTrend(
  count10mRecent: number,
  count10mPrior: number,
): ActivityTrend {
  if (count10mPrior === 0) {
    return count10mRecent > 0 ? "rising" : "steady";
  }
  const ratio = count10mRecent / count10mPrior;
  if (ratio > 1 + TREND_DEAD_BAND) return "rising";
  if (ratio < 1 - TREND_DEAD_BAND) return "falling";
  return "steady";
}

/** Parse one row of the /api/spots/band-activity response envelope. */
export function parseBandActivityEntry(value: unknown): BandActivityEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  if (typeof row.band !== "string" || row.band.length === 0) return null;
  const count60m = num(row.count_60m);
  const obs20m = num(row.obs_20m);
  const reporters20m = num(row.reporters_20m);
  const count10mRecent = num(row.count_10m_recent);
  const count10mPrior = num(row.count_10m_prior);
  if (
    count60m === null ||
    obs20m === null ||
    reporters20m === null ||
    count10mRecent === null ||
    count10mPrior === null
  ) {
    return null;
  }

  const p25 = num(row.p25);
  const p75 = num(row.p75);
  const p95 = num(row.p95);
  const thresholds =
    p25 !== null && p75 !== null && p95 !== null ? { p25, p75, p95 } : null;

  const sourceCounts: Record<string, number> = {};
  if (
    row.source_counts_60m &&
    typeof row.source_counts_60m === "object" &&
    !Array.isArray(row.source_counts_60m)
  ) {
    for (const [source, n] of Object.entries(
      row.source_counts_60m as Record<string, unknown>,
    )) {
      const parsed = num(n);
      if (parsed !== null && parsed >= 0) sourceCounts[source] = parsed;
    }
  }

  return {
    band: row.band,
    count60m,
    obs20m,
    reporters20m,
    count10mRecent,
    count10mPrior,
    sourceCounts60m: sourceCounts,
    thresholds,
    sampleCount: num(row.sample_count),
  };
}
