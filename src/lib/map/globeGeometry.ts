import { WGS84_RADIUS } from "3d-tiles-renderer/core";
import { Ellipsoid } from "3d-tiles-renderer/three";

export type GlobeScale = [number, number, number];

export interface UnitGlobeProjection {
  ellipsoidRadii: GlobeScale;
  scale: GlobeScale;
}

/**
 * Describe a spherical metre-based tile surface and the uniform transform
 * that maps it into the unit globe used by Propulse overlays and navigation.
 * The tile renderer requires a uniform world transform for correct
 * screen-space-error calculations.
 */
export function getUnitGlobeProjection(radius: number): UnitGlobeProjection {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Globe radius must be a positive finite number");
  }

  const scale = 1 / radius;
  return {
    ellipsoidRadii: [radius, radius, radius],
    scale: [scale, scale, scale],
  };
}

/** Shared geometry for every tile layer rendered on the unit globe. */
export const UNIT_GLOBE_PROJECTION = getUnitGlobeProjection(WGS84_RADIUS);
export const UNIT_GLOBE_SCALE = UNIT_GLOBE_PROJECTION.scale;
export const UNIT_GLOBE_ELLIPSOID = new Ellipsoid(
  ...UNIT_GLOBE_PROJECTION.ellipsoidRadii,
);
