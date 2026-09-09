import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useDXCluster, type UseDXClusterOptions } from "@/hooks/useDXCluster";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS } from "@/lib/hamclock/clusterBridge";
import {
  dxFiltersFromViewSpots,
  filterDxSpotsForView,
  type RadioObservation,
} from "@/lib/views/runtime";
import type { SpotPresentationPreferences } from "@/lib/views/spotContracts";

function observation(
  radio: { band: string; mode: string } | null,
): RadioObservation | null {
  return radio ? { band: radio.band, mode: radio.mode } : null;
}

/** Configured + derived follow overlay for the bound runtime only. */
export function useViewEffectiveSpots(): SpotPresentationPreferences {
  const runtime = useViewRuntime();
  const radio = useOperatingMonitor();
  const snapshot = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot(),
  );
  const spotsConfig = snapshot.config.spots;
  const follow = snapshot.config.context.followRadio;
  return useMemo(
    () => (follow ? runtime.effectiveSpots(observation(radio)) : spotsConfig),
    [runtime, spotsConfig, follow, radio],
  );
}

/**
 * Patch this view's own configured spot filters (`config.spots.filters`) —
 * the same field `useViewEffectiveSpots` reads when follow-radio is off.
 * Writes only the bound runtime, never `mapStore`/`dxStore`. Does not touch
 * follow-radio; a caller representing a manual band/mode choice must clear
 * it separately via the runtime's follow-radio control.
 */
export function useViewSpotFilterPatch() {
  const runtime = useViewRuntime();
  return useCallback(
    (patch: Partial<SpotPresentationPreferences["filters"]>) => {
      const snapshot = runtime.getSnapshot();
      runtime.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: { ...snapshot.config.spots.filters, ...patch },
        },
      });
    },
    [runtime],
  );
}

/**
 * Cluster spots for the bound view. Ingestion stays in useDXCluster;
 * SP-04 matching (categories, aliases, unknown/inferred, sources, limits)
 * is applied after ingest so legacy exact-match modes cannot discard rows.
 */
export function useViewClusterSpots(options?: UseDXClusterOptions) {
  const spots = useViewEffectiveSpots();
  const ingestFilters = useMemo(() => dxFiltersFromViewSpots(spots), [spots]);
  const cluster = useDXCluster(ingestFilters, options);
  const { matching, mapBudgeted } = useMemo(() => {
    const nowMs = Date.now();
    const futureToleranceMs = cluster.source === "bridge"
      ? CLUSTER_BRIDGE_FUTURE_TOLERANCE_MS
      : 0;
    return filterDxSpotsForView(cluster.allSpots, spots, nowMs, futureToleranceMs);
  }, [cluster.allSpots, cluster.source, spots]);
  return {
    ...cluster,
    spots: matching,
    mapSpots: mapBudgeted,
    listTotal: matching.length,
    mapBudget: spots.filters.spotLimit,
  };
}
