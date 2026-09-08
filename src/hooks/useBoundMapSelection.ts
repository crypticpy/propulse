import { useMemo, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { latLonToGrid } from "@/lib/utils/grid";
import type { DXSpot } from "@/types/dxcluster";
import type { TargetLocation } from "@/stores/mapStore";

/** Stable empty input for renderers that only need bound-target camera focus. */
export const EMPTY_VIEW_SPOTS: readonly DXSpot[] = [];

/** This view's selected report id. Never reads dxStore.selectedSpot. */
export function useBoundSelectedReportId(): string | undefined {
  const runtime = useViewRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.selectedReportId ?? undefined,
  );
}

function gridFromCoordinates(lat: number, lon: number): string | undefined {
  try {
    return latLonToGrid(lat, lon, 6);
  } catch {
    return undefined;
  }
}

/**
 * Visual target for this view: bound spot selection first, then a manual
 * mapStore pin/grid target. Bound metadata is derived from this runtime's
 * coordinates, never copied from an unrelated global pin.
 */
export function useBoundVisualTarget(
  mapTarget: TargetLocation | null,
): TargetLocation | null {
  const runtime = useViewRuntime();
  const bound = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.target,
  );
  return useMemo(() => {
    if (!bound) return mapTarget;
    return {
      lat: bound.lat,
      lon: bound.lon,
      grid: gridFromCoordinates(bound.lat, bound.lon),
    };
  }, [bound, mapTarget]);
}
