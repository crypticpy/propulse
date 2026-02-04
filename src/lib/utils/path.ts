/**
 * Path Analysis Utilities
 *
 * Calculates great circle paths, distances, bearings, and propagation estimates
 * between two points on Earth for radio communication analysis.
 */

const EARTH_RADIUS_KM = 6371;
const EARTH_CIRCUMFERENCE_KM = 2 * Math.PI * EARTH_RADIUS_KM; // ~40,030 km
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface PathMetrics {
  shortPath: {
    distance: number; // km
    bearing: number; // degrees (0-360)
    reciprocal: number; // degrees (return bearing)
  };
  longPath: {
    distance: number; // km
    bearing: number; // degrees (0-360)
    reciprocal: number; // degrees
  };
  midpoint: {
    lat: number;
    lon: number;
  };
  hops: number; // Estimated F-layer hops
  difficulty: 1 | 2 | 3 | 4 | 5; // 1=easy, 5=very difficult
}

export interface PathPoint {
  lat: number;
  lon: number;
  fraction: number; // 0 = start, 1 = end
}

/**
 * Calculate the great circle distance between two points using Haversine formula
 */
export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaPhi = (lat2 - lat1) * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate the initial bearing (forward azimuth) from point 1 to point 2
 */
export function getBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const bearing = Math.atan2(y, x) * RAD_TO_DEG;
  return (bearing + 360) % 360;
}

/**
 * Calculate the midpoint of a great circle path
 */
export function getMidpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { lat: number; lon: number } {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const deltaLambda = (lon2 - lon1) * DEG_TO_RAD;

  const Bx = Math.cos(phi2) * Math.cos(deltaLambda);
  const By = Math.cos(phi2) * Math.sin(deltaLambda);

  const phi3 = Math.atan2(
    Math.sin(phi1) + Math.sin(phi2),
    Math.sqrt((Math.cos(phi1) + Bx) ** 2 + By ** 2),
  );
  const lambda3 = lambda1 + Math.atan2(By, Math.cos(phi1) + Bx);

  return {
    lat: phi3 * RAD_TO_DEG,
    lon: ((lambda3 * RAD_TO_DEG + 540) % 360) - 180,
  };
}

/**
 * Generate points along a great circle path for visualization
 */
export function getPathPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 100,
): PathPoint[] {
  const points: PathPoint[] = [];

  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const lambda2 = lon2 * DEG_TO_RAD;

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;

    // Spherical linear interpolation (slerp)
    const d = getDistance(lat1, lon1, lat2, lon2) / EARTH_RADIUS_KM;
    const a = Math.sin((1 - fraction) * d) / Math.sin(d);
    const b = Math.sin(fraction * d) / Math.sin(d);

    const x =
      a * Math.cos(phi1) * Math.cos(lambda1) +
      b * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      a * Math.cos(phi1) * Math.sin(lambda1) +
      b * Math.cos(phi2) * Math.sin(lambda2);
    const z = a * Math.sin(phi1) + b * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lon = Math.atan2(y, x) * RAD_TO_DEG;

    points.push({ lat, lon, fraction });
  }

  return points;
}

/**
 * Calculate full path metrics between two points
 */
export function getPathMetrics(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): PathMetrics {
  const shortDistance = getDistance(lat1, lon1, lat2, lon2);
  const shortBearing = getBearing(lat1, lon1, lat2, lon2);
  const shortReciprocal = getBearing(lat2, lon2, lat1, lon1);

  // Long path goes the other way around Earth
  const longDistance = 2 * Math.PI * EARTH_RADIUS_KM - shortDistance;
  const longBearing = (shortBearing + 180) % 360;
  const longReciprocal = (shortReciprocal + 180) % 360;

  const midpoint = getMidpoint(lat1, lon1, lat2, lon2);

  // Estimate F-layer hops (average hop ~3000km at typical angles)
  const hops = Math.ceil(shortDistance / 3000);

  // Difficulty rating based on distance and path characteristics
  let difficulty: 1 | 2 | 3 | 4 | 5;
  if (shortDistance < 2000) {
    difficulty = 1;
  } else if (shortDistance < 5000) {
    difficulty = 2;
  } else if (shortDistance < 10000) {
    difficulty = 3;
  } else if (shortDistance < 15000) {
    difficulty = 4;
  } else {
    difficulty = 5;
  } // Extreme DX (antipodal)

  return {
    shortPath: {
      distance: shortDistance,
      bearing: shortBearing,
      reciprocal: shortReciprocal,
    },
    longPath: {
      distance: longDistance,
      bearing: longBearing,
      reciprocal: longReciprocal,
    },
    midpoint,
    hops,
    difficulty,
  };
}

/**
 * Format bearing as compass direction
 */
export function formatBearing(bearing: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(bearing / 22.5) % 16;
  return directions[index];
}

/**
 * Format distance in kilometers
 */
export function formatDistance(km: number): string {
  if (km < 1000) {
    return `${Math.round(km).toLocaleString()} km`;
  }
  return `${(km / 1000).toFixed(1)}k km`;
}

/**
 * Get long path distance from short path distance
 * Long path = Earth circumference - short path
 */
export function getLongPathDistance(shortPathKm: number): number {
  return EARTH_CIRCUMFERENCE_KM - shortPathKm;
}

/**
 * Get long path bearing from short path bearing
 * Long path bearing is opposite direction (180 degrees offset)
 */
export function getLongPathBearing(shortPathBearing: number): number {
  return (shortPathBearing + 180) % 360;
}

/**
 * Generate points along the long path (opposite direction around Earth)
 * Uses more points for smooth rendering since long path is longer
 */
export function getLongPathPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 150,
): PathPoint[] {
  // Long path goes the opposite way - so we swap the direction
  // by generating points from end to start along the short path direction,
  // but going the "long way" around the sphere
  const points: PathPoint[] = [];

  const phi1 = lat1 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;

  // Calculate the short path angular distance
  const shortDistanceRad =
    getDistance(lat1, lon1, lat2, lon2) / EARTH_RADIUS_KM;
  // Long path angular distance (going the other way)
  const longDistanceRad = 2 * Math.PI - shortDistanceRad;

  // Get the initial bearing for short path, then reverse it
  const shortBearing = getBearing(lat1, lon1, lat2, lon2);
  const longBearing = (shortBearing + 180) % 360;
  const bearingRad = longBearing * DEG_TO_RAD;

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;
    const angularDistance = fraction * longDistanceRad;

    // Calculate point along great circle at given angular distance and bearing
    const lat = Math.asin(
      Math.sin(phi1) * Math.cos(angularDistance) +
        Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(bearingRad),
    );

    const lon =
      lambda1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(phi1),
        Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(lat),
      );

    // Normalize longitude to -180 to 180
    let lonDeg = lon * RAD_TO_DEG;
    lonDeg = ((lonDeg + 540) % 360) - 180;

    points.push({
      lat: lat * RAD_TO_DEG,
      lon: lonDeg,
      fraction,
    });
  }

  return points;
}

/**
 * Calculate path illumination percentage (how much of path is in daylight)
 */
export function getPathIllumination(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  date: Date,
): number {
  // Import dynamically to avoid circular dependency
  const points = getPathPoints(lat1, lon1, lat2, lon2, 20);
  let daylightCount = 0;

  // We need to check each point - simplified check using subsolar distance
  const subsolar = getSubsolarPointSimple(date);

  for (const point of points) {
    const angle = getDistance(point.lat, point.lon, subsolar.lat, subsolar.lon);
    // Points within ~90° of subsolar point are in daylight
    // (90° = quarter of Earth = ~10000km from subsolar)
    if (angle < 10018) {
      // 90° at equator
      daylightCount++;
    }
  }

  return (daylightCount / points.length) * 100;
}

/**
 * Simplified subsolar point calculation for path illumination
 * (To avoid importing the full sun.ts and potential circular deps)
 */
function getSubsolarPointSimple(date: Date): { lat: number; lon: number } {
  // Day of year (approximate)
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Approximate declination using sine wave
  const declination = -23.45 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);

  // Subsolar longitude based on UTC time
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const lon = (12 - utcHours) * 15;

  return {
    lat: declination,
    lon: lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon,
  };
}
