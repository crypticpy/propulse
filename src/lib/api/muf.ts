/**
 * MUF (Maximum Usable Frequency) Estimation
 *
 * Provides SFI-based MUF estimation for ionospheric propagation analysis.
 * MUF represents the highest frequency that will reflect from the ionosphere
 * for a given path at a given time.
 *
 * The estimation considers:
 * - Solar Flux Index (SFI) - Higher SFI = more ionization = higher MUF
 * - Solar zenith angle - More direct sunlight = higher MUF
 * - Latitude - Equatorial regions generally have higher MUF
 * - Time of day - MUF peaks in afternoon local time
 */

import { getSubsolarPoint } from "@/lib/utils/sun";
import {
  calculateDLayerAbsorption,
  calculateZenithAngle,
} from "@/lib/utils/ionosphere";
import type { FrequencyLimits } from "@/types/propagation";

export interface MUFData {
  timestamp: string;
  grid: MUFGridPoint[];
}

export interface MUFGridPoint {
  lat: number;
  lon: number;
  muf: number; // MHz
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculate the solar zenith angle at a given location using subsolar point
 * Returns angle in degrees (0 = sun directly overhead, 90 = horizon, >90 = night)
 * @internal Used by estimateMUF for the simple model
 */
function calculateZenithAngleFromSubsolar(
  lat: number,
  lon: number,
  subsolarLat: number,
  subsolarLon: number,
): number {
  const phi1 = lat * DEG_TO_RAD;
  const phi2 = subsolarLat * DEG_TO_RAD;
  const deltaLambda = (lon - subsolarLon) * DEG_TO_RAD;

  const cosAngle =
    Math.sin(phi1) * Math.sin(phi2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
}

/**
 * Estimate MUF at a given location based on Solar Flux Index
 *
 * Formula derivation:
 * 1. Base critical frequency (f0F2) from SFI: f0F2 ≈ 0.15 × sqrt(SFI - 60) + 4
 * 2. MUF = f0F2 × MUF factor × solar zenith correction
 * 3. MUF factor for F2 layer ≈ 3.6 (typical for HF paths)
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param sfi - Solar Flux Index (typically 65-300)
 * @param date - Date/time for calculation
 * @returns Estimated MUF in MHz
 */
export function estimateMUF(
  lat: number,
  lon: number,
  sfi: number,
  date: Date,
): number {
  // Ensure SFI has a reasonable minimum (quiet sun conditions)
  const effectiveSFI = Math.max(sfi, 65);

  // Base critical frequency from SFI
  // f0F2 represents the critical frequency of the F2 layer
  const f0F2 = 0.15 * Math.sqrt(Math.max(effectiveSFI - 60, 5)) + 4;

  // Get subsolar point (where sun is directly overhead)
  const sunPos = getSubsolarPoint(date);

  // Calculate solar zenith angle
  const zenith = calculateZenithAngleFromSubsolar(
    lat,
    lon,
    sunPos.lat,
    sunPos.lon,
  );

  // MUF factor - typical for F2 layer reflections
  const mufFactor = 3.6;

  // Latitude correction factor
  // Equatorial regions have slightly higher MUF due to ionosphere height
  const latFactor = 1.0 + 0.1 * Math.cos(Math.abs(lat) * DEG_TO_RAD);

  // Night side gets much lower MUF (ionosphere recombines without sunlight)
  if (zenith > 90) {
    // Night side - exponential decay based on how far into night
    const nightDepth = (zenith - 90) / 90; // 0 at terminator, 1 at antipode
    const nightMUF = f0F2 * 2.0 * (1 - nightDepth * 0.4);
    return Math.max(3.5, nightMUF * latFactor);
  }

  // Twilight zone (80-90 degrees) - transition region
  if (zenith > 80) {
    const twilightFactor = (90 - zenith) / 10; // 1 at 80deg, 0 at 90deg
    const dayMUF =
      f0F2 * mufFactor * Math.pow(Math.cos(zenith * DEG_TO_RAD), 0.5);
    const nightMUF = f0F2 * 2.0;
    const transitionMUF = nightMUF + (dayMUF - nightMUF) * twilightFactor;
    return Math.max(3.5, transitionMUF * latFactor);
  }

  // Day side - full solar ionization
  const cosFactor = Math.pow(Math.cos(zenith * DEG_TO_RAD), 0.5);
  const dayMUF = f0F2 * mufFactor * cosFactor;

  return Math.max(3.5, dayMUF * latFactor);
}

/**
 * Generate a global MUF grid at specified resolution
 *
 * @param sfi - Solar Flux Index
 * @param date - Date/time for calculation
 * @param resolution - Grid resolution in degrees (default 10)
 * @returns MUF data with grid points covering the globe
 */
export function generateMUFGrid(
  sfi: number,
  date: Date,
  resolution: number = 10,
): MUFData {
  const grid: MUFGridPoint[] = [];

  // Generate points from -90 to 90 latitude and -180 to 180 longitude
  for (let lat = -90; lat <= 90; lat += resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      const muf = estimateMUF(lat, lon, sfi, date);
      grid.push({ lat, lon, muf });
    }
  }

  return {
    timestamp: date.toISOString(),
    grid,
  };
}

/**
 * Get MUF color based on frequency value
 * Used for visualization consistency across components
 *
 * @param muf - MUF value in MHz
 * @returns Object with color string and band description
 */
/**
 * 8-band MUF color scale — same stops and thresholds as the globe MUF
 * shader (MUFOverlay.tsx) and the MUFLegend component. Colors interpolate
 * between stops exactly like the shader so the flat map, globe, and legend
 * all agree.
 */
const MUF_COLOR_STOPS: Array<{ threshold: number; rgb: [number, number, number]; band: string }> =
  [
    { threshold: 3, rgb: [115, 20, 31], band: "< 3 MHz (no HF)" },
    { threshold: 5, rgb: [217, 46, 38], band: "3-5 MHz (80m)" },
    { threshold: 7, rgb: [242, 128, 26], band: "5-7 MHz (40m)" },
    { threshold: 10, rgb: [242, 184, 26], band: "7-10 MHz (30m)" },
    { threshold: 14, rgb: [191, 224, 51], band: "10-14 MHz (20m)" },
    { threshold: 21, rgb: [38, 199, 102], band: "14-21 MHz (15m)" },
    { threshold: 28, rgb: [26, 184, 217], band: "21-28 MHz (10m)" },
    { threshold: Infinity, rgb: [77, 89, 235], band: "> 28 MHz (6m+)" },
  ];

export function getMUFColor(muf: number): { color: string; band: string } {
  // Below the first threshold: flat deep maroon (matches shader)
  if (muf < MUF_COLOR_STOPS[0].threshold) {
    const [r, g, b] = MUF_COLOR_STOPS[0].rgb;
    return { color: `rgb(${r},${g},${b})`, band: MUF_COLOR_STOPS[0].band };
  }

  for (let i = 1; i < MUF_COLOR_STOPS.length; i++) {
    const stop = MUF_COLOR_STOPS[i];
    if (muf < stop.threshold) {
      // Interpolate from this stop's color toward the next stop's color
      // across the [prevThreshold, threshold) range — same as the shader.
      const prevThreshold = MUF_COLOR_STOPS[i - 1].threshold;
      const next = MUF_COLOR_STOPS[Math.min(i + 1, MUF_COLOR_STOPS.length - 1)];
      const span = stop.threshold - prevThreshold;
      const t = span > 0 && Number.isFinite(span) ? (muf - prevThreshold) / span : 0;
      const r = Math.round(stop.rgb[0] + (next.rgb[0] - stop.rgb[0]) * t);
      const g = Math.round(stop.rgb[1] + (next.rgb[1] - stop.rgb[1]) * t);
      const b = Math.round(stop.rgb[2] + (next.rgb[2] - stop.rgb[2]) * t);
      return { color: `rgb(${r},${g},${b})`, band: stop.band };
    }
  }

  const last = MUF_COLOR_STOPS[MUF_COLOR_STOPS.length - 1];
  return {
    color: `rgb(${last.rgb[0]},${last.rgb[1]},${last.rgb[2]})`,
    band: last.band,
  };
}

/**
 * Get MUF at a specific location (convenience function)
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @param sfi - Solar Flux Index
 * @param date - Date/time
 * @returns MUF value in MHz
 */
export function getMUFAtLocation(
  lat: number,
  lon: number,
  sfi: number,
  date: Date,
): number {
  return estimateMUF(lat, lon, sfi, date);
}

/**
 * SNR thresholds for different operating modes (dB)
 * Used for LUF calculation link budget
 */
const MODE_SNR_THRESHOLDS: Record<"SSB" | "CW" | "FT8", number> = {
  SSB: 10, // SSB requires ~10 dB SNR for readable speech
  CW: 3, // CW can be copied at lower SNR
  FT8: -20, // FT8 works well below noise floor
};

/**
 * Calculate Lowest Usable Frequency for a path
 *
 * LUF is the frequency below which D-layer absorption prevents communication.
 * Below LUF, signals are too heavily absorbed by the D-layer to be usable.
 *
 * The calculation considers:
 * - D-layer absorption (inversely proportional to f^2)
 * - Solar zenith angle (more absorption when sun is higher)
 * - Solar activity (higher SFI = more ionization = more absorption)
 * - Transmitter power (more power = more link margin)
 * - Operating mode SNR requirements
 *
 * @param lat - Latitude of path midpoint
 * @param lon - Longitude of path midpoint
 * @param sfi - Solar Flux Index
 * @param date - Date/time
 * @param txPowerWatts - Transmitter power in watts (default 100W)
 * @param mode - Operating mode for SNR threshold (default 'SSB')
 * @returns LUF in MHz
 *
 * @example
 * ```typescript
 * // Calculate LUF for 100W SSB at midday
 * const luf = calculateLUF(45, -93, 120, new Date(), 100, 'SSB');
 * // Returns approximately 4-6 MHz during day
 *
 * // FT8 with 50W has lower LUF due to mode efficiency
 * const lufFT8 = calculateLUF(45, -93, 120, new Date(), 50, 'FT8');
 * // Returns approximately 2-3 MHz
 * ```
 */
export function calculateLUF(
  lat: number,
  lon: number,
  sfi: number,
  date: Date,
  txPowerWatts: number = 100,
  mode: "SSB" | "CW" | "FT8" = "SSB",
): number {
  // Calculate solar zenith angle at the location
  const zenithAngle = calculateZenithAngle(lat, lon, date);

  // At night, D-layer absorption is minimal
  if (zenithAngle >= 98) {
    return 1.8; // Minimum usable HF frequency
  }

  // Convert power to dBW (0 dBW = 1W)
  const txPowerDbW = 10 * Math.log10(Math.max(txPowerWatts, 1));

  // Get required SNR for the mode
  const requiredSNR = MODE_SNR_THRESHOLDS[mode];

  // Calculate maximum acceptable absorption
  // Base link budget assumes:
  // - Typical path loss for HF
  // - Standard antenna gains
  // - Noise floor around -140 dBW in 3kHz bandwidth
  // Higher power and lower SNR requirements allow more absorption
  const maxAcceptableAbsorption = 25 + (txPowerDbW - 20) - requiredSNR;

  // Binary search to find frequency where absorption equals max acceptable
  // LUF is the crossover point
  let low = 1.8;
  let high = 30;

  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    const absorption = calculateDLayerAbsorption(mid, zenithAngle, sfi);

    if (absorption > maxAcceptableAbsorption) {
      // Too much absorption at this frequency, need to go higher
      low = mid;
    } else {
      // Acceptable absorption, could go lower
      high = mid;
    }
  }

  // Return the LUF (round up for safety margin)
  const luf = Math.ceil(((low + high) / 2) * 10) / 10;

  // Ensure LUF is within reasonable bounds
  return Math.max(1.8, Math.min(15, luf));
}

/**
 * Calculate Frequency of Optimum Traffic
 *
 * FOT = 0.85 × MUF
 *
 * The FOT provides a safety margin below the MUF to ensure reliable
 * propagation despite ionospheric variability. Operating at FOT gives
 * approximately 90% probability of successful propagation.
 *
 * @param muf - Maximum Usable Frequency in MHz
 * @returns FOT in MHz
 *
 * @example
 * ```typescript
 * const fot = calculateFOT(21.5);
 * // Returns 18.275 MHz (85% of MUF)
 * ```
 */
export function calculateFOT(muf: number): number {
  return muf * 0.85;
}

/**
 * Calculate Highest Probable Frequency
 *
 * HPF = 1.15 × MUF
 *
 * The HPF is the upper-decile MUF: the frequency that propagates on roughly
 * 10% of days, above the median MUF. It captures the day-to-day upward
 * variability of the ionosphere, so it sits above the (median) MUF, not below
 * it. Operating near the HPF is opportunistic and unreliable.
 *
 * @param muf - Maximum Usable Frequency (median) in MHz
 * @returns HPF in MHz
 *
 * @example
 * ```typescript
 * const hpf = calculateHPF(21.5);
 * // Returns 24.725 MHz (115% of MUF)
 * ```
 */
export function calculateHPF(muf: number): number {
  return muf * 1.15;
}

/**
 * Get all frequency limits (MUF, FOT, LUF, HPF) for a location
 *
 * This function combines all frequency limit calculations into a single
 * convenient call. It calculates the usable frequency window for HF
 * propagation at a given location and time.
 *
 * The usable frequency window is: LUF < operating frequency < MUF
 * - Below LUF: D-layer absorption too high
 * - Above MUF: F-layer won't reflect the signal
 * - FOT: Recommended operating frequency (85% of MUF)
 * - HPF: Upper-decile frequency for opportunistic operation (~115% of MUF)
 *
 * @param lat - Latitude of path midpoint
 * @param lon - Longitude of path midpoint
 * @param sfi - Solar Flux Index
 * @param date - Date/time
 * @param txPowerWatts - Transmitter power in watts (default 100W)
 * @param mode - Operating mode for SNR threshold (default 'SSB')
 * @returns FrequencyLimits object with muf, fot, luf, and hpf values
 *
 * @example
 * ```typescript
 * const limits = getFrequencyLimits(45, -93, 120, new Date());
 * console.log(`Usable window: ${limits.luf} - ${limits.muf} MHz`);
 * console.log(`Optimum frequency: ${limits.fot} MHz`);
 * // Output: "Usable window: 4.5 - 18.2 MHz"
 * // Output: "Optimum frequency: 15.5 MHz"
 * ```
 */
export function getFrequencyLimits(
  lat: number,
  lon: number,
  sfi: number,
  date: Date,
  txPowerWatts: number = 100,
  mode: "SSB" | "CW" | "FT8" = "SSB",
): FrequencyLimits {
  // Calculate MUF using existing estimation
  const muf = estimateMUF(lat, lon, sfi, date);

  // Calculate derived frequencies
  const fot = calculateFOT(muf);
  const hpf = calculateHPF(muf);

  // Calculate LUF based on absorption
  const luf = calculateLUF(lat, lon, sfi, date, txPowerWatts, mode);

  return {
    muf,
    fot,
    luf,
    hpf,
  };
}
