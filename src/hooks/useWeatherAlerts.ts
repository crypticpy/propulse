/**
 * TanStack Query hook for fetching weather alert data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchWeatherAlerts } from "@/lib/api/weather";

// Query key for cache management
export const WEATHER_ALERTS_QUERY_KEY = ["weather-alerts"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch active weather alerts
 * Returns NWS weather alerts with geographic locations
 * Refetches every 10 minutes, stale after 5 minutes
 *
 * @param enabled - Whether to fetch data (pass layers.weather)
 */
export function useWeatherAlerts(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: WEATHER_ALERTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchWeatherAlerts(signal),
    enabled,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
    refetchInterval: enabled ? 10 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    alerts: data ?? [],
    isLoading,
    error,
  };
}
