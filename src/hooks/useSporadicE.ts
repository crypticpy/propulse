/**
 * React hook for Sporadic E calculations
 *
 * Provides Es probability and conditions for a given location,
 * automatically updating based on time and solar conditions.
 */

import { useMemo } from "react";
import {
  calculateEsProbability,
  getEsConditions,
  type EsProbability,
  type EsConditions,
} from "@/lib/utils/sporadicE";
import { useSolarFlux } from "./useSolarData";

/**
 * Default Es probability when location is not available
 */
const DEFAULT_ES_PROBABILITY: EsProbability = {
  probability: 0,
  maxFrequency: 0,
  openingType: "none",
  maxDistance: 0,
  confidence: "low",
};

/**
 * Default Es conditions when location is not available
 */
const DEFAULT_ES_CONDITIONS: EsConditions = {
  isEsSeason: false,
  seasonalFactor: 0,
  timeOfDayFactor: 0,
  latitudeFactor: 0,
  solarFactor: 1,
};

/**
 * Hook result interface
 */
export interface UseSporadicEResult {
  /** Es probability calculation result */
  probability: EsProbability;
  /** Es conditions breakdown */
  conditions: EsConditions;
  /** Whether Es is currently active (probability > 30%) */
  isActive: boolean;
  /** Whether Es exceeds alert threshold (probability > 50%) */
  alertThreshold: boolean;
  /** Whether data is loading */
  isLoading: boolean;
}

/**
 * Hook to calculate Sporadic E probability and conditions
 *
 * @param lat - Optional latitude in degrees
 * @param lon - Optional longitude in degrees
 * @param displayTime - Optional display time (defaults to current time)
 * @returns Es probability and conditions
 *
 * @example
 * ```tsx
 * const { probability, conditions, isActive } = useSporadicE(45.0, -93.0);
 *
 * if (isActive) {
 *   console.log(`Es probability: ${probability.probability}%`);
 *   console.log(`Max frequency: ${probability.maxFrequency} MHz`);
 * }
 * ```
 */
export function useSporadicE(
  lat?: number,
  lon?: number,
  displayTime?: Date,
): UseSporadicEResult {
  // Get current SFI for solar factor calculation
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();

  // Get most recent SFI value
  const currentSFI = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return undefined;
    }
    return solarFluxData[solarFluxData.length - 1]?.flux;
  }, [solarFluxData]);

  // Use provided time or current time
  const time = displayTime ?? new Date();

  // Calculate Es probability
  const probability = useMemo(() => {
    if (lat === undefined || lon === undefined) {
      return DEFAULT_ES_PROBABILITY;
    }
    return calculateEsProbability(lat, lon, time, currentSFI);
  }, [lat, lon, time, currentSFI]);

  // Calculate Es conditions breakdown
  const conditions = useMemo(() => {
    if (lat === undefined) {
      return DEFAULT_ES_CONDITIONS;
    }
    return getEsConditions(lat, time, currentSFI);
  }, [lat, time, currentSFI]);

  // Determine activity thresholds
  const isActive = probability.probability > 30;
  const alertThreshold = probability.probability > 50;

  return {
    probability,
    conditions,
    isActive,
    alertThreshold,
    isLoading: sfiLoading,
  };
}

/**
 * Hook to get Es probability grid for overlay display
 *
 * This hook is optimized for rendering efficiency by memoizing
 * the grid calculation based on time changes.
 *
 * @param displayTime - Display time for calculation
 * @param resolution - Grid resolution in degrees (default: 5)
 * @returns Es probability grid
 */
export function useSporadicEGrid(
  displayTime: Date,
  resolution: number = 5,
): {
  grid: Array<{ lat: number; lon: number; probability: number }>;
  isLoading: boolean;
} {
  const { data: solarFluxData, isLoading } = useSolarFlux();

  const currentSFI = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return undefined;
    }
    return solarFluxData[solarFluxData.length - 1]?.flux;
  }, [solarFluxData]);

  // Round time to 15-minute intervals for stable memoization
  const roundedTime = useMemo(() => {
    const time = new Date(displayTime);
    time.setMinutes(Math.floor(time.getMinutes() / 15) * 15, 0, 0);
    return time;
  }, [displayTime]);

  // Generate grid - memoized on time and SFI changes
  const grid = useMemo(() => {
    const points: Array<{ lat: number; lon: number; probability: number }> = [];

    // Generate grid points focusing on mid-latitudes
    for (let lat = -70; lat <= 70; lat += resolution) {
      for (let lon = -180; lon < 180; lon += resolution) {
        const prob = calculateEsProbability(lat, lon, roundedTime, currentSFI);

        // Only include points with meaningful probability
        if (prob.probability > 5) {
          points.push({
            lat,
            lon,
            probability: prob.probability,
          });
        }
      }
    }

    return points;
  }, [roundedTime, currentSFI, resolution]);

  return {
    grid,
    isLoading,
  };
}
