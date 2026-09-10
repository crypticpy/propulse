import { useCallback } from "react";
import type { ReactNode, RefObject } from "react";
import { MapSurfaceContext } from "./MapSurfaceContext";

export interface MapSurfaceProps {
  /**
   * The host's own ref for the surface element. Passed in rather than owned
   * here because `FlatMapView` and `AzimuthalView` already measure and
   * hit-test against this element.
   */
  surfaceRef: RefObject<HTMLDivElement>;
  /**
   * Accessible name for the surface. Focus is deliberately moved here when an
   * overlay closes and its opener is gone, so a screen reader has to be able
   * to say where focus went — an unnamed generic `div` announces nothing and
   * would leave a screen-reader user worse off than the bug this fixes. Short
   * and distinct per host: "Globe map", "Flat map", "Azimuthal map".
   */
  label: string;
  className: string;
  children: ReactNode;
}

/**
 * The map host's root element, plus the focus home its overlays restore to.
 *
 * This renders the same single `<div>` each host already had — it adds no DOM
 * node — and contributes three things: `tabIndex={-1}`, which makes the
 * surface a programmatic focus target without putting it in the tab order; a
 * named `region` so a screen reader announces where focus landed; and the
 * `MapSurfaceContext` value that lets a portaled overlay send focus back here
 * when the element that opened it has been unmounted (#797).
 */
export function MapSurface({
  surfaceRef,
  label,
  className,
  children,
}: MapSurfaceProps) {
  const focusSurface = useCallback(() => {
    surfaceRef.current?.focus();
  }, [surfaceRef]);

  return (
    <MapSurfaceContext.Provider value={focusSurface}>
      <div
        ref={surfaceRef}
        tabIndex={-1}
        role="region"
        aria-label={label}
        data-map-surface
        className={className}
      >
        {children}
      </div>
    </MapSurfaceContext.Provider>
  );
}

export default MapSurface;
