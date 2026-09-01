import { useMemo } from "react";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { resolveActivationMarkers } from "@/lib/map/activationMarkers";
import { selectMapSpotCandidates } from "@/lib/map/spotCandidates";
import type { SpotSource } from "@/types/livespot";
import type { SpotFilters } from "@/types/operatingProfile";
import { resolveSpotLocations } from "../LiveSpotArcs";

interface UseResolvedMapSpotsOptions {
  /** Receiver grid used by PSKReporter. */
  grid?: string;
  /** Whether any renderer feature currently needs the raw live feed. */
  enabled: boolean;
  /** Whether the separate POTA/SOTA/WWFF marker feed is visible. */
  activationsEnabled?: boolean;
  /**
   * Whether coordinates are needed. This can be narrower than `enabled`:
   * the globe spectrum ring consumes raw spots but does not need map points.
   */
  resolveEnabled?: boolean;
  /** Optional renderer draw cap; omitted when the downstream renderer caps. */
  maxSpots?: number;
  /** DX source choices shared by every map renderer. */
  sources?: SpotSource[];
  /** Profile band/mode choices shared by every map renderer. */
  spotFilters?: SpotFilters;
  refetchInterval?: number;
}

/**
 * Shared live-spot request and coordinate-normalization boundary for all map
 * projections. Renderer-specific drawing stays local; source selection,
 * disabled-state behavior, and density slicing now have one implementation.
 */
export function useResolvedMapSpots({
  grid,
  enabled,
  activationsEnabled = false,
  resolveEnabled = enabled,
  maxSpots,
  sources,
  spotFilters,
  refetchInterval = 60_000,
}: UseResolvedMapSpotsOptions) {
  const live = useLiveSpots({
    grid,
    enabled,
    refetchInterval,
    sources: sources && sources.length > 0 ? sources : undefined,
  });
  const activations = useActivationSpots(activationsEnabled);
  const candidateSpots = useMemo(
    () =>
      selectMapSpotCandidates(live.spots, {
        sources,
        spotFilters,
        maxSpots,
      }),
    [live.spots, maxSpots, sources, spotFilters],
  );
  const resolvedSpots = useMemo(() => {
    if (!resolveEnabled) return [];
    return resolveSpotLocations(candidateSpots);
  }, [candidateSpots, resolveEnabled]);
  const activationSpots = useMemo(
    () =>
      activationsEnabled
        ? resolveActivationMarkers(activations.spots, maxSpots)
        : [],
    [activations.spots, activationsEnabled, maxSpots],
  );

  return { ...live, candidateSpots, resolvedSpots, activationSpots };
}
