/**
 * TanStack Query hook for fetching nearby APRS station data from aprs.fi
 * Uses the active operating location for lat/lon coordinates.
 * APRS data is moderately dynamic — 5 minute stale time, 10 minute refetch.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchAPRSStations } from "@/lib/api/aprs";
import type { APRSStation } from "@/lib/api/aprs";
import { useActiveLocation } from "@/hooks/useActiveLocation";

// Query key for cache management
export const APRS_STATIONS_QUERY_KEY = ["aprs-stations"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch nearby APRS stations based on the user's active location.
 * Returns stations within 100km of the active operating location.
 *
 * @param enabled - Whether to fetch data (e.g., layer visibility toggle)
 */
export function useAPRSStations(enabled = true) {
  const location = useActiveLocation();
  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const { data, isLoading, error } = useQuery<APRSStation[]>({
    queryKey: [...APRS_STATIONS_QUERY_KEY, lat, lon],
    queryFn: ({ signal }) => {
      if (lat == null || lon == null) return [];
      return fetchAPRSStations(lat, lon, 100, signal);
    },
    enabled: enabled && lat != null && lon != null,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
    refetchInterval: 10 * MINUTE,
    refetchOnWindowFocus: false,
  });

  return {
    stations: data ?? [],
    isLoading,
    error,
  };
}
