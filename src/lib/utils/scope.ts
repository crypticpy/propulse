/**
 * QTH scope projection (G18)
 *
 * Pure math for the circular range-ring scope: project geographic points
 * onto a unit disc centered on the operator's QTH, with true north up.
 * Rendering (canvas) and audio live with the card; nothing here touches
 * the DOM.
 *
 * @module lib/utils/scope
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** Great-circle distance in km between two lat/lon points (unrounded) */
export function greatCircleKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2));
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial great-circle bearing in degrees (0 = north, 90 = east) */
export function initialBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

export interface ScopeBlip {
  /** Unit-disc coordinates: x east, y south (canvas convention), |r| ≤ 1 */
  x: number;
  y: number;
  distanceKm: number;
  bearingDeg: number;
}

/**
 * Project a point onto the unit scope disc around the QTH.
 * Returns null when the point lies beyond the scope range.
 */
export function projectToScope(
  qthLat: number,
  qthLon: number,
  lat: number,
  lon: number,
  maxRangeKm: number,
): ScopeBlip | null {
  const distanceKm = greatCircleKm(qthLat, qthLon, lat, lon);
  if (distanceKm > maxRangeKm) return null;
  const bearingDeg = initialBearingDeg(qthLat, qthLon, lat, lon);
  const r = distanceKm / maxRangeKm;
  const theta = toRad(bearingDeg);
  return {
    x: Math.sin(theta) * r,
    y: -Math.cos(theta) * r,
    distanceKm,
    bearingDeg,
  };
}
