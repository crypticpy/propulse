import { useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";
import type { TargetLocation } from "@/stores/mapStore";

/** Stable empty input for renderers that only need bound-target camera focus. */
export const EMPTY_VIEW_SPOTS: readonly DXSpot[] = [];

/**
 * This view's selected report id. The runtime is the authority when it has
 * a value; otherwise falls back to dxStore.selectedSpot, since legacy
 * writers (DXSpotList row click, BandMap, wall BandTopDx) still set the
 * store directly without touching the runtime (see PR #603 NEW-2).
 */
export function useBoundSelectedReportId(): string | undefined {
  const runtime = useViewRuntime();
  const runtimeId = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.selectedReportId ?? undefined,
  );
  const dxSelectedId = useDXStore((s) => s.selectedSpot?.id);
  return runtimeId ?? dxSelectedId;
}

/**
 * Visual target for this view. `mapStore` remains the single visual target
 * for now — the runtime-bound selection is written in parallel
 * (`commitViewSpotSelection`) but is not yet read here, because ~14 other
 * consumers still read `mapStore.target` directly and would disagree with a
 * view that preferred the bound value. Restoring bound-selection precedence
 * (and removing this pass-through) is tracked in #707.
 */
export function useBoundVisualTarget(
  mapTarget: TargetLocation | null,
): TargetLocation | null {
  return mapTarget;
}
