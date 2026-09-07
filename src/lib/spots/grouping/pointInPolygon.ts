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

export function ringArea(ring: readonly (readonly [number, number])[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += ring[j]![1] * ring[i]![0] - ring[i]![1] * ring[j]![0];
  }
  return Math.abs(area) / 2;
}

export interface ClosestRingPoint {
  lat: number;
  lon: number;
  dist: number;
}

/** Cartesian degrees; adequate for ~0.03° coastal snaps. */
export function closestPointOnRing(
  lat: number,
  lon: number,
  ring: readonly (readonly [number, number])[],
): ClosestRingPoint {
  let best: ClosestRingPoint = { lat: ring[0]?.[0] ?? lat, lon: ring[0]?.[1] ?? lon, dist: Number.POSITIVE_INFINITY };
  if (ring.length < 2) return best;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [ay, ax] = ring[i]!;
    const [by, bx] = ring[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / length2));
    const closestLon = ax + t * dx;
    const closestLat = ay + t * dy;
    const dist = Math.hypot(lon - closestLon, lat - closestLat);
    if (dist < best.dist) best = { lat: closestLat, lon: closestLon, dist };
  }
  return best;
}

export function minDistanceToRing(
  lat: number,
  lon: number,
  ring: readonly (readonly [number, number])[],
): number {
  return closestPointOnRing(lat, lon, ring).dist;
}
