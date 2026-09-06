import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { resolveAggregationWatermark } from "./watermark.js";

/**
 * Field-grain path recency aggregator (#297 — NowCast N2).
 *
 * Derives `path_recency_hourly` from `path_hourly_stats` one hour at a time
 * via the `compute_path_recency_hourly` RPC. This is a NETWORK-RECENCY
 * statistic over our own PSK Reporter / RBN spots — never a WSPR opportunity
 * rate, and nothing here reads a WSPR table (that pipeline is decommissioned
 * and must not be rebuilt).
 *
 * Chaining: the recency rows for hour H are a pure function of
 * `path_hourly_stats` for hour H, so this job never runs ahead of the path
 * aggregator. Instead of keeping a second settle clock, it reads the
 * `path_hourly` watermark the path aggregator writes and recomputes that
 * hour plus the hour before it. The extra hour absorbs late spots: when the
 * path aggregator rewrites an hour's cells, the next recency tick rewrites
 * the matching recency rows (the RPC is delete+insert, so it is idempotent).
 *
 * The service consuming these rows is not activated by this job — that is
 * N4, after the N3 retrain.
 */

/** Must match the transform_version the migration and backfill script use. */
export const PATH_RECENCY_TRANSFORM_VERSION = "psk-rbn-field-recency-v2";

const HOUR_MS = 3_600_000;

/** Last (watermark hour) this process already recomputed, ISO 8601. */
let lastRecomputedHour: string | null = null;

async function computeRecencyForHour(
  db: SupabaseClient,
  hourISO: string,
): Promise<number> {
  const { data, error } = await db.rpc("compute_path_recency_hourly", {
    p_hour: hourISO,
    p_transform_version: PATH_RECENCY_TRANSFORM_VERSION,
  });
  if (error) {
    throw new Error(`path-recency RPC failed for ${hourISO}: ${error.message}`);
  }
  return Number(data ?? 0);
}

/**
 * Recompute the two most recent settled hours of `path_recency_hourly`.
 * Returns the number of rows written across both hours.
 */
export async function computePathRecency(db: SupabaseClient): Promise<number> {
  const watermark = await resolveAggregationWatermark(db, "path_hourly");
  if (!watermark) {
    // Fresh deployment (or the path aggregator has never completed an hour).
    // Nothing to derive from yet; the next tick retries.
    log("info", "No path hourly watermark yet - skipping path recency");
    return 0;
  }

  if (lastRecomputedHour === watermark) return 0;

  const watermarkMs = new Date(watermark).getTime();
  if (!Number.isFinite(watermarkMs)) {
    throw new Error(`path_hourly watermark is not a valid time: ${watermark}`);
  }

  // Newest hour last so a mid-run failure leaves the cursor unadvanced and
  // the next tick redoes both hours.
  const hours = [
    new Date(watermarkMs - HOUR_MS).toISOString(),
    new Date(watermarkMs).toISOString(),
  ];

  let rowsWritten = 0;
  for (const hourISO of hours) {
    rowsWritten += await computeRecencyForHour(db, hourISO);
  }

  lastRecomputedHour = watermark;
  log("info", "Path recency aggregation complete", {
    watermarkHour: watermark,
    hours,
    rowsWritten,
  });
  return rowsWritten;
}

/** Test seam: clear the in-process cursor between cases. */
export function resetPathRecencyCursor(): void {
  lastRecomputedHour = null;
}
