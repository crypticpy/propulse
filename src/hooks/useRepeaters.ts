/**
 * TanStack Query hook for fetching nearby repeater data from RepeaterBook
 * Uses the active operating location for lat/lon coordinates.
 * Repeater data is very stable — 1 hour stale time, no auto-refetch.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchRepeaters } from "@/lib/api/repeaters";
import type { Repeater } from "@/lib/api/repeaters";
import { useActiveLocation } from "@/hooks/useActiveLocation";

// Query key for cache management
export const REPEATERS_QUERY_KEY = ["repeaters"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch nearby repeaters based on the user's active location.
 * Returns repeaters within 50 miles of the active operating location.
 *
 * @param enabled - Whether to fetch data (e.g., layer visibility toggle)
 */
export function useRepeaters(enabled = true) {
  const location = useActiveLocation();
  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  const { data, isLoading, error } = useQuery<Repeater[]>({
    queryKey: [...REPEATERS_QUERY_KEY, lat, lon],
    queryFn: ({ signal }) => {
      if (lat == null || lon == null) return [];
      return fetchRepeaters(lat, lon, 50, signal);
    },
    enabled: enabled && lat != null && lon != null,
    staleTime: 60 * MINUTE,
    gcTime: 120 * MINUTE,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  return {
    repeaters: data ?? [],
    isLoading,
    error,
  };
}
