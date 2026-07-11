/**
 * Polar cap absorption (PCA) model
 *
 * HF signals crossing polar regions experience significant absorption
 * due to ionization from solar proton events and auroral activity.
 *
 * Current model shows ~4 dB - realistic values are 20-40+ dB during
 * disturbed conditions (high K-index, solar proton events).
 *
 * Polar cap absorption affects paths crossing the auroral zones
 * (approximately > 60 degrees latitude). During geomagnetic storms,
 * this can cause complete HF blackouts on polar paths.
 */

const DEG_TO_RAD = Math.PI / 180;

/**
 * Polar absorption calculation result
 */
export interface PolarAbsorption {
  /** Absorption loss in dB (0 to 40+) */
  absorption: number;
  /** Whether path crosses polar region */
  isAffected: boolean;
  /** Severity classification */
  severity: "none" | "minor" | "moderate" | "severe" | "blackout";
  /** Recommendation for the operator */
  recommendation: string;
  /** Maximum latitude crossed by the path */
  maxLatitude: number;
  /** Percentage of path in polar region */
  polarPathPercent: number;
}

/**
 * Polar region threshold latitude in degrees
 * Paths crossing latitudes above this are considered polar paths
 */
const POLAR_LATITUDE_THRESHOLD = 60;

/**
 * Auroral zone center latitude (approximately)
 * The auroral oval is typically between 65-75 degrees
 * Exported for future auroral absorption calculations
 */
export const AURORAL_ZONE_CENTER = 68;

/**
 * Base absorption in dB for quiet polar conditions
 */
const BASE_POLAR_ABSORPTION = 3;

/**
 * Maximum absorption during severe PCA events
 */
const MAX_ABSORPTION = 50;

/**
 * Check if a path crosses the polar region
 *
 * A path is considered polar if any point along the great circle
 * path exceeds the polar latitude threshold (60 degrees).
 *
 * @param lat1 - Start latitude in degrees
 * @param lon1 - Start longitude in degrees
 * @param lat2 - End latitude in degrees
 * @param lon2 - End longitude in degrees
 * @returns True if path crosses polar region
 */
export function isPolarPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): boolean {
  const maxLat = getMaxLatitudeOnPath(lat1, lon1, lat2, lon2);
  return Math.abs(maxLat) > POLAR_LATITUDE_THRESHOLD;
}

/**
 * Calculate the maximum latitude reached along a great circle path
 *
 * For great circle paths, the maximum latitude can be higher than
 * either endpoint, especially for east-west paths at high latitudes.
 *
 * @param lat1 - Start latitude in degrees
 * @param lon1 - Start longitude in degrees
 * @param lat2 - End latitude in degrees
 * @param lon2 - End longitude in degrees
 * @returns Maximum absolute latitude along the path
 */
export function getMaxLatitudeOnPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  // Sample points along the great circle path
  const numPoints = 50;
  let maxLat = Math.max(Math.abs(lat1), Math.abs(lat2));

  // Convert to radians for great circle calculation
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const lambda2 = lon2 * DEG_TO_RAD;

  // Calculate angular distance
  const deltaLambda = lambda2 - lambda1;
  const cosD =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

  if (d === 0) return maxLat;

  // Sample along great circle
  for (let i = 1; i < numPoints; i++) {
    const f = i / numPoints;

    // Spherical interpolation
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x =
      A * Math.cos(phi1) * Math.cos(lambda1) +
      B * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      A * Math.cos(phi1) * Math.sin(lambda1) +
      B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG_TO_RAD;
    maxLat = Math.max(maxLat, Math.abs(lat));
  }

  return maxLat;
}

/**
 * Calculate the percentage of a path that crosses the polar region
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @returns Percentage of path in polar region (0-100)
 */
export function getPolarPathPercentage(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const numPoints = 50;
  let polarPoints = 0;

  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const lambda2 = lon2 * DEG_TO_RAD;

  const deltaLambda = lambda2 - lambda1;
  const cosD =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

  if (d === 0) {
    return Math.abs(lat1) > POLAR_LATITUDE_THRESHOLD ? 100 : 0;
  }

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;

    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x =
      A * Math.cos(phi1) * Math.cos(lambda1) +
      B * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      A * Math.cos(phi1) * Math.sin(lambda1) +
      B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG_TO_RAD;

    if (Math.abs(lat) > POLAR_LATITUDE_THRESHOLD) {
      polarPoints++;
    }
  }

  return Math.round((polarPoints / (numPoints + 1)) * 100);
}

/**
 * Calculate polar cap absorption for a propagation path
 *
 * Polar absorption is caused by:
 * 1. Solar proton events (SPE) - ionize the D-region at high latitudes
 * 2. Auroral precipitation - electron bombardment in the auroral zone
 * 3. General polar cap ionization - enhanced during high K-index
 *
 * Absorption increases with:
 * - Higher K-index (geomagnetic activity)
 * - Path latitude (deeper into polar cap = more absorption)
 * - Percentage of path in polar region
 * - Solar proton flux (during SPE events)
 *
 * @param pathPoints - Array of lat/lon points along the path
 * @param kIndex - Current K-index (0-9)
 * @param solarProtonFlux - Solar proton flux (optional, for SPE events)
 * @returns Polar absorption data
 */
export function calculatePolarAbsorption(
  pathPoints: Array<{ lat: number; lon: number }>,
  kIndex: number,
  solarProtonFlux?: number,
): PolarAbsorption {
  if (pathPoints.length === 0) {
    return {
      absorption: 0,
      isAffected: false,
      severity: "none",
      recommendation: "No path data available.",
      maxLatitude: 0,
      polarPathPercent: 0,
    };
  }

  // Find maximum latitude on path
  let maxLat = 0;
  let polarPoints = 0;
  let auroralZonePoints = 0;

  for (const point of pathPoints) {
    const absLat = Math.abs(point.lat);
    maxLat = Math.max(maxLat, absLat);

    if (absLat > POLAR_LATITUDE_THRESHOLD) {
      polarPoints++;
    }
    if (absLat > 63 && absLat < 75) {
      auroralZonePoints++;
    }
  }

  const polarPathPercent = (polarPoints / pathPoints.length) * 100;
  const auroralPercent = (auroralZonePoints / pathPoints.length) * 100;
  const isAffected = polarPathPercent > 0;

  if (!isAffected) {
    return {
      absorption: 0,
      isAffected: false,
      severity: "none",
      recommendation: "Path does not cross polar regions.",
      maxLatitude: maxLat,
      polarPathPercent: 0,
    };
  }

  // Calculate absorption based on conditions
  let absorption = BASE_POLAR_ABSORPTION;

  // K-index factor: absorption increases exponentially with Kp
  // Kp 0-2: minimal effect
  // Kp 3-4: moderate absorption
  // Kp 5-6: significant absorption
  // Kp 7-9: severe to blackout
  const kIndexFactor = Math.pow(kIndex / 9, 2);

  // Latitude factor: deeper into polar cap = more absorption
  // Peaks around 70-75 degrees (auroral zone)
  let latFactor = 0;
  if (maxLat > POLAR_LATITUDE_THRESHOLD) {
    // Ramp up from threshold to auroral zone center
    latFactor = (maxLat - POLAR_LATITUDE_THRESHOLD) / 30;
    // Extra penalty for crossing auroral zone
    if (maxLat > 63 && maxLat < 78) {
      latFactor *= 1.5;
    }
  }

  // Path percentage factor: more path in polar = more total absorption
  const pathFactor = polarPathPercent / 100;

  // Auroral zone factor: extra absorption in the auroral oval
  const auroralFactor =
    auroralPercent > 0 ? 1 + (auroralPercent / 100) * 0.5 : 1;

  // Base calculation following the formula from requirements
  // absorption = 10 + (30 * kIndexFactor * latFactor)
  absorption = 10 + 30 * kIndexFactor * latFactor;

  // Apply path percentage and auroral zone factors
  absorption *= pathFactor * auroralFactor;

  // Solar proton event enhancement
  if (solarProtonFlux && solarProtonFlux > 10) {
    // SPE causes additional D-layer ionization
    // Log scale for proton flux
    const speFactor = 1 + Math.log10(solarProtonFlux / 10);
    absorption *= speFactor;
  }

  // Add minimum absorption for polar paths during quiet conditions
  absorption = Math.max(BASE_POLAR_ABSORPTION * pathFactor, absorption);

  // Clamp to maximum
  absorption = Math.min(MAX_ABSORPTION, absorption);

  // Determine severity
  let severity: PolarAbsorption["severity"];
  if (absorption < 5) {
    severity = "minor";
  } else if (absorption < 15) {
    severity = "moderate";
  } else if (absorption < 30) {
    severity = "severe";
  } else {
    severity = "blackout";
  }

  // Generate recommendation
  let recommendation: string;
  switch (severity) {
    case "minor":
      recommendation =
        "Minor polar absorption. Signals may be slightly weaker than normal.";
      break;
    case "moderate":
      recommendation =
        "Moderate polar absorption. Consider using higher power or more efficient modes (FT8/CW).";
      break;
    case "severe":
      recommendation =
        "Severe polar absorption. Try long path to avoid polar region, or wait for conditions to improve.";
      break;
    case "blackout":
      recommendation =
        "Polar blackout conditions. HF propagation via polar path is unlikely. Use long path or wait.";
      break;
    default:
      recommendation = "Path does not cross polar regions.";
  }

  // Add K-index context
  if (kIndex >= 7) {
    recommendation += ` K-index ${kIndex} indicates major geomagnetic storm.`;
  } else if (kIndex >= 5) {
    recommendation += ` K-index ${kIndex} indicates geomagnetic storm in progress.`;
  } else if (kIndex >= 4) {
    recommendation += ` K-index ${kIndex} shows elevated geomagnetic activity.`;
  }

  return {
    absorption: Math.round(absorption * 10) / 10,
    isAffected,
    severity,
    recommendation,
    maxLatitude: Math.round(maxLat * 10) / 10,
    polarPathPercent: Math.round(polarPathPercent),
  };
}

/**
 * Calculate polar absorption for a path defined by endpoints
 *
 * Convenience wrapper that generates path points automatically.
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param kIndex - Current K-index (0-9)
 * @param solarProtonFlux - Solar proton flux (optional)
 * @returns Polar absorption data
 */
export function getPolarAbsorptionForPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  kIndex: number,
  solarProtonFlux?: number,
): PolarAbsorption {
  // Generate path points using great circle
  const pathPoints = generateGreatCirclePoints(lat1, lon1, lat2, lon2, 30);
  return calculatePolarAbsorption(pathPoints, kIndex, solarProtonFlux);
}

/**
 * Generate points along a great circle path
 */
function generateGreatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const lambda1 = lon1 * DEG_TO_RAD;
  const lambda2 = lon2 * DEG_TO_RAD;

  const deltaLambda = lambda2 - lambda1;
  const cosD =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const d = Math.acos(Math.max(-1, Math.min(1, cosD)));

  if (d === 0) {
    points.push({ lat: lat1, lon: lon1 });
    return points;
  }

  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;

    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x =
      A * Math.cos(phi1) * Math.cos(lambda1) +
      B * Math.cos(phi2) * Math.cos(lambda2);
    const y =
      A * Math.cos(phi1) * Math.sin(lambda1) +
      B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG_TO_RAD;
    let lon = Math.atan2(y, x) / DEG_TO_RAD;

    // Normalize longitude
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    points.push({ lat, lon });
  }

  return points;
}

/**
 * Check if long path would avoid polar absorption
 *
 * Sometimes the long path (anti-podal) route can avoid polar
 * regions and provide better propagation during high K-index.
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @returns Analysis of short vs long path polar exposure
 */
export function comparePolarPaths(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): {
  shortPathPolar: boolean;
  longPathPolar: boolean;
  recommendation: "short" | "long" | "either";
  reason: string;
} {
  // Short path analysis
  const shortPathMaxLat = getMaxLatitudeOnPath(lat1, lon1, lat2, lon2);
  const shortPathPolar = shortPathMaxLat > POLAR_LATITUDE_THRESHOLD;

  // Long path goes the other way around Earth
  // Approximate by going through the opposite hemisphere
  const lon2Long = lon2 > 0 ? lon2 - 180 : lon2 + 180;
  const longPathMaxLat = getMaxLatitudeOnPath(lat1, lon1, -lat2, lon2Long);
  const longPathPolar = longPathMaxLat > POLAR_LATITUDE_THRESHOLD;

  let recommendation: "short" | "long" | "either";
  let reason: string;

  if (!shortPathPolar && !longPathPolar) {
    recommendation = "either";
    reason =
      "Neither path crosses polar region. Use short path for efficiency.";
  } else if (!shortPathPolar && longPathPolar) {
    recommendation = "short";
    reason = "Short path avoids polar region.";
  } else if (shortPathPolar && !longPathPolar) {
    recommendation = "long";
    reason = "Long path avoids polar region - recommended during high K-index.";
  } else {
    // Both are polar - compare which has less exposure
    const shortPercent = getPolarPathPercentage(lat1, lon1, lat2, lon2);
    const longPercent = getPolarPathPercentage(lat1, lon1, -lat2, lon2Long);

    if (shortPercent < longPercent) {
      recommendation = "short";
      reason = `Short path has less polar exposure (${shortPercent}% vs ${longPercent}%).`;
    } else if (longPercent < shortPercent) {
      recommendation = "long";
      reason = `Long path has less polar exposure (${longPercent}% vs ${shortPercent}%).`;
    } else {
      recommendation = "either";
      reason = "Both paths have similar polar exposure.";
    }
  }

  return {
    shortPathPolar,
    longPathPolar,
    recommendation,
    reason,
  };
}

/**
 * Get polar absorption severity color for UI display
 *
 * @param severity - Severity level
 * @returns Tailwind color class
 */
export function getPolarSeverityColor(
  severity: PolarAbsorption["severity"],
): string {
  switch (severity) {
    case "none":
      return "text-gray-500";
    case "minor":
      return "text-caution-amber";
    case "moderate":
      return "text-orange-500";
    case "severe":
      return "text-alert-red";
    case "blackout":
      return "text-red-700";
  }
}

/**
 * Get polar absorption severity background color for UI badges
 *
 * @param severity - Severity level
 * @returns Tailwind background color class
 */
export function getPolarSeverityBgColor(
  severity: PolarAbsorption["severity"],
): string {
  switch (severity) {
    case "none":
      return "bg-gray-500/20";
    case "minor":
      return "bg-caution-amber/20";
    case "moderate":
      return "bg-orange-500/20";
    case "severe":
      return "bg-alert-red/20";
    case "blackout":
      return "bg-red-700/20";
  }
}
