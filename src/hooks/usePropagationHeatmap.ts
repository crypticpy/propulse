/**
 * TanStack Query hook for building a band x hour-of-day propagation heatmap.
 *
 * Fetches `band_hourly_stats` over a configurable time window (default 7 days),
 * then aggregates spot counts and average SNR into 24 hourly buckets per band.
 * The result is a flat array of { band, hour, spotCount, avgSnr } cells
 * suitable for rendering a heatmap grid.
 */

import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  band: string;
  hour: number; // 0-23 UTC
  spotCount: number; // average spots per hour-of-day
  avgSnr: number | null;
}

// ─── Query keys ─────────────────────────────────────────────────────────────

export const PROPAGATION_HEATMAP_KEYS = {
  all: ["propagation-heatmap"] as const,
  byDays: (days: number) => ["propagation-heatmap", days] as const,
};

// ─── Time constants ─────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePropagationHeatmap(days: number = 7) {
  return useQuery({
    queryKey: PROPAGATION_HEATMAP_KEYS.byDays(days),
    queryFn: async (): Promise<HeatmapCell[]> => {
      // Cast needed: collector tables are not in the generated Database type —
      // they were created by a separate migration for the Railway collector.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from("band_hourly_stats")
        .select("band, hour_utc, spot_count, avg_snr")
        .gte("hour_utc", since.toISOString())
        .order("hour_utc", { ascending: true });

      if (error) throw error;

      // Aggregate by band x hour-of-day
      const buckets = new Map<
        string,
        { count: number; totalSpots: number; snrSum: number; snrCount: number }
      >();

      for (const row of data ?? []) {
        const hour = new Date(row.hour_utc).getUTCHours();
        const key = `${row.band}:${hour}`;
        const existing = buckets.get(key) ?? {
          count: 0,
          totalSpots: 0,
          snrSum: 0,
          snrCount: 0,
        };
        existing.count += 1;
        existing.totalSpots += row.spot_count ?? 0;
        if (row.avg_snr != null) {
          existing.snrSum += row.avg_snr;
          existing.snrCount += 1;
        }
        buckets.set(key, existing);
      }

      const cells: HeatmapCell[] = [];
      for (const [key, val] of buckets) {
        const separatorIdx = key.lastIndexOf(":");
        const band = key.slice(0, separatorIdx);
        const hour = parseInt(key.slice(separatorIdx + 1), 10);
        cells.push({
          band,
          hour,
          spotCount: Math.round(val.totalSpots / val.count), // average per hour
          avgSnr: val.snrCount > 0 ? val.snrSum / val.snrCount : null,
        });
      }

      return cells;
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * MINUTE,
    refetchInterval: 15 * MINUTE,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
  });
}
