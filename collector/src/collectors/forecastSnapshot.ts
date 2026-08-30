/**
 * Forecast snapshot writer (M4 F1).
 *
 * Once per hour, log what each forecast source claims about each band into
 * `forecast_snapshots` so the F2 eval harness can score predictions against
 * the band_hourly_stats ground truth later. Log-don't-reconstruct: the row
 * must be written before the hour's outcome is known, so the first write for
 * a given (hour, band, source, horizon) wins and later ticks are no-ops.
 *
 * Sources:
 * - "physics" (implemented here): the client Band Conditions calculation
 *   ported verbatim from src/lib/utils/bands.ts (getCondition /
 *   getVHFCondition / BANDS multipliers) plus the CONDITION_SCORE word→score
 *   map from src/hooks/useBandVerdicts.ts. The frontend picks day or night
 *   per station; the global log has no station, so p_open blends the day and
 *   night scores by the ham-weighted planetary lit fraction (P1 — v1 used a
 *   fixed 0.5 mean; both condition words and f_lit are kept in meta).
 * - "nowcast"/"futurecast" (not yet written): the Railway inference service
 *   only exposes per-path/per-surface predictions, so a global per-band
 *   p_open needs an aggregation design first. See the M4 plan F1 notes.
 *
 * BH3: alongside the horizon-0 row, the physics source also logs rows for
 * future target hours (SNAPSHOT_HORIZONS_H) under solar persistence, so the
 * eval harness can score real lead-time calls per horizon.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";
import { globalLitFraction } from "../lib/sun.js";

// ─── Physics port (src/lib/utils/bands.ts — keep in sync) ──────────────────

type BandCondition = "Excellent" | "Good" | "Fair" | "Poor" | "Aurora";

interface BandConfig {
  name: string;
  /** Multiplier for daytime conditions (0-1) - higher = needs better indices */
  dayMultiplier: number;
  /** Multiplier for nighttime conditions (0-1) */
  nightMultiplier: number;
  /** Minimum SFI needed for band to open (0 = always possible) */
  minSfi: number;
  /** True if band is primarily a nighttime band */
  nightOnly: boolean;
  /** True if this is a VHF band with different propagation rules */
  isVhf: boolean;
}

const BANDS: BandConfig[] = [
  { name: "160m", dayMultiplier: 0.3, nightMultiplier: 0.8, minSfi: 0, nightOnly: true, isVhf: false },
  { name: "80m", dayMultiplier: 0.4, nightMultiplier: 0.9, minSfi: 0, nightOnly: false, isVhf: false },
  { name: "60m", dayMultiplier: 0.5, nightMultiplier: 0.85, minSfi: 0, nightOnly: false, isVhf: false },
  { name: "40m", dayMultiplier: 0.6, nightMultiplier: 0.9, minSfi: 0, nightOnly: false, isVhf: false },
  { name: "30m", dayMultiplier: 0.7, nightMultiplier: 0.85, minSfi: 0, nightOnly: false, isVhf: false },
  { name: "20m", dayMultiplier: 0.8, nightMultiplier: 0.7, minSfi: 70, nightOnly: false, isVhf: false },
  { name: "17m", dayMultiplier: 0.85, nightMultiplier: 0.6, minSfi: 80, nightOnly: false, isVhf: false },
  { name: "15m", dayMultiplier: 0.9, nightMultiplier: 0.5, minSfi: 90, nightOnly: false, isVhf: false },
  { name: "12m", dayMultiplier: 0.95, nightMultiplier: 0.3, minSfi: 100, nightOnly: false, isVhf: false },
  { name: "10m", dayMultiplier: 1.0, nightMultiplier: 0.2, minSfi: 110, nightOnly: false, isVhf: false },
  { name: "6m", dayMultiplier: 1.0, nightMultiplier: 0.1, minSfi: 0, nightOnly: false, isVhf: true },
];

/** Word → 0..1 score, from src/hooks/useBandVerdicts.ts CONDITION_SCORE */
const CONDITION_SCORE: Record<BandCondition, number> = {
  Excellent: 0.9,
  Good: 0.7,
  Fair: 0.45,
  Poor: 0.2,
  Aurora: 0.2,
};

function getCondition(kp: number, sfi: number, multiplier: number): BandCondition {
  const baseScore = (sfi / 200) * (1 - kp / 9);
  const score = baseScore * multiplier;
  if (score > 0.6) return "Excellent";
  if (score > 0.45) return "Good";
  if (score > 0.3) return "Fair";
  return "Poor";
}

function getVHFCondition(kp: number): BandCondition {
  if (kp >= 5) return "Aurora";
  if (kp >= 4) return "Fair";
  return "Poor";
}

export interface PhysicsBandScore {
  band: string;
  dayCondition: BandCondition;
  nightCondition: BandCondition;
}

/** Per-band day/night condition words from solar indices. */
export function computePhysicsBandScores(
  kp: number,
  sfi: number,
): PhysicsBandScore[] {
  return BANDS.map((band) => {
    let dayCondition: BandCondition;
    let nightCondition: BandCondition;

    if (band.isVhf) {
      dayCondition = getVHFCondition(kp);
      nightCondition = "Poor";
    } else if (band.nightOnly) {
      dayCondition = "Poor";
      nightCondition = getCondition(kp, sfi, band.nightMultiplier);
    } else {
      const effectiveSfi = sfi >= band.minSfi ? sfi : sfi * 0.5;
      dayCondition = getCondition(kp, effectiveSfi, band.dayMultiplier);
      nightCondition = getCondition(kp, effectiveSfi, band.nightMultiplier);
    }

    return { band: band.name, dayCondition, nightCondition };
  });
}

/**
 * p_open from the condition words and a lit fraction. `fLit = 0.5`
 * reproduces the v1 day/night mean exactly.
 */
export function blendPOpen(score: PhysicsBandScore, fLit: number): number {
  return (
    fLit * CONDITION_SCORE[score.dayCondition] +
    (1 - fLit) * CONDITION_SCORE[score.nightCondition]
  );
}

// ─── Snapshot rows ──────────────────────────────────────────────────────────

/** Bump when the physics calculation or p_open blend changes */
export const PHYSICS_ALGO_VERSION = "bands-v2-global-litfrac";

/** Solar data older than this is not an honest "current conditions" input */
const MAX_SOLAR_AGE_MS = 3 * 3600_000;

export interface ForecastSnapshotRow {
  hour_utc: string;
  band: string;
  source: "physics";
  horizon_hours: number;
  p_open: number;
  meta: {
    algo: string;
    kp: number;
    sfi: number;
    solar_captured_at: string;
    day_condition: BandCondition;
    night_condition: BandCondition;
    /** Ham-weighted planetary lit fraction used for the p_open blend */
    f_lit: number;
  };
}

/** Truncate a timestamp to its UTC hour boundary. */
export function hourBucketUtc(nowMs: number): string {
  return new Date(Math.floor(nowMs / 3600_000) * 3600_000).toISOString();
}

/**
 * Bands the snapshot job logs: HF only. The collector's ingestion contract
 * skips VHF (transforms/bands.ts), so band_hourly_stats can never provide 6m
 * ground truth — a 6m snapshot could only ever be scored against fabricated
 * zero-count rows, biasing the eval.
 */
const SNAPSHOT_BANDS = new Set(
  BANDS.filter((band) => !band.isVhf).map((band) => band.name),
);

export function buildPhysicsSnapshotRows(
  nowMs: number,
  kp: number,
  sfi: number,
  solarCapturedAt: string,
): ForecastSnapshotRow[] {
  const hourUtc = hourBucketUtc(nowMs);
  const fLit = Math.round(globalLitFraction(nowMs) * 1000) / 1000;
  return computePhysicsBandScores(kp, sfi)
    .filter((score) => SNAPSHOT_BANDS.has(score.band))
    .map((score) => ({
      hour_utc: hourUtc,
      band: score.band,
      source: "physics" as const,
      horizon_hours: 0,
      p_open: blendPOpen(score, fLit),
      meta: {
        algo: PHYSICS_ALGO_VERSION,
        kp,
        sfi,
        solar_captured_at: solarCapturedAt,
        day_condition: score.dayCondition,
        night_condition: score.nightCondition,
        f_lit: fLit,
      },
    }));
}

/**
 * Lead times the physics arm logs ahead (BH3). The eval harness joins truth
 * on the row's own hour, so `hour_utc` is the TARGET hour the prediction is
 * about and `horizon_hours` is how early it was issued.
 */
export const SNAPSHOT_HORIZONS_H = [1, 2, 3, 6];

/**
 * Physics rows for future target hours under solar persistence: kp/sfi
 * pinned to the current reading, lit fraction evaluated at the target hour.
 * First-write-wins makes each row an honest h-hours-early call — the
 * (target, h) slot is claimed on the first tick after target − h.
 */
export function buildPhysicsHorizonRows(
  nowMs: number,
  kp: number,
  sfi: number,
  solarCapturedAt: string,
): ForecastSnapshotRow[] {
  const scores = computePhysicsBandScores(kp, sfi).filter((score) =>
    SNAPSHOT_BANDS.has(score.band),
  );
  const rows: ForecastSnapshotRow[] = [];
  for (const horizon of SNAPSHOT_HORIZONS_H) {
    const targetHourUtc = hourBucketUtc(nowMs + horizon * 3600_000);
    const fLit =
      Math.round(globalLitFraction(Date.parse(targetHourUtc)) * 1000) / 1000;
    for (const score of scores) {
      rows.push({
        hour_utc: targetHourUtc,
        band: score.band,
        source: "physics" as const,
        horizon_hours: horizon,
        p_open: blendPOpen(score, fLit),
        meta: {
          algo: PHYSICS_ALGO_VERSION,
          kp,
          sfi,
          solar_captured_at: solarCapturedAt,
          day_condition: score.dayCondition,
          night_condition: score.nightCondition,
          f_lit: fLit,
        },
      });
    }
  }
  return rows;
}

// ─── Collector job ──────────────────────────────────────────────────────────

export async function collectForecastSnapshot(
  db: SupabaseClient,
): Promise<void> {
  const start = Date.now();

  try {
    const { data, error } = await db
      .from("solar_snapshots")
      .select("captured_at,kp_index,sfi")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Solar snapshot read failed: ${error.message}`);
    if (!data || data.kp_index == null || data.sfi == null) {
      throw new Error("No usable solar snapshot (missing kp_index/sfi)");
    }
    // Reject stale AND future timestamps (clock skew tolerance: 5 min) — a
    // negative age otherwise passes a plain upper-bound check.
    const solarAgeMs = start - Date.parse(data.captured_at);
    if (
      !Number.isFinite(solarAgeMs) ||
      solarAgeMs < -5 * 60_000 ||
      solarAgeMs > MAX_SOLAR_AGE_MS
    ) {
      throw new Error(
        `Latest solar snapshot is stale or in the future (${data.captured_at}) — skipping forecast snapshot`,
      );
    }

    const rows = [
      ...buildPhysicsSnapshotRows(start, data.kp_index, data.sfi, data.captured_at),
      ...buildPhysicsHorizonRows(start, data.kp_index, data.sfi, data.captured_at),
    ];

    // First write for the hour wins: the earliest prediction is the honest one.
    const { error: upsertError } = await db
      .from("forecast_snapshots")
      .upsert(rows, {
        onConflict: "hour_utc,band,source,horizon_hours",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      throw new Error(`Forecast snapshot upsert failed: ${upsertError.message}`);
    }

    const durationMs = Date.now() - start;
    reportHealth("forecast-snapshot", "ok", rows.length);
    await reportToDb(db, "forecast-snapshot", "ok", rows.length, durationMs);

    log("info", "Forecast snapshot written", {
      hourUtc: rows[0]?.hour_utc,
      rows: rows.length,
      kp: data.kp_index,
      sfi: data.sfi,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("forecast-snapshot", "error", 0);
    await reportToDb(db, "forecast-snapshot", "error", 0, durationMs, msg);
    log("error", "Forecast snapshot failed", { error: msg });
  }
}
