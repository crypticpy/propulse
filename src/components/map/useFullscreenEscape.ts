import { useEffect } from "react";
import { useMapStore } from "@/stores/mapStore";

export interface UseFullscreenEscapeOptions {
  observatoryMode: boolean;
  exitObservatory: () => void;
  setAmbientMode: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
}

/**
 * Escape key handler for `FullscreenPropSphere`: observatory mode exits
 * observatory, otherwise exits fullscreen. Registered on `document` in the
 * bubble phase, so it must yield to any dialog above it instead of firing
 * alongside that dialog's own Escape handler (see issue #801).
 *
 * `AccessibleDialog` surfaces are already safe without help from this
 * handler — they own Escape via a `document` capture-phase listener that
 * calls `stopImmediatePropagation()`, which halts the dispatch before it
 * ever reaches this bubble-phase listener. The `document.querySelector`
 * check below exists for the modals that predate that pattern: they close
 * themselves from their own bubble-phase `document` listener, where
 * `stopPropagation()` is a no-op against sibling listeners on the same
 * node. Matching the `aria-modal` *value* (not just the attribute) is
 * load-bearing: `SelectedSpotCard` renders `role="dialog"
 * aria-modal="false"` as a non-modal companion panel, and it must not
 * suppress the fullscreen exit. Kept character-identical to the predicate
 * `PathPointInspector` uses (merged cccf61f3).
 *
 * The `satelliteModalId` check stays even though the predicate above covers
 * every `AccessibleDialog`-style modal: `SatelliteDetailModal`
 * (`src/components/map/layers/SatelliteDetailModal.tsx`, mounted by
 * `PropSphere.tsx` underneath this view) closes itself from its own
 * bubble-phase `document` listener and renders no `role`/`aria-modal`
 * attributes at all, so the querySelector below can never see it. Do not
 * delete this check without first giving that modal real dialog semantics.
 */
export function useFullscreenEscape({
  observatoryMode,
  exitObservatory,
  setAmbientMode,
  setFullscreen,
}: UseFullscreenEscapeOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An open satellite modal owns Escape (it closes itself) — see the
      // doc comment above for why this can't be folded into the predicate
      // below.
      if (useMapStore.getState().satelliteModalId !== null) return;
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
        )
      ) {
        return;
      }
      if (observatoryMode) {
        exitObservatory();
        setAmbientMode(false);
      } else {
        setFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [observatoryMode, exitObservatory, setFullscreen, setAmbientMode]);
}
