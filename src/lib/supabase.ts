/**
 * Supabase client singleton — lazily initialized
 *
 * The client is only created on first access via `getSupabase()`.
 * This supports "anonymous/no-account mode" where Supabase is never
 * initialized until the user explicitly signs in.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL as string | undefined
)?.trim();
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim();

/** Whether Supabase is configured in the current environment */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient<Database> | null = null;

/**
 * Returns the Supabase client singleton, creating it on first call.
 *
 * @throws {Error} If VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY are not set
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) {
    return client;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.",
    );
  }

  client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: "propulse-auth-token",
    },
  });

  return client;
}

// ─── Spot & Stats Query Helpers ─────────────────────────────────────────────

/** Row shape returned by querySpotHistory (untyped — collector tables are not in generated types) */
export interface SpotHistoryRow {
  id: string;
  tx_call: string;
  rx_call: string;
  frequency: number;
  band: string;
  mode: string;
  snr: number | null;
  tx_grid: string | null;
  rx_grid: string | null;
  source: string;
  spotted_at: string;
}

/** Row shape returned by queryBandHourlyStats */
export interface BandHourlyStatsRow {
  band: string;
  hour: number;
  day_of_year: number;
  spot_count: number;
  avg_snr: number | null;
  kp: number | null;
  sfi: number | null;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
  xray_flux: number | null;
  dst_index: number | null;
  proton_flux_10mev: number | null;
  created_at: string;
}

/**
 * Query spot_history for a given band with optional limit and time filter.
 *
 * @param band - Amateur band designation (e.g., "20m", "40m")
 * @param limit - Max rows to return (default 100)
 * @param since - ISO timestamp — only return spots after this time
 * @returns Array of spot rows
 */
export async function querySpotHistory(
  band: string,
  limit = 100,
  since?: string,
): Promise<SpotHistoryRow[]> {
  const supabase = getSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("spot_history_live")
    .select("*")
    .eq("band", band)
    .order("spotted_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gt("spotted_at", since);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`spot_history query failed: ${error.message}`);
  }

  return (data ?? []) as SpotHistoryRow[];
}

/**
 * Query band_hourly_stats for a given band over a time window.
 *
 * @param band - Amateur band designation (e.g., "20m", "40m")
 * @param hours - Number of hours to look back (default 168 = 7 days)
 * @returns Array of hourly stat rows
 */
export async function queryBandHourlyStats(
  band: string,
  hours = 168,
): Promise<BandHourlyStatsRow[]> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("band_hourly_stats")
    .select("*")
    .eq("band", band)
    .gt("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`band_hourly_stats query failed: ${error.message}`);
  }

  return (data ?? []) as BandHourlyStatsRow[];
}

// ─── Realtime Spot Subscription ─────────────────────────────────────────────

function getRealtimeSpotTable(): "spot_history" | "spot_history_partitioned_v1" {
  const configured = import.meta.env.VITE_SPOT_HISTORY_REALTIME_TABLE?.trim();
  if (!configured || configured === "spot_history") return "spot_history";
  if (configured === "spot_history_partitioned_v1") return configured;
  console.error(
    "VITE_SPOT_HISTORY_REALTIME_TABLE is not an approved relation; falling back to spot_history",
  );
  return "spot_history";
}

/**
 * Subscribe to new spots via Supabase Realtime (postgres_changes on spot_history).
 *
 * @param callback - Called with each new spot row as it is inserted
 * @returns Object with `unsubscribe()` to tear down the channel
 */
export function subscribeToSpots(callback: (spot: SpotHistoryRow) => void): {
  unsubscribe: () => void;
} {
  if (!isSupabaseConfigured) {
    // Supabase not configured — return no-op
    return { unsubscribe: () => {} };
  }

  try {
    const supabase = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase as any)
      .channel("spot-history-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: getRealtimeSpotTable(),
        },
        (payload: { new: SpotHistoryRow }) => {
          if (payload.new) {
            callback(payload.new);
          }
        },
      )
      .subscribe();

    return {
      unsubscribe: () => {
        channel.unsubscribe();
      },
    };
  } catch {
    // Supabase error — return no-op
    return { unsubscribe: () => {} };
  }
}
