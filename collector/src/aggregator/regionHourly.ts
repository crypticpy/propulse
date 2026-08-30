/**
 * Regional hourly aggregation (BH2) — rolls spot_history into
 * region_hourly_stats, one row per (hour, band, continent), the Regional
 * scope's climatology numerator. Continent derivation happens inside the
 * compute_region_hourly_stats RPC (coords → grid field → feed continent →
 * callsign_fields backfill); rows where neither endpoint resolves are
 * excluded entirely.
 *
 * Same settle/watermark/catch-up pattern as hourly.ts band aggregation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";
import {
  recordAggregationWatermark,
  resolveAggregationWatermark,
} from "./watermark.js";
import { settledPreviousHour } from "./hourly.js";

let lastComputedHour: string | null = null;

async function computeStatsForHour(
  db: SupabaseClient,
  hourStart: Date,
): Promise<number> {
  const { data, error } = await db.rpc("compute_region_hourly_stats", {
    hour_start: hourStart.toISOString(),
  });
  if (error) {
    throw new Error(`region-hour RPC failed: ${error.message}`);
  }
  return Number(data ?? 0);
}

async function resolveLastComputedHour(
  db: SupabaseClient,
): Promise<string | null> {
  if (lastComputedHour !== null) return lastComputedHour;
  const resolved = await resolveAggregationWatermark(db, "region_hourly");
  if (!resolved) {
    log("info", "No existing region hourly stats found - starting fresh");
    return null;
  }
  log("info", "Resolved last computed region hour from DB", { hour: resolved });
  return resolved;
}

export async function computeRegionHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<number> {
  const maxCatchupHours = (config?.retention.spots ?? 7) * 24;
  const settleMinutes = config?.aggregationSettleMinutes ?? 20;
  const prevHour = settledPreviousHour(new Date(), settleMinutes);
  const prevHourISO = prevHour.toISOString();
  if (lastComputedHour === prevHourISO) return 0;

  try {
    const effectiveLast = await resolveLastComputedHour(db);
    const hoursToCompute: Date[] = [];
    if (effectiveLast === null) {
      hoursToCompute.push(prevHour);
    } else {
      const prevMs = prevHour.getTime();
      let cursor = new Date(effectiveLast).getTime() + 3_600_000;
      const oldestAllowed = prevMs - maxCatchupHours * 3_600_000;
      if (cursor < oldestAllowed) {
        log("warn", "Region catch-up exceeds spot retention limit, clamping", {
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
      lastComputedHour = prevHourISO;
      return 0;
    }

    let cellsProcessed = 0;
    for (let i = 0; i < hoursToCompute.length; i++) {
      const hour = hoursToCompute[i];
      const written = await computeStatsForHour(db, hour);
      await recordAggregationWatermark(
        db,
        "region_hourly",
        hour.toISOString(),
        written,
      );
      cellsProcessed += written;
      lastComputedHour = hour.toISOString();
      log("info", "Region hourly aggregation complete", {
        hour: hour.toISOString(),
        cellsProcessed: written,
        settleMinutes,
        remaining: hoursToCompute.length - i - 1,
      });
    }
    lastComputedHour = prevHourISO;
    return cellsProcessed;
  } catch (err) {
    log("error", "Region hourly aggregation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
