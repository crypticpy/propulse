/**
 * ITU-R P.372 external noise model for HF frequencies.
 *
 * Three components, all expressed as Fa, dB above kT0b at T0 = 290 K:
 * 1. Man-made noise   Fam = c - d*log10(f_MHz), P.372-16 Table 1 categories
 * 2. Galactic noise   Fag = 52 - 23*log10(f_MHz)
 * 3. Atmospheric noise from lightning, the CCIR Report 322 numerical world
 *    maps by month, four-hour local-time block and frequency. Implemented in
 *    `@/lib/propagation/noise/p372Noise` as a port of the ITU-R Study Group 3
 *    reference code, over the vendored coefficient asset.
 *
 * Two totals, because the reference uses two (see `p372Noise.ts`):
 * `faMedianSum_dB` is the plain power sum of the three medians, which is what
 * `P533/CircuitReliability.c` forms the SNR against and therefore what the
 * noise floor and every SNR in this application use. `faDecileTotal_dB` is the
 * P.372 section 8 log-normal combination `FamT = min(FamTu, FamTl)`, reported
 * with `duTotal_dB`/`dlTotal_dB` for anything that wants the spread. They
 * differ by up to about 1 dB.
 *
 * Temperature reference: the P.372 noise factors are defined against
 * T0 = 288 K in the reference implementation, while the thermal term here uses
 * the conventional T0 = 290 K (kT0B = -174 dBm/Hz). The difference is
 * 10*log10(290/288) = 0.03 dB, below every tolerance in this module's tests
 * and below the 0.1 dB resolution at which SNR is reported. 290 K is kept
 * deliberately and is pinned by `signalConsistency.test.ts`; do not "fix" it.
 *
 * Reference: ITU-R P.372-16 "Radio noise".
 */

import {
  atmosphericNoiseP372,
  combineNoiseP372,
  powerSumMediansP372,
  type NoiseComponent,
  type P372ReceiverContext,
} from "@/lib/propagation/noise/p372Noise";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NoiseEnvironment = "city" | "residential" | "rural" | "quiet_rural";

/**
 * Where a resolved noise environment came from (contract M09/M11, #982):
 * "specified" = the caller stated it; "assumed" = the caller omitted it and
 * the declared default policy filled it in. Missing is never silently zero or
 * a second, uncited noise model.
 */
export type NoiseEnvironmentSource = "specified" | "assumed";

export interface ResolvedNoiseEnvironment {
  environment: NoiseEnvironment;
  source: NoiseEnvironmentSource;
}

export type NoiseLevel = "very_high" | "high" | "moderate" | "low" | "very_low";

export interface NoiseAssessment {
  level: NoiseLevel;
  fa_dB: number;
  description: string;
}

/**
 * Receiver context for the ITU-R P.372 atmospheric noise term.
 *
 * Every field is needed: the CCIR 322 map is indexed by month, by the
 * four-hour block of *receiver local mean time* (derived from `utcHour` and
 * `longitude`) and by position. The fields stay optional because the type is
 * threaded through several signatures, but an incomplete context yields no
 * atmospheric term at all rather than a fabricated one -- see
 * `getAtmosphericNoise`.
 *
 * `isDaytime` is gone: the local-time block supersedes it, and the flat
 * -10 dB daytime / -5 dB winter / -5 dB high-latitude corrections it drove
 * were part of the uncited curve this module no longer uses (#948, #955).
 */
export type AtmosphericNoiseOptions = Partial<P372ReceiverContext>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const T0_KELVIN = 290;

// ITU-R P.372-16 Table (Fam = c - d*log10(f_MHz), c is Fam at 1 MHz).
// The prior table was shifted one category too quiet (residential carried the
// rural value, etc.); these are the canonical business/residential/rural/quiet
// categories mapped onto this module's environment keys.
const MAN_MADE_COEFFICIENTS: Record<
  NoiseEnvironment,
  { c: number; d: number; du: number; dl: number }
> = {
  city: { c: 76.8, d: 27.7, du: 11.0, dl: 6.7 }, // business / city
  residential: { c: 72.5, d: 27.7, du: 10.6, dl: 5.3 },
  rural: { c: 67.2, d: 27.7, du: 9.2, dl: 4.6 },
  quiet_rural: { c: 53.6, d: 28.6, du: 9.2, dl: 4.6 },
};

/**
 * P.372 gives the galactic component a 2 dB decile deviation either side
 * (the reference implementation's sigma of 1.56 dB).
 */
const GALACTIC_DECILE_DB = 2.0;

/**
 * Declared default receiver-noise policy (PROP-02, #948).
 *
 * One P.372 category is used whenever a caller omits the environment, so an
 * omitted input and the explicit default produce the same SNR. "residential"
 * is the application's declared station default (settingsStore.ts
 * `noiseEnvironment`) and the ITU-R P.372-16 Table 1 residential category.
 * The previous omitted-input path used an uncited flat 15 dB and disagreed
 * with every explicit environment by ~47 dB at 14 MHz (#945 audit).
 */
export const DEFAULT_NOISE_ENVIRONMENT: NoiseEnvironment = "residential";

/**
 * Resolve an optional caller environment through the single default policy.
 * The `source` field keeps an assumed default distinguishable from a stated
 * value (contract M11: missing is never treated as a measurement).
 */
export function resolveNoiseEnvironment(
  environment?: NoiseEnvironment,
): ResolvedNoiseEnvironment {
  return environment
    ? { environment, source: "specified" }
    : { environment: DEFAULT_NOISE_ENVIRONMENT, source: "assumed" };
}

const MIN_FREQUENCY_MHZ = 1.0;
const MAX_FREQUENCY_MHZ = 55.0;

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
 * ITU-R P.372 atmospheric noise at the receiver, or `null` when the receiver
 * context is incomplete.
 *
 * `null` is not zero. It means "this model has no value here": the atmospheric
 * term is a function of receiver position, month and local time, and P.372
 * offers no position-free value. `getExternalNoiseFigure` then combines only
 * the man-made and galactic terms and says so in its documentation, rather
 * than substituting a second, uncited curve. For the application's declared
 * default (residential) the omission is worth less than 0.1 dB across the HF
 * bands, because man-made noise is 15-25 dB above the atmospheric term there;
 * in `quiet_rural` at 1.8-7 MHz it matters, which is why every production
 * caller passes a complete context.
 */
export function getAtmosphericNoise(
  frequencyMHz: number,
  options: AtmosphericNoiseOptions = {},
): NoiseComponent | null {
  return atmosphericNoiseP372(options, frequencyMHz);
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Total external noise factor Fa at a frequency, for a receiver environment and
 * context: the plain power sum of the atmospheric, man-made and galactic
 * medians, as `P533/CircuitReliability.c` forms it.
 *
 * This is the SNR convention, and it is the only total that belongs in a noise
 * floor. The P.372 section 8 log-normal combination sits up to about 1 dB away
 * from it and is available as `getExternalNoise(...).faDecileTotal_dB`.
 *
 * When `options` is incomplete the atmospheric term is absent (see
 * `getAtmosphericNoise`) and the result is the man-made/galactic sum.
 */
export function getExternalNoiseFigure(
  frequencyMHz: number,
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): number {
  return getExternalNoise(frequencyMHz, environment, options).faMedianSum_dB;
}

export interface ExternalNoise {
  /**
   * Plain power sum of the component medians. The SNR convention; this is what
   * `getExternalNoiseFigure` returns and what the noise floor uses.
   */
  faMedianSum_dB: number;
  /**
   * ITU-R P.372 section 8 log-normal combination, `FamT = min(FamTu, FamTl)`.
   * Not the SNR convention -- do not substitute it for `faMedianSum_dB`.
   */
  faDecileTotal_dB: number;
  /** Combined upper decile deviation from the section 8 combination, dB. */
  duTotal_dB: number;
  /** Combined lower decile deviation from the section 8 combination, dB. */
  dlTotal_dB: number;
  manMade: NoiseComponent;
  galactic: NoiseComponent;
  /** `null` when the receiver context was incomplete. */
  atmospheric: NoiseComponent | null;
}

/** The full P.372 breakdown behind `getExternalNoiseFigure`. */
export function getExternalNoise(
  frequencyMHz: number,
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): ExternalNoise {
  const { du, dl } = MAN_MADE_COEFFICIENTS[environment];
  const manMade: NoiseComponent = {
    fa: getManMadeNoise(frequencyMHz, environment),
    du,
    dl,
  };
  const galactic: NoiseComponent = {
    fa: getGalacticNoise(frequencyMHz),
    du: GALACTIC_DECILE_DB,
    dl: GALACTIC_DECILE_DB,
  };
  const atmospheric = getAtmosphericNoise(frequencyMHz, options);
  const components = atmospheric
    ? [atmospheric, galactic, manMade]
    : [galactic, manMade];
  const decileTotal = combineNoiseP372(components);
  return {
    faMedianSum_dB: powerSumMediansP372(components),
    faDecileTotal_dB: decileTotal.fa,
    duTotal_dB: decileTotal.du,
    dlTotal_dB: decileTotal.dl,
    manMade,
    galactic,
    atmospheric,
  };
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
// Real-time Atmospheric QRN
// ---------------------------------------------------------------------------

/**
 * Estimate real-time atmospheric QRN increase from nearby lightning/storms.
 * Returns additional noise figure in dB above the baseline ITU-R P.372 model.
 *
 * Lightning QRN falls off roughly as 1/distance:
 *   At 10km: +20dB, at 50km: +12dB, at 200km: +6dB, at 1000km: +1dB
 *
 * @param nearestLightningKm - Distance to nearest lightning strike in km (null = no data)
 * @param stormIntensity - 0-1 scale (0 = no storms, 1 = extreme convection)
 */
export function getRealtimeAtmosphericQRN(
  nearestLightningKm: number | null,
  stormIntensity: number,
): number {
  if (nearestLightningKm == null) return 0;

  // Lightning QRN falls off roughly as 1/distance
  const distanceFactor =
    nearestLightningKm <= 0
      ? 20
      : Math.max(0, 20 - 8 * Math.log10(Math.max(nearestLightningKm, 1)));

  // Storm intensity multiplier (heavy convection = more impulsive noise)
  const intensityMultiplier = 0.3 + 0.7 * stormIntensity;

  return distanceFactor * intensityMultiplier;
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
  /** `null` when the receiver context was incomplete. */
  atmospheric_dB: number | null;
}

/**
 * Get noise figures for all standard HF amateur bands.
 */
export function getAllBandNoise(
  environment: NoiseEnvironment,
  options?: AtmosphericNoiseOptions,
): BandNoiseEntry[] {
  return Object.entries(HF_BAND_FREQUENCIES).map(([band, freq]) => {
    const noise = getExternalNoise(freq, environment, options);
    const fa_dB = noise.faMedianSum_dB;
    return {
      band,
      frequencyMHz: freq,
      fa_dB: Math.round(fa_dB * 10) / 10,
      level: classifyNoiseLevel(fa_dB),
      manMade_dB: Math.round(noise.manMade.fa * 10) / 10,
      galactic_dB: Math.round(noise.galactic.fa * 10) / 10,
      atmospheric_dB:
        noise.atmospheric === null
          ? null
          : Math.round(noise.atmospheric.fa * 10) / 10,
    };
  });
}
