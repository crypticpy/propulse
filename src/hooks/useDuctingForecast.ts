/**
 * Hook: Tropospheric Ducting Forecast
 *
 * Fetches tropospheric ducting probability grid data from the
 * /api/propagation/ducting edge function. Uses TanStack Query for
 * caching, automatic refetching, and error handling.
 *
 * Only fetches when the ducting layer is enabled in mapStore.
 */

import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DuctingRegion {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Probability of ducting (0-1) */
  probability: number;
  /** Type of ducting mechanism */
  type: "surface" | "elevated" | "evaporation";
}

interface DuctingResponse {
  month: number;
  hour: number;
  resolution: number;
  timestamp: string;
  count: number;
  regions: DuctingRegion[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const DUCTING_QUERY_KEY = ["propagation", "ducting"] as const;

// ─── Fetcher ────────────────────────────────────────────────────────────────

async function fetchDuctingForecast(): Promise<DuctingResponse> {
  const response = await fetch("/api/propagation/ducting");

  if (!response.ok) {
    throw new Error(
      `Ducting API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch tropospheric ducting probability grid data.
 *
 * Refreshes every hour since ducting conditions change slowly.
 *
 * @returns { regions, isLoading, error, dataUpdatedAt }
 */
export function useDuctingForecast() {
  const ductingEnabled = useMapStore((s) => s.layers.ducting);

  const query = useQuery({
    queryKey: [...DUCTING_QUERY_KEY],
    queryFn: fetchDuctingForecast,
    enabled: ductingEnabled,
    staleTime: 1 * HOUR,
    refetchInterval: ductingEnabled ? 1 * HOUR : false,
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
