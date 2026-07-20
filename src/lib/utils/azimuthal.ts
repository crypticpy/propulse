/**
 * Azimuthal Equidistant Projection Utilities
 *
 * Provides projection functions for the azimuthal equidistant map projection,
 * which is extremely useful for ham radio operators because great circle paths
 * appear as straight lines from the center point.
 *
 * The projection is centered on the user's QTH (home station location).
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/**
 * Result of projecting a point to azimuthal equidistant coordinates
 */
export interface AzimuthalPoint {
  /** X coordinate, normalized to -1 to 1 (0 = center) */
  x: number;
  /** Y coordinate, normalized to -1 to 1 (0 = center) */
  y: number;
  /** Great circle distance from center in km */
  distance: number;
  /** Bearing from center in degrees (0 = north, 90 = east) */
  bearing: number;
  /** Whether the point is visible (always true for azimuthal equidistant) */
  visible: boolean;
}

/**
 * Project a lat/lon point to azimuthal equidistant coordinates
 * centered on the user's QTH.
 *
 * In this projection:
 * - The center point (QTH) is at (0, 0)
 * - All points are shown at their true distance and bearing from center
 * - Great circle paths through the center appear as straight lines
 * - The outer edge represents the antipodal point (max distance = 20,015 km)
 *
 * @param lat - Latitude of the point to project
 * @param lon - Longitude of the point to project
 * @param centerLat - Latitude of the center (QTH)
 * @param centerLon - Longitude of the center (QTH)
 * @returns Projected coordinates and metadata
 */
export function azimuthalProject(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
): AzimuthalPoint {
  // Convert to radians
  const phi1 = centerLat * DEG_TO_RAD;
  const lambda0 = centerLon * DEG_TO_RAD;
  const phi = lat * DEG_TO_RAD;
  const lambda = lon * DEG_TO_RAD;

  // Calculate great circle distance (angular distance c)
  const cosPhi1 = Math.cos(phi1);
  const sinPhi1 = Math.sin(phi1);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const deltaLambda = lambda - lambda0;
  const cosDeltaLambda = Math.cos(deltaLambda);
  const sinDeltaLambda = Math.sin(deltaLambda);

  const cosC = sinPhi1 * sinPhi + cosPhi1 * cosPhi * cosDeltaLambda;
  const c = Math.acos(Math.max(-1, Math.min(1, cosC)));

  // Handle center point (same location as QTH)
  if (c < 0.0001) {
    return {
      x: 0,
      y: 0,
      distance: 0,
      bearing: 0,
      visible: true,
    };
  }

  // Handle antipodal point (exactly opposite side of Earth)
  if (c > Math.PI - 0.0001) {
    return {
      x: 0,
      y: 1, // Place at bottom (south in standard orientation)
      distance: Math.PI * EARTH_RADIUS_KM,
      bearing: 180,
      visible: true,
    };
  }

  // Calculate the scaling factor k = c / sin(c)
  const sinC = Math.sin(c);
  const k = c / sinC;

  // Project to x, y coordinates
  // x = k * cos(phi) * sin(lambda - lambda0)
  // y = k * (cos(phi1) * sin(phi) - sin(phi1) * cos(phi) * cos(lambda - lambda0))
  const x = k * cosPhi * sinDeltaLambda;
  const y = k * (cosPhi1 * sinPhi - sinPhi1 * cosPhi * cosDeltaLambda);

  // Normalize to unit circle (max angular distance = pi)
  const normalizedX = x / Math.PI;
  const normalizedY = -y / Math.PI; // Flip y so north is up

  // Calculate distance and bearing
  const distance = c * EARTH_RADIUS_KM;
  const bearing =
    Math.atan2(
      sinDeltaLambda * cosPhi,
      cosPhi1 * sinPhi - sinPhi1 * cosPhi * cosDeltaLambda,
    ) * RAD_TO_DEG;

  return {
    x: normalizedX,
    y: normalizedY,
    distance,
    bearing: (bearing + 360) % 360,
    visible: true,
  };
}

/**
 * Reverse projection: convert canvas coordinates back to lat/lon
 *
 * @param x - Normalized x coordinate (-1 to 1)
 * @param y - Normalized y coordinate (-1 to 1)
 * @param centerLat - Latitude of the center (QTH)
 * @param centerLon - Longitude of the center (QTH)
 * @returns Geographic coordinates { lat, lon }
 */
export function azimuthalUnproject(
  x: number,
  y: number,
  centerLat: number,
  centerLon: number,
): { lat: number; lon: number } {
  // Flip y back (we flipped it in project)
  const projY = -y;

  // Convert to radians
  const phi1 = centerLat * DEG_TO_RAD;
  const lambda0 = centerLon * DEG_TO_RAD;

  // Normalized projected radius on the unit disk; the lat/lon formulas below
  // must use this unscaled value so it cancels against x/projY consistently.
  const rhoNorm = Math.sqrt(x * x + projY * projY);

  // Handle center point
  if (rhoNorm * Math.PI < 0.0001) {
    return { lat: centerLat, lon: centerLon };
  }

  // Clamp to valid range (can't be more than pi radians away)
  const c = Math.min(rhoNorm * Math.PI, Math.PI);

  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);

  // Calculate latitude
  const phi = Math.asin(
    Math.max(
      -1,
      Math.min(1, cosC * sinPhi1 + (projY * sinC * cosPhi1) / rhoNorm),
    ),
  );

  // Calculate longitude
  let lambda: number;
  if (Math.abs(phi1 - Math.PI / 2) < 0.0001) {
    // Center is at North Pole
    lambda = lambda0 + Math.atan2(-x, projY);
  } else if (Math.abs(phi1 + Math.PI / 2) < 0.0001) {
    // Center is at South Pole
    lambda = lambda0 + Math.atan2(x, projY);
  } else {
    lambda =
      lambda0 +
      Math.atan2(x * sinC, rhoNorm * cosPhi1 * cosC - projY * sinPhi1 * sinC);
  }

  // Normalize longitude to -180 to 180
  let lon = lambda * RAD_TO_DEG;
  while (lon > 180) {
      lon -= 360;
  }
  while (lon < -180) {
      lon += 360;
  }

  return {
    lat: phi * RAD_TO_DEG,
    lon,
  };
}

/**
 * Generate points along a circle at a given distance from center
 * Useful for drawing distance rings
 *
 * @param centerLat - Latitude of the center (QTH)
 * @param centerLon - Longitude of the center (QTH)
 * @param distanceKm - Distance from center in kilometers
 * @param numPoints - Number of points to generate (default 72)
 * @returns Array of projected points forming a circle
 */
export function getDistanceRingPoints(
  centerLat: number,
  centerLon: number,
  distanceKm: number,
  numPoints: number = 72,
): Array<{ x: number; y: number; lat: number; lon: number }> {
  const points: Array<{ x: number; y: number; lat: number; lon: number }> = [];
  const angularDist = distanceKm / EARTH_RADIUS_KM;

  const phi1 = centerLat * DEG_TO_RAD;
  const lambda0 = centerLon * DEG_TO_RAD;
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinAngDist = Math.sin(angularDist);
  const cosAngDist = Math.cos(angularDist);

  for (let i = 0; i < numPoints; i++) {
    const bearing = (i / numPoints) * 2 * Math.PI;

    // Calculate point at given distance and bearing
    const phi = Math.asin(
      sinPhi1 * cosAngDist + cosPhi1 * sinAngDist * Math.cos(bearing),
    );
    const lambda =
      lambda0 +
      Math.atan2(
        Math.sin(bearing) * sinAngDist * cosPhi1,
        cosAngDist - sinPhi1 * Math.sin(phi),
      );

    const lat = phi * RAD_TO_DEG;
    let lon = lambda * RAD_TO_DEG;
    while (lon > 180) {
        lon -= 360;
    }
    while (lon < -180) {
        lon += 360;
    }

    const projected = azimuthalProject(lat, lon, centerLat, centerLon);
    points.push({
      x: projected.x,
      y: projected.y,
      lat,
      lon,
    });
  }

  return points;
}
