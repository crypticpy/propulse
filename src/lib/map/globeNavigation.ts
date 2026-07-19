/** Unit-sphere radius used by the PropSphere 3D renderer. */
export const GLOBE_RADIUS = 1;

const MIN_ALTITUDE = 1e-7;

export interface GlobeResolutionOptions {
  /** Highest native XYZ zoom level, inclusive. */
  maxZoom: number;
  /** Native source tile dimension in physical pixels. */
  tileSize: number;
  /** Rendered canvas height in physical pixels. */
  viewportHeight: number;
  /** Perspective camera vertical field of view, in degrees. */
  fieldOfView: number;
}

export interface GlobeNavigationTuning {
  zoomSpeed: number;
  rotateSpeed: number;
  autoRotateScale: number;
  near: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert an XYZ provider's native pixel resolution into a closest useful
 * camera distance. Stopping here avoids enlarging the provider's final tile
 * level while still allowing every native pixel to reach the display.
 */
export function getMinimumGlobeDistance({
  maxZoom,
  tileSize,
  viewportHeight,
  fieldOfView,
}: GlobeResolutionOptions): number {
  const safeZoom = clamp(Math.floor(maxZoom), 0, 30);
  const safeTileSize = Math.max(1, tileSize);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeFov = clamp(fieldOfView, 1, 179);

  const worldUnitsPerPixel =
    (2 * Math.PI * GLOBE_RADIUS) /
    (2 ** safeZoom * safeTileSize);
  const nativeViewHeight = worldUnitsPerPixel * safeViewportHeight;
  const altitude =
    nativeViewHeight / (2 * Math.tan((safeFov * Math.PI) / 360));

  return GLOBE_RADIUS + Math.max(MIN_ALTITUDE, altitude);
}

/**
 * OrbitControls rotates and dollies as a fraction of its distance from the
 * globe center. That feels natural from orbit but becomes wildly sensitive
 * near the surface. Scale both interactions by altitude so one pointer pixel
 * continues to represent roughly one ground pixel at street-level zoom.
 */
export function getGlobeNavigationTuning(
  cameraDistance: number,
  minimumDistance: number,
): GlobeNavigationTuning {
  const minimumAltitude = Math.max(
    MIN_ALTITUDE,
    minimumDistance - GLOBE_RADIUS,
  );
  const altitude = Math.max(
    minimumAltitude,
    cameraDistance - GLOBE_RADIUS,
  );
  const safeDistance = Math.max(cameraDistance, GLOBE_RADIUS);
  const localRotateFactor = 0.12 + 0.17 * altitude;

  return {
    zoomSpeed: clamp((3.5 * altitude) / safeDistance, 1e-6, 0.65),
    rotateSpeed: clamp(localRotateFactor * altitude, 1e-7, 0.5),
    autoRotateScale: clamp(altitude / 1.5, 1e-6, 1),
    near: clamp(altitude * 0.1, 1e-8, 0.05),
  };
}
