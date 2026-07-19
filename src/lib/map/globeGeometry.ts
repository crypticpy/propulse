export type GlobeScale = [number, number, number];

/**
 * Convert an ellipsoid with X/Y equatorial axes and a Z polar axis into the
 * unit sphere used by Propulse overlays and navigation.
 */
export function getUnitSphereScale(
  equatorialRadius: number,
  polarRadius: number,
): GlobeScale {
  if (!Number.isFinite(equatorialRadius) || equatorialRadius <= 0) {
    throw new RangeError("Equatorial radius must be a positive finite number");
  }
  if (!Number.isFinite(polarRadius) || polarRadius <= 0) {
    throw new RangeError("Polar radius must be a positive finite number");
  }

  return [
    1 / equatorialRadius,
    1 / equatorialRadius,
    1 / polarRadius,
  ];
}
