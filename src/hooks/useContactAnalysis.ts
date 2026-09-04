/**
 * Hook for analyzing propagation path between viewer and target station.
 * Computes distance, bearing, band conditions, shared bands/modes,
 * schedule overlap, and best contact recommendation.
 */

import { useMemo } from "react";
import {
  getBandConditionsForPath,
  getEnhancedBandConditions,
  calculateGreatCircleDistance,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";

export interface ContactAnalysis {
  /** Great circle distance in km */
  distance: number;
  /** Bearing from viewer to target in degrees (0-360) */
  bearing: number;
  /** Band-by-band propagation conditions for this path */
  bandConditions: PathBandCondition[];
  /** Bands both operators have used */
  sharedBands: string[];
  /** Modes both operators have used */
  sharedModes: string[];
  /** 24-element array, true where both stations are active */
  overlapHours: boolean[];
  /** Recommended band for contact (best SNR in shared, or overall best) */
  bestBand: string | null;
  /** Best contiguous overlap time range, e.g. "14-18z" */
  bestTimeRange: string | null;
}

interface UseContactAnalysisParams {
  viewerLat: number;
  viewerLon: number;
  targetLat: number;
  targetLon: number;
  viewerStats?: Record<string, unknown>;
  targetStats?: Record<string, unknown>;
  viewerHours?: number[];
  targetHours?: number[];
  txPowerWatts?: number;
  mode?: "SSB" | "CW" | "FT8";
  antennaGainDbi?: number;
  farEndGainDbi?: number | ((band: string) => number);
}

/**
 * Calculate initial bearing from point A to point B along a great circle.
 */
function calculateBearing(
  lat1Deg: number,
  lon1Deg: number,
  lat2Deg: number,
  lon2Deg: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(lat1Deg);
  const lat2 = toRad(lat2Deg);
  const dLon = toRad(lon2Deg - lon1Deg);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Approximate path illumination percentage from current UTC hour.
 * Noon UTC = 100%, midnight UTC = 0%, sinusoidal interpolation.
 */
function approximatePathIllumination(): number {
  const utcHour = new Date().getUTCHours();
  // Map 0-24 to a sine wave peaking at 12 UTC
  const fraction = Math.cos(((utcHour - 12) / 12) * Math.PI);
  // Scale from [-1,1] to [0,100]
  return Math.round(((fraction + 1) / 2) * 100);
}

/**
 * Extract keys from a Record<string, number> embedded in a stats cache object.
 */
function extractRecordKeys(
  stats: Record<string, unknown> | undefined,
  field: string,
): string[] {
  if (!stats) return [];
  const record = stats[field];
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return Object.keys(record as Record<string, unknown>);
  }
  return [];
}

/**
 * Find the longest contiguous run of true values in a boolean array,
 * returning the start and end+1 indices (wrapping not supported).
 */
function longestContiguousRun(arr: boolean[]): {
  start: number;
  length: number;
} {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }

  return { start: bestStart, length: bestLen };
}

export function useContactAnalysis(
  params: UseContactAnalysisParams,
): ContactAnalysis | null {
  const {
    viewerLat,
    viewerLon,
    targetLat,
    targetLon,
    viewerStats,
    targetStats,
    viewerHours,
    targetHours,
    txPowerWatts,
    mode,
    antennaGainDbi,
    farEndGainDbi,
  } = params;

  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  return useMemo(() => {
    // Get current solar indices or use defaults
    const kp =
      kIndexData && kIndexData.length > 0
        ? kIndexData[kIndexData.length - 1].kp_index
        : 3;

    const sfi =
      solarFluxData && solarFluxData.length > 0
        ? solarFluxData[solarFluxData.length - 1].flux
        : 120;

    // Distance and bearing
    const distance = calculateGreatCircleDistance(
      viewerLat,
      viewerLon,
      targetLat,
      targetLon,
    );
    const bearing = calculateBearing(
      viewerLat,
      viewerLon,
      targetLat,
      targetLon,
    );

    // Band conditions
    const pathIllumination = approximatePathIllumination();
    const bandConditions =
      txPowerWatts != null && mode != null && antennaGainDbi != null
        ? getEnhancedBandConditions(
            viewerLat,
            viewerLon,
            targetLat,
            targetLon,
            kp,
            sfi,
            new Date(),
            txPowerWatts,
            mode,
            antennaGainDbi,
            undefined,
            farEndGainDbi ?? 0,
          )
        : getBandConditionsForPath(
            viewerLat,
            viewerLon,
            targetLat,
            targetLon,
            kp,
            sfi,
            pathIllumination,
          );

    // Shared bands and modes
    const viewerBands = extractRecordKeys(viewerStats, "qsosByBand");
    const targetBands = extractRecordKeys(targetStats, "qsosByBand");
    const sharedBands = viewerBands.filter((b) => targetBands.includes(b));

    const viewerModes = extractRecordKeys(viewerStats, "qsosByMode");
    const targetModes = extractRecordKeys(targetStats, "qsosByMode");
    const sharedModes = viewerModes.filter((m) => targetModes.includes(m));

    // Overlap hours
    const vH = viewerHours ?? new Array<number>(24).fill(0);
    const tH = targetHours ?? new Array<number>(24).fill(0);
    const vMax = Math.max(...vH, 1);
    const tMax = Math.max(...tH, 1);

    const overlapHours: boolean[] = [];
    for (let h = 0; h < 24; h++) {
      const vActive = vH[h] / vMax > 0.05;
      const tActive = tH[h] / tMax > 0.05;
      overlapHours.push(vActive && tActive);
    }

    // Best band: highest SNR in shared bands, or overall highest SNR
    let bestBand: string | null = null;
    const sharedBandSet = new Set(sharedBands.map((b) => b.toLowerCase()));

    // First try shared bands
    if (sharedBandSet.size > 0) {
      const sharedConditions = bandConditions.filter((c) =>
        sharedBandSet.has(c.band.toLowerCase()),
      );
      if (sharedConditions.length > 0) {
        const best = sharedConditions.reduce((a, b) =>
          a.snrEstimate > b.snrEstimate ? a : b,
        );
        if (best.status !== "closed") {
          bestBand = best.band;
        }
      }
    }

    // Fallback to overall best
    if (!bestBand) {
      const openBands = bandConditions.filter((c) => c.status !== "closed");
      if (openBands.length > 0) {
        bestBand = openBands.reduce((a, b) =>
          a.snrEstimate > b.snrEstimate ? a : b,
        ).band;
      }
    }

    // Best time range from overlap hours
    let bestTimeRange: string | null = null;
    const run = longestContiguousRun(overlapHours);
    if (run.length > 0) {
      const endHour = (run.start + run.length) % 24;
      bestTimeRange = `${String(run.start).padStart(2, "0")}-${String(endHour).padStart(2, "0")}z`;
    }

    return {
      distance,
      bearing,
      bandConditions,
      sharedBands,
      sharedModes,
      overlapHours,
      bestBand,
      bestTimeRange,
    };
  }, [
    viewerLat,
    viewerLon,
    targetLat,
    targetLon,
    viewerStats,
    targetStats,
    viewerHours,
    targetHours,
    txPowerWatts,
    mode,
    antennaGainDbi,
    farEndGainDbi,
    kIndexData,
    solarFluxData,
  ]);
}
