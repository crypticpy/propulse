import type { SupabaseClient } from "@supabase/supabase-js";
import type { CollectorConfig } from "../types.js";
import { log } from "../logger.js";

let lastPruneDate: string | null = null;

/**
 * Prune old data once per day. Retention periods are configurable
 * via RETENTION_* env vars. band_hourly_stats is never pruned.
 */
export async function pruneOldData(
  db: SupabaseClient,
  config: CollectorConfig,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastPruneDate === today) return;

  const { retention } = config;

  try {
    const spotCutoff = new Date(
      Date.now() - retention.spots * 86_400_000,
    ).toISOString();
    const healthCutoff = new Date(
      Date.now() - retention.health * 86_400_000,
    ).toISOString();
    const solarCutoff = new Date(
      Date.now() - retention.solar * 86_400_000,
    ).toISOString();
    const tleCutoff = new Date(
      Date.now() - retention.tle * 86_400_000,
    ).toISOString();

    // Batch-delete spot_history in chunks to avoid overwhelming PostgREST
    const SPOT_BATCH_SIZE = 50_000;
    let totalSpots = 0;
    while (true) {
      const { count } = await db
        .from("spot_history")
        .delete({ count: "exact" })
        .lt("spotted_at", spotCutoff)
        .limit(SPOT_BATCH_SIZE);
      if (!count || count === 0) break;
      totalSpots += count;
    }

    const { count: healthDeleted } = await db
      .from("collector_health")
      .delete({ count: "exact" })
      .lt("reported_at", healthCutoff);

    const { count: solarDeleted } = await db
      .from("solar_snapshots")
      .delete({ count: "exact" })
      .lt("captured_at", solarCutoff);

    const { count: tleDeleted } = await db
      .from("satellite_tle")
      .delete({ count: "exact" })
      .lt("collected_at", tleCutoff);

    lastPruneDate = today;
    log("info", "Prune complete", {
      retention,
      spotsDeleted: totalSpots,
      healthDeleted: healthDeleted ?? 0,
      solarDeleted: solarDeleted ?? 0,
      tleDeleted: tleDeleted ?? 0,
      spotCutoff,
    });
  } catch (err) {
    log("error", "Prune failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
