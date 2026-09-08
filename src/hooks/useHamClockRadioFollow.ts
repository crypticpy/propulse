import { useEffect, useRef, useSyncExternalStore } from "react";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useMapStore } from "@/stores/mapStore";
import { useOperatingMonitor } from "./useOperatingMonitor";
import type { ScopedViewRuntime } from "@/lib/views/runtime";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";

/** Follow the display's radio even while its spots panel is hidden or collapsed. */
export function useHamClockRadioFollow() {
  const followRadio = useHamClockDisplayStore((s) => s.followRadio);
  const radio = useOperatingMonitor();
  const setSpotFilters = useMapStore((s) => s.setSpotFilters);
  const applyingRadioFilter = useRef(false);
  useEffect(() => {
    if (!followRadio) return;
    // A manual choice in either the band chips or the shared DX filters wins.
    return useMapStore.subscribe((current, previous) => {
      if (
        current.spotFilters !== previous.spotFilters &&
        !applyingRadioFilter.current
      ) {
        useHamClockDisplayStore.getState().setFollowRadio(false);
      }
    });
  }, [followRadio]);
  useEffect(() => {
    if (!followRadio || !radio) return;
    const filters = useMapStore.getState().spotFilters;
    if (
      filters.bands.length !== 1 ||
      filters.bands[0] !== radio.band ||
      filters.modes.length !== 1 ||
      filters.modes[0] !== radio.mode
    ) {
      applyingRadioFilter.current = true;
      try {
        setSpotFilters({ bands: [radio.band], modes: [radio.mode] });
      } finally {
        applyingRadioFilter.current = false;
      }
    }
  }, [followRadio, radio, setSpotFilters]);
}

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
