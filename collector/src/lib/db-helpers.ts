import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";

// ---------------------------------------------------------------------------
// Batch insert through the server-authoritative reversible hot-store writer.
// The RPC keeps legacy, dual-write, and partitioned modes out of collector
// configuration so one audited database control owns the cutover.
// ---------------------------------------------------------------------------

export async function insertSpots(
  db: SupabaseClient,
  spots: NormalizedSpot[],
  source: string,
): Promise<number> {
  if (spots.length === 0) return 0;
  let attempted = 0;
  for (let i = 0; i < spots.length; i += 500) {
    const chunk = spots.slice(i, i + 500);
    const { error } = await db.rpc("ingest_spot_history_rows", {
      p_rows: chunk,
    });
    if (error) throw new Error(`[${source}] Insert failed: ${error.message}`);
    attempted += chunk.length;
  }
  return attempted;
}

// ---------------------------------------------------------------------------
// Durable health and current source status. Callers await both writes so a
// receipt cannot claim success before the database records it.
// ---------------------------------------------------------------------------

export async function reportToDb(
  db: SupabaseClient,
  source: string,
  status: string,
  spotsIngested: number,
  durationMs: number,
  errorMessage?: string,
): Promise<void> {
  const [health, statusResult] = await Promise.all([
    db.from("collector_health").insert({
      source,
      status,
      spots_ingested: spotsIngested,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    }),
    db.rpc("record_collector_source_status", {
      p_source: source,
      p_status: status,
      p_rows: spotsIngested,
      p_duration_ms: durationMs,
      p_error: errorMessage || null,
    }),
  ]);
  if (health.error) {
    throw new Error(`[${source}] Health insert failed: ${health.error.message}`);
  }
  if (statusResult.error) {
    throw new Error(
      `[${source}] Status update failed: ${statusResult.error.message}`,
    );
  }
}
