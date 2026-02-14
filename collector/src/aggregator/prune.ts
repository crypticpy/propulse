import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";

const SPOT_RETENTION_DAYS = 14;
const HEALTH_RETENTION_DAYS = 7;
const SOLAR_RETENTION_DAYS = 90;

let lastPruneDate: string | null = null;

/**
 * Prune old data once per day. Keeps:
 * - spot_history: 14 days (band_hourly_stats preserves aggregates forever)
 * - collector_health: 7 days
 * - solar_snapshots: 90 days
 */
export async function pruneOldData(db: SupabaseClient): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastPruneDate === today) return;

  try {
    const spotCutoff = new Date(
      Date.now() - SPOT_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    const healthCutoff = new Date(
      Date.now() - HEALTH_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    const solarCutoff = new Date(
      Date.now() - SOLAR_RETENTION_DAYS * 86_400_000,
    ).toISOString();

    const { count: spotsDeleted } = await db
      .from("spot_history")
      .delete({ count: "exact" })
      .lt("spotted_at", spotCutoff);

    const { count: healthDeleted } = await db
      .from("collector_health")
      .delete({ count: "exact" })
      .lt("reported_at", healthCutoff);

    const { count: solarDeleted } = await db
      .from("solar_snapshots")
      .delete({ count: "exact" })
      .lt("captured_at", solarCutoff);

    lastPruneDate = today;
    log("info", "Prune complete", {
      spotsDeleted: spotsDeleted ?? 0,
      healthDeleted: healthDeleted ?? 0,
      solarDeleted: solarDeleted ?? 0,
      spotCutoff,
    });
  } catch (err) {
    log("error", "Prune failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
