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
    spotFilters,
  });
  const activations = useActivationSpots(activationsEnabled);
  const filteredSpots = useMemo(
    () =>
      selectMapSpotCandidates(live.spots, {
        sources,
        spotFilters,
      }),
    [live.spots, sources, spotFilters],
  );
  const { candidateSpots, resolvedSpots } = useMemo(() => {
    const limit =
      maxSpots === undefined ? Number.POSITIVE_INFINITY : Math.max(0, maxSpots);
    if (!resolveEnabled) {
      return {
        candidateSpots: filteredSpots.slice(0, limit),
        resolvedSpots: [],
      };
    }

    // Resolve first, then apply the renderer budget. Otherwise unresolved
    // entries at the head of the time-sorted feed consume capacity without
    // producing a point. Rebuild both arrays from the same resolved order so
    // trace metadata and coordinates always describe the same spot IDs.
    const resolvedCandidates = resolveSpotLocations(filteredSpots);
    const sourceById = new Map(
      filteredSpots.map((spot) => [spot.id, spot] as const),
    );
    const cappedCandidates = [] as typeof filteredSpots;
    const cappedResolved = [] as typeof resolvedCandidates;
    for (const resolved of resolvedCandidates) {
      if (cappedResolved.length >= limit) break;
      const source = sourceById.get(resolved.id);
      if (!source) continue;
      cappedCandidates.push(source);
      cappedResolved.push(resolved);
    }
    return {
      candidateSpots: cappedCandidates,
      resolvedSpots: cappedResolved,
    };
  }, [filteredSpots, maxSpots, resolveEnabled]);
  const activationSpots = useMemo(
    () =>
      activationsEnabled
        ? resolveActivationMarkers(activations.spots, maxSpots)
        : [],
    [activations.spots, activationsEnabled, maxSpots],
  );

  return { ...live, candidateSpots, resolvedSpots, activationSpots };
}
