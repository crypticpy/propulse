/**
 * Sun Position Calculations
 *
 * Calculates the subsolar point (where the sun is directly overhead)
 * for a given date/time. Used for terminator and greyline visualization.
 * Uses the suncalc library for accurate astronomical calculations.
 */

import SunCalc from "suncalc";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Calculate the subsolar point (lat/lon where sun is directly overhead)
 * Uses suncalc for accurate positioning
 */
export function getSubsolarPoint(date: Date): { lat: number; lon: number } {
  // Get UTC hours as decimal
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  // Subsolar longitude: It's solar noon (sun overhead) at this longitude
  // At 12:00 UTC, sun is overhead at 0° longitude
  // Sun moves west 15° per hour
  let subsolarLon = (12 - utcHours) * 15;

  // Normalize to -180 to 180
  if (subsolarLon > 180) {
    subsolarLon -= 360;
  }
  if (subsolarLon < -180) {
    subsolarLon += 360;
  }

  // Get sun position to find declination (subsolar latitude)
  // Check altitude at equator on the subsolar meridian
  const sunPos = SunCalc.getPosition(date, 0, subsolarLon);

  // At equator on subsolar meridian, altitude = 90° - |declination|
  // So declination = 90° - altitude (with sign based on which hemisphere sun is in)
  const altAtEquator = sunPos.altitude * RAD_TO_DEG;

  // Sun's declination = 90 - altitude at equator (when on subsolar meridian)
  // Sign: check if sun is in northern or southern sky
  const sunPosNorth = SunCalc.getPosition(date, 45, subsolarLon);
  const sunPosSouth = SunCalc.getPosition(date, -45, subsolarLon);

  // If sun is higher from southern hemisphere, declination is negative
  const subsolarLat =
    sunPosNorth.altitude > sunPosSouth.altitude
      ? 90 - altAtEquator
      : -(90 - altAtEquator);

  return {
    lat: subsolarLat,
    lon: subsolarLon,
  };
}

/**
 * Check if a point is in daylight at the given time
 */
export function isPointInDaylight(
  lat: number,
  lon: number,
  date: Date,
): boolean {
  const sunPos = SunCalc.getPosition(date, lat, lon);
  return sunPos.altitude > 0;
}

/**
 * Get the angular distance from subsolar point (0 = directly under sun, 90 = terminator)
 */
export function getSolarAngle(lat: number, lon: number, date: Date): number {
  const subsolar = getSubsolarPoint(date);
  return getAngularDistance(lat, lon, subsolar.lat, subsolar.lon);
}

/**
 * Calculate angular distance between two points on a sphere (degrees)
 */
function getAngularDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const cosAngle =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * RAD_TO_DEG;
}

/**
 * Generate terminator points (the line where sun altitude = 0°)
 * Returns array of {lat, lon} points
 */
export function getTerminatorPoints(
  date: Date,
  numPoints: number = 360,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  // Sample longitudes and find where sun altitude crosses 0
  for (let i = 0; i < numPoints; i++) {
    const lon = (i / numPoints) * 360 - 180;

    // Binary search to find latitude where sun altitude = 0
    let latLow = -90;
    let latHigh = 90;

    // Check if terminator crosses this longitude
    const altAtNorth = SunCalc.getPosition(date, 89, lon).altitude;
    const altAtSouth = SunCalc.getPosition(date, -89, lon).altitude;

    // If both same sign, terminator doesn't cross at this longitude normally
    // But we still want to find the closest point to terminator
    if (altAtNorth * altAtSouth > 0) {
      // Both in daylight or both in night - find where altitude is closest to 0
      const altAtEquator = SunCalc.getPosition(date, 0, lon).altitude;
      if (Math.abs(altAtEquator) < Math.abs(altAtNorth)) {
        points.push({ lat: 0, lon });
      } else if (altAtNorth > 0) {
        points.push({ lat: 89, lon });
      } else {
        points.push({ lat: -89, lon });
      }
      continue;
    }

    // Binary search for terminator latitude
    for (let j = 0; j < 20; j++) {
      const latMid = (latLow + latHigh) / 2;
      const alt = SunCalc.getPosition(date, latMid, lon).altitude;

      if (alt * altAtSouth > 0) {
        latLow = latMid;
      } else {
        latHigh = latMid;
      }
    }

    points.push({ lat: (latLow + latHigh) / 2, lon });
  }

  return points;
}

/**
 * Get greyline band points (terminator ± offset degrees)
 * Returns two arrays: inner band and outer band
 */
export function getGreylineBand(
  date: Date,
  offsetDegrees: number = 15,
  numPoints: number = 180,
): {
  inner: Array<{ lat: number; lon: number }>;
  outer: Array<{ lat: number; lon: number }>;
} {
  const subsolar = getSubsolarPoint(date);
  const innerAngle = (90 - offsetDegrees) * DEG_TO_RAD;
  const outerAngle = (90 + offsetDegrees) * DEG_TO_RAD;

  const generateRing = (angle: number): Array<{ lat: number; lon: number }> => {
    const points: Array<{ lat: number; lon: number }> = [];
    const subsolarLat = subsolar.lat * DEG_TO_RAD;
    const subsolarLon = subsolar.lon * DEG_TO_RAD;

    for (let i = 0; i < numPoints; i++) {
      const theta = (i / numPoints) * 2 * Math.PI;

      // Spherical rotation from subsolar point
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);

      // Unit vector to subsolar point (standard geographic)
      const sx = Math.cos(subsolarLat) * Math.cos(subsolarLon);
      const sy = Math.cos(subsolarLat) * Math.sin(subsolarLon);
      const sz = Math.sin(subsolarLat);

      // Perpendicular vectors
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Build rotation basis
      const ex = -Math.sin(subsolarLon);
      const ey = Math.cos(subsolarLon);
      const ez = 0;

      const nnx = -Math.sin(subsolarLat) * Math.cos(subsolarLon);
      const nny = -Math.sin(subsolarLat) * Math.sin(subsolarLon);
      const nnz = Math.cos(subsolarLat);

      // Point at angle from subsolar
      const px = sx * cosAngle + (nnx * cosT + ex * sinT) * sinAngle;
      const py = sy * cosAngle + (nny * cosT + ey * sinT) * sinAngle;
      const pz = sz * cosAngle + (nnz * cosT + ez * sinT) * sinAngle;

      const lat = Math.asin(Math.max(-1, Math.min(1, pz))) * RAD_TO_DEG;
      const lon = Math.atan2(py, px) * RAD_TO_DEG;

      points.push({ lat, lon });
    }

    return points;
  };

  return {
    inner: generateRing(innerAngle),
    outer: generateRing(outerAngle),
  };
}
