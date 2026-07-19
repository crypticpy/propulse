export type GlobeScale = [number, number, number];

/**
 * Convert an ellipsoid with X/Y equatorial axes and a Z polar axis into the
 * unit sphere used by Propulse overlays and navigation.
 */
export function getUnitSphereScale(
  equatorialRadius: number,
  polarRadius: number,
): GlobeScale {
  const safeEquatorialRadius = Math.max(Number.EPSILON, equatorialRadius);
  const safePolarRadius = Math.max(Number.EPSILON, polarRadius);

  return [
    1 / safeEquatorialRadius,
    1 / safeEquatorialRadius,
    1 / safePolarRadius,
  ];
}
