import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { settledPreviousHour } from "./hourly.js";
import { recoverHourly } from "./recoverHourly.js";

export async function computeRegionHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<number> {
  return recoverHourly(
    db,
    "region_hourly",
    settledPreviousHour(new Date(), config?.aggregationSettleMinutes ?? 20),
  );
}
