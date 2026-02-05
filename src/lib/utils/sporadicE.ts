/**
 * Sporadic E Detection & Prediction Engine
 *
 * Detects sporadic E (Es) layer openings from live spot data and provides
 * seasonal/regional forecasts. Es is an ionospheric phenomenon where patches
 * of unusually dense ionization form in the E layer (~100 km altitude),
 * enabling VHF propagation on 6m and enhanced 10m propagation.
 *
 * NO React dependencies - pure utility module.
 */

import type { DXSpot } from "@/types/dxcluster";
import { getDistance } from "@/lib/utils/path";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Detected sporadic E opening derived from live spot analysis
 */
export interface EsDetection {
  /** Whether the Es opening is currently active */
  active: boolean;
  /** Latitude of the estimated Es cloud center */
  centerLat: number;
  /** Longitude of the estimated Es cloud center */
  centerLon: number;
  /** Estimated radius of the Es cloud in km */
  radiusKm: number;
  /** Number of supporting spots */
  spotCount: number;
  /** Bands with detected Es activity, e.g. ["6m", "10m"] */
  bands: string[];
  /** Estimated maximum usable frequency in MHz */
  estimatedMUFMHz: number;
  /** Timestamp when the opening was first detected */
  detectedAt: number;
  /** Timestamp of the most recent supporting spot */
  lastSpotAt: number;
  /** Duration in seconds since first detection */
  duration: number;
  /** Confidence level 0-1 based on spot density */
  confidence: number;
}

/**
 * Seasonal/regional Es forecast
 */
export interface EsForecast {
  /** Probability of Es occurring (0-1) */
  probability: number;
  /** Expected maximum usable frequency ceiling in MHz */
  expectedCeilingMHz: number;
  /** Typical duration in minutes */
  typicalDurationMinutes: number;
  /** Current season category */
  season: "peak" | "secondary" | "off-season";
  /** Human-readable forecast description */
  description: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** 6m band frequency range in kHz */
const BAND_6M_LOW_KHZ = 50000;
const BAND_6M_HIGH_KHZ = 54000;

/** 10m band frequency range in kHz */
const BAND_10M_LOW_KHZ = 28000;
const BAND_10M_HIGH_KHZ = 29700;

/** Minimum spot counts to trigger detection */
const MIN_SPOTS_6M = 5;
const MIN_SPOTS_10M = 10;

/** Es single-hop distance range in km */
const ES_MIN_HOP_KM = 800;
const ES_MAX_SINGLE_HOP_KM = 2300;

/** Es multi-hop max distance in km */
const ES_MAX_MULTI_HOP_KM = 4600;

/** Percentile for radius calculation (0-1) */
const RADIUS_PERCENTILE = 0.8;

/** MUF margin factor (add 10% above highest observed frequency) */
const MUF_MARGIN = 1.1;

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Check if a frequency (in kHz) falls within the 6m band
 */
function is6mSpot(frequencyKHz: number): boolean {
  return frequencyKHz >= BAND_6M_LOW_KHZ && frequencyKHz <= BAND_6M_HIGH_KHZ;
}

/**
 * Check if a frequency (in kHz) falls within the 10m band
 */
function is10mSpot(frequencyKHz: number): boolean {
  return frequencyKHz >= BAND_10M_LOW_KHZ && frequencyKHz <= BAND_10M_HIGH_KHZ;
}

/**
 * Calculate the midpoint between spotter and DX station.
 * Returns null if either location is missing.
 */
function getSpotMidpoint(spot: DXSpot): { lat: number; lon: number } | null {
  if (
    spot.spotterLat == null ||
    spot.spotterLon == null ||
    spot.dxLat == null ||
    spot.dxLon == null
  ) {
    return null;
  }

  // Simple average midpoint (adequate for Es detection at mid-latitudes)
  return {
    lat: (spot.spotterLat + spot.dxLat) / 2,
    lon: (spot.spotterLon + spot.dxLon) / 2,
  };
}

/**
 * Calculate the nth percentile value from a sorted array of numbers
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = p * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sortedValues.length)
    return sortedValues[sortedValues.length - 1];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Detect an active sporadic E opening from a set of DX spots.
 *
 * Algorithm:
 * 1. Filter spots on 6m and 10m within the time window
 * 2. Require minimum spot counts (5 on 6m OR 10 on 10m)
 * 3. Calculate centroid of spot midpoints
 * 4. Calculate radius as the 80th percentile distance from centroid
 * 5. Estimate MUF from highest observed frequency + 10% margin
 * 6. Compute confidence from spot count
 *
 * @param spots - Array of DX spots to analyze
 * @param timeWindowMs - Time window in ms (default 5 minutes)
 * @returns EsDetection if opening detected, null otherwise
 */
export function detectEsOpening(
  spots: DXSpot[],
  timeWindowMs: number = 300_000,
): EsDetection | null {
  const now = Date.now();
  const cutoff = now - timeWindowMs;

  // Filter spots within time window on Es-relevant bands
  const recentSpots = spots.filter((s) => {
    const spotTime = s.time instanceof Date ? s.time.getTime() : Number(s.time);
    return spotTime >= cutoff;
  });

  const spots6m = recentSpots.filter((s) => is6mSpot(s.frequency));
  const spots10m = recentSpots.filter((s) => is10mSpot(s.frequency));

  const has6m = spots6m.length >= MIN_SPOTS_6M;
  const has10m = spots10m.length >= MIN_SPOTS_10M;

  if (!has6m && !has10m) {
    return null;
  }

  // Combine relevant spots
  const esSpots = [...(has6m ? spots6m : []), ...(has10m ? spots10m : [])];

  // Calculate midpoints (only spots with location data)
  const midpoints = esSpots
    .map((s) => getSpotMidpoint(s))
    .filter((mp): mp is { lat: number; lon: number } => mp !== null);

  if (midpoints.length < 2) {
    return null;
  }

  // Calculate centroid
  const centroid = {
    lat: midpoints.reduce((sum, p) => sum + p.lat, 0) / midpoints.length,
    lon: midpoints.reduce((sum, p) => sum + p.lon, 0) / midpoints.length,
  };

  // Calculate distances from centroid for radius estimation
  const distances = midpoints
    .map((p) => getDistance(centroid.lat, centroid.lon, p.lat, p.lon))
    .sort((a, b) => a - b);

  const radiusKm = Math.max(100, percentile(distances, RADIUS_PERCENTILE));

  // Find highest frequency among Es spots (convert kHz to MHz)
  const highestFreqMHz = Math.max(...esSpots.map((s) => s.frequency)) / 1000;
  const estimatedMUFMHz = Math.round(highestFreqMHz * MUF_MARGIN * 10) / 10;

  // Determine active bands
  const bands: string[] = [];
  if (has6m) bands.push("6m");
  if (has10m) bands.push("10m");

  // Calculate confidence based on total spot count
  const totalSpots = esSpots.length;
  let confidence: number;
  if (totalSpots >= 20) {
    confidence = 0.9;
  } else if (totalSpots >= 10) {
    confidence = 0.7;
  } else {
    confidence = 0.5;
  }

  // Timestamps
  const spotTimes = esSpots.map((s) =>
    s.time instanceof Date ? s.time.getTime() : Number(s.time),
  );
  const firstSpotAt = Math.min(...spotTimes);
  const lastSpotAt = Math.max(...spotTimes);
  const duration = Math.round((lastSpotAt - firstSpotAt) / 1000);

  return {
    active: true,
    centerLat: Math.round(centroid.lat * 100) / 100,
    centerLon: Math.round(centroid.lon * 100) / 100,
    radiusKm: Math.round(radiusKm),
    spotCount: totalSpots,
    bands,
    estimatedMUFMHz,
    detectedAt: firstSpotAt,
    lastSpotAt,
    duration,
    confidence,
  };
}

// =============================================================================
// SEASONAL PROBABILITY
// =============================================================================

/**
 * Monthly Es probability for the Northern Hemisphere.
 * Index 0 = January, 11 = December.
 * Based on observed Es occurrence statistics.
 */
const NH_MONTHLY_PROBABILITY: number[] = [
  0.15, // Jan  (secondary peak)
  0.05, // Feb
  0.05, // Mar
  0.3, // Apr
  0.6, // May
  0.8, // Jun  (peak)
  0.6, // Jul
  0.3, // Aug
  0.05, // Sep
  0.05, // Oct
  0.15, // Nov  (secondary peak)
  0.3, // Dec  (secondary peak)
];

/**
 * Get latitude-based scaling factor for Es probability.
 * Es is most common at mid-latitudes (30-60 degrees).
 */
function getLatitudeScale(absLat: number): number {
  if (absLat >= 30 && absLat <= 60) {
    return 1.0; // Midlatitude sweet spot
  } else if (absLat < 30) {
    return 0.5; // Tropical - less common
  } else {
    return 0.3; // Polar - rare
  }
}

/**
 * Get the seasonal Es probability for a given month and latitude.
 *
 * Northern hemisphere uses direct month lookup.
 * Southern hemisphere shifts by 6 months.
 * Latitude scaling: 30-60 deg = 1.0x, 0-30 deg = 0.5x, >60 deg = 0.3x.
 *
 * @param month - Month (0-11, where 0=January)
 * @param latDeg - Latitude in degrees (positive = north)
 * @returns Probability 0-1
 */
export function getEsSeasonalProbability(
  month: number,
  latDeg: number,
): number {
  // Normalize month to 0-11
  const normalizedMonth = ((month % 12) + 12) % 12;

  // For southern hemisphere, shift by 6 months
  const effectiveMonth =
    latDeg >= 0 ? normalizedMonth : (normalizedMonth + 6) % 12;

  const baseProbability = NH_MONTHLY_PROBABILITY[effectiveMonth];
  const latScale = getLatitudeScale(Math.abs(latDeg));

  return Math.min(1, baseProbability * latScale);
}

// =============================================================================
// REGIONAL FORECAST
// =============================================================================

/**
 * Determine the season category based on monthly probability.
 */
function getSeasonCategory(
  probability: number,
): "peak" | "secondary" | "off-season" {
  if (probability >= 0.5) return "peak";
  if (probability >= 0.15) return "secondary";
  return "off-season";
}

/**
 * Generate a regional Es forecast for the given date and latitude.
 *
 * Combines seasonal probability with latitude factor to produce
 * expected ceiling, duration, and descriptive text.
 *
 * @param date - Date to forecast for
 * @param latDeg - Latitude in degrees
 * @returns EsForecast with probability, ceiling, duration, and description
 */
export function getEsRegionalForecast(date: Date, latDeg: number): EsForecast {
  const month = date.getMonth(); // 0-11
  const probability = getEsSeasonalProbability(month, latDeg);
  const season = getSeasonCategory(probability);

  // Expected ceiling based on probability
  let expectedCeilingMHz: number;
  let typicalDurationMinutes: number;
  let description: string;

  if (probability >= 0.6) {
    // Strong season - openings to 6m and possibly 2m
    expectedCeilingMHz = 70;
    typicalDurationMinutes = 120;
    description =
      "Peak Es season. Strong openings on 6m likely, with occasional extension to 70 MHz. " +
      "Monitor 50.110 MHz for beacon activity. Multi-hop paths possible.";
  } else if (probability >= 0.3) {
    // Moderate season - 6m openings common
    expectedCeilingMHz = 54;
    typicalDurationMinutes = 60;
    description =
      "Moderate Es conditions expected. 6m openings possible, typically supporting " +
      "single-hop paths up to 2300 km. 10m may see enhanced propagation.";
  } else if (probability >= 0.15) {
    // Secondary peak or transition - occasional openings
    expectedCeilingMHz = 50;
    typicalDurationMinutes = 30;
    description =
      "Secondary Es season. Brief openings possible on 10m and lower 6m frequencies. " +
      "Keep 50 MHz FM calling frequency monitored.";
  } else {
    // Off-season - rare openings
    expectedCeilingMHz = 30;
    typicalDurationMinutes = 15;
    description =
      "Off-season for sporadic E. Openings are rare but not impossible. " +
      "Any Es activity will likely be limited to 10m.";
  }

  // Exceptional openings (very high probability) can reach 144 MHz
  if (probability >= 0.8) {
    expectedCeilingMHz = 144;
    typicalDurationMinutes = 240;
    description =
      "Peak Es season with excellent conditions. 6m wide open, with rare chance of " +
      "2m Es openings. Extended multi-hop paths across continents possible.";
  }

  return {
    probability: Math.round(probability * 100) / 100,
    expectedCeilingMHz,
    typicalDurationMinutes,
    season,
    description,
  };
}

// =============================================================================
// PATH VIABILITY
// =============================================================================

/**
 * Check if a sporadic E propagation path is viable between two locations.
 *
 * Single-hop Es: 800-2300 km
 * Multi-hop Es: 2300-4600 km (rare but documented)
 *
 * @param lat1 - Station 1 latitude
 * @param lon1 - Station 1 longitude
 * @param lat2 - Station 2 latitude
 * @param lon2 - Station 2 longitude
 * @returns true if the distance is within Es propagation range
 */
export function isEsPathViable(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): boolean {
  const distance = getDistance(lat1, lon1, lat2, lon2);
  return distance >= ES_MIN_HOP_KM && distance <= ES_MAX_MULTI_HOP_KM;
}

/**
 * Classify an Es path by hop count.
 *
 * @param lat1 - Station 1 latitude
 * @param lon1 - Station 1 longitude
 * @param lat2 - Station 2 latitude
 * @param lon2 - Station 2 longitude
 * @returns "single-hop" | "multi-hop" | "out-of-range"
 */
export function classifyEsPath(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): "single-hop" | "multi-hop" | "out-of-range" {
  const distance = getDistance(lat1, lon1, lat2, lon2);

  if (distance < ES_MIN_HOP_KM || distance > ES_MAX_MULTI_HOP_KM) {
    return "out-of-range";
  }
  if (distance <= ES_MAX_SINGLE_HOP_KM) {
    return "single-hop";
  }
  return "multi-hop";
}
