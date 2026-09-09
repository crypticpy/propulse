import { useEffect } from "react";

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
 * `SatelliteDetailModal` (`src/components/map/layers/SatelliteDetailModal.tsx`,
 * mounted by `PropSphere.tsx` underneath this view) used to need its own
 * `satelliteModalId` carve-out here because it rendered no `role`/`aria-modal`
 * attributes at all. Migrated to `AccessibleDialog` in #805, so it now
 * matches the predicate below like every other dialog and the carve-out was
 * deleted as genuinely redundant.
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
