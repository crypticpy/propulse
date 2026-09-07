import { useMemo, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useDXCluster, type UseDXClusterOptions } from "@/hooks/useDXCluster";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { dxFiltersFromViewSpots } from "@/lib/views/runtime";

/**
 * Cluster spots for the bound view. Ingestion stays in useDXCluster;
 * this only supplies per-runtime effective filters (including follow radio).
 */
export function useViewClusterSpots(options?: UseDXClusterOptions) {
  const runtime = useViewRuntime();
  const radio = useOperatingMonitor();
  const followRadio = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().config.context.followRadio,
  );
  const filters = useMemo(
    () => dxFiltersFromViewSpots(runtime.effectiveSpots(followRadio ? radio : null)),
    [runtime, radio, followRadio],
  );
  return useDXCluster(filters, options);
}
