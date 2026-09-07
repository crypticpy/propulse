import type { DXClusterFilters } from "@/types/dxcluster";
import type { SpotPresentationPreferences } from "../spotContracts";

/** Map saved/effective view spot filters onto the shared cluster filter shape. */
export function dxFiltersFromViewSpots(
  spots: SpotPresentationPreferences,
): DXClusterFilters {
  const modes = spots.filters.modes.all ? undefined : [...spots.filters.modes.modes];
  return {
    bands: spots.filters.bands.length > 0 ? [...spots.filters.bands] : undefined,
    modes: modes && modes.length > 0 ? modes : undefined,
    sources: spots.filters.sources.length > 0 ? [...spots.filters.sources] : undefined,
    maxAge: spots.filters.maxAgeMinutes,
  };
}
