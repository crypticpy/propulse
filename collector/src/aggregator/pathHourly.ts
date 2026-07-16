import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";
import { settledPreviousHour } from "./hourly.js";
import {
  recordAggregationWatermark,
  resolveAggregationWatermark,
} from "./watermark.js";

let lastComputedHour: string | null = null;
let lastCallsignRefreshDay: string | null = null;

/**
 * Refresh the callsign -> Maidenhead-field backfill map once per UTC day.
 * RBN spots (~85% of volume, all CW) carry no grids; this map lets the
 * path aggregation recover them. The SQL function only scans the last day
 * of grid-bearing spots, so a failed run degrades slowly (entries persist).
 */
async function refreshCallsignFields(db: SupabaseClient): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastCallsignRefreshDay === today) return;

  const { data, error } = await db.rpc("refresh_callsign_fields");

  if (error) {
    throw new Error(`callsign_fields refresh failed: ${error.message}`);
  } else {
    log("info", "callsign_fields refreshed", { callsignsUpserted: data });
  }

  // Mark only a completed refresh; a failure retries on the next tick.
  lastCallsignRefreshDay = today;
}

/**
 * Resolve the effective last-computed hour.
 * On first invocation (lastComputedHour is null), query the DB for the
 * most recent hour_utc in path_hourly_stats. Returns null if the table
 * is empty (fresh deployment).
 */
async function resolveLastComputedHour(
  db: SupabaseClient,
): Promise<string | null> {
  if (lastComputedHour !== null) return lastComputedHour;

  const resolved = await resolveAggregationWatermark(db, "path_hourly");
  if (!resolved) {
    log("info", "No existing path hourly stats found - starting fresh");
    return null;
  }
  log("info", "Resolved last computed path hour from DB", { hour: resolved });
  return resolved;
}

/**
 * Aggregate spot_history into path_hourly_stats — one row per
 * (hour, band, mode_class, tx_field, rx_field). These cells are the ML
 * training data for the path_open / SNR models (ml/README.md), so unlike
 * raw spots they are never pruned. The heavy lifting happens inside
 * Postgres via the compute_path_hourly_stats RPC (~1M spots -> ~6K rows
 * per hour; far too much to page through PostgREST).
 */
export async function computePathHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<number> {
  // Catch-up window matches spot retention (default 7 days)
  const maxCatchupHours = (config?.retention.spots ?? 7) * 24;

  const settleMinutes = config?.aggregationSettleMinutes ?? 20;
  const prevHour = settledPreviousHour(new Date(), settleMinutes);
  const prevHourISO = prevHour.toISOString();

  // Fast path: already computed this hour within current process lifetime
  if (lastComputedHour === prevHourISO) return 0;

  try {
    // Keep the backfill map warm before aggregating
    await refreshCallsignFields(db);

    // Determine starting point for catch-up
    const effectiveLast = await resolveLastComputedHour(db);

    // Build list of hours that need computation
    const hoursToCompute: Date[] = [];

    if (effectiveLast === null) {
      // Fresh start — just compute the previous hour
      hoursToCompute.push(prevHour);
    } else {
      const lastMs = new Date(effectiveLast).getTime();
      const prevMs = prevHour.getTime();

      // Walk from (lastComputed + 1h) through prevHour
      let cursor = lastMs + 3_600_000;

      // Bound catch-up to spot retention window
      const oldestAllowed = prevMs - maxCatchupHours * 3_600_000;
      if (cursor < oldestAllowed) {
        log("warn", "Path catch-up window exceeds spot retention, clamping", {
          retentionDays: config?.retention.spots ?? 7,
          lastComputed: effectiveLast,
          skippedHours: Math.floor((oldestAllowed - cursor) / 3_600_000),
        });
        cursor = oldestAllowed;
      }

      while (cursor <= prevMs) {
        hoursToCompute.push(new Date(cursor));
        cursor += 3_600_000;
      }
    }

    if (hoursToCompute.length === 0) {
      // Edge case: lastComputed equals prevHour already
      lastComputedHour = prevHourISO;
      return 0;
    }

    const isCatchUp = hoursToCompute.length > 1;
    if (isCatchUp) {
      log("info", "Path aggregator catch-up started", {
        missingHours: hoursToCompute.length,
        from: hoursToCompute[0].toISOString(),
        to: hoursToCompute[hoursToCompute.length - 1].toISOString(),
      });
    }

    let totalCellsWritten = 0;
    for (let i = 0; i < hoursToCompute.length; i++) {
      const hour = hoursToCompute[i];
      const hourISO = hour.toISOString();

      const { data: cellsWritten, error } = await db.rpc(
        "compute_path_hourly_stats",
        { hour_start: hourISO },
      );

      if (error) {
        throw new Error(`path-hour RPC failed for ${hourISO}: ${error.message}`);
      }

      totalCellsWritten += Number(cellsWritten ?? 0);
      await recordAggregationWatermark(
        db,
        "path_hourly",
        hourISO,
        Number(cellsWritten ?? 0),
      );

      log("info", "Path aggregation complete", {
        hour: hourISO,
        cellsWritten,
        settleMinutes,
        ...(isCatchUp ? { remaining: hoursToCompute.length - i - 1 } : {}),
      });

      // Advance the cursor per hour so a mid-catch-up crash resumes correctly
      lastComputedHour = hourISO;
    }

    lastComputedHour = prevHourISO;
    return totalCellsWritten;
  } catch (err) {
    log("error", "Path aggregation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
