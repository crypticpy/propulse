/** Ray-casting point-in-polygon. Rings are [lat, lon][]. */
export function pointInRing(
  lat: number,
  lon: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i]![0];
    const xi = ring[i]![1];
    const yj = ring[j]![0];
    const xj = ring[j]![1];
    const intersects = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInRings(
  lat: number,
  lon: number,
  rings: readonly (readonly (readonly [number, number])[])[],
): boolean {
  return rings.some((ring) => pointInRing(lat, lon, ring));
}

/** Exterior minus holes. Used for Canadian polygons that retain lakes/islands. */
export function pointInPolygonWithHoles(
  lat: number,
  lon: number,
  exterior: readonly (readonly [number, number])[],
  holes: readonly (readonly (readonly [number, number])[])[] = [],
): boolean {
  if (!pointInRing(lat, lon, exterior)) return false;
  return !holes.some((hole) => pointInRing(lat, lon, hole));
}
