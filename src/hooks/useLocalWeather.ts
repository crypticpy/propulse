import { useQuery } from "@tanstack/react-query";
import { fetchLocalWeather } from "@/lib/api/openMeteo";
import { useUserStore } from "@/stores/userStore";
import type { LocalWeatherData } from "@/lib/api/openMeteo";

const MINUTE = 60 * 1000;

/** Current weather for an arbitrary operating or target coordinate. */
export function useLocationWeather(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  enabled = true,
) {
  const hasLocation =
    Number.isFinite(latitude) && Number.isFinite(longitude);

  const { data, isLoading, error } = useQuery<LocalWeatherData>({
    queryKey: ["local-weather", latitude, longitude],
    queryFn: ({ signal }) =>
      fetchLocalWeather(latitude!, longitude!, signal),
    enabled: enabled && hasLocation,
    staleTime: 15 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled && hasLocation ? 15 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return { weather: data ?? null, isLoading, error, hasLocation };
}

export function useLocalWeather(enabled = true) {
  const station = useUserStore((s) => s.station);
  return useLocationWeather(station?.lat, station?.lon, enabled);
}
