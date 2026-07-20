/**
 * useContestPropIntel Hook
 *
 * Provides contest-derived propagation intelligence by combining contest
 * context awareness with spot history data from Supabase. When a major
 * contest is active, the high spot density gives much better propagation
 * confidence than normal operation.
 *
 * - 60s refresh during active contests, disabled otherwise
 * - Computes density map and high-confidence paths
 * - Detects when contest data meaningfully boosts confidence (20%+)
 *
 * @module hooks/useContestPropIntel
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useContestContext } from "@/hooks/useContestContext";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { SpotHistoryRow } from "@/lib/supabase";

import {
  computeContestDensity,
  extractPropagationSignal,
  getEnhancedConfidence,
  type DensityMap,
  type PropagationPath,
  type SpotLike,
} from "@/lib/contest/contestPropIntel";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Refresh interval during active contests (60 seconds) */
const CONTEST_REFRESH_MS = 60_000;

/** How far back to fetch spots (60 minutes) */
const SPOT_LOOKBACK_MS = 60 * 60 * 1000;

/** Max spots to fetch per query */
const SPOT_LIMIT = 5000;

/** Threshold for declaring contest-enhanced confidence (20% boost) */
const ENHANCEMENT_THRESHOLD = 0.2;

/** Baseline confidence when no contest data is available */
const BASELINE_CONFIDENCE = 0.3;

// ─── Query keys ─────────────────────────────────────────────────────────────

const CONTEST_INTEL_KEYS = {
  all: ["contest-prop-intel"] as const,
  spots: (since: string) => ["contest-prop-intel", "spots", since] as const,
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface UseContestPropIntelResult {
  /** Density map of grid-pair aggregations, null when no contest is active */
  density: DensityMap | null;
  /** Overall propagation confidence (0-1) accounting for contest boost */
  confidence: number;
  /** High-confidence propagation paths extracted from contest density */
  enhancedPaths: PropagationPath[];
  /** Whether spot data is currently being fetched */
  loading: boolean;
  /** True when contest density boosts confidence by 20%+ over baseline */
  isContestEnhanced: boolean;
}

/**
 * Contest propagation intelligence hook.
 *
 * @param band - Optional band filter (e.g., "20m"). When provided, only
 *   spots on that band contribute to density and path extraction.
 * @returns Contest propagation intelligence data
 */
export function useContestPropIntel(band?: string): UseContestPropIntelResult {
  const { isContestWeekend } = useContestContext();

  // Compute the "since" timestamp for stable query key
  const sinceIso = useMemo(() => {
    const d = new Date(Date.now() - SPOT_LOOKBACK_MS);
    // Round to the nearest minute to avoid excessive cache busting
    d.setSeconds(0, 0);
    return d.toISOString();
  }, [
    // Re-derive every 60s: use floor(now / 60s) as dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Math.floor(Date.now() / CONTEST_REFRESH_MS),
  ]);

  // Fetch spots from Supabase when a contest is active
  const {
    data: rawSpots,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: CONTEST_INTEL_KEYS.spots(sinceIso),
    queryFn: async (): Promise<SpotHistoryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from("spot_history_live")
        .select("*")
        .gte("spotted_at", sinceIso)
        .order("spotted_at", { ascending: false })
        .limit(SPOT_LIMIT);

      if (band) {
        query = query.eq("band", band);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SpotHistoryRow[];
    },
    enabled: isContestWeekend && isSupabaseConfigured,
    staleTime: CONTEST_REFRESH_MS,
    refetchInterval: isContestWeekend ? CONTEST_REFRESH_MS : false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex: number) =>
      Math.min(1000 * 2 ** attemptIndex, 15000),
  });

  // Transform SpotHistoryRow → SpotLike for the analysis engine
  const spots = useMemo((): SpotLike[] => {
    if (!rawSpots) return [];
    return rawSpots.map((row) => ({
      frequency: row.frequency ?? 0,
      mode: row.mode ?? "UNKNOWN",
      grid: row.tx_grid ?? undefined,
      receiverGrid: row.rx_grid ?? undefined,
      snr: row.snr ?? undefined,
      time: new Date(row.spotted_at),
    }));
  }, [rawSpots]);

  // Compute density map
  const density = useMemo((): DensityMap | null => {
    if (!isContestWeekend || spots.length === 0) return null;
    return computeContestDensity(spots);
  }, [isContestWeekend, spots]);

  // Extract high-confidence propagation paths
  const enhancedPaths = useMemo((): PropagationPath[] => {
    if (!density) return [];
    const targetBand = band ?? "all";
    return extractPropagationSignal(density, targetBand);
  }, [density, band]);

  // Compute total contest density (sum of all path counts)
  const totalDensity = useMemo(() => {
    if (!density) return 0;
    let total = 0;
    for (const bucket of density.values()) {
      total += bucket.count;
    }
    return total;
  }, [density]);

  // Compute enhanced confidence
  const confidence = useMemo(() => {
    if (!isContestWeekend) return BASELINE_CONFIDENCE;
    return getEnhancedConfidence(BASELINE_CONFIDENCE, totalDensity);
  }, [isContestWeekend, totalDensity]);

  // Determine if contest is providing meaningful enhancement
  const isContestEnhanced = useMemo(() => {
    if (!isContestWeekend) return false;
    const boost = confidence - BASELINE_CONFIDENCE;
    return boost >= ENHANCEMENT_THRESHOLD;
  }, [isContestWeekend, confidence]);

  return {
    density,
    confidence,
    enhancedPaths,
    loading: isLoading || isFetching,
    isContestEnhanced,
  };
}

// Re-export types for consumer convenience
export type {
  DensityMap,
  PropagationPath,
} from "@/lib/contest/contestPropIntel";
