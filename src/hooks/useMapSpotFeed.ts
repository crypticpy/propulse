import { useMemo } from "react";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { selectScopedLiveSpotSources } from "@/lib/map/operationalScope";
import { MAX_SPOT_FETCH_LIMIT } from "@/lib/map/spotDensity";
import { useMapStore } from "@/stores/mapStore";
import type { SpotSource } from "@/types/livespot";
import type { SpotFilters } from "@/types/operatingProfile";

/** Shared map/settings feed policy without importing renderer geometry. */
export function useMapSpotFeed({
  grid, enabled, sources, spotFilters, refetchInterval = 60_000,
}: {
  grid?: string;
  enabled: boolean;
  sources?: SpotSource[];
  spotFilters?: SpotFilters;
  refetchInterval?: number;
}) {
  const { policy } = useMapOperationalContext();
  const windowMinutes = useMapStore((s) => s.spotAgeMinutes);
  const scopedSources = useMemo(
    () => selectScopedLiveSpotSources(sources, policy),
    [policy, sources],
  );
  const live = useLiveSpots({
    grid, enabled, refetchInterval,
    sources: scopedSources && scopedSources.length > 0 ? scopedSources : undefined,
    spotFilters,
    // Draw density must not change the bounded snapshot used for activity.
    fetchLimit: MAX_SPOT_FETCH_LIMIT,
    windowMinutes,
  });
  return { ...live, policy, scopedSources };
}
