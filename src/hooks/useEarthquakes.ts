/**
 * TanStack Query hook for fetching earthquake data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchEarthquakes } from "@/lib/api/earthquakes";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";

// Query key for cache management
export const EARTHQUAKES_QUERY_KEY = ["earthquakes"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch recent earthquake data
 * Returns USGS M2.5+ earthquakes from the past 24 hours
 * Refetches every 10 minutes, stale after 5 minutes
 */
export function useEarthquakes() {
  const { data, isLoading, error } = useQuery({
    queryKey: EARTHQUAKES_QUERY_KEY,
    queryFn: fetchEarthquakes,
    staleTime: 5 * MINUTE,
    refetchInterval: 10 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    earthquakes: data ?? ([] as EarthquakeEvent[]),
    isLoading,
    error,
  };
}
