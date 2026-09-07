import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../logger.js";
import { planRecoveryWindow } from "./recoveryWindow.js";
import { resolveAggregationWatermark, type AggregationName } from "./watermark.js";

/** Replay only whole retained hours. The database serializes expiry and commits
 * aggregate writes and progress together. Neither a retained window nor zero
 * output rows establishes upstream feed completeness. */
export async function recoverHourly(
  db: SupabaseClient,
  aggregation: AggregationName,
  latestSettledHour: Date,
): Promise<number> {
  const watermark = await resolveAggregationWatermark(db, aggregation);
  const plan = planRecoveryWindow(new Date(), latestSettledHour, watermark);
  const gap = plan.expiredMissing;
  if (gap.count > 0) {
    const { error } = await db.rpc("record_spot_aggregation_gap", {
      p_aggregation: aggregation,
      p_start_hour: gap.from,
      p_end_hour: gap.to,
    });
    if (error) throw new Error(`Cannot persist ${aggregation} recovery gap: ${error.message}`);
    log("error", "Raw spot hours expired before aggregation", { aggregation, ...gap });
  }

  let rows = 0;
  let expiredDuringRun = false;
  for (const hour of plan.hoursToProcess) {
    const { data, error } = await db.rpc("compute_retained_spot_hour", {
      p_aggregation: aggregation,
      p_hour: hour.toISOString(),
    });
    if (error) throw new Error(`${aggregation} protected aggregation failed: ${error.message}`);
    if (data?.status === "expired") {
      expiredDuringRun = true;
      continue;
    }
    if (data?.status !== "retained" || !Number.isSafeInteger(data.rows) || data.rows < 0) {
      throw new Error(`${aggregation} returned invalid recovery metadata`);
    }
    rows += data.rows;
  }
  // Valid newer hours can recover even after a historical gap. Preserve the gap
  // durably and surface this tick as degraded instead of reporting success/zero.
  if (gap.count > 0 || expiredDuringRun) {
    throw new Error(`${aggregation} recovery has expired raw input; inspect collector_aggregation_gaps`);
  }
  return rows;
}
