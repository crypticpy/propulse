import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedSpot } from "../types.js";

// ---------------------------------------------------------------------------
// Batch insert with chunking (500-row batches, upsert with dedup)
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
    const { error } = await db.from("spot_history").upsert(chunk, {
      onConflict: "source,tx_callsign,rx_callsign,frequency_khz,spotted_at",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`[${source}] Insert failed: ${error.message}`);
    attempted += chunk.length;
  }
  return attempted;
}

// ---------------------------------------------------------------------------
// Health row (fire-and-forget — errors silently swallowed)
// ---------------------------------------------------------------------------

export function reportToDb(
  db: SupabaseClient,
  source: string,
  status: string,
  spotsIngested: number,
  durationMs: number,
  errorMessage?: string,
): void {
  db.from("collector_health")
    .insert({
      source,
      status,
      spots_ingested: spotsIngested,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    })
    .then(
      () => {},
      () => {},
    );
  db.rpc("record_collector_source_status", {
    p_source: source,
    p_status: status,
    p_rows: spotsIngested,
    p_duration_ms: durationMs,
    p_error: errorMessage || null,
  }).then(
    () => {},
    () => {},
  );
}
