import { useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import type { ViewInteractionState, ViewPresentationPreferences } from "@/lib/views/contracts";

/** Bound-runtime presentation. Does not read mapStore or settingsStore. */
export function useViewPresentation(): ViewPresentationPreferences {
  const runtime = useViewRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().config.presentation,
  );
}

/** Bound-runtime interaction. Selection never falls back to dxStore. */
export function useViewInteraction(): ViewInteractionState {
  const runtime = useViewRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction,
  );
}
