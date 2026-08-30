/**
 * Band-activity climatology recompute (BH1 + BH2).
 *
 * Once per day, refresh band_activity_climatology — the per band ×
 * UTC-hour-of-day spot-count percentile table the Activity Index compares
 * live counts against. The heavy lifting happens inside PostgreSQL
 * (compute_band_activity_climatology), which reads band_hourly_stats over
 * the baseline window and upserts ≤ 11 bands × 24 hours of rows.
 *
 * BH2 adds the regional variant in the same pass: region_activity_climatology
 * from region_hourly_stats. Zero regional rows is NOT an error — the regional
 * aggregate starts empty and Regional runs counts-only until cells accrue
 * ~14 samples.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";

/**
 * 90 days balances seasonality drift against per-(band, hour) sample depth;
 * the client treats cells with fewer than ~14 samples as no-baseline.
 */
export const CLIMATOLOGY_BASELINE_DAYS = 90;

export async function computeBandActivityClimatology(
  db: SupabaseClient,
): Promise<void> {
  const start = Date.now();

  try {
    const { data, error } = await db.rpc("compute_band_activity_climatology", {
      baseline_days: CLIMATOLOGY_BASELINE_DAYS,
    });

    if (error) {
      throw new Error(`Climatology recompute failed: ${error.message}`);
    }

    const rowsWritten = typeof data === "number" ? data : 0;
    if (rowsWritten === 0) {
      throw new Error(
        "Climatology recompute wrote 0 rows — band_hourly_stats empty over the baseline window?",
      );
    }

    const { data: regionData, error: regionError } = await db.rpc(
      "compute_region_activity_climatology",
      { baseline_days: CLIMATOLOGY_BASELINE_DAYS },
    );
    if (regionError) {
      throw new Error(
        `Region climatology recompute failed: ${regionError.message}`,
      );
    }
    const regionRowsWritten = typeof regionData === "number" ? regionData : 0;

    const durationMs = Date.now() - start;
    reportHealth("band-climatology", "ok", rowsWritten + regionRowsWritten);
    await reportToDb(
      db,
      "band-climatology",
      "ok",
      rowsWritten + regionRowsWritten,
      durationMs,
    );

    log("info", "Band activity climatology recomputed", {
      rowsWritten,
      regionRowsWritten,
      baselineDays: CLIMATOLOGY_BASELINE_DAYS,
      durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    reportHealth("band-climatology", "error", 0);
    await reportToDb(db, "band-climatology", "error", 0, durationMs, msg);
    log("error", "Band activity climatology failed", { error: msg });
  }
}
