import { useQuery } from "@tanstack/react-query";
import { fetchRadarManifest } from "@/lib/api/radar";
import { getNexradTileUrl } from "@/lib/api/nexrad";

export const RADAR_QUERY_KEY = ["weather-radar"] as const;
const NEXRAD_AVAIL_KEY = ["nexrad-available"] as const;
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

/**
 * Check if IEM NEXRAD tiles are reachable.
 * Fires a lightweight HEAD request to a known US tile.
 * Cached for 10 minutes — doesn't re-check constantly.
 */
export function useNexradAvailable(enabled = true) {
  const { data: available = false } = useQuery({
    queryKey: NEXRAD_AVAIL_KEY,
    queryFn: async ({ signal }) => {
      try {
        // Check a known CONUS tile (zoom 4, central US)
        const url = getNexradTileUrl("nexrad-n0q", 4, 4, 6);
        const res = await fetch(url, { method: "HEAD", signal });
        return res.ok;
      } catch {
        return false;
      }
    },
    enabled,
    staleTime: 10 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  return available;
}
