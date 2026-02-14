/**
 * Hook: Sporadic E Layer Data
 *
 * Fetches Sporadic E probability grid data from the
 * /api/propagation/sporadic-e edge function. Uses TanStack Query for
 * caching, automatic refetching, and error handling.
 *
 * Only fetches when the sporadicE layer is enabled in mapStore.
 */

import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SporadicERegion {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Probability of Es occurrence (0-1) */
  probability: number;
  /** Estimated foEs critical frequency in MHz */
  estimatedFoEs: number;
}

interface SporadicEResponse {
  month: number;
  hour: number;
  resolution: number;
  timestamp: string;
  count: number;
  regions: SporadicERegion[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

export const SPORADIC_E_QUERY_KEY = ["propagation", "sporadic-e"] as const;

// ─── Fetcher ────────────────────────────────────────────────────────────────

async function fetchSporadicE(): Promise<SporadicEResponse> {
  const response = await fetch("/api/propagation/sporadic-e");

  if (!response.ok) {
    throw new Error(
      `Sporadic E API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch Sporadic E probability grid data.
 *
 * Refreshes every 30 minutes since Es conditions change slowly.
 *
 * @returns { regions, isLoading, error, dataUpdatedAt }
 */
export function useSporadicE() {
  const sporadicEEnabled = useMapStore((s) => s.layers.sporadicE);

  const query = useQuery({
    queryKey: [...SPORADIC_E_QUERY_KEY],
    queryFn: fetchSporadicE,
    enabled: sporadicEEnabled,
    staleTime: 30 * MINUTE,
    refetchInterval: sporadicEEnabled ? 30 * MINUTE : false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    regions: query.data?.regions ?? [],
    count: query.data?.count ?? 0,
    timestamp: query.data?.timestamp ?? null,
    isLoading: query.isLoading,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
