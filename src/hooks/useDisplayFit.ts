/**
 * useDisplayFit — resolves the effective PropSphere layout fit (P1).
 *
 * On cramped viewports the desktop three-column layout squeezes the globe
 * into a sliver between the 280px/320px side panels. "auto" watches the
 * viewport and collapses the panels into the bottom tab strip when it is
 * too small; "compact"/"full" are explicit overrides persisted in mapStore
 * (and pushable per paired display via DisplaySceneConfig.layout).
 */

import { useState, useEffect } from "react";
import { useMapStore, type DisplayFit } from "@/stores/mapStore";

/**
 * The desktop layout turns its side panels on at lg (1024px), but under
 * ~1400px they leave the globe unusably narrow, and 720p-class wall TVs
 * run out of height once the header and info row are up.
 */
export const CRAMPED_VIEWPORT_QUERY =
  "(max-width: 1399px), (max-height: 759px)";

/** Pure resolution rule: explicit override wins, "auto" follows the viewport. */
export function resolveCompactFit(fit: DisplayFit, cramped: boolean): boolean {
  if (fit === "compact") return true;
  if (fit === "full") return false;
  return cramped;
}

/** True when the PropSphere page should use the compact (tabbed) layout. */
export function useDisplayFit(): boolean {
  const fit = useMapStore((s) => s.displayFit);
  const [cramped, setCramped] = useState(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(CRAMPED_VIEWPORT_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(CRAMPED_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setCramped(e.matches);
    mql.addEventListener("change", handler);
    setCramped(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return resolveCompactFit(fit, cramped);
}
