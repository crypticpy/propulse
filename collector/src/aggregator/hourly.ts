import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";
import {
  recordAggregationWatermark,
  resolveAggregationWatermark,
} from "./watermark.js";

let lastComputedHour: string | null = null;

export function settledPreviousHour(
  now: Date,
  settleMinutes: number,
): Date {
  const settled = new Date(now.getTime() - settleMinutes * 60_000);
  const settledHour = Date.UTC(
    settled.getUTCFullYear(),
    settled.getUTCMonth(),
    settled.getUTCDate(),
    settled.getUTCHours(),
  );
  return new Date(settledHour - 3_600_000);
}

async function computeStatsForHour(
  db: SupabaseClient,
  hourStart: Date,
): Promise<number> {
  const { data, error } = await db.rpc("compute_band_hourly_stats", {
    hour_start: hourStart.toISOString(),
  });
  if (error) {
    throw new Error(`band-hour RPC failed: ${error.message}`);
  }
  return Number(data ?? 0);
}

async function resolveLastComputedHour(
  db: SupabaseClient,
): Promise<string | null> {
  if (lastComputedHour !== null) return lastComputedHour;
  const resolved = await resolveAggregationWatermark(db, "band_hourly");
  if (!resolved) {
    log("info", "No existing hourly stats found - starting fresh");
    return null;
  }
  log("info", "Resolved last computed hour from DB", { hour: resolved });
  return resolved;
}

export async function computeHourlyStats(
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
        log("warn", "Catch-up window exceeds spot retention limit, clamping", {
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

    let bandsProcessed = 0;
    for (let i = 0; i < hoursToCompute.length; i++) {
      const hour = hoursToCompute[i];
      const written = await computeStatsForHour(db, hour);
      await recordAggregationWatermark(
        db,
        "band_hourly",
        hour.toISOString(),
        written,
      );
      bandsProcessed += written;
      lastComputedHour = hour.toISOString();
      log("info", "Hourly aggregation complete", {
        hour: hour.toISOString(),
        bandsProcessed: written,
        settleMinutes,
        remaining: hoursToCompute.length - i - 1,
      });
    }
    lastComputedHour = prevHourISO;
    return bandsProcessed;
  } catch (err) {
    log("error", "Hourly aggregation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
