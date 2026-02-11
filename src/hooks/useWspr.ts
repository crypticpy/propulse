/**
 * TanStack Query hook for fetching WSPR spot data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchWsprSpots } from "@/lib/api/wspr";

// Query key for cache management
export const WSPR_SPOTS_QUERY_KEY = ["wspr-spots"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch recent WSPR spot data
 * Returns wspr.live spots from the past 30 minutes
 * Refetches every 2 minutes (WSPR uses 2-minute TX cycles)
 *
 * @param enabled - Whether to fetch data (pass layers.wspr)
 */
export function useWsprSpots(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: WSPR_SPOTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchWsprSpots(signal),
    enabled,
    staleTime: 2 * MINUTE,
    gcTime: 10 * MINUTE,
    refetchInterval: enabled ? 2 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    spots: data ?? [],
    isLoading,
    error,
  };
}
