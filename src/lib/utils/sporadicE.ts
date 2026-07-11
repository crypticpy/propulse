/**
 * Sporadic E (Es) Probability Model
 *
 * Provides statistical modeling of Sporadic E occurrence patterns.
 * Sporadic E is an unpredictable ionospheric phenomenon that enables:
 * - VHF propagation (6m, 2m) over 500-2300 km
 * - Occasional 10m openings
 * - Peak activity: May-August (Northern Hemisphere), Nov-Feb (Southern)
 * - Best times: Late morning (10-12 local) and early evening (18-21 local)
 * - More common at mid-latitudes (30-50 degrees)
 *
 * This model is based on statistical analysis of Es occurrence patterns
 * and provides probability estimates, not predictions.
 */

/**
 * Sporadic E probability result
 */
export interface EsProbability {
  /** Probability of Es opening (0-100%) */
  probability: number;
  /** Expected maximum usable frequency during Es (MHz) */
  maxFrequency: number;
  /** Type of Es opening possible */
  openingType: "single-hop" | "double-hop" | "none";
  /** Maximum distance achievable with Es (km) */
  maxDistance: number;
  /** Confidence level of the prediction */
  confidence: "low" | "medium" | "high";
}

/**
 * Breakdown of Es condition factors
 */
export interface EsConditions {
  /** Whether current time is in Es season */
  isEsSeason: boolean;
  /** Seasonal multiplier (0-1) */
  seasonalFactor: number;
  /** Time of day multiplier (0-1) */
  timeOfDayFactor: number;
  /** Latitude multiplier (0-1) */
  latitudeFactor: number;
  /** Solar activity multiplier (slight correlation with SFI) */
  solarFactor: number;
}

/**
 * Grid point for Es probability overlay
 */
export interface EsGridPoint {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Es probability (0-100) */
  probability: number;
}

/**
 * Calculate local solar hour from longitude and UTC time
 */
function getLocalSolarHour(lon: number, date: Date): number {
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;

  // Each 15 degrees of longitude = 1 hour offset
  let solarHour = utcHours + lon / 15;

  // Normalize to 0-24
  while (solarHour < 0) solarHour += 24;
  while (solarHour >= 24) solarHour -= 24;

  return solarHour;
}

/**
 * Get seasonal factor for Es probability
 *
 * Es activity peaks in summer months:
 * - Northern Hemisphere: May-August (peak in June)
 * - Southern Hemisphere: November-February (peak in December)
 *
 * @param month - Month (0-11, where 0 = January)
 * @param hemisphere - 'N' for northern, 'S' for southern
 * @returns Seasonal factor (0-1)
 */
export function getSeasonalFactor(
  month: number,
  hemisphere: "N" | "S",
): number {
  // Peak month: June (5) for Northern, December (11) for Southern
  const peak = hemisphere === "N" ? 5 : 11;

  // Calculate months from peak, accounting for wrap-around
  let monthsFromPeak = Math.abs(month - peak);
  if (monthsFromPeak > 6) {
    monthsFromPeak = 12 - monthsFromPeak;
  }

  // Exponential decay from peak
  // At peak: factor = 1.0
  // 3 months from peak: factor ~= 0.3
  // 6 months from peak: factor ~= 0.09
  return Math.exp(-monthsFromPeak * 0.4);
}

/**
 * Get time of day factor for Es probability
 *
 * Es activity has two daily peaks:
 * - Late morning: 10-12 local solar time (narrower peak)
 * - Early evening: 18-21 local solar time (broader peak)
 *
 * @param localHour - Local solar hour (0-24)
 * @returns Time of day factor (0-1)
 */
export function getTimeOfDayFactor(localHour: number): number {
  // Morning peak centered at 11:00 local, narrow width
  const morningPeak = Math.exp(-Math.pow((localHour - 11) / 2, 2));

  // Evening peak centered at 19:00 local, broader width
  const eveningPeak = Math.exp(-Math.pow((localHour - 19) / 3, 2));

  // Return the maximum of the two peaks
  return Math.max(morningPeak, eveningPeak);
}

/**
 * Get latitude factor for Es probability
 *
 * Es is most common at mid-latitudes (30-50 degrees)
 * with an optimal zone around 40-50 degrees.
 * Very rare at equator and polar regions.
 *
 * @param lat - Latitude in degrees (-90 to 90)
 * @returns Latitude factor (0-1)
 */
export function getLatitudeFactor(lat: number): number {
  const absLat = Math.abs(lat);

  // Very low probability at tropics and polar regions
  if (absLat < 20 || absLat > 60) {
    return 0.1;
  }

  // Optimal latitude around 45 degrees
  const optimalLat = 45;
  const deviation = absLat - optimalLat;

  // Gaussian distribution centered at optimal latitude
  return Math.exp(-Math.pow(deviation / 15, 2));
}

/**
 * Get solar activity factor for Es probability
 *
 * Es has a slight positive correlation with solar activity,
 * but the relationship is not as strong as with F2 layer propagation.
 *
 * @param sfi - Solar Flux Index (65-300+)
 * @returns Solar factor (0.8-1.2)
 */
export function getSolarFactor(sfi?: number): number {
  if (!sfi) {
    return 1.0; // Neutral factor when SFI unknown
  }

  // Normalize SFI: 65 = quiet, 150 = moderate, 200+ = high
  // Es has weak positive correlation with solar activity
  const normalizedSFI = (sfi - 65) / 150;
  return 0.9 + 0.2 * Math.min(1, Math.max(0, normalizedSFI));
}

/**
 * Get Es conditions breakdown for a location and time
 *
 * @param lat - Geographic latitude in degrees
 * @param time - Date/time for calculation
 * @param sfi - Optional Solar Flux Index
 * @returns Es conditions breakdown
 */
export function getEsConditions(
  lat: number,
  time: Date,
  sfi?: number,
): EsConditions {
  const month = time.getUTCMonth();
  const hemisphere = lat >= 0 ? "N" : "S";

  const seasonalFactor = getSeasonalFactor(month, hemisphere);
  const timeOfDayFactor = getTimeOfDayFactor(getLocalSolarHour(0, time));
  const latitudeFactor = getLatitudeFactor(lat);
  const solarFactor = getSolarFactor(sfi);

  // Es season is when seasonal factor is above 0.4
  const isEsSeason = seasonalFactor > 0.4;

  return {
    isEsSeason,
    seasonalFactor,
    timeOfDayFactor,
    latitudeFactor,
    solarFactor,
  };
}

/**
 * Calculate Es probability for a specific location and time
 *
 * @param lat - Geographic latitude in degrees
 * @param lon - Geographic longitude in degrees
 * @param time - Date/time for calculation
 * @param sfi - Optional Solar Flux Index
 * @returns Es probability result
 */
export function calculateEsProbability(
  lat: number,
  lon: number,
  time: Date,
  sfi?: number,
): EsProbability {
  const month = time.getUTCMonth();
  const hemisphere = lat >= 0 ? "N" : "S";
  const localHour = getLocalSolarHour(lon, time);

  // Calculate individual factors
  const seasonalFactor = getSeasonalFactor(month, hemisphere);
  const timeOfDayFactor = getTimeOfDayFactor(localHour);
  const latitudeFactor = getLatitudeFactor(lat);
  const solarFactor = getSolarFactor(sfi);

  // Combine factors with weighting
  // Seasonal and latitude are most important
  const combinedFactor =
    seasonalFactor * 0.35 +
    timeOfDayFactor * 0.25 +
    latitudeFactor * 0.3 +
    (solarFactor - 1) * 0.1 +
    0.1; // solarFactor contribution normalized

  // Convert to probability (0-100%)
  // Max probability is around 60% even in ideal conditions
  // Es is inherently unpredictable
  const rawProbability = combinedFactor * 70;
  const probability = Math.max(0, Math.min(100, rawProbability));

  // Estimate maximum frequency during Es
  // Higher probability correlates with higher MUF
  // Typical Es MUF: 50-150 MHz
  const maxFrequency = probability > 10 ? 50 + (probability / 100) * 100 : 0;

  // Determine opening type and max distance
  let openingType: "single-hop" | "double-hop" | "none" = "none";
  let maxDistance = 0;

  if (probability > 20) {
    openingType = "single-hop";
    maxDistance = 2000; // Typical single-hop Es: up to 2000 km
  }
  if (probability > 50) {
    // Strong Es can support double-hop
    openingType = "double-hop";
    maxDistance = 4000; // Double-hop can reach 4000+ km
  }

  // Confidence based on how many factors are favorable
  let confidence: "low" | "medium" | "high" = "low";
  const favorableFactors = [
    seasonalFactor > 0.5,
    timeOfDayFactor > 0.5,
    latitudeFactor > 0.5,
  ].filter(Boolean).length;

  if (favorableFactors >= 3) {
    confidence = "high";
  } else if (favorableFactors >= 2) {
    confidence = "medium";
  }

  return {
    probability,
    maxFrequency,
    openingType,
    maxDistance,
    confidence,
  };
}

/**
 * Check if Es is likely for a specific path between two locations
 *
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param time - Date/time for calculation
 * @returns Path Es analysis
 */
export function isEsPathLikely(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  time: Date,
): { likely: boolean; probability: number; hops: number } {
  // Calculate path distance using Haversine formula
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Es typically supports 500-2300 km per hop
  const minEsDistance = 500;
  const maxSingleHop = 2300;
  const maxDoubleHop = 4400;

  // Path too short or too long for Es
  if (distance < minEsDistance || distance > maxDoubleHop) {
    return { likely: false, probability: 0, hops: 0 };
  }

  // Calculate midpoint for Es probability
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;

  // Get Es probability at midpoint (simplified - real Es analysis is more complex)
  const midpointProb = calculateEsProbability(midLat, midLon, time);

  // Determine number of hops needed
  let hops = 1;
  if (distance > maxSingleHop) {
    hops = 2;
    // Double hop requires Es at two reflection points - reduce probability
    midpointProb.probability *= 0.6;
  }

  // Es works better for certain distance ranges
  let distanceFactor = 1.0;
  if (distance >= 1000 && distance <= 1800) {
    // Optimal single-hop range
    distanceFactor = 1.2;
  } else if (distance < 800) {
    // Short paths are less common via Es
    distanceFactor = 0.7;
  }

  const adjustedProbability = Math.min(
    100,
    midpointProb.probability * distanceFactor,
  );

  return {
    likely: adjustedProbability > 25,
    probability: adjustedProbability,
    hops,
  };
}

/**
 * Generate a grid of Es probability values for map overlay
 *
 * @param time - Date/time for calculation
 * @param resolution - Grid resolution in degrees (default: 5)
 * @returns Array of grid points with Es probability
 */
export function getEsProbabilityGrid(
  time: Date,
  resolution: number = 5,
): EsGridPoint[] {
  const grid: EsGridPoint[] = [];

  // Generate grid points
  // Focus on mid-latitudes where Es is most common
  for (let lat = -70; lat <= 70; lat += resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      const prob = calculateEsProbability(lat, lon, time);

      // Only include points with meaningful probability
      if (prob.probability > 5) {
        grid.push({
          lat,
          lon,
          probability: prob.probability,
        });
      }
    }
  }

  return grid;
}

/**
 * Get human-readable Es conditions description
 *
 * @param probability - Es probability result
 * @param conditions - Es conditions breakdown
 * @returns Human-readable description
 */
export function describeEsConditions(
  probability: EsProbability,
  conditions: EsConditions,
): string {
  const parts: string[] = [];

  if (probability.probability < 10) {
    parts.push("Es unlikely");
  } else if (probability.probability < 30) {
    parts.push("Es possible");
  } else if (probability.probability < 50) {
    parts.push("Es likely");
  } else {
    parts.push("Es highly likely");
  }

  if (conditions.isEsSeason) {
    parts.push("(Es season)");
  }

  if (probability.openingType !== "none") {
    parts.push(`${probability.openingType} possible`);
    parts.push(`up to ${Math.round(probability.maxFrequency)} MHz`);
  }

  return parts.join(" - ");
}

/**
 * Check if a frequency is suitable for Es propagation
 *
 * @param frequencyMHz - Frequency in MHz
 * @returns Whether the frequency is commonly used for Es
 */
export function isEsFrequency(frequencyMHz: number): boolean {
  // Common Es frequencies:
  // 28 MHz (10m) - Occasional Es
  // 50 MHz (6m) - Primary Es band
  // 70 MHz (4m) - Where available
  // 144 MHz (2m) - Strong Es only
  return (
    (frequencyMHz >= 28 && frequencyMHz <= 30) || // 10m
    (frequencyMHz >= 50 && frequencyMHz <= 54) || // 6m
    (frequencyMHz >= 70 && frequencyMHz <= 71) || // 4m
    (frequencyMHz >= 144 && frequencyMHz <= 148) // 2m
  );
}

/**
 * Get recommended bands for current Es conditions
 *
 * @param probability - Es probability percentage
 * @returns Array of recommended band names
 */
export function getRecommendedEsBands(probability: number): string[] {
  const bands: string[] = [];

  if (probability > 10) {
    bands.push("6m"); // 50 MHz - most common Es band
  }
  if (probability > 20) {
    bands.push("10m"); // 28 MHz - benefits from Es
  }
  if (probability > 40) {
    bands.push("4m"); // 70 MHz - where available
  }
  if (probability > 60) {
    bands.push("2m"); // 144 MHz - strong Es only
  }

  return bands;
}
