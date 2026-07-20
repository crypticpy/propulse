/**
 * TanStack Query hook for fetching raw spot history from Supabase.
 *
 * Queries `spot_history_live` — individual spots from PSKReporter, RBN, and
 * DX Cluster with callsigns, grids, coordinates, frequency, band, mode,
 * and SNR. The view follows the reversible legacy/partitioned cutover.
 *
 * **Important**: Always provide a time window and reasonable limit to
 * avoid pulling excessive data.
 */

import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpotHistoryEntry {
  id: string;
  source: string;
  spotted_at: string;
  tx_callsign: string;
  tx_grid: string | null;
  tx_lat: number | null;
  tx_lon: number | null;
  rx_callsign: string;
  rx_grid: string | null;
  rx_lat: number | null;
  rx_lon: number | null;
  frequency_khz: number;
  band: string;
  mode: string | null;
  snr: number | null;
  wpm: number | null;
  dxcc: number | null;
  comment: string | null;
  continent: string | null;
}

// ─── Query keys ─────────────────────────────────────────────────────────────

export const SPOT_HISTORY_KEYS = {
  all: ["spot-history"] as const,
  filtered: (
    startTime: string,
    endTime: string,
    band?: string,
    mode?: string,
    limit?: number,
  ) => ["spot-history", startTime, endTime, band, mode, limit] as const,
};

// ─── Time constants ─────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSpotHistory(options: {
  startTime: Date;
  endTime: Date;
  band?: string;
  mode?: string;
  limit?: number;
  enabled?: boolean;
}) {
  const {
    startTime,
    endTime,
    band,
    mode,
    limit = 500,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: SPOT_HISTORY_KEYS.filtered(
      startTime.toISOString(),
      endTime.toISOString(),
      band,
      mode,
      limit,
    ),
    queryFn: async (): Promise<SpotHistoryEntry[]> => {
      // Cast needed: collector tables are not in the generated Database type —
      // they were created by a separate migration for the Railway collector.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from("spot_history_live")
        .select("*")
        .gte("spotted_at", startTime.toISOString())
        .lte("spotted_at", endTime.toISOString())
        .order("spotted_at", { ascending: false })
        .limit(limit);

      if (band) query = query.eq("band", band);
      if (mode) query = query.eq("mode", mode);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SpotHistoryEntry[];
    },
    enabled: enabled && isSupabaseConfigured,
    staleTime: 2 * MINUTE,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
  });
}
