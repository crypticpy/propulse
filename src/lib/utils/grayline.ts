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

// ─── Gray Line Enhancement Quantification ────────────────────────────────────

/**
 * Quantified gray line propagation enhancement at a point.
 */
export interface GrayLineEnhancement {
  /** Whether this point is currently in the gray line zone */
  inZone: boolean;
  /** D-layer absorption reduction in dB (0 at edge, up to 15 dB at zone center) */
  absorptionReduction: number;
  /** Enhancement factor 0.0 (no enhancement) to 1.0 (maximum enhancement at terminator) */
  enhancementFactor: number;
  /** Angular distance from the subsolar point in degrees */
  angularDistanceFromSubsolar: number;
  /** Estimated gray line duration at this latitude in minutes */
  durationMinutes: number;
}

/**
 * Mutual gray line window for a two-station path.
 */
export interface GrayLineWindow {
  /** Whether both endpoints are currently in gray line simultaneously */
  isActive: boolean;
  /** Next mutual gray line window start (within 24h), or null if none */
  windowStart: Date | null;
  /** Next mutual gray line window end, or null if none */
  windowEnd: Date | null;
  /** Peak enhancement in dB during the mutual window */
  peakEnhancement: number;
  /** Time of maximum mutual enhancement, or null if none */
  optimalTime: Date | null;
}

/**
 * Calculate the angular distance from a point to the subsolar point.
 */
function angularDistanceFromSubsolar(
  lat: number,
  lon: number,
  date: Date,
): number {
  const subsolar = getSubsolarPoint(date);
  const phi1 = lat * DEG_TO_RAD;
  const phi2 = subsolar.lat * DEG_TO_RAD;
  const deltaLambda = (lon - subsolar.lon) * DEG_TO_RAD;

  const cosAngle =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * RAD_TO_DEG;
}

/**
 * Estimate the gray line zone duration at a given latitude.
 *
 * At the equator, the terminator moves fastest (~27.8 km/min at the equator,
 * or about 0.25°/min). The ±5° zone takes ~40 minutes to pass.
 * At high latitudes, the terminator moves slower, and gray line lasts longer.
 * Near the poles during equinoxes, it can last hours.
 */
function estimateGrayLineDuration(latDeg: number): number {
  const absLat = Math.abs(latDeg);
  // Base duration at equator: ~40 minutes for 10-degree zone
  // Increases with latitude due to slower terminator movement
  // cos(lat) factor for terminator speed, plus extra time at high latitudes
  const cosLat = Math.cos(absLat * DEG_TO_RAD);
  if (cosLat < 0.05) {
    // Near poles, gray line can last very long during equinox
    return 360;
  }
  const baseDuration = 40;
  return Math.round(baseDuration / cosLat);
}

/**
 * Get quantified gray line propagation enhancement at a specific point.
 *
 * The enhancement is strongest at the terminator center (90° from subsolar)
 * and tapers to zero at the zone edges (85° and 95° from subsolar).
 *
 * Maximum absorption reduction is ~15 dB at the terminator center,
 * primarily benefiting low-frequency bands (160m, 80m) where D-layer
 * absorption is the dominant loss factor.
 */
export function getGrayLineEnhancement(
  lat: number,
  lon: number,
  date: Date,
): GrayLineEnhancement {
  const angDist = angularDistanceFromSubsolar(lat, lon, date);
  const durationMinutes = estimateGrayLineDuration(lat);

  // Check if in the ±5° gray line zone (85° to 95° from subsolar)
  const inZone = angDist >= 85 && angDist <= 95;

  if (!inZone) {
    return {
      inZone: false,
      absorptionReduction: 0,
      enhancementFactor: 0,
      angularDistanceFromSubsolar: angDist,
      durationMinutes,
    };
  }

  // Enhancement factor: peaks at 90° (terminator center), 0 at 85° and 95°
  // Use a cosine taper for smooth transition
  const distFromTerminator = Math.abs(angDist - 90); // 0 at center, 5 at edge
  const enhancementFactor = Math.cos((distFromTerminator / 5) * (Math.PI / 2));

  // Maximum absorption reduction at center: ~15 dB
  // This reflects the D-layer collapse at the day/night boundary
  const MAX_ABSORPTION_REDUCTION_DB = 15;
  const absorptionReduction = MAX_ABSORPTION_REDUCTION_DB * enhancementFactor;

  return {
    inZone: true,
    absorptionReduction: Math.round(absorptionReduction * 10) / 10,
    enhancementFactor: Math.round(enhancementFactor * 1000) / 1000,
    angularDistanceFromSubsolar: Math.round(angDist * 100) / 100,
    durationMinutes,
  };
}

/**
 * Find the mutual gray line window for a two-station path.
 *
 * Scans the next 24 hours in 5-minute increments looking for times when
 * both endpoints are simultaneously in the gray line zone.
 */
export function getPathGrayLineWindow(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  date: Date,
): GrayLineWindow {
  const SCAN_HOURS = 24;
  const STEP_MINUTES = 5;
  const totalSteps = (SCAN_HOURS * 60) / STEP_MINUTES;

  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;
  let peakEnhancement = 0;
  let optimalTime: Date | null = null;
  let isCurrentlyActive = false;
  let inWindow = false;

  for (let step = 0; step <= totalSteps; step++) {
    const checkTime = new Date(date.getTime() + step * STEP_MINUTES * 60_000);
    const startEnh = getGrayLineEnhancement(startLat, startLon, checkTime);
    const endEnh = getGrayLineEnhancement(endLat, endLon, checkTime);

    const bothInZone = startEnh.inZone && endEnh.inZone;

    if (bothInZone) {
      const mutualEnhancement =
        (startEnh.absorptionReduction + endEnh.absorptionReduction) / 2;

      if (!inWindow) {
        // Window just started
        inWindow = true;
        if (!windowStart) {
          windowStart = checkTime;
        }
        if (step === 0) {
          isCurrentlyActive = true;
        }
      }

      if (mutualEnhancement > peakEnhancement) {
        peakEnhancement = mutualEnhancement;
        optimalTime = checkTime;
      }
    } else if (inWindow) {
      // Window just ended
      inWindow = false;
      if (!windowEnd) {
        windowEnd = checkTime;
      }
      // Only find the first window
      break;
    }
  }

  // If window was still active at end of scan
  if (inWindow && !windowEnd && windowStart) {
    windowEnd = new Date(date.getTime() + SCAN_HOURS * 60 * 60_000);
  }

  return {
    isActive: isCurrentlyActive,
    windowStart,
    windowEnd,
    peakEnhancement: Math.round(peakEnhancement * 10) / 10,
    optimalTime,
  };
}
