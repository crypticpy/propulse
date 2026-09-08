/**
 * TanStack Query hook for fetching band hourly stats from Supabase.
 *
 * Queries `band_hourly_stats_readable` — gap-filtered aggregate rows (one per
 * band per hour) with spot counts, SNR stats, mode/source breakdowns, and
 * denormalized solar conditions.
 */

import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BandHourlyStat {
  id: number;
  hour_utc: string;
  band: string;
  spot_count: number;
  unique_tx: number;
  unique_rx: number;
  avg_snr: number | null;
  min_snr: number | null;
  max_snr: number | null;
  median_snr: number | null;
  mode_counts: Record<string, number> | null;
  source_counts: Record<string, number> | null;
  unique_grids_tx: number;
  unique_grids_rx: number;
  kp_index: number | null;
  sfi: number | null;
  bz_gsm: number | null;
  bt: number | null;
  by_gsm: number | null;
  xray_flux: number | null;
  dst_index: number | null;
  proton_flux_10mev: number | null;
}

// ─── Query keys ─────────────────────────────────────────────────────────────

export const BAND_HOURLY_STATS_KEYS = {
  all: ["band-hourly-stats"] as const,
  filtered: (band: string | undefined, days: number) =>
    ["band-hourly-stats", band ?? "all", days] as const,
};

// ─── Time constants ─────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useBandHourlyStats(options?: { band?: string; days?: number }) {
  const days = options?.days ?? 1; // default: last 24 hours
  const band = options?.band;

  return useQuery({
    queryKey: BAND_HOURLY_STATS_KEYS.filtered(band, days),
    queryFn: async (): Promise<BandHourlyStat[]> => {
      // Cast needed: collector relations are not in the generated Database
      // type because they are managed by separate collector migrations.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const since = new Date();
      since.setDate(since.getDate() - days);

      let query = supabase
        .from("band_hourly_stats_readable")
        .select("*")
        .gte("hour_utc", since.toISOString())
        .order("hour_utc", { ascending: true });

      if (band) {
        query = query.eq("band", band);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as BandHourlyStat[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 5 * MINUTE,
    refetchInterval: 5 * MINUTE,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
  });
}
