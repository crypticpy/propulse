import { useCallback, useSyncExternalStore } from "react";
import { useOperatingMonitor } from "./useOperatingMonitor";
import type { ScopedViewRuntime } from "@/lib/views/runtime";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";

/**
 * Follow radio for one bound runtime. Manual band/mode edits disable follow
 * inside that runtime only (`updateWorkingView`). Missing radio pauses
 * following without writing filters or issuing a tune. This hook never writes
 * mapStore or hamclockDisplayStore.
 */
export function useViewRadioFollow(runtime: ScopedViewRuntime) {
  const radio = useOperatingMonitor();
  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.followStatus(radio ? { band: radio.band, mode: radio.mode } : null),
  );
}

export function useBoundViewRadioFollow() {
  useViewRadioFollow(useViewRuntime());
}

export interface ViewFollowRadioControl {
  followRadio: boolean;
  setFollowRadio: (next: boolean) => void;
}

/**
 * Read/write `config.context.followRadio` for the bound view — the field
 * `useViewEffectiveSpots` (useViewClusterSpots.ts) reads to decide whether
 * the radio overrides the configured band/mode filters. Any wall control
 * that lets an operator toggle follow-radio must go through this: nothing
 * reads `hamclockDisplayStore.followRadio` any more.
 */
export function useViewFollowRadioControl(): ViewFollowRadioControl {
  const runtime = useViewRuntime();
  const followRadio = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().config.context.followRadio,
  );
  const setFollowRadio = useCallback(
    (next: boolean) => {
      const context = runtime.getSnapshot().config.context;
      if (context.followRadio === next) return;
      runtime.updateWorkingView({ context: { ...context, followRadio: next } });
    },
    [runtime],
  );
  return { followRadio, setFollowRadio };
}
