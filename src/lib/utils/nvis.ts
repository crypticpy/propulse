/**
 * NVIS (Near Vertical Incidence Skywave) Analysis
 *
 * NVIS is used for regional communications within ~400km radius.
 * Signals are transmitted nearly vertically and reflect from the F2 layer.
 *
 * Key characteristics:
 * - Optimal takeoff angle: 70-90 degrees (near vertical)
 * - Typical coverage: 0-400km (fills in the "skip zone")
 * - Optimal frequency: 0.85 * f0F2 (below critical frequency)
 * - Best bands: 60m (5.3 MHz), 80m (3.5 MHz), 40m (7 MHz)
 * - Primary use: Emergency communications, ARES/RACES operations
 *
 * NVIS works by sending signals nearly straight up. At frequencies below
 * the critical frequency (f0F2), the signal is refracted back down within
 * a ~400km radius, providing coverage in the "skip zone" where ground wave
 * has faded but normal skywave skip hasn't started yet.
 */

import {
  getIonosphericParameters,
  calculateZenithAngle,
} from "@/lib/utils/ionosphere";

/**
 * NVIS analysis result with recommendations
 */
export interface NVISAnalysis {
  /** Optimal NVIS frequency (MHz) - typically 0.85 * f0F2 */
  optimalFrequency: number;
  /** Usable frequency range [min, max] in MHz */
  frequencyRange: { min: number; max: number };
  /** Maximum reliable coverage radius (km) */
  coverageRadius: number;
  /** Recommended takeoff angle (degrees from horizontal) */
  takeoffAngle: number;
  /** Primary reflecting layer */
  layerUsed: "F2" | "F1" | "E";
  /** Reliability estimate (0-100%) */
  reliability: number;
  /** Best band recommendations with amateur designations */
  recommendedBands: string[];
  /** Current conditions description */
  conditionSummary: string;
  /** F2 layer critical frequency (for reference) */
  f0F2: number;
  /** Whether conditions support NVIS at all */
  nvisViable: boolean;
}

/**
 * NVIS coverage area definition
 */
export interface NVISCoverageArea {
  /** Center latitude in degrees */
  centerLat: number;
  /** Center longitude in degrees */
  centerLon: number;
  /** Maximum coverage radius in km */
  radiusKm: number;
  /** Optimal coverage area (highest reliability) in km */
  optimalRadiusKm: number;
}

/**
 * Amateur band definitions for NVIS
 */
const NVIS_BANDS = [
  { name: "160m", minMHz: 1.8, maxMHz: 2.0, centerMHz: 1.9 },
  { name: "80m", minMHz: 3.5, maxMHz: 4.0, centerMHz: 3.75 },
  { name: "60m", minMHz: 5.33, maxMHz: 5.405, centerMHz: 5.37 },
  { name: "40m", minMHz: 7.0, maxMHz: 7.3, centerMHz: 7.15 },
] as const;

/**
 * Get optimal NVIS frequency
 *
 * NVIS works best at about 85% of f0F2. This provides margin below
 * the critical frequency to account for ionospheric variability
 * while maximizing antenna efficiency and minimizing D-layer absorption.
 *
 * @param f0F2 - F2 layer critical frequency in MHz
 * @returns Optimal NVIS operating frequency in MHz
 *
 * @example
 * ```typescript
 * const f0F2 = 8.5; // MHz
 * const optimal = getOptimalNVISFrequency(f0F2);
 * // Returns 7.225 MHz (ideal for 40m band)
 * ```
 */
export function getOptimalNVISFrequency(f0F2: number): number {
  // 85% of critical frequency is the sweet spot
  // This provides reliability margin while staying close enough
  // for good signal strength
  return f0F2 * 0.85;
}

/**
 * Check if a frequency is suitable for NVIS
 *
 * A frequency is suitable for NVIS if it's below the critical frequency
 * (so it will be refracted back) but not so low that D-layer absorption
 * makes it unusable.
 *
 * @param frequency - Operating frequency in MHz
 * @param f0F2 - F2 layer critical frequency in MHz
 * @returns True if frequency is suitable for NVIS
 *
 * @example
 * ```typescript
 * const suitable = isNVISFrequency(7.2, 9.0);
 * // Returns true - 40m will work with f0F2 of 9 MHz
 * ```
 */
export function isNVISFrequency(frequency: number, f0F2: number): boolean {
  // Must be below critical frequency to be refracted back
  if (frequency >= f0F2) return false;

  // Should be at least 50% of f0F2 for reasonable absorption
  // Below this, D-layer absorption becomes excessive during day
  if (frequency < f0F2 * 0.4) return false;

  // Frequency must be in a practical amateur range (1.8 - 10 MHz for NVIS)
  if (frequency < 1.8 || frequency > 10) return false;

  return true;
}

/**
 * Get NVIS band recommendations based on current f0F2
 *
 * Returns amateur bands that are suitable for NVIS given the
 * current ionospheric conditions.
 *
 * @param f0F2 - F2 layer critical frequency in MHz
 * @returns Array of recommended band names (e.g., ["80m", "60m", "40m"])
 *
 * @example
 * ```typescript
 * const bands = getNVISBandRecommendations(7.5);
 * // Returns ["80m", "60m", "40m"] during good conditions
 * ```
 */
export function getNVISBandRecommendations(f0F2: number): string[] {
  const recommendations: string[] = [];

  for (const band of NVIS_BANDS) {
    // Band center should be below f0F2 for reliable NVIS
    if (band.centerMHz < f0F2) {
      // Check if band is in the optimal range (50-95% of f0F2)
      const ratio = band.centerMHz / f0F2;
      if (ratio >= 0.4 && ratio <= 0.95) {
        recommendations.push(band.name);
      }
    }
  }

  return recommendations;
}

/**
 * Calculate NVIS coverage area
 *
 * NVIS coverage is roughly circular centered on the transmitter.
 * The coverage radius depends on ionospheric conditions and the
 * takeoff angle. Higher critical frequencies allow larger coverage.
 *
 * @param lat - Center latitude in degrees
 * @param lon - Center longitude in degrees
 * @param f0F2 - F2 layer critical frequency in MHz
 * @returns Coverage area definition with optimal and maximum radii
 *
 * @example
 * ```typescript
 * const coverage = calculateNVISCoverage(38.9, -77.0, 8.0);
 * // Returns { centerLat: 38.9, centerLon: -77.0, radiusKm: 400, optimalRadiusKm: 250 }
 * ```
 */
export function calculateNVISCoverage(
  lat: number,
  lon: number,
  f0F2: number,
): NVISCoverageArea {
  // Base coverage: ~300-400 km for typical NVIS
  // Coverage increases slightly with higher f0F2 (higher layer)

  // Minimum f0F2 for any NVIS coverage is about 2 MHz
  if (f0F2 < 2) {
    return {
      centerLat: lat,
      centerLon: lon,
      radiusKm: 0,
      optimalRadiusKm: 0,
    };
  }

  // Coverage radius scales with f0F2 but has practical limits
  // Typical NVIS geometry with 80-90 degree takeoff angles
  // At 5 MHz f0F2: ~300 km
  // At 10 MHz f0F2: ~400 km

  const baseRadius = 250;
  const f0F2Factor = Math.min(1.6, f0F2 / 5); // Caps at about 1.6x
  const maxRadius = Math.min(450, baseRadius * f0F2Factor);

  // Optimal radius (highest reliability) is about 60% of max
  const optimalRadius = maxRadius * 0.6;

  return {
    centerLat: lat,
    centerLon: lon,
    radiusKm: Math.round(maxRadius),
    optimalRadiusKm: Math.round(optimalRadius),
  };
}

/**
 * Calculate takeoff angle for NVIS at a given distance
 *
 * For NVIS, the signal travels nearly vertically up and back down.
 * The takeoff angle determines how far from the transmitter the
 * signal will land.
 *
 * @param distanceKm - Target distance in km
 * @param hmF2 - F2 layer height in km (typically 250-400 km)
 * @returns Required takeoff angle in degrees from horizontal
 */
function calculateNVISTakeoffAngle(distanceKm: number, hmF2: number): number {
  // Simple geometry: for NVIS, we're looking at a nearly vertical path
  // The signal goes up to hmF2, bounces, and comes back down
  // For distance d and height h: tan(90 - angle) = d / (2 * h)

  if (distanceKm <= 0) return 90; // Directly overhead

  const halfDistance = distanceKm / 2;
  const tanValue = halfDistance / hmF2;
  const angleFromVertical = Math.atan(tanValue) * (180 / Math.PI);

  // Takeoff angle from horizontal = 90 - angle from vertical
  return Math.max(70, 90 - angleFromVertical);
}

/**
 * Analyze NVIS conditions at a location
 *
 * Provides comprehensive NVIS analysis including optimal frequency,
 * coverage radius, band recommendations, and reliability assessment.
 *
 * @param lat - Geographic latitude in degrees (-90 to 90)
 * @param lon - Geographic longitude in degrees (-180 to 180)
 * @param sfi - Solar Flux Index (65-300)
 * @param date - Date/time for the analysis
 * @returns Complete NVIS analysis with recommendations
 *
 * @example
 * ```typescript
 * const analysis = analyzeNVIS(38.9, -77.0, 120, new Date());
 * console.log(`Optimal frequency: ${analysis.optimalFrequency.toFixed(2)} MHz`);
 * console.log(`Coverage radius: ${analysis.coverageRadius} km`);
 * console.log(`Recommended bands: ${analysis.recommendedBands.join(", ")}`);
 * ```
 */
export function analyzeNVIS(
  lat: number,
  lon: number,
  sfi: number,
  date: Date,
): NVISAnalysis {
  // Get ionospheric parameters
  const ionoParams = getIonosphericParameters(lat, lon, date, sfi);
  const { f0F2, hmF2, isDaytime } = ionoParams;

  // Calculate zenith angle for daylight/absorption assessment
  const zenithAngle = calculateZenithAngle(lat, lon, date);

  // Calculate optimal NVIS frequency
  const optimalFrequency = getOptimalNVISFrequency(f0F2);

  // Calculate frequency range
  // Min: limited by D-layer absorption (lower during night)
  // Max: must be below f0F2 for refraction
  const minFactor = isDaytime ? 0.5 : 0.35;
  const frequencyRange = {
    min: Math.max(1.8, f0F2 * minFactor),
    max: f0F2 * 0.95, // 95% of f0F2 for margin
  };

  // Get coverage area
  const coverage = calculateNVISCoverage(lat, lon, f0F2);

  // Calculate takeoff angle (for optimal radius)
  const takeoffAngle = calculateNVISTakeoffAngle(
    coverage.optimalRadiusKm,
    hmF2,
  );

  // Determine layer used (F2 for NVIS, occasionally F1 during day)
  const layerUsed: "F2" | "F1" | "E" = "F2";

  // Get band recommendations
  const recommendedBands = getNVISBandRecommendations(f0F2);

  // Calculate reliability estimate
  // Factors: f0F2 level, time of day, solar conditions
  let reliability = 50; // Base reliability

  // Higher f0F2 = better reliability
  if (f0F2 >= 8) reliability += 25;
  else if (f0F2 >= 6) reliability += 15;
  else if (f0F2 >= 4) reliability += 5;
  else reliability -= 20;

  // Daytime generally better (more ionization) but more absorption
  if (isDaytime) {
    reliability += 10;
    // High sun = more absorption, reduce reliability for lower frequencies
    if (zenithAngle < 45) reliability -= 5;
  } else {
    // Night: less absorption but also less ionization
    if (f0F2 >= 5) reliability += 5;
    else reliability -= 10;
  }

  // Moderate solar activity is best for NVIS
  if (sfi >= 100 && sfi <= 150) reliability += 5;
  else if (sfi < 80) reliability -= 10;
  else if (sfi > 200) reliability -= 5;

  // Clamp reliability
  reliability = Math.max(10, Math.min(95, reliability));

  // Determine if NVIS is viable
  const nvisViable = f0F2 >= 3 && recommendedBands.length > 0;

  // Generate condition summary
  let conditionSummary: string;
  if (!nvisViable) {
    conditionSummary = `NVIS not viable - f0F2 too low (${f0F2.toFixed(1)} MHz)`;
  } else if (reliability >= 75) {
    conditionSummary = `Excellent NVIS conditions on ${recommendedBands.join(", ")}`;
  } else if (reliability >= 50) {
    conditionSummary = `Good NVIS conditions, prefer ${recommendedBands[0] || "80m"}`;
  } else if (reliability >= 30) {
    conditionSummary = `Marginal NVIS conditions, try ${recommendedBands[0] || "80m"}`;
  } else {
    conditionSummary = `Poor NVIS conditions - consider alternative modes`;
  }

  return {
    optimalFrequency: Math.round(optimalFrequency * 100) / 100,
    frequencyRange: {
      min: Math.round(frequencyRange.min * 100) / 100,
      max: Math.round(frequencyRange.max * 100) / 100,
    },
    coverageRadius: coverage.radiusKm,
    takeoffAngle: Math.round(takeoffAngle),
    layerUsed,
    reliability,
    recommendedBands,
    conditionSummary,
    f0F2,
    nvisViable,
  };
}

/**
 * Get NVIS condition color based on reliability
 *
 * @param reliability - Reliability percentage (0-100)
 * @returns Tailwind color class
 */
export function getNVISConditionColor(reliability: number): string {
  if (reliability >= 75) return "text-signal-green";
  if (reliability >= 50) return "text-good";
  if (reliability >= 30) return "text-caution-amber";
  return "text-alert-red";
}

/**
 * Get NVIS condition label
 *
 * @param reliability - Reliability percentage (0-100)
 * @returns Condition label
 */
export function getNVISConditionLabel(reliability: number): string {
  if (reliability >= 75) return "Excellent";
  if (reliability >= 50) return "Good";
  if (reliability >= 30) return "Fair";
  return "Poor";
}

/**
 * Calculate distance on Earth's surface given lat/lon
 * Used for coverage area calculations
 *
 * @param lat1 - First point latitude
 * @param lon1 - First point longitude
 * @param lat2 - Second point latitude
 * @param lon2 - Second point longitude
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a location is within NVIS coverage of a station
 *
 * @param stationLat - Station latitude
 * @param stationLon - Station longitude
 * @param targetLat - Target latitude
 * @param targetLon - Target longitude
 * @param coverageRadius - NVIS coverage radius in km
 * @returns True if target is within coverage
 */
export function isWithinNVISCoverage(
  stationLat: number,
  stationLon: number,
  targetLat: number,
  targetLon: number,
  coverageRadius: number,
): boolean {
  const distance = calculateDistance(
    stationLat,
    stationLon,
    targetLat,
    targetLon,
  );
  return distance <= coverageRadius;
}
