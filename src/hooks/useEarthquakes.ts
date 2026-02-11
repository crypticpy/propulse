/**
 * TanStack Query hook for fetching earthquake data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchEarthquakes } from "@/lib/api/earthquakes";

// Query key for cache management
export const EARTHQUAKES_QUERY_KEY = ["earthquakes"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch recent earthquake data
 * Returns USGS M2.5+ earthquakes from the past 24 hours
 * Refetches every 10 minutes, stale after 5 minutes
 *
 * @param enabled - Whether to fetch data (pass layers.earthquakes)
 */
export function useEarthquakes(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: EARTHQUAKES_QUERY_KEY,
    queryFn: ({ signal }) => fetchEarthquakes(signal),
    enabled,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
    refetchInterval: enabled ? 10 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    earthquakes: data ?? [],
    isLoading,
    error,
  };
}
