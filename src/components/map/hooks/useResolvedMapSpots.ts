import { useMemo } from "react";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useMapSpotFeed } from "@/hooks/useMapSpotFeed";
import { resolveActivationMarkers } from "@/lib/map/activationMarkers";
import {
  policyAllows,
} from "@/lib/map/operationalScope";
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
  const live = useMapSpotFeed({ grid, enabled, sources, spotFilters, refetchInterval });
  const { policy, scopedSources, effectiveSpotFilters } = live;
  const scopedActivationsEnabled =
    activationsEnabled && policyAllows(policy, "activations", "public");
  const activations = useActivationSpots(scopedActivationsEnabled);
  const filteredSpots = useMemo(
    () =>
      selectMapSpotCandidates(live.spots, {
        sources: scopedSources,
        spotFilters: effectiveSpotFilters,
      }),
    [live.spots, scopedSources, effectiveSpotFilters],
  );
  const evidenceSpots = useMemo(
    () =>
      selectMapSpotCandidates(live.evidenceSpots, {
        sources: scopedSources,
        spotFilters: effectiveSpotFilters,
      }),
    [live.evidenceSpots, scopedSources, effectiveSpotFilters],
  );
  const {
    candidateSpots,
    resolvedSpots,
    allCandidateSpots,
    allResolvedSpots,
  } = useMemo(() => {
    const limit =
      maxSpots === undefined ? Number.POSITIVE_INFINITY : Math.max(0, maxSpots);
    if (!resolveEnabled) {
      return {
        candidateSpots: filteredSpots.slice(0, limit),
        resolvedSpots: [],
        allCandidateSpots: evidenceSpots,
        allResolvedSpots: [],
      };
    }

    // Resolve first, then apply the renderer budget. Otherwise unresolved
    // entries at the head of the time-sorted feed consume capacity without
    // producing a point. Rebuild both arrays from the same resolved order so
    // trace metadata and coordinates always describe the same spot IDs.
    const resolvedEvidence = resolveSpotLocations(evidenceSpots);
    // The resolver retains the exact source object. Use that identity instead
    // of LiveSpot.id: some upstream RBN rows historically shared an ID across
    // receivers/frequencies observed in the same second.
    const resolvedBySource = new Map(
      resolvedEvidence.map((spot) => [spot.originalSpot, spot] as const),
    );
    const cappedCandidates = [] as typeof filteredSpots;
    const cappedResolved = [] as typeof resolvedEvidence;
    for (const source of filteredSpots) {
      if (cappedResolved.length >= limit) break;
      const resolved = resolvedBySource.get(source);
      if (!resolved) continue;
      cappedCandidates.push(source);
      cappedResolved.push(resolved);
    }
    return {
      candidateSpots: cappedCandidates,
      resolvedSpots: cappedResolved,
      // Activity aggregation and other semantic summaries must see the whole
      // eligible feed. Renderer density limits are applied only to the arrays
      // above so a crowded region cannot disappear from aggregate facts.
      allCandidateSpots: evidenceSpots,
      allResolvedSpots: resolvedEvidence,
    };
  }, [evidenceSpots, filteredSpots, maxSpots, resolveEnabled]);
  const activationSpots = useMemo(
    () =>
      scopedActivationsEnabled
        ? resolveActivationMarkers(activations.spots, maxSpots)
        : [],
    [activations.spots, maxSpots, scopedActivationsEnabled],
  );

  return {
    ...live,
    candidateSpots,
    resolvedSpots,
    allCandidateSpots,
    allResolvedSpots,
    activationSpots,
    dataPolicy: policy,
  };
}
