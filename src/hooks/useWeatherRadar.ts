/**
 * TanStack Query hook for fetching weather alert data
 * Provides React hook with automatic caching, refetching, and error handling
 */

import { useQuery } from "@tanstack/react-query";
import { fetchWeatherAlerts } from "@/lib/api/weather";
import type { WeatherAlert } from "@/lib/api/weather";

// Query key for cache management
export const WEATHER_ALERTS_QUERY_KEY = ["weather-alerts"] as const;

// Time constants in milliseconds
const MINUTE = 60 * 1000;

/**
 * Hook to fetch active weather alerts
 * Returns NWS weather alerts with geographic locations
 * Refetches every 10 minutes, stale after 5 minutes
 */
export function useWeatherAlerts() {
  const { data, isLoading, error } = useQuery({
    queryKey: WEATHER_ALERTS_QUERY_KEY,
    queryFn: fetchWeatherAlerts,
    staleTime: 5 * MINUTE,
    refetchInterval: 10 * MINUTE,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    alerts: data ?? ([] as WeatherAlert[]),
    isLoading,
    error,
  };
}
