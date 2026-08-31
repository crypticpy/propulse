/**
 * useShareParams Hook
 *
 * Handles loading shared state from URL parameters on app load.
 * Checks for share params and applies them to the map store.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useMapStore } from "@/stores/mapStore";
import { decodeShareState, hasShareParams } from "@/lib/utils/shareState";

/**
 * Hook to apply shared state from URL parameters
 * Should be used once at the top level of the PropSphere page
 */
export function useShareParams(): { wasSharedLink: boolean } {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedRef = useRef(false);
  const wasSharedLinkRef = useRef(false);

  useEffect(() => {
    // Only apply once on mount
    if (appliedRef.current) {
      return;
    }
    appliedRef.current = true;

    // Check if URL has share params
    if (!hasShareParams(searchParams)) {
      return;
    }

    wasSharedLinkRef.current = true;

    // Decode the share state
    const sharedState = decodeShareState(searchParams);
    if (!sharedState) {
      return;
    }

    // Apply to map store
    const store = useMapStore.getState();

    if (sharedState.viewMode) {
      store.setViewMode(sharedState.viewMode);
    }

    if (typeof sharedState.timeOffset === "number") {
      store.setTimeOffset(sharedState.timeOffset);
    }

    if (sharedState.layers) {
      // A share URL represents a complete view, not a patch over this device's
      // saved preferences. The store resets every non-encoded layer to its
      // deterministic baseline before applying these eight public flags.
      store.applySharedLayers(sharedState.layers);
    }

    if (sharedState.pathMode) {
      store.setPathMode(sharedState.pathMode);
    }

    if (sharedState.target) {
      store.setTarget(sharedState.target);
    }

    // Clear the URL params after applying (to avoid re-applying on refresh)
    // Keep the URL clean but preserve the applied state
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [searchParams, setSearchParams]);

  return { wasSharedLink: wasSharedLinkRef.current };
}

export default useShareParams;
