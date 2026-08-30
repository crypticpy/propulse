import type { SupabaseClient } from "@supabase/supabase-js";

export type AggregationName = "band_hourly" | "path_hourly" | "region_hourly";

export async function resolveAggregationWatermark(
  db: SupabaseClient,
  aggregation: AggregationName,
): Promise<string | null> {
  const { data, error } = await db
    .from("collector_aggregation_watermarks")
    .select("hour_utc")
    .eq("aggregation", aggregation)
    .maybeSingle();
  if (error) {
    throw new Error(`${aggregation} watermark lookup failed: ${error.message}`);
  }
  return data ? (data.hour_utc as string) : null;
}

export async function recordAggregationWatermark(
  db: SupabaseClient,
  aggregation: AggregationName,
  hourUtc: string,
  rowsWritten: number,
): Promise<void> {
  const { error } = await db.rpc("record_collector_aggregation_watermark", {
    p_aggregation: aggregation,
    p_hour_utc: hourUtc,
    p_rows: rowsWritten,
  });
  if (error) {
    throw new Error(`${aggregation} watermark write failed: ${error.message}`);
  }
}
