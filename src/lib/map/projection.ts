/**
 * Projection — a shared interface over the two 2D map projections
 * (equirectangular flat map, azimuthal equidistant disc) so canvas layers can
 * draw once against `Projection` instead of duplicating lat/lon → px math and
 * a per-view zoom-damping convention (#1091).
 */

import { azimuthalProject } from "@/lib/utils/azimuthal";

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371; // matches azimuthal.ts:13
const HALF_CIRCUMFERENCE_KM = Math.PI * EARTH_RADIUS_KM; // 20015.086

export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
  /** Normalised distance from the disc centre (0 at centre, 1 at the rim),
   * `Math.sqrt(p.x*p.x + p.y*p.y)` on the azimuthal projection's own
   * pre-radius-scale coordinates; undefined on the flat map, which has no
   * rim. Lets the shared borders layer (#1091) apply the disc's edge-drop
   * rule without reaching into the view's normalised-coordinate math. */
  rim?: number;
}

export interface LocalScale {
  /** Pixels per km along the undistorted axis: N-S on equirectangular, radial on the disc. */
  pxPerKm: number;
  /** Perpendicular-axis stretch relative to pxPerKm; 1 = isotropic; on the disc = k = c/sin(c). */
  stretch: number;
}

export interface Projection {
  readonly kind: "equirectangular" | "azimuthal";
  /** Raw view zoom, undamped. */
  readonly zoomScale: number;
  /** Horizontal period in user-space px, undefined when the projection does not repeat. Wrapping stays the layer's job. */
  readonly wrapWidth?: number;
  /** Canvas height in user-space px, set alongside `wrapWidth` on the
   * equirectangular projection (`addWrappedRingPath` needs both); undefined
   * on the disc, which has no wrap. */
  readonly wrapHeight?: number;
  /** The azimuthal disc's radius in user-space px; undefined on the flat
   * map. Lets the shared borders layer (#1091) compute the disc's
   * jump-break threshold without reaching into the view's own radius const. */
  readonly discRadiusPx?: number;
  /** The disc's centre in canvas px (`centerX`/`centerY` passed to
   * `createAzimuthalProjection`); undefined on the flat map. Lets the
   * shared night-side clip (#1091 PR 7) build its closing arc without
   * reaching into the view's own centre const. */
  readonly discCenterPx?: { x: number; y: number };
  project(lat: number, lon: number): ProjectedPoint;
  scaleAt(lat: number, lon: number): LocalScale;
  /** Convert an on-screen px size into this projection's user space (the flat map's zoomDamp). */
  screenPx(px: number): number;
}

export function createEquirectangularProjection(opts: {
  width: number;
  height: number;
  zoomScale: number;
}): Projection {
  const { width, height, zoomScale } = opts;
  const zoomDamp = Math.max(1, zoomScale); // same floor as every zoomDamp in the flat map view
  const pxPerKmNS = height / HALF_CIRCUMFERENCE_KM;
  const pxPerKmEWEquator = width / (2 * HALF_CIRCUMFERENCE_KM);
  return {
    kind: "equirectangular",
    zoomScale,
    wrapWidth: width,
    wrapHeight: height,
    discRadiusPx: undefined,
    discCenterPx: undefined,
    project: (lat, lon) => ({
      x: ((lon + 180) / 360) * width,
      y: ((90 - lat) / 180) * height,
      visible: true,
    }), // == the flat map view's latLonToCanvas helper
    scaleAt: (lat) => ({
      pxPerKm: pxPerKmNS,
      stretch:
        pxPerKmEWEquator /
        pxPerKmNS /
        Math.max(1e-6, Math.cos(lat * DEG_TO_RAD)),
    }),
    screenPx: (px) => px / zoomDamp,
  };
}

export function createAzimuthalProjection(opts: {
  centerLat: number;
  centerLon: number;
  centerX: number;
  centerY: number;
  radius: number;
  zoomScale: number;
  zoomDamp: number;
}): Projection {
  const {
    centerLat,
    centerLon,
    centerX,
    centerY,
    radius,
    zoomScale,
    zoomDamp,
  } = opts;
  const pxPerKmRadial = radius / HALF_CIRCUMFERENCE_KM; // exact: equidistant projection
  return {
    kind: "azimuthal",
    zoomScale,
    wrapWidth: undefined,
    wrapHeight: undefined,
    discRadiusPx: radius,
    discCenterPx: { x: centerX, y: centerY },
    project(lat, lon) {
      const p = azimuthalProject(lat, lon, centerLat, centerLon);
      return {
        x: centerX + p.x * radius,
        y: centerY + p.y * radius,
        // Differs from the old always-true flag only for non-finite
        // coordinates (NaN/Infinity fail every comparison, including this
        // one) -- do not simplify this back to a constant `true`.
        visible: Math.hypot(p.x, p.y) <= 1 + 1e-9,
        // Same expression `drawAzimuthalBorders`/`drawAzimuthalStateBorders`
        // used inline before #1091: Math.sqrt, not Math.hypot, to stay
        // bit-identical with the pre-refactor rim-drop check.
        rim: Math.sqrt(p.x * p.x + p.y * p.y),
      }; // == the azimuthal view's projToCanvas helper; antipode sits exactly on 1
    },
    scaleAt(lat, lon) {
      const { distance } = azimuthalProject(lat, lon, centerLat, centerLon);
      const c = Math.min(
        Math.max(distance / EARTH_RADIUS_KM, 1e-6),
        Math.PI - 1e-4,
      );
      return { pxPerKm: pxPerKmRadial, stretch: c / Math.sin(c) };
    },
    screenPx: (px) => px / zoomDamp,
  };
}
