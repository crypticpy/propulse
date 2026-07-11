/**
 * Gray line (terminator) propagation enhancement model
 *
 * The gray line provides enhanced propagation due to:
 * 1. Reduced D-layer absorption (ionization dying off)
 * 2. F-layer still ionized (before recombination)
 * 3. Creates "waveguide" effect along terminator
 *
 * Enhancement: typically +5 to +15 dB on 40m, 80m, 160m
 * Peak enhancement: within 30 minutes of local sunrise/sunset
 *
 * The gray zone is the transition region where solar zenith angle is
 * between approximately 90 and 108 degrees (civil to astronomical twilight).
 */

import { getSubsolarPoint } from "./sun";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Gray line enhancement calculation result
 */
export interface GrayLineEnhancement {
  /** dB enhancement (0 to 15) */
  enhancement: number;
  /** Minutes remaining in peak window */
  duration: number;
  /** Type of terminator crossing */
  type: "sunrise" | "sunset" | "none";
  /** Percentage of path in gray zone (0-100) */
  pathIllumination: number;
  /** Whether path is currently enhanced */
  isEnhanced: boolean;
  /** Quality of gray line conditions */
  quality: "excellent" | "good" | "moderate" | "none";
}

/**
 * Gray zone width in degrees from terminator
 * This represents civil twilight zone where D-layer is weakened
 * but F-layer remains ionized
 */
const GRAY_ZONE_WIDTH = 15; // degrees

/**
 * Peak enhancement in dB at the terminator
 * Based on observations, gray line can provide 10-15 dB enhancement
 * on low bands (40m, 80m, 160m)
 */
const PEAK_ENHANCEMENT_DB = 12;

/**
 * Duration of peak gray line window in minutes
 * Approximately 30-45 minutes around local sunrise/sunset
 */
const PEAK_WINDOW_MINUTES = 35;

/**
 * Calculate angular distance between two points on Earth in degrees
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
 * Calculate the distance from a point to the terminator (in degrees)
 *
 * The terminator is the great circle where solar zenith angle = 90 degrees.
 * Points inside daylight have distance < 90 from subsolar point.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param time - Current time
 * @returns Distance from terminator in degrees (positive = day side, negative = night side)
 */
export function getDistanceFromTerminator(
  lat: number,
  lon: number,
  time: Date,
): number {
  const subsolar = getSubsolarPoint(time);

  // Angular distance from subsolar point
  const angularDist = getAngularDistance(lat, lon, subsolar.lat, subsolar.lon);

  // Terminator is at 90 degrees from subsolar point
  // Positive values = day side (closer to sun)
  // Negative values = night side (farther from sun)
  return 90 - angularDist;
}

/**
 * Determine if a point is in the gray zone (twilight region)
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param time - Current time
 * @returns True if point is in the gray zone
 */
export function isPointInGrayZone(
  lat: number,
  lon: number,
  time: Date,
): boolean {
  const distFromTerminator = Math.abs(
    getDistanceFromTerminator(lat, lon, time),
  );
  return distFromTerminator <= GRAY_ZONE_WIDTH;
}

/**
 * Check if a path is in the gray zone
 *
 * A path is considered in the gray zone if a significant portion
 * (>30%) of the path points are in the twilight region.
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param time - Current time
 * @returns True if path is in gray zone
 */
export function isPathInGrayZone(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  time: Date,
): boolean {
  const enhancement = calculateGrayLineEnhancement(
    generatePathPoints(lat1, lon1, lat2, lon2),
    time,
  );
  return enhancement.pathIllumination >= 30;
}

/**
 * Get the gray zone width in degrees from the terminator
 */
export function getGrayZoneWidth(): number {
  return GRAY_ZONE_WIDTH;
}

/**
 * Generate points along a great circle path
 */
function generatePathPoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 20,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i <= numPoints; i++) {
    const fraction = i / numPoints;

    // Simple linear interpolation for moderate distances
    // For very long paths, should use great circle interpolation
    const lat = lat1 + (lat2 - lat1) * fraction;

    // Handle longitude wrapping
    let lonDiff = lon2 - lon1;
    if (lonDiff > 180) lonDiff -= 360;
    if (lonDiff < -180) lonDiff += 360;
    let lon = lon1 + lonDiff * fraction;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;

    points.push({ lat, lon });
  }

  return points;
}

/**
 * Determine terminator type (sunrise or sunset) for a point
 */
function getTerminatorType(
  lat: number,
  lon: number,
  time: Date,
): "sunrise" | "sunset" | "none" {
  const distFromTerminator = getDistanceFromTerminator(lat, lon, time);

  // If not in gray zone, no enhancement
  if (Math.abs(distFromTerminator) > GRAY_ZONE_WIDTH) {
    return "none";
  }

  // Check if the point is moving toward or away from daylight
  // Use a 5-minute offset to determine direction
  const futureTime = new Date(time.getTime() + 5 * 60 * 1000);
  const futureDist = getDistanceFromTerminator(lat, lon, futureTime);

  // If distance is increasing (moving away from terminator toward day), it's sunrise
  // If distance is decreasing (moving toward terminator from day), it's sunset
  if (distFromTerminator > 0) {
    // Currently on day side
    return futureDist > distFromTerminator ? "sunrise" : "sunset";
  } else {
    // Currently on night side
    return futureDist > distFromTerminator ? "sunrise" : "sunset";
  }
}

/**
 * Calculate gray line enhancement for a propagation path
 *
 * The enhancement is based on how much of the path is in the gray zone
 * and the distance of path points from the terminator.
 *
 * Gray line propagation is particularly effective for low bands (160m, 80m, 40m)
 * because:
 * - D-layer absorption is minimal in the gray zone
 * - F-layer is still sufficiently ionized
 * - Creates a natural waveguide along the terminator
 *
 * @param pathPoints - Array of lat/lon points along the path
 * @param time - Current time for calculation
 * @returns Gray line enhancement data
 */
export function calculateGrayLineEnhancement(
  pathPoints: Array<{ lat: number; lon: number }>,
  time: Date,
): GrayLineEnhancement {
  if (pathPoints.length === 0) {
    return {
      enhancement: 0,
      duration: 0,
      type: "none",
      pathIllumination: 0,
      isEnhanced: false,
      quality: "none",
    };
  }

  let totalEnhancement = 0;
  let pointsInGrayZone = 0;
  let sunriseCount = 0;
  let sunsetCount = 0;

  // Calculate enhancement for each point on the path
  for (const point of pathPoints) {
    const distFromTerminator = Math.abs(
      getDistanceFromTerminator(point.lat, point.lon, time),
    );

    // Enhancement peaks at terminator, decreases with distance
    // Using Gaussian falloff for smooth transition
    if (distFromTerminator <= GRAY_ZONE_WIDTH * 2) {
      const pointEnhancement =
        PEAK_ENHANCEMENT_DB *
        Math.exp(-Math.pow(distFromTerminator / GRAY_ZONE_WIDTH, 2));
      totalEnhancement += pointEnhancement;
    }

    // Count points in gray zone
    if (distFromTerminator <= GRAY_ZONE_WIDTH) {
      pointsInGrayZone++;

      // Determine type
      const type = getTerminatorType(point.lat, point.lon, time);
      if (type === "sunrise") sunriseCount++;
      else if (type === "sunset") sunsetCount++;
    }
  }

  // Average enhancement across path
  const avgEnhancement = totalEnhancement / pathPoints.length;

  // Calculate path illumination percentage
  const pathIllumination = (pointsInGrayZone / pathPoints.length) * 100;

  // Determine predominant type
  let type: "sunrise" | "sunset" | "none" = "none";
  if (sunriseCount > 0 || sunsetCount > 0) {
    type = sunriseCount >= sunsetCount ? "sunrise" : "sunset";
  }

  // Estimate duration based on how centered the path is in the gray zone
  // More centered = more time remaining
  let duration = 0;
  if (pathIllumination > 0) {
    // Rough estimate: peak window is ~35 minutes
    // Duration scales with how much of path is in gray zone
    duration = Math.round(PEAK_WINDOW_MINUTES * (pathIllumination / 100));
  }

  // Determine quality
  let quality: GrayLineEnhancement["quality"] = "none";
  if (pathIllumination >= 70) {
    quality = "excellent";
  } else if (pathIllumination >= 50) {
    quality = "good";
  } else if (pathIllumination >= 30) {
    quality = "moderate";
  }

  // Is the path currently enhanced?
  const isEnhanced = avgEnhancement >= 2; // At least 2 dB enhancement

  return {
    enhancement: Math.round(avgEnhancement * 10) / 10,
    duration,
    type,
    pathIllumination: Math.round(pathIllumination),
    isEnhanced,
    quality,
  };
}

/**
 * Calculate gray line enhancement for a path defined by endpoints
 *
 * Convenience wrapper that generates path points automatically.
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param time - Current time
 * @returns Gray line enhancement data
 */
export function getGrayLineEnhancementForPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  time: Date,
): GrayLineEnhancement {
  const pathPoints = generatePathPoints(lat1, lon1, lat2, lon2);
  return calculateGrayLineEnhancement(pathPoints, time);
}

/**
 * Get the band-specific gray line enhancement multiplier
 *
 * Low bands benefit most from gray line propagation because
 * D-layer absorption is the primary limitation for these frequencies
 * during daytime.
 *
 * @param band - Band name (e.g., '160m', '80m', '40m')
 * @returns Multiplier for gray line enhancement (0.0 to 1.0)
 */
export function getBandGrayLineMultiplier(band: string): number {
  const multipliers: Record<string, number> = {
    "160m": 1.0, // Maximum benefit - D-layer blocks 160m during day
    "80m": 0.9, // High benefit
    "60m": 0.7, // Moderate benefit
    "40m": 0.6, // Moderate benefit
    "30m": 0.3, // Minor benefit
    "20m": 0.15, // Minimal benefit
    "17m": 0.1, // Minimal benefit
    "15m": 0.05, // Negligible
    "12m": 0.02, // Negligible
    "10m": 0.01, // Negligible
  };

  return multipliers[band] ?? 0.1;
}

/**
 * Calculate effective enhancement for a specific band
 *
 * @param baseEnhancement - Base gray line enhancement in dB
 * @param band - Band name
 * @returns Effective enhancement in dB for this band
 */
export function getEffectiveBandEnhancement(
  baseEnhancement: number,
  band: string,
): number {
  const multiplier = getBandGrayLineMultiplier(band);
  return Math.round(baseEnhancement * multiplier * 10) / 10;
}

/**
 * Check if gray line conditions favor a specific path
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param time - Current time
 * @returns Object with favorability assessment
 */
export function assessGrayLineConditions(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  time: Date,
): {
  isFavorable: boolean;
  recommendation: string;
  peakBands: string[];
  enhancement: GrayLineEnhancement;
} {
  const enhancement = getGrayLineEnhancementForPath(
    lat1,
    lon1,
    lat2,
    lon2,
    time,
  );

  const isFavorable = enhancement.isEnhanced && enhancement.quality !== "none";

  let recommendation: string;
  const peakBands: string[] = [];

  if (enhancement.quality === "excellent") {
    recommendation =
      "Excellent gray line conditions! Low bands (160m, 80m, 40m) highly favored.";
    peakBands.push("160m", "80m", "40m");
  } else if (enhancement.quality === "good") {
    recommendation =
      "Good gray line enhancement. Try 80m and 40m for best results.";
    peakBands.push("80m", "40m");
  } else if (enhancement.quality === "moderate") {
    recommendation =
      "Moderate gray line effect. 40m may show some improvement.";
    peakBands.push("40m");
  } else {
    recommendation = "Path not currently in gray line zone.";
  }

  if (enhancement.type === "sunrise") {
    recommendation += " (Sunrise terminator)";
  } else if (enhancement.type === "sunset") {
    recommendation += " (Sunset terminator)";
  }

  return {
    isFavorable,
    recommendation,
    peakBands,
    enhancement,
  };
}
