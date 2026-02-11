/**
 * TanStack Query hook for fetching NASA FIRMS fire hotspot data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchFireHotspots } from "@/lib/api/fires";

// Query key for cache management
export const FIRES_QUERY_KEY = ["fires"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch active fire hotspot data
 * Returns NASA FIRMS VIIRS detections from the past 24 hours
 * Refetches every 30 minutes (fire data updates hourly), stale after 30 minutes
 *
 * @param enabled - Whether to fetch data (pass layers.fires)
 */
export function useFires(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: FIRES_QUERY_KEY,
    queryFn: ({ signal }) => fetchFireHotspots(signal),
    enabled,
    staleTime: 30 * MINUTE,
    gcTime: 60 * MINUTE,
    refetchInterval: enabled ? 30 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    hotspots: data ?? [],
    isLoading,
    error,
  };
}
