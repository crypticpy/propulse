import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import type { SpotSource } from "@/types/livespot";
import { useResolvedMapSpots } from "./useResolvedMapSpots";

interface UseAzimuthalMapSpotsOptions {
  grid?: string;
  enabled: boolean;
  activationsEnabled: boolean;
  maxSpots: number;
}

/**
 * Keeps the azimuthal renderer on the same source/profile selection contract
 * as the globe and flat projections.
 */
export function useAzimuthalMapSpots(options: UseAzimuthalMapSpotsOptions) {
  const spotFilters = useMapStore((state) => state.spotFilters);
  const spotSourceFilters = useDXStore(
    (state) => state.filters.sources as SpotSource[] | undefined,
  );

  return useResolvedMapSpots({
    ...options,
    sources: spotSourceFilters,
    spotFilters,
  });
}
