/**
 * Gray Line Propagation Zone Utilities
 *
 * Computes the enhanced gray line propagation zone -- the +/-5 degree region
 * around the solar terminator (90 degree solar zenith angle) where HF
 * propagation is enhanced due to ionospheric conditions at the day/night
 * boundary.
 *
 * The terminator sits at 90 degrees from the subsolar point. The inner
 * boundary (day side) is at 85 degrees and the outer boundary (night side)
 * is at 95 degrees, forming a 10-degree-wide band centered on the
 * terminator.
 */

import { getSubsolarPoint } from "./sun";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Generate a ring of lat/lon points at a fixed angular distance from the
 * subsolar point using spherical rotation.
 *
 * This mirrors the approach used in `getGreylineBand` from sun.ts but
 * is self-contained for the gray line zone computation.
 *
 * @param subsolarLat - Subsolar latitude in degrees
 * @param subsolarLon - Subsolar longitude in degrees
 * @param angleDegrees - Angular distance from subsolar point in degrees
 * @param numPoints - Number of points to generate around the ring
 * @returns Array of {lat, lon} points tracing the ring
 */
function generateRing(
  subsolarLat: number,
  subsolarLon: number,
  angleDegrees: number,
  numPoints: number,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];
  const angle = angleDegrees * DEG_TO_RAD;
  const sLat = subsolarLat * DEG_TO_RAD;
  const sLon = subsolarLon * DEG_TO_RAD;

  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);

  // Unit vector toward the subsolar point in Cartesian (geographic convention)
  const sx = Math.cos(sLat) * Math.cos(sLon);
  const sy = Math.cos(sLat) * Math.sin(sLon);
  const sz = Math.sin(sLat);

  // Two perpendicular basis vectors in the tangent plane at the subsolar point
  // East direction
  const ex = -Math.sin(sLon);
  const ey = Math.cos(sLon);
  const ez = 0;

  // North direction (cross product of subsolar and east)
  const nx = -Math.sin(sLat) * Math.cos(sLon);
  const ny = -Math.sin(sLat) * Math.sin(sLon);
  const nz = Math.cos(sLat);

  for (let i = 0; i < numPoints; i++) {
    const theta = (i / numPoints) * 2 * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Point at the given angular distance from the subsolar point,
    // rotated around the subsolar axis by theta
    const px = sx * cosAngle + (nx * cosT + ex * sinT) * sinAngle;
    const py = sy * cosAngle + (ny * cosT + ey * sinT) * sinAngle;
    const pz = sz * cosAngle + (nz * cosT + ez * sinT) * sinAngle;

    const lat = Math.asin(Math.max(-1, Math.min(1, pz))) * RAD_TO_DEG;
    const lon = Math.atan2(py, px) * RAD_TO_DEG;

    points.push({ lat, lon });
  }

  return points;
}

/**
 * Compute the gray line propagation zone boundaries.
 *
 * The zone extends +/-5 degrees from the solar terminator (90 degree solar
 * zenith angle). Returns arrays of {lat, lon} points for the inner and
 * outer boundaries.
 *
 * - Inner boundary: 85 degrees from subsolar point (5 degrees before
 *   terminator, on the day side)
 * - Outer boundary: 95 degrees from subsolar point (5 degrees past
 *   terminator, on the night side)
 *
 * @param date - Date/time to compute the zone for
 * @param numPoints - Number of points per boundary ring (default 180)
 * @returns Object with innerBound and outerBound point arrays
 */
export function getGrayLineZone(
  date: Date,
  numPoints: number = 180,
): {
  innerBound: Array<{ lat: number; lon: number }>;
  outerBound: Array<{ lat: number; lon: number }>;
} {
  const subsolar = getSubsolarPoint(date);

  // Inner boundary: 85 degrees from subsolar (day side of terminator)
  const innerBound = generateRing(subsolar.lat, subsolar.lon, 85, numPoints);

  // Outer boundary: 95 degrees from subsolar (night side of terminator)
  const outerBound = generateRing(subsolar.lat, subsolar.lon, 95, numPoints);

  return { innerBound, outerBound };
}

/**
 * Check if a lat/lon point is within the gray line propagation zone.
 *
 * The zone is the region between 85 and 95 degrees angular distance from
 * the subsolar point (i.e., within 5 degrees of the terminator on either
 * side).
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @param date - Date/time to check against
 * @returns true if the point falls within the +/-5 degree gray line zone
 */
export function isInGrayLineZone(
  lat: number,
  lon: number,
  date: Date,
): boolean {
  const subsolar = getSubsolarPoint(date);

  // Compute angular distance between the point and the subsolar point
  // using the spherical law of cosines
  const phi1 = lat * DEG_TO_RAD;
  const phi2 = subsolar.lat * DEG_TO_RAD;
  const deltaLambda = (lon - subsolar.lon) * DEG_TO_RAD;

  const cosAngle =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const angularDistance =
    Math.acos(Math.max(-1, Math.min(1, cosAngle))) * RAD_TO_DEG;

  // The terminator is at 90 degrees; the zone extends from 85 to 95
  return angularDistance >= 85 && angularDistance <= 95;
}
