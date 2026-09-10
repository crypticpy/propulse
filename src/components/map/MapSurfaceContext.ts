import { createContext, useContext } from "react";

/**
 * Moves focus to the map host's surface — the element that already wraps the
 * canvas and every DOM overlay, carrying `tabIndex={-1}` so it can be focused
 * programmatically without joining the tab order.
 *
 * A function rather than the element: it is stable for the life of the host,
 * so an overlay can call it from an effect cleanup without the element itself
 * ever being captured at a moment when it might not be mounted yet.
 */
export type FocusMapSurface = () => void;

/**
 * Map overlays portal out of the map subtree, and every host clears the
 * overlay that opened the next one inside the same handler that opens it
 * (`handleMapSpotSelect` in `GlobeView`, `FlatMapView` and `AzimuthalView`).
 * React batches those into a single commit, so by the time an overlay's focus
 * effect runs its opener is already detached and `document.activeElement` has
 * fallen back to `<body>`. `<body>` is not a restore target, which left a
 * keyboard user tabbing in from the top of the page after closing a spot
 * card. This is the focus home instead (#797).
 */
export const MapSurfaceContext = createContext<FocusMapSurface | null>(null);

/**
 * Null outside a map host. The overlays that consume this also render from
 * surfaces that own no map (the DX list, wall report tiles), so callers must
 * treat a missing surface as "leave focus where the browser put it".
 */
export function useMapSurfaceFocus(): FocusMapSurface | null {
  return useContext(MapSurfaceContext);
}
