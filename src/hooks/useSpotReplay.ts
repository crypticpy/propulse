/**
 * TanStack Query hook for spot replay functionality.
 *
 * Queries `spot_history_live` in Supabase for a configurable time window around a
 * center timestamp, supporting band/mode/grid filters. Designed to power a
 * scrubber-style replay UI where the user drags through past propagation.
 *
 * Feature-gated behind `spotReplay` (pro tier).
 */

import { useQuery } from "@tanstack/react-query";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useFeatureFlags } from "@/lib/featureFlags";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UseSpotReplayOptions {
  /** Center time for the replay window */
  centerTime: Date;
  /** Window size in minutes (default 15) */
  windowMinutes?: number;
  /** Optional band filter (e.g., "20m") */
  band?: string;
  /** Optional mode filter (e.g., "FT8") */
  mode?: string;
  /** Optional grid prefix filter (e.g., "EM") */
  gridPrefix?: string;
  /** Max rows to fetch (default 200) */
  limit?: number;
  /** Whether replay is enabled (default false) */
  enabled?: boolean;
}

export interface ReplaySpot {
  id: string;
  spotter: string;
  spotterGrid?: string;
  dx: string;
  dxGrid?: string;
  frequency: number;
  band?: string;
  mode?: string;
  snr?: number;
  spottedAt: Date;
  source: string;
  spotterLat?: number;
  spotterLon?: number;
  dxLat?: number;
  dxLon?: number;
}

// ─── Row type returned by Supabase ──────────────────────────────────────────

interface SpotHistoryRow {
  id: string;
  rx_callsign: string;
  rx_grid: string | null;
  tx_callsign: string;
  tx_grid: string | null;
  frequency_khz: number;
  band: string | null;
  mode: string | null;
  snr: number | null;
  spotted_at: string;
  source: string;
  comment: string | null;
  rx_lat: number | null;
  rx_lon: number | null;
  tx_lat: number | null;
  tx_lon: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map a raw Supabase row (snake_case) to the camelCase ReplaySpot interface */
function mapRowToReplaySpot(row: SpotHistoryRow): ReplaySpot {
  return {
    id: String(row.id),
    spotter: row.rx_callsign,
    ...(row.rx_grid != null && { spotterGrid: row.rx_grid }),
    dx: row.tx_callsign,
    ...(row.tx_grid != null && { dxGrid: row.tx_grid }),
    frequency: row.frequency_khz,
    ...(row.band != null && { band: row.band }),
    ...(row.mode != null && { mode: row.mode }),
    ...(row.snr != null && { snr: row.snr }),
    spottedAt: new Date(row.spotted_at),
    source: row.source,
    ...(row.rx_lat != null && { spotterLat: row.rx_lat }),
    ...(row.rx_lon != null && { spotterLon: row.rx_lon }),
    ...(row.tx_lat != null && { dxLat: row.tx_lat }),
    ...(row.tx_lon != null && { dxLon: row.tx_lon }),
  };
}

// ─── Query key ──────────────────────────────────────────────────────────────

export const SPOT_REPLAY_KEYS = {
  all: ["spot-replay"] as const,
  window: (
    centerTime: string,
    windowMinutes: number,
    band?: string,
    mode?: string,
    gridPrefix?: string,
    limit?: number,
  ) =>
    [
      "spot-replay",
      centerTime,
      windowMinutes,
      band,
      mode,
      gridPrefix,
      limit,
    ] as const,
};

// ─── Constants ──────────────────────────────────────────────────────────────

const SECOND = 1000;

/** Empty array — stable reference to avoid unnecessary re-renders */
const EMPTY_SPOTS: ReplaySpot[] = [];

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSpotReplay(options: UseSpotReplayOptions): {
  spots: ReplaySpot[];
  isLoading: boolean;
  error: Error | null;
} {
  const {
    centerTime,
    windowMinutes = 15,
    band,
    mode,
    gridPrefix,
    limit = 200,
    enabled = false,
  } = options;

  const flags = useFeatureFlags();
  const featureEnabled = flags.spotReplay;

  // Compute time window
  const halfWindowMs = (windowMinutes / 2) * 60 * SECOND;
  const startTime = new Date(centerTime.getTime() - halfWindowMs);
  const endTime = new Date(centerTime.getTime() + halfWindowMs);

  const queryEnabled = enabled && featureEnabled && isSupabaseConfigured;

  const query = useQuery({
    queryKey: SPOT_REPLAY_KEYS.window(
      centerTime.toISOString(),
      windowMinutes,
      band,
      mode,
      gridPrefix,
      limit,
    ),
    queryFn: async (): Promise<ReplaySpot[]> => {
      // Cast needed: collector tables are not in the generated Database type —
      // they were created by a separate migration for the Railway collector.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from("spot_history_live")
        .select("*")
        .gte("spotted_at", startTime.toISOString())
        .lte("spotted_at", endTime.toISOString())
        .order("spotted_at", { ascending: true })
        .limit(limit);

      if (band) {
        query = query.eq("band", band);
      }
      if (mode) {
        query = query.eq("mode", mode);
      }
      if (gridPrefix) {
        query = query.or(
          `tx_grid.ilike.${gridPrefix}%,rx_grid.ilike.${gridPrefix}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as SpotHistoryRow[]).map(mapRowToReplaySpot);
    },
    enabled: queryEnabled,
    staleTime: 2 * SECOND,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 15000),
  });

  // Feature-gated: return empty immediately when disabled
  if (!featureEnabled) {
    return { spots: EMPTY_SPOTS, isLoading: false, error: null };
  }

  return {
    spots: query.data ?? EMPTY_SPOTS,
    isLoading: query.isLoading,
    error: query.error,
  };
}
