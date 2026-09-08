import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";
import { settledPreviousHour } from "./hourly.js";
import { recoverHourly } from "./recoverHourly.js";

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

export async function computePathHourlyStats(
  db: SupabaseClient,
  config?: CollectorConfig,
): Promise<number> {
  await refreshCallsignFields(db);
  return recoverHourly(
    db,
    "path_hourly",
    settledPreviousHour(new Date(), config?.aggregationSettleMinutes ?? 20),
  );
}
