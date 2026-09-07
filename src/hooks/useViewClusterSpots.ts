import { useMemo, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useDXCluster, type UseDXClusterOptions } from "@/hooks/useDXCluster";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { dxFiltersFromViewSpots, type RadioObservation } from "@/lib/views/runtime";
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
 * Cluster spots for the bound view. Ingestion stays in useDXCluster;
 * this only supplies per-runtime effective filters (including follow radio).
 */
export function useViewClusterSpots(options?: UseDXClusterOptions) {
  const spots = useViewEffectiveSpots();
  const filters = useMemo(() => dxFiltersFromViewSpots(spots), [spots]);
  return useDXCluster(filters, options);
}
