/**
 * useRiverGauges — TanStack Query hook for USGS river gauge data
 *
 * Fetches gauge heights in a ~2-degree bounding box around the current
 * AtmosView map center. Refreshes every 30 minutes (USGS data updates
 * are typically every 15-60 minutes).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchRiverGauges } from "@/lib/api/gauges";
import type { RiverGauge } from "@/lib/api/gauges";
import { useAtmosStore } from "@/stores/atmosStore";

const MINUTE = 60 * 1000;

export function useRiverGauges(enabled = true) {
  const mapCenter = useAtmosStore((s) => s.mapCenter);

  // Create a bounding box ~2 degrees around map center
  const west = mapCenter.lon - 2;
  const south = mapCenter.lat - 2;
  const east = mapCenter.lon + 2;
  const north = mapCenter.lat + 2;

  const { data, isLoading, error } = useQuery<RiverGauge[]>({
    queryKey: [
      "river-gauges",
      Math.round(mapCenter.lat),
      Math.round(mapCenter.lon),
    ],
    queryFn: ({ signal }) => fetchRiverGauges(west, south, east, north, signal),
    enabled,
    staleTime: 30 * MINUTE,
    gcTime: 60 * MINUTE,
    refetchInterval: enabled ? 30 * MINUTE : false,
    refetchOnWindowFocus: false,
  });

  return { gauges: data ?? [], isLoading, error };
}
