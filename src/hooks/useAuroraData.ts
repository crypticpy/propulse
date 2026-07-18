/**
 * TanStack Query hook for fetching aurora data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchAuroraData } from "@/lib/api/aurora";

// Query key for cache management
export const AURORA_QUERY_KEY = ["aurora"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch aurora data
 * Returns NOAA OVATION aurora probability data
 * Refetches every 30 minutes, stale after 30 minutes
 */
export function useAuroraData(enabled = true) {
  return useQuery({
    queryKey: AURORA_QUERY_KEY,
    queryFn: fetchAuroraData,
    enabled,
    staleTime: 30 * MINUTE,
    refetchInterval: enabled ? 30 * MINUTE : false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
