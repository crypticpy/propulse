/**
 * Home "On the bands now" ladder — pure row math (DS-07).
 *
 * One row per HF band, 160 → 10 m, always present so a silent band reads as
 * silence rather than absence. Every number here comes from a feed that
 * already exists:
 *
 *   counts / reporters / top mode  — /api/spots/band-activity, 20-min
 *                                    deduplicated observations for the scope
 *                                    Home is showing (global or continent)
 *   share / relative activity      — those same counts, divided
 *   ratio ("1.6× typical")         — count_60m against p50 of this band ×
 *                                    UTC-hour climatology cell (90-day
 *                                    baseline, same count(*) population),
 *                                    withheld below MIN_CLIMATOLOGY_SAMPLES
 *   trend                          — trailing 10 min vs the prior 10 min
 *   verdict                        — the collector's scored ladder state
 *                                    (verdict_states via /api/spots/band-ladder)
 *
 * Nothing is modelled here. A band with no feed row renders zeros and "No
 * verdict"; a scope whose scored rows have gone stale renders "No verdict"
 * for every band rather than repeating an old call as if it were current.
 */

import type { BandActivityStatus } from "@/hooks/useBandActivity";
import {
  MIN_CLIMATOLOGY_SAMPLES,
  type ActivityTrend,
} from "@/lib/utils/bandActivity";
import type { LadderState } from "@/lib/verdict/ladder";
import {
  VERDICT_MAX_AGE_MS,
  verdictIsCurrent,
} from "@/lib/verdict/presentation";

export { VERDICT_MAX_AGE_MS, verdictIsCurrent };

/** Fixed HF ladder, longest wavelength first — the approved DS-07 order. */
export const LADDER_BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
] as const;

/** Mode-class words. Matches the Advanced dashboard's breakdown labels. */
export const MODE_LABEL: Record<string, string> = {
  phone: "Phone",
  digital: "Digital",
  cw: "CW",
  unknown: "Other",
};

export interface BandsLadderRow {
  band: string;
  /** 20-min deduplicated observations for the scope */
  obs20m: number;
  reporters20m: number;
  /** Trailing 60-min raw count — the climatology's population */
  count60m: number;
  /** Fraction of the window's observations on this band, 0..1 */
  share: number;
  /** Fraction of the busiest band's observations, 0..1 */
  relative: number;
  topMode: { label: string; count: number } | null;
  /** Collector-scored ladder state; null when the feed has nothing for it */
  verdict: LadderState | null;
  trend: ActivityTrend | null;
  /** count60m ÷ this band-hour's median, or null without a trusted baseline */
  ratio: number | null;
}

/** Dominant mode class of the 20-min observations, with its spoken label.
 * Ties break alphabetically on mode name so equal counts render the same
 * mode on every poll instead of flickering between them. */
export function dominantMode(
  modeObs20m: Record<string, number> | undefined,
): { label: string; count: number } | null {
  if (!modeObs20m) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [mode, count] of Object.entries(modeObs20m)) {
    if (count > bestCount || (count === bestCount && count > 0 && best !== null && mode < best)) {
      best = mode;
      bestCount = count;
    }
  }
  if (best === null || bestCount <= 0) return null;
  return { label: MODE_LABEL[best] ?? best, count: bestCount };
}

/**
 * How this hour compares with the same band-hour's 90-day median. Null when
 * the climatology cell is missing, too thin to mean anything, or has a zero
 * median (a band that is normally silent has no "typical" to divide by).
 */
export function typicalRatio(
  count60m: number,
  median60m: number | null,
  sampleCount: number | null,
): number | null {
  if (median60m === null || median60m <= 0) return null;
  if (sampleCount === null || sampleCount < MIN_CLIMATOLOGY_SAMPLES) return null;
  if (!Number.isFinite(count60m) || count60m < 0) return null;
  return count60m / median60m;
}

/** Wavelength descending: 160m first, 10m last, 6m and up after the HF ladder. */
function byWavelengthDesc(a: string, b: string): number {
  return parseFloat(b) - parseFloat(a) || a.localeCompare(b);
}

/**
 * Join the activity feed onto the fixed ladder. Bands the feed reports that
 * are not on the HF ladder (6 m and up) keep their row after 10 m rather than
 * disappearing from Home.
 */
export function buildBandsLadder(
  statuses: BandActivityStatus[],
  verdictByBand: Map<string, LadderState>,
): BandsLadderRow[] {
  const byBand = new Map(statuses.map((status) => [status.band, status]));
  const extras = statuses
    .map((status) => status.band)
    .filter((band) => !(LADDER_BANDS as readonly string[]).includes(band))
    .sort(byWavelengthDesc);
  const bands = [...LADDER_BANDS, ...extras];

  const total = statuses.reduce((sum, status) => sum + status.obs20m, 0);
  const busiest = statuses.reduce(
    (max, status) => Math.max(max, status.obs20m),
    0,
  );

  return bands.map((band) => {
    const status = byBand.get(band);
    const obs20m = status?.obs20m ?? 0;
    return {
      band,
      obs20m,
      reporters20m: status?.reporters20m ?? 0,
      count60m: status?.count60m ?? 0,
      share: total > 0 ? obs20m / total : 0,
      relative: busiest > 0 ? obs20m / busiest : 0,
      topMode: dominantMode(status?.modeObs20m),
      verdict: verdictByBand.get(band) ?? null,
      trend: status?.trend ?? null,
      ratio: status
        ? typicalRatio(status.count60m, status.median60m, status.sampleCount)
        : null,
    };
  });
}

/** "6.1%" — never rounds a band that was heard down to a flat zero. */
export function formatShare(share: number): string {
  const percent = share * 100;
  if (percent <= 0) return "0.0%";
  if (percent < 0.1) return "<0.1%";
  return `${percent.toFixed(1)}%`;
}

/** "1.6× typical for this hour" — the comparison the ratio actually makes. */
export function formatRatio(ratio: number): string {
  if (ratio > 0 && ratio < 0.05) return "<0.1× typical for this hour";
  return `${ratio.toFixed(1)}× typical for this hour`;
}
