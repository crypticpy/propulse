/**
 * TanStack Query hook for fetching lightning strike data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchLightningStrikes } from "@/lib/api/lightning";
import { LIGHTNING_LIVE_SOURCE_ENABLED } from "@/lib/map/layerCapabilities";

// Query key for cache management
export const LIGHTNING_QUERY_KEY = ["lightning"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch recent lightning strike data
 * Returns global lightning strikes from Blitzortung
 * Refetches every 1 minute, stale after 1 minute
 *
 * @param enabled - Whether to fetch data (pass layers.lightning)
 */
export function useLightning(enabled = true) {
  const queryEnabled = enabled && LIGHTNING_LIVE_SOURCE_ENABLED;
  const { data, isLoading, error } = useQuery({
    queryKey: LIGHTNING_QUERY_KEY,
    queryFn: ({ signal }) => fetchLightningStrikes(signal),
    enabled: queryEnabled,
    staleTime: 1 * MINUTE,
    gcTime: 5 * MINUTE,
    refetchInterval: queryEnabled ? 1 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    strikes: data ?? [],
    isLoading,
    error,
  };
}
