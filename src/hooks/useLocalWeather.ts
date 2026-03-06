import { useQuery } from "@tanstack/react-query";
import { fetchLocalWeather } from "@/lib/api/openMeteo";
import { useUserStore } from "@/stores/userStore";
import type { LocalWeatherData } from "@/lib/api/openMeteo";

const MINUTE = 60 * 1000;

export function useLocalWeather(enabled = true) {
  const station = useUserStore((s) => s.station);
  const lat = station?.lat ?? null;
  const lon = station?.lon ?? null;
  const hasLocation = lat != null && lon != null;

  const { data, isLoading, error } = useQuery<LocalWeatherData>({
    queryKey: ["local-weather", lat, lon],
    queryFn: ({ signal }) => fetchLocalWeather(lat!, lon!, signal),
    enabled: enabled && hasLocation,
    staleTime: 15 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: enabled && hasLocation ? 15 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return { weather: data ?? null, isLoading, error, hasLocation };
}
