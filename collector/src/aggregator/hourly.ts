import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { recoverHourly } from "./recoverHourly.js";

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


export async function computeHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<number> {
  return recoverHourly(
    db,
    "band_hourly",
    settledPreviousHour(new Date(), config?.aggregationSettleMinutes ?? 20),
  );
}
