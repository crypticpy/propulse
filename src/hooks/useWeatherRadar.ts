import { useQuery } from "@tanstack/react-query";
import { fetchRadarManifest } from "@/lib/api/radar";

export const RADAR_QUERY_KEY = ["weather-radar"] as const;
const MINUTE = 60 * 1000;

export function useWeatherRadar(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: RADAR_QUERY_KEY,
    queryFn: ({ signal }) => fetchRadarManifest(signal),
    enabled,
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
    refetchInterval: enabled ? 10 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  return { manifest: data ?? null, isLoading, error };
}
