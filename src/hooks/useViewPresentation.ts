import { useCallback, useSyncExternalStore } from "react";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import type {
  ViewInteractionState,
  ViewPresentationPreferences,
  WorkingViewPatch,
} from "@/lib/views/contracts";

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

/** Replace this view's presentation slice. Never writes settingsStore or mapStore. */
export function useUpdateViewPresentation() {
  const runtime = useViewRuntime();
  return useCallback((presentation: ViewPresentationPreferences) => {
    runtime.updateWorkingView({ presentation });
  }, [runtime]);
}

/** Working-view patches for the bound runtime only. */
export function useViewWorkingPatch() {
  const runtime = useViewRuntime();
  return useCallback((patch: WorkingViewPatch) => {
    runtime.updateWorkingView(patch);
  }, [runtime]);
}
