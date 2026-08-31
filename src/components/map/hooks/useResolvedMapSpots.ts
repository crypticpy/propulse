import { useMemo } from "react";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { resolveActivationMarkers } from "@/lib/map/activationMarkers";
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
  refetchInterval = 60_000,
}: UseResolvedMapSpotsOptions) {
  const live = useLiveSpots({ grid, enabled, refetchInterval });
  const activations = useActivationSpots(activationsEnabled);
  const resolvedSpots = useMemo(() => {
    if (!resolveEnabled) return [];
    const resolved = resolveSpotLocations(live.spots);
    return maxSpots === undefined ? resolved : resolved.slice(0, maxSpots);
  }, [live.spots, resolveEnabled, maxSpots]);
  const activationSpots = useMemo(
    () =>
      activationsEnabled
        ? resolveActivationMarkers(activations.spots, maxSpots)
        : [],
    [activations.spots, activationsEnabled, maxSpots],
  );

  return { ...live, resolvedSpots, activationSpots };
}
