import { useMemo, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import type { TargetLocation } from "@/stores/mapStore";

/** This view's selected report id. Never reads dxStore.selectedSpot. */
export function useBoundSelectedReportId(): string | undefined {
  const runtime = useViewRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.selectedReportId ?? undefined,
  );
}

/**
 * Visual target for this view: bound spot selection first, then a manual
 * mapStore pin/grid target. Manual origin has no runtime command yet.
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
      grid: mapTarget?.grid,
      name: mapTarget?.name,
    };
  }, [bound, mapTarget]);
}
