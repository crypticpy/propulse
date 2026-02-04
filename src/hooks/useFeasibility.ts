/**
 * useFeasibility Hook
 *
 * Calculates path feasibility for ham radio propagation based on distance,
 * time of day, solar flux index, and geomagnetic conditions.
 *
 * Provides a composite score and optimal band recommendations for any path.
 */

import { useMemo } from "react";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { getDistance, getMidpoint } from "@/lib/utils/path";
import { getSubsolarPoint, isPointInDaylight } from "@/lib/utils/sun";

/**
 * Feasibility level indicating propagation quality
 */
export type FeasibilityLevel =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "unlikely";

/**
 * Complete feasibility analysis result
 */
export interface FeasibilityResult {
  /** Overall feasibility level */
  level: FeasibilityLevel;
  /** Composite score from 0-100 */
  score: number;
  /** Recommended band for this path */
  optimalBand: string;
  /** Estimated Maximum Usable Frequency in MHz */
  mufEstimate: number;
  /** Whether path is in grayline enhancement zone */
  isGrayline: boolean;
  /** Whether both endpoints are in darkness */
  isNightPath: boolean;
  /** Whether both endpoints are in daylight */
  isDayPath: boolean;
  /** Human-readable factors affecting the analysis */
  reasoning: string[];
}

/**
 * Options for the useFeasibility hook
 */
export interface UseFeasibilityOptions {
  /** Origin grid square (4 or 6 character Maidenhead) */
  fromGrid: string;
  /** Destination grid square (4 or 6 character Maidenhead) */
  toGrid: string;
  /** Solar Flux Index (default: 100) */
  sfi?: number;
  /** Geomagnetic K-index (default: 2) */
  kIndex?: number;
  /** Time to evaluate (default: now) */
  time?: Date;
}

// Terminator proximity threshold in degrees for grayline detection
const GRAYLINE_THRESHOLD_DEG = 20;

/**
 * Calculate the distance factor score (0-25 points)
 */
function calculateDistanceFactor(distanceKm: number): {
  score: number;
  reasoning: string;
} {
  if (distanceKm < 2000) {
    return {
      score: 25,
      reasoning: `Short path (${Math.round(distanceKm)} km) - usually reliable`,
    };
  } else if (distanceKm < 8000) {
    return {
      score: 20,
      reasoning: `Medium path (${Math.round(distanceKm)} km) - good with propagation`,
    };
  } else if (distanceKm < 15000) {
    return {
      score: 15,
      reasoning: `Long path (${Math.round(distanceKm)} km) - challenging, multiple hops`,
    };
  } else {
    return {
      score: 10,
      reasoning: `Very long path (${Math.round(distanceKm)} km) - difficult, consider long path`,
    };
  }
}

/**
 * Calculate the time of day factor score (0-25 points)
 */
function calculateTimeFactor(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  time: Date,
): {
  score: number;
  reasoning: string;
  isDayPath: boolean;
  isNightPath: boolean;
  isGrayline: boolean;
} {
  const fromDaylight = isPointInDaylight(fromLat, fromLon, time);
  const toDaylight = isPointInDaylight(toLat, toLon, time);

  // Get subsolar point for terminator distance calculation
  const subsolar = getSubsolarPoint(time);

  // Calculate angular distance from terminator (90 degrees from subsolar = terminator)
  const fromSubsolarDist = getDistance(
    fromLat,
    fromLon,
    subsolar.lat,
    subsolar.lon,
  );
  const toSubsolarDist = getDistance(toLat, toLon, subsolar.lat, subsolar.lon);

  // Convert to angular distance (Earth circumference / 360 = ~111 km per degree)
  const fromTerminatorDist = Math.abs(fromSubsolarDist / 111 - 90);
  const toTerminatorDist = Math.abs(toSubsolarDist / 111 - 90);

  // Check if path is in grayline zone (both endpoints near terminator)
  const isGrayline =
    fromTerminatorDist < GRAYLINE_THRESHOLD_DEG &&
    toTerminatorDist < GRAYLINE_THRESHOLD_DEG;

  const isDayPath = fromDaylight && toDaylight;
  const isNightPath = !fromDaylight && !toDaylight;
  const isMixedPath = fromDaylight !== toDaylight;

  if (isGrayline) {
    return {
      score: 25,
      reasoning: "Grayline enhancement - optimal propagation conditions",
      isDayPath,
      isNightPath,
      isGrayline: true,
    };
  } else if (isDayPath) {
    return {
      score: 20,
      reasoning: "Both ends in daylight - good HF propagation",
      isDayPath: true,
      isNightPath: false,
      isGrayline: false,
    };
  } else if (isMixedPath) {
    return {
      score: 15,
      reasoning: "Mixed day/night path - moderate conditions",
      isDayPath: false,
      isNightPath: false,
      isGrayline: false,
    };
  } else {
    return {
      score: 10,
      reasoning: "Both ends in darkness - lower bands preferred",
      isDayPath: false,
      isNightPath: true,
      isGrayline: false,
    };
  }
}

/**
 * Calculate the solar flux factor score (0-25 points)
 */
function calculateSolarFluxFactor(sfi: number): {
  score: number;
  reasoning: string;
} {
  if (sfi > 150) {
    return {
      score: 25,
      reasoning: `SFI ${sfi} - Excellent HF conditions`,
    };
  } else if (sfi >= 100) {
    return {
      score: 20,
      reasoning: `SFI ${sfi} - Good conditions`,
    };
  } else if (sfi >= 70) {
    return {
      score: 15,
      reasoning: `SFI ${sfi} - Fair conditions`,
    };
  } else {
    return {
      score: 10,
      reasoning: `SFI ${sfi} - Poor HF, use lower bands`,
    };
  }
}

/**
 * Calculate the geomagnetic factor score (0-25 points)
 */
function calculateGeomagneticFactor(kIndex: number): {
  score: number;
  reasoning: string;
} {
  if (kIndex <= 1) {
    return {
      score: 25,
      reasoning: `K-index ${kIndex} - Quiet, excellent conditions`,
    };
  } else if (kIndex <= 3) {
    return {
      score: 20,
      reasoning: `K-index ${kIndex} - Unsettled, good conditions`,
    };
  } else if (kIndex <= 5) {
    return {
      score: 10,
      reasoning: `K-index ${kIndex} - Storm conditions, degraded propagation`,
    };
  } else {
    return {
      score: 5,
      reasoning: `K-index ${kIndex} - Major storm, difficult conditions`,
    };
  }
}

/**
 * Convert score to feasibility level
 */
function scoreToLevel(score: number): FeasibilityLevel {
  if (score >= 80) {
    return "excellent";
  }
  if (score >= 60) {
    return "good";
  }
  if (score >= 40) {
    return "fair";
  }
  if (score >= 20) {
    return "poor";
  }
  return "unlikely";
}

/**
 * Estimate MUF using simplified formula
 * MUF = 0.3 * SFI * cos(midpoint_latitude)
 * Clamped between 7 and 50 MHz
 */
function estimateMUF(midpointLat: number, sfi: number): number {
  const muf = 0.3 * sfi * Math.cos((midpointLat * Math.PI) / 180);
  return Math.max(7, Math.min(50, muf));
}

/**
 * Determine optimal band based on distance, time of day, and MUF
 */
function determineOptimalBand(
  distanceKm: number,
  muf: number,
  isNightPath: boolean,
  isDayPath: boolean,
): string {
  // Base band selection on distance
  let baseBand: string;
  if (distanceKm < 500) {
    baseBand = "10m";
  } else if (distanceKm < 2000) {
    baseBand = "20m";
  } else if (distanceKm < 5000) {
    baseBand = "20m";
  } else if (distanceKm < 10000) {
    baseBand = "20m";
  } else {
    baseBand = "40m";
  }

  // Adjust for time of day
  if (isNightPath) {
    // Night paths prefer lower bands
    const nightBands: Record<string, string> = {
      "10m": "40m",
      "15m": "40m",
      "20m": "40m",
      "30m": "40m",
      "40m": "80m",
      "80m": "80m",
    };
    baseBand = nightBands[baseBand] || "40m";
  } else if (isDayPath) {
    // Day paths can use higher bands if MUF supports it
    if (muf > 28 && distanceKm < 3000) {
      baseBand = "10m";
    } else if (muf > 21 && distanceKm < 5000) {
      baseBand = "15m";
    } else if (muf > 14) {
      baseBand = "20m";
    }
  }

  // Final MUF check - don't recommend bands above MUF
  const bandFrequencies: Record<string, number> = {
    "10m": 28,
    "15m": 21,
    "20m": 14,
    "30m": 10,
    "40m": 7,
    "80m": 3.5,
    "160m": 1.8,
  };

  const bandFreq = bandFrequencies[baseBand] || 14;
  if (bandFreq > muf) {
    // Step down to a band below MUF
    if (muf > 21) {
      return "15m";
    }
    if (muf > 14) {
      return "20m";
    }
    if (muf > 10) {
      return "30m";
    }
    if (muf > 7) {
      return "40m";
    }
    return "80m";
  }

  return baseBand;
}

/**
 * Hook to calculate path feasibility for ham radio propagation
 *
 * @param options - Configuration options including grid squares and conditions
 * @returns FeasibilityResult with score, level, and recommendations
 *
 * @example
 * ```tsx
 * const result = useFeasibility({
 *   fromGrid: "EM10",
 *   toGrid: "JO31",
 *   sfi: 120,
 *   kIndex: 2,
 * });
 *
 * console.log(result.level);       // "good"
 * console.log(result.optimalBand); // "20m"
 * console.log(result.isGrayline);  // false
 * ```
 */
export function useFeasibility(
  options: UseFeasibilityOptions,
): FeasibilityResult {
  const {
    fromGrid,
    toGrid,
    sfi = 100,
    kIndex = 2,
    time = new Date(),
  } = options;

  return useMemo(() => {
    const reasoning: string[] = [];

    // Validate grids
    if (!isValidGrid(fromGrid) || !isValidGrid(toGrid)) {
      return {
        level: "unlikely" as FeasibilityLevel,
        score: 0,
        optimalBand: "20m",
        mufEstimate: 14,
        isGrayline: false,
        isNightPath: false,
        isDayPath: false,
        reasoning: ["Invalid grid square format"],
      };
    }

    // Convert grids to coordinates
    const from = gridToLatLon(fromGrid);
    const to = gridToLatLon(toGrid);

    // Calculate distance
    const distanceKm = getDistance(from.lat, from.lon, to.lat, to.lon);

    // Calculate midpoint for MUF estimation
    const midpoint = getMidpoint(from.lat, from.lon, to.lat, to.lon);

    // Calculate each factor
    const distanceFactor = calculateDistanceFactor(distanceKm);
    reasoning.push(distanceFactor.reasoning);

    const timeFactor = calculateTimeFactor(
      from.lat,
      from.lon,
      to.lat,
      to.lon,
      time,
    );
    reasoning.push(timeFactor.reasoning);

    const solarFactor = calculateSolarFluxFactor(sfi);
    reasoning.push(solarFactor.reasoning);

    const geomagFactor = calculateGeomagneticFactor(kIndex);
    reasoning.push(geomagFactor.reasoning);

    // Calculate total score
    const totalScore =
      distanceFactor.score +
      timeFactor.score +
      solarFactor.score +
      geomagFactor.score;

    // Estimate MUF
    const mufEstimate = estimateMUF(midpoint.lat, sfi);

    // Determine optimal band
    const optimalBand = determineOptimalBand(
      distanceKm,
      mufEstimate,
      timeFactor.isNightPath,
      timeFactor.isDayPath,
    );

    return {
      level: scoreToLevel(totalScore),
      score: totalScore,
      optimalBand,
      mufEstimate: Math.round(mufEstimate * 10) / 10,
      isGrayline: timeFactor.isGrayline,
      isNightPath: timeFactor.isNightPath,
      isDayPath: timeFactor.isDayPath,
      reasoning,
    };
  }, [fromGrid, toGrid, sfi, kIndex, time]);
}

/**
 * Standalone function for feasibility calculation without React hooks
 * Useful for server-side or non-React contexts
 */
export function calculateFeasibility(
  options: UseFeasibilityOptions,
): FeasibilityResult {
  const {
    fromGrid,
    toGrid,
    sfi = 100,
    kIndex = 2,
    time = new Date(),
  } = options;
  const reasoning: string[] = [];

  // Validate grids
  if (!isValidGrid(fromGrid) || !isValidGrid(toGrid)) {
    return {
      level: "unlikely",
      score: 0,
      optimalBand: "20m",
      mufEstimate: 14,
      isGrayline: false,
      isNightPath: false,
      isDayPath: false,
      reasoning: ["Invalid grid square format"],
    };
  }

  // Convert grids to coordinates
  const from = gridToLatLon(fromGrid);
  const to = gridToLatLon(toGrid);

  // Calculate distance
  const distanceKm = getDistance(from.lat, from.lon, to.lat, to.lon);

  // Calculate midpoint for MUF estimation
  const midpoint = getMidpoint(from.lat, from.lon, to.lat, to.lon);

  // Calculate each factor
  const distanceFactor = calculateDistanceFactor(distanceKm);
  reasoning.push(distanceFactor.reasoning);

  const timeFactor = calculateTimeFactor(
    from.lat,
    from.lon,
    to.lat,
    to.lon,
    time,
  );
  reasoning.push(timeFactor.reasoning);

  const solarFactor = calculateSolarFluxFactor(sfi);
  reasoning.push(solarFactor.reasoning);

  const geomagFactor = calculateGeomagneticFactor(kIndex);
  reasoning.push(geomagFactor.reasoning);

  // Calculate total score
  const totalScore =
    distanceFactor.score +
    timeFactor.score +
    solarFactor.score +
    geomagFactor.score;

  // Estimate MUF
  const mufEstimate = estimateMUF(midpoint.lat, sfi);

  // Determine optimal band
  const optimalBand = determineOptimalBand(
    distanceKm,
    mufEstimate,
    timeFactor.isNightPath,
    timeFactor.isDayPath,
  );

  return {
    level: scoreToLevel(totalScore),
    score: totalScore,
    optimalBand,
    mufEstimate: Math.round(mufEstimate * 10) / 10,
    isGrayline: timeFactor.isGrayline,
    isNightPath: timeFactor.isNightPath,
    isDayPath: timeFactor.isDayPath,
    reasoning,
  };
}
