/**
 * ITU-R P.372-16 External Noise Model for HF Frequencies
 *
 * Implements the three primary components of external noise at HF:
 * 1. Man-made noise -- dominant in urban environments, decreases with frequency
 * 2. Galactic noise -- cosmic background, dominant above ~20 MHz in quiet locations
 * 3. Atmospheric noise -- from thunderstorms, dominant at lower HF frequencies
 *
 * All noise figures are expressed as Fa (dB above kTB at 290K).
 *
 * Reference: ITU-R P.372-16 "Radio noise"
 *
 * Key formulas (from ITU-R P.372 Section 6):
 * - Man-made: Fam = c - d * log10(f_MHz) per Table 1
 * - Galactic: Fag = 52 - 23 * log10(f_MHz)
 * - Atmospheric: Faa = base - corrections for time, season, latitude
 * - Total: power sum Fa = 10 * log10(sum of 10^(Fi/10))
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoiseEnvironment = "city" | "residential" | "rural" | "quiet_rural";

export type NoiseLevel = "very_high" | "high" | "moderate" | "low" | "very_low";

export interface NoiseAssessment {
  level: NoiseLevel;
  fa_dB: number;
  description: string;
}

export interface AtmosphericNoiseOptions {
  isDaytime?: boolean;
  month?: number;
  latitude?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const T0_KELVIN = 290;

const MAN_MADE_COEFFICIENTS: Record<
  NoiseEnvironment,
  { c: number; d: number }
> = {
  city: { c: 76.8, d: 27.7 },
  residential: { c: 67.2, d: 27.7 },
  rural: { c: 53.6, d: 28.6 },
  quiet_rural: { c: 44.2, d: 29.4 },
};

const MIN_FREQUENCY_MHZ = 1.0;
const MAX_FREQUENCY_MHZ = 55.0;

const ATMOSPHERIC_DAYTIME_CORRECTION = -10;
const ATMOSPHERIC_WINTER_CORRECTION = -5;
const ATMOSPHERIC_HIGH_LATITUDE_CORRECTION = -5;
const HIGH_LATITUDE_THRESHOLD = 55;

export const HF_BAND_FREQUENCIES: Record<string, number> = {
  "160m": 1.9,
  "80m": 3.6,
  "60m": 5.35,
  "40m": 7.1,
  "30m": 10.1,
  "20m": 14.1,
  "17m": 18.1,
  "15m": 21.2,
  "12m": 24.9,
  "10m": 28.5,
  "6m": 50.1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampFrequency(frequencyMHz: number): number {
  return clamp(frequencyMHz, MIN_FREQUENCY_MHZ, MAX_FREQUENCY_MHZ);
}

function powerSumDb(...figures: number[]): number {
  const linearSum = figures.reduce((sum, fa) => sum + Math.pow(10, fa / 10), 0);
  return 10 * Math.log10(linearSum);
}

// ---------------------------------------------------------------------------
// Individual Noise Components
// ---------------------------------------------------------------------------

/**
 * Calculate man-made noise figure per ITU-R P.372-16 Table 1.
 * Formula: Fam = c - d * log10(f_MHz)
 */
export function getManMadeNoise(
  frequencyMHz: number,
  environment: NoiseEnvironment,
): number {
  const freq = clampFrequency(frequencyMHz);
  const { c, d } = MAN_MADE_COEFFICIENTS[environment];
  return Math.max(0, c - d * Math.log10(freq));
}

/**
 * Calculate galactic (cosmic) noise figure per ITU-R P.372-16.
 * Formula: Fag = 52 - 23 * log10(f_MHz)
 */
export function getGalacticNoise(frequencyMHz: number): number {
  const freq = clampFrequency(frequencyMHz);
  return Math.max(0, 52 - 23 * Math.log10(freq));
}

/**
 * Calculate atmospheric noise figure per ITU-R P.372-16.
 * Base formula: Faa = 100 - 33 * log10(f_MHz) with corrections for
 * daytime (-10 dB), winter (-5 dB), and high latitude (-5 dB).
 */
export function getAtmosphericNoise(
  frequencyMHz: number,
  options: AtmosphericNoiseOptions = {},
): number {
  const freq = clampFrequency(frequencyMHz);
  let faa = 100 - 33 * Math.log10(freq);

  if (options.isDaytime) {
    faa += ATMOSPHERIC_DAYTIME_CORRECTION;
  }

  if (options.month !== undefined) {
    if (isWinterMonth(options.month, options.latitude)) {
      faa += ATMOSPHERIC_WINTER_CORRECTION;
    }
  }

  if (
    options.latitude !== undefined &&
    Math.abs(options.latitude) > HIGH_LATITUDE_THRESHOLD
  ) {
    faa += ATMOSPHERIC_HIGH_LATITUDE_CORRECTION;
  }

  return Math.max(0, faa);
}

function isWinterMonth(month: number, latitude?: number): boolean {
  const isNorthern = latitude === undefined || latitude >= 0;
  if (isNorthern) {
    return month <= 2 || month >= 11;
  }
  return month >= 5 && month <= 8;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Calculate the total external noise figure at a given frequency and environment.
 * Combines all three noise components using power summation.
 */
export function getExternalNoiseFigure(
  frequencyMHz: number,
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): number {
  const fam = getManMadeNoise(frequencyMHz, environment);
  const fag = getGalacticNoise(frequencyMHz);
  const faa = getAtmosphericNoise(frequencyMHz, options);
  return powerSumDb(fam, fag, faa);
}

// ---------------------------------------------------------------------------
// Conversion Utilities
// ---------------------------------------------------------------------------

export function noiseTemperatureFromFigure(fa_dB: number): number {
  if (fa_dB <= 0) return 0;
  return T0_KELVIN * (Math.pow(10, fa_dB / 10) - 1);
}

export function noiseFigureFromTemperature(temperatureK: number): number {
  if (temperatureK <= 0) return 0;
  return 10 * Math.log10(temperatureK / T0_KELVIN + 1);
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

function classifyNoiseLevel(fa_dB: number): NoiseLevel {
  if (fa_dB >= 50) return "very_high";
  if (fa_dB >= 35) return "high";
  if (fa_dB >= 20) return "moderate";
  if (fa_dB >= 10) return "low";
  return "very_low";
}

function describeNoiseLevel(level: NoiseLevel, fa_dB: number): string {
  const rounded = Math.round(fa_dB * 10) / 10;
  switch (level) {
    case "very_high":
      return `Very high noise (${rounded} dB) -- only strong signals will be readable above the noise floor`;
    case "high":
      return `High noise (${rounded} dB) -- weak signals will be buried; consider directional antennas or narrower bandwidth`;
    case "moderate":
      return `Moderate noise (${rounded} dB) -- typical conditions for this environment; most signals copyable`;
    case "low":
      return `Low noise (${rounded} dB) -- favorable conditions; weak DX signals should be accessible`;
    case "very_low":
      return `Very low noise (${rounded} dB) -- excellent conditions near the galactic noise floor`;
  }
}

/**
 * Get a complete noise assessment for a frequency and environment.
 */
export function getNoiseAssessment(
  frequencyMHz: number,
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): NoiseAssessment {
  const fa_dB = getExternalNoiseFigure(frequencyMHz, environment, options);
  const level = classifyNoiseLevel(fa_dB);
  const description = describeNoiseLevel(level, fa_dB);
  return {
    level,
    fa_dB: Math.round(fa_dB * 10) / 10,
    description,
  };
}

// ---------------------------------------------------------------------------
// Band Lookup
// ---------------------------------------------------------------------------

export interface BandNoiseEntry {
  band: string;
  frequencyMHz: number;
  fa_dB: number;
  level: NoiseLevel;
  manMade_dB: number;
  galactic_dB: number;
  atmospheric_dB: number;
}

/**
 * Get noise figures for all standard HF amateur bands.
 */
export function getAllBandNoise(
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): BandNoiseEntry[] {
  return Object.entries(HF_BAND_FREQUENCIES).map(([band, freq]) => {
    const manMade_dB = getManMadeNoise(freq, environment);
    const galactic_dB = getGalacticNoise(freq);
    const atmospheric_dB = getAtmosphericNoise(freq, options);
    const fa_dB = powerSumDb(manMade_dB, galactic_dB, atmospheric_dB);
    const level = classifyNoiseLevel(fa_dB);
    return {
      band,
      frequencyMHz: freq,
      fa_dB: Math.round(fa_dB * 10) / 10,
      level,
      manMade_dB: Math.round(manMade_dB * 10) / 10,
      galactic_dB: Math.round(galactic_dB * 10) / 10,
      atmospheric_dB: Math.round(atmospheric_dB * 10) / 10,
    };
  });
}
