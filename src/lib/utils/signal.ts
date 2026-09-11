/**
 * Signal strength and path loss calculation utilities
 * Implements simplified ITU-R P.533 path loss model for HF propagation
 *
 * Reference values:
 * - S9 = -73 dBm (HF standard)
 * - Each S-unit = 6 dB
 * - Thermal noise: -174 dBm/Hz at 290K
 * - Typical noise floor at 20m: -110 dBm in 2.4 kHz bandwidth
 */

import type {
  SUnit,
  SignalClass,
  SignalPrediction,
  OperatingMode,
  ModeParameters,
  CircuitSupport,
  NoiseAssumption,
} from "../../types/signal";
import { getExternalNoiseFigure, resolveNoiseEnvironment } from "./noiseModel";
import type { AtmosphericNoiseOptions, NoiseEnvironment } from "./noiseModel";

/**
 * Reference bandwidth (Hz) for SNR reporting.
 *
 * WSJT-X and the amateur digital-mode community quote SNR in a 2500 Hz
 * reference bandwidth. We compute SNR in this same reference so the mode
 * thresholds below (which are all published/quoted in 2500 Hz) are compared
 * honestly. A mode's real detection bandwidth is narrower; its extra
 * sensitivity lives in the threshold, not in a mode-specific noise floor.
 */
const REFERENCE_BANDWIDTH_HZ = 2500;

/**
 * Mode-specific parameters for signal calculations.
 *
 * `bandwidth` is the mode's nominal detection bandwidth (informational).
 * `minSNR` is the minimum SNR for reliable copy/decode, expressed in the
 * 2500 Hz reference bandwidth (see REFERENCE_BANDWIDTH_HZ) so all modes are
 * directly comparable.
 */
export const MODE_PARAMETERS: Record<OperatingMode, ModeParameters> = {
  SSB: {
    name: "Single Sideband",
    bandwidth: 2400,
    minSNR: 3, // ~+3 dB in 2.4 kHz (~2500 Hz ref) for readable voice
    typicalPower: 100,
  },
  CW: {
    name: "Continuous Wave",
    bandwidth: 500,
    minSNR: -8, // typical human-copy threshold, 2500 Hz ref
    typicalPower: 100,
  },
  FT8: {
    name: "FT8 Digital",
    bandwidth: 50,
    minSNR: -21, // WSJT-X published threshold in 2500 Hz ref
    typicalPower: 50,
  },
  RTTY: {
    name: "Radio Teletype",
    bandwidth: 300,
    minSNR: -5, // 2500 Hz ref
    typicalPower: 100,
  },
};

/**
 * Ground reflection loss per hop by terrain type (dB)
 * Based on ITU-R P.527 ground constants
 */
const GROUND_REFLECTION_LOSS: Record<"sea" | "land" | "mixed", number> = {
  sea: 1.0, // Low loss - good conductor
  land: 3.0, // Higher loss - poor conductor
  mixed: 2.0, // Average of sea and land paths
};

/**
 * Polarization coupling loss in dB
 * Accounts for Faraday rotation and polarization mismatch
 */
const POLARIZATION_LOSS_DB = 1.5;

/**
 * Reference signal level for S9 in dBm
 * IARU Region 1/2/3 standard for HF
 */
const S9_DBM = -73;

/**
 * dB per S-unit (standard amateur radio scale)
 */
const DB_PER_S_UNIT = 6;

/**
 * Boltzmann constant, exact SI value (2019 redefinition), J/K.
 * Contract M09 (#982) requires the exact constant and T0 = 290 K.
 */
const BOLTZMANN_J_PER_K = 1.380649e-23;

/** Reference temperature T0 in kelvin (ITU-R P.372 noise-factor reference). */
const T0_KELVIN = 290;

/**
 * Thermal noise power density k*T0 at 290 K in dBm/Hz:
 * 10*log10(kB*T0 / 1e-3 W) = -173.975 dBm/Hz (the usual "-174" rounded).
 */
const THERMAL_NOISE_DBM_PER_HZ =
  10 * Math.log10((BOLTZMANN_J_PER_K * T0_KELVIN) / 1e-3);

/**
 * Calculate free space path loss using the Friis equation
 *
 * The Friis transmission equation in dB form:
 * FSL = 32.45 + 20×log10(f) + 20×log10(d)
 *
 * Where:
 * - f = frequency in MHz
 * - d = distance in km
 * - 32.45 = constant derived from (4π/c)² converted to dB with km and MHz units
 *
 * @param frequencyMHz - Operating frequency in MHz (typically 1.8-30 for HF)
 * @param distanceKm - Path distance in kilometers
 * @returns Free space path loss in dB (always positive)
 *
 * @example
 * ```ts
 * // Calculate free space loss for 14 MHz over 5000 km
 * const fsl = calculateFreeSpaceLoss(14, 5000);
 * // fsl ≈ 139.3 dB
 * ```
 */
export function calculateFreeSpaceLoss(
  frequencyMHz: number,
  distanceKm: number,
): number {
  // Guard against invalid inputs
  if (frequencyMHz <= 0 || distanceKm <= 0) {
    return 0;
  }

  // Friis equation: FSL = 32.45 + 20×log10(f_MHz) + 20×log10(d_km)
  const fsl =
    32.45 + 20 * Math.log10(frequencyMHz) + 20 * Math.log10(distanceKm);

  return Math.max(0, fsl);
}

/**
 * Calculate ground reflection loss per hop
 *
 * Ground reflections between ionospheric hops introduce loss based on:
 * - Surface conductivity (sea > land)
 * - Grazing angle (lower angles = more loss)
 * - Frequency (higher frequencies = more loss at low angles)
 *
 * This simplified model uses fixed values per terrain type.
 * Full ITU-R P.527 model accounts for frequency and angle.
 *
 * @param hops - Number of ionospheric reflection hops (1 = single hop)
 * @param terrainType - Path terrain: 'sea', 'land', or 'mixed'
 * @returns Total ground reflection loss in dB
 *
 * @example
 * ```ts
 * // Calculate loss for 3-hop path over mixed terrain
 * const groundLoss = calculateGroundReflectionLoss(3, 'mixed');
 * // groundLoss = 4.0 dB (2 ground reflections × 2.0 dB each)
 * ```
 */
export function calculateGroundReflectionLoss(
  hops: number,
  terrainType: "sea" | "land" | "mixed",
): number {
  // Guard against invalid inputs
  if (hops < 1) {
    return 0;
  }

  // Number of ground reflections = hops - 1
  // (N hops means N-1 ground bounces)
  const groundReflections = hops - 1;

  if (groundReflections <= 0) {
    return 0;
  }

  const lossPerReflection = GROUND_REFLECTION_LOSS[terrainType];
  return groundReflections * lossPerReflection;
}

/**
 * Calculate total HF path loss including all components
 *
 * Total path loss is the sum of:
 * 1. Free Space Loss (FSL) - distance and frequency dependent
 * 2. D-layer Absorption - from ionosphere.ts calculations
 * 3. Ground Reflection Loss - terrain and hop count dependent
 * 4. Polarization Coupling Loss - Faraday rotation effects
 *
 * Based on simplified ITU-R P.533 methodology.
 *
 * @param frequencyMHz - Operating frequency in MHz
 * @param distanceKm - Path distance in kilometers
 * @param hops - Number of ionospheric hops
 * @param absorptionDb - D-layer absorption loss in dB (from ionosphere.ts)
 * @param terrainType - Path terrain type (defaults to 'mixed')
 * @returns Total path loss in dB
 *
 * @example
 * ```ts
 * // Calculate total loss for 14 MHz, 8000 km, 3 hops, 5 dB absorption
 * const totalLoss = calculateTotalPathLoss(14, 8000, 3, 5);
 * // totalLoss ≈ 149.5 dB
 * ```
 */
export function calculateTotalPathLoss(
  frequencyMHz: number,
  distanceKm: number,
  hops: number,
  absorptionDb: number,
  terrainType: "sea" | "land" | "mixed" = "mixed",
): number {
  // Component losses
  const freeSpaceLoss = calculateFreeSpaceLoss(frequencyMHz, distanceKm);
  const groundReflectionLoss = calculateGroundReflectionLoss(hops, terrainType);

  // Total path loss
  const totalLoss =
    freeSpaceLoss + absorptionDb + groundReflectionLoss + POLARIZATION_LOSS_DB;

  return Math.max(0, totalLoss);
}

/**
 * Convert signal level in dBm to S-meter units
 *
 * Standard amateur radio S-meter scale:
 * - S9 = -73 dBm (HF standard, IARU)
 * - Each S-unit below S9 = 6 dB
 * - Above S9, reported as S9+dB
 *
 * Scale:
 * - S1 = -121 dBm
 * - S5 = -97 dBm
 * - S9 = -73 dBm
 * - S9+10 = -63 dBm
 * - S9+20 = -53 dBm
 *
 * @param dBm - Signal level in dBm
 * @returns SUnit object with value, text representation, and dBm
 *
 * @example
 * ```ts
 * const sReading = dBmToSUnits(-73);
 * // { value: 9, text: 'S9', dBm: -73 }
 *
 * const strongSignal = dBmToSUnits(-53);
 * // { value: 9, text: 'S9+20', dBm: -53 }
 * ```
 */
export function dBmToSUnits(dBm: number): SUnit {
  // Calculate S-units relative to S9
  const dbAboveS9 = dBm - S9_DBM;

  if (dbAboveS9 >= 0) {
    // Signal is S9 or stronger
    // Report as S9+dB
    const dbOver = Math.round(dbAboveS9);
    return {
      value: 9,
      text: dbOver > 0 ? `S9+${dbOver}` : "S9",
      dBm: Math.round(dBm),
    };
  }

  // Signal is below S9
  // Each S-unit = 6 dB, S9 = -73 dBm
  const sUnits = 9 + dbAboveS9 / DB_PER_S_UNIT;

  // Clamp to valid range (S0 to S9)
  const clampedSUnits = Math.max(0, Math.min(9, Math.round(sUnits)));

  return {
    value: clampedSUnits,
    text: `S${clampedSUnits}`,
    dBm: Math.round(dBm),
  };
}

/**
 * Convert S-meter units to dBm
 *
 * Reverse of dBmToSUnits for calculations.
 * For S9+dB values, pass the S-unit (9) plus the dB over as a decimal.
 *
 * @param sUnits - S-meter reading (0-9, or values > 9 for S9+dB)
 * @returns Signal level in dBm
 *
 * @example
 * ```ts
 * sUnitsTodBm(9);   // -73 dBm (S9)
 * sUnitsTodBm(5);   // -97 dBm (S5)
 * sUnitsTodBm(1);   // -121 dBm (S1)
 * ```
 */
export function sUnitsTodBm(sUnits: number): number {
  // S9 = -73 dBm, each S-unit = 6 dB
  const dbBelowS9 = (9 - sUnits) * DB_PER_S_UNIT;
  return S9_DBM - dbBelowS9;
}

/**
 * Receiver noise in the 2500 Hz reference bandwidth (contract M09/M10).
 *
 * N_B[dBm] = 10*log10(kB*T0*B / 1e-3) + Fa, with Fa the ITU-R P.372 external
 * noise factor in dB above kT0B for the resolved environment. There is one
 * noise plane and one reference bandwidth: every caller, whether it names an
 * environment or not, goes through `resolveNoiseEnvironment` and this
 * function. The former uncited "15 dB above thermal" fallback for omitted
 * environments is gone; it made an omitted input disagree with every explicit
 * one by ~47 dB at 14 MHz (#945 audit, PROP-02 #948).
 *
 * The receiver's own noise factor and feeder temperature (M09 `Tn`) are not
 * modelled here; Fa alone sets the floor, as before.
 *
 * @param frequencyMHz - Operating frequency in MHz (Fa is frequency dependent)
 * @param noiseEnvironment - Optional caller environment; omitted resolves to
 *   the declared default with `source: "assumed"`
 * @param atmosphericOptions - Receiver position, month and UTC hour for the
 *   ITU-R P.372 atmospheric term (CCIR Report 322 world maps). Omitting it is
 *   not neutral: P.372 has no position-free atmospheric value, so the term is
 *   left out of the combination entirely and the floor is the man-made and
 *   galactic pair. Callers that know where and when the receiver is must pass
 *   all four fields (PROP-02 #948, #955).
 */
export function calculateReferenceNoise(
  frequencyMHz: number,
  noiseEnvironment?: NoiseEnvironment,
  atmosphericOptions?: AtmosphericNoiseOptions,
): NoiseAssumption {
  const { environment, source } = resolveNoiseEnvironment(noiseEnvironment);
  const fa_dB = getExternalNoiseFigure(
    frequencyMHz,
    environment,
    atmosphericOptions,
  );
  const thermalNoiseDbm =
    THERMAL_NOISE_DBM_PER_HZ + 10 * Math.log10(REFERENCE_BANDWIDTH_HZ);
  return {
    environment,
    source,
    fa_dB,
    noiseFloorDbm: thermalNoiseDbm + fa_dB,
    referenceBandwidthHz: REFERENCE_BANDWIDTH_HZ,
  };
}

/**
 * Calculate expected Signal-to-Noise Ratio
 *
 * SNR calculation based on:
 * - Transmit power (converted to dBm)
 * - Total path loss
 * - The 2500 Hz reference noise floor (WSJT-X convention; mode-independent)
 * - Antenna gains
 *
 * SNR = P_tx(dBm) + G_ant(dBi) - PathLoss(dB) - NoiseFloor(dBm)
 *
 * @param txPowerWatts - Transmitter power in watts
 * @param pathLossDb - Total path loss in dB (from calculateTotalPathLoss)
 * @param mode - Operating mode (kept for API compatibility; SNR is now reported
 *   in the shared 2500 Hz reference bandwidth, so mode sensitivity lives in the
 *   per-mode minSNR threshold rather than in the noise floor)
 * @param antennaGainDbi - Combined TX+RX antenna gain in dBi (default 0)
 * @param frequencyMHz - Operating frequency in MHz; the P.372 noise factor is
 *   frequency dependent, so there is no frequency-free noise floor
 * @param noiseEnvironment - Receiver noise environment; omitted resolves to
 *   the declared default (see calculateReferenceNoise)
 * @returns Expected SNR in dB (can be negative for weak signals)
 *
 * @example
 * ```ts
 * // 100W SSB with 6 dBi antenna gain, 145 dB path loss at 14 MHz
 * const snr = calculateExpectedSNR(100, 145, 'SSB', 6, 14);
 *
 * // 50W FT8 with dipole (0 dBi), 155 dB path loss at 7 MHz, rural receiver
 * const ft8snr = calculateExpectedSNR(50, 155, 'FT8', 0, 7, 'rural');
 * ```
 */
export function calculateExpectedSNR(
  txPowerWatts: number,
  pathLossDb: number,
  _mode: OperatingMode,
  antennaGainDbi: number = 0,
  frequencyMHz: number,
  noiseEnvironment?: NoiseEnvironment,
  atmosphericOptions?: AtmosphericNoiseOptions,
): number {
  // A non-finite frequency has no noise floor and no path: it can only come
  // from a caller bug, never from a user input (0 W below is a real user
  // input, so that one keeps its sentinel). Throw rather than return a
  // fabricated SNR that would be classified and displayed as physics.
  if (!Number.isFinite(frequencyMHz)) {
    throw new RangeError(
      `calculateExpectedSNR: frequencyMHz must be finite, received ${frequencyMHz}`,
    );
  }

  // Guard against invalid inputs
  if (txPowerWatts <= 0) {
    return -100;
  }

  // Convert TX power to dBm: P[dBm] = 30 + 10*log10(P[W]) (contract M08)
  const txPowerDbm = 30 + 10 * Math.log10(txPowerWatts);

  // Compute the noise floor (and hence SNR) in the 2500 Hz reference bandwidth
  // used by WSJT-X and the mode thresholds. Using each mode's narrow detection
  // bandwidth here would inflate the SNR (e.g. ~+17 dB for FT8's 50 Hz) while
  // still comparing against 2500 Hz-referenced thresholds -- the optimism bug.
  // The mode's sensitivity is captured by MODE_PARAMETERS.minSNR instead.
  const noiseFloor = calculateReferenceNoise(
    frequencyMHz,
    noiseEnvironment,
    atmosphericOptions,
  ).noiseFloorDbm;

  // Received signal level
  const rxSignalDbm = txPowerDbm + antennaGainDbi - pathLossDb;

  // SNR = signal - noise
  const snr = rxSignalDbm - noiseFloor;

  return Math.round(snr * 10) / 10;
}

/**
 * Classify signal strength based on SNR and operating mode
 *
 * Classification thresholds are mode-dependent:
 * - Strong: Well above minimum, comfortable margin
 * - Moderate: Good copy, some fading tolerance
 * - Weak: Near threshold, careful operation needed
 * - Marginal: At or just below threshold
 * - None: No usable signal
 *
 * @param snrDb - Signal-to-noise ratio in dB
 * @param mode - Operating mode (affects threshold interpretation)
 * @returns Signal classification
 *
 * @example
 * ```ts
 * getSignalClass(15, 'SSB');   // 'strong'
 * getSignalClass(-5, 'SSB');   // 'weak'
 * getSignalClass(-18, 'FT8');  // 'moderate'
 * getSignalClass(-25, 'FT8'); // 'marginal'
 * ```
 */
export function getSignalClass(
  snrDb: number,
  mode: OperatingMode | string,
): SignalClass {
  // Get mode parameters (default to SSB if unknown mode)
  const modeKey = (
    Object.keys(MODE_PARAMETERS).includes(mode) ? mode : "SSB"
  ) as OperatingMode;
  const modeParams = MODE_PARAMETERS[modeKey];
  const { minSNR } = modeParams;

  // Thresholds relative to minimum required SNR
  const margin = snrDb - minSNR;

  if (margin >= 20) {
    return "strong";
  } else if (margin >= 10) {
    return "moderate";
  } else if (margin >= 3) {
    return "weak";
  } else if (margin >= -3) {
    // Within 3 dB of threshold - marginal
    return "marginal";
  } else {
    // Below threshold
    return "none";
  }
}

/**
 * Calculate prediction confidence based on conditions
 *
 * Confidence is reduced by:
 * - Very long paths (more variability)
 * - High hop counts (more uncertainty)
 * - Near MUF (propagation cutoff risk)
 *
 * @param distanceKm - Path distance
 * @param hops - Number of hops
 * @param snrDb - Predicted SNR
 * @param mode - Operating mode
 * @returns Confidence percentage (0-100)
 */
function calculateConfidence(
  distanceKm: number,
  hops: number,
  snrDb: number,
  mode: OperatingMode,
): number {
  let confidence = 85; // Base confidence

  // Reduce for long paths
  if (distanceKm > 15000) {
    confidence -= 10;
  } else if (distanceKm > 10000) {
    confidence -= 5;
  }

  // Reduce for multi-hop paths
  if (hops > 3) {
    confidence -= (hops - 3) * 5;
  }

  // Reduce for marginal signals
  const modeParams = MODE_PARAMETERS[mode];
  const margin = snrDb - modeParams.minSNR;
  if (margin < 5) {
    confidence -= 10;
  } else if (margin < 10) {
    confidence -= 5;
  }

  // Clamp to valid range
  return Math.max(20, Math.min(95, confidence));
}

/**
 * Parameters for confidence interval calculation
 */
export interface ConfidenceIntervalParams {
  distanceKm: number;
  hops: number;
  snrMargin: number;
  kp: number;
  sfi: number;
  frequency: number;
  /** frequency / MUF -- how close to MUF cutoff */
  mufRatio: number;
}

/**
 * Result of confidence interval calculation
 */
export interface ConfidenceIntervalResult {
  confidence: number;
  low: number;
  high: number;
  snrLow: number;
  snrHigh: number;
}

/**
 * Calculate confidence interval for a propagation prediction
 *
 * Produces a center confidence value plus upper/lower bounds and SNR
 * uncertainty range.  Width factors (geomagnetic storms, near-MUF,
 * multi-hop, long-path) widen the interval while stable conditions
 * (low Kp, well within MUF window, daytime) narrow it.
 *
 * @param params - Calculation input parameters
 * @param baseConfidence - The point-estimate confidence from calculateConfidence
 * @param baseSNR - The point-estimate SNR from the signal model
 * @returns Confidence interval with bounds and SNR range
 */
export function calculateConfidenceInterval(
  params: ConfidenceIntervalParams,
  baseConfidence: number,
  baseSNR: number,
): ConfidenceIntervalResult {
  // Start with a base half-width for the confidence interval
  let confidenceHalfWidth = 10; // ±10 default
  let snrUncertainty = 3; // ±3 dB default

  // --- Width factors (widen the interval) ---

  // High Kp (>= 4): geomagnetic storm = unpredictable
  if (params.kp >= 4) {
    confidenceHalfWidth += 15;
    snrUncertainty += 6;
  }

  // Near MUF cutoff (ratio > 0.85): binary propagation
  if (params.mufRatio > 0.85) {
    confidenceHalfWidth += 10;
    snrUncertainty += 8;
  }

  // Multi-hop paths (> 2 hops): cumulative uncertainty
  if (params.hops > 2) {
    const extraHops = params.hops - 2;
    confidenceHalfWidth += extraHops * 5;
    snrUncertainty += extraHops * 1.5;
  }

  // Long path (> 10000 km)
  if (params.distanceKm > 10000) {
    confidenceHalfWidth += 5;
    snrUncertainty += 2;
  }

  // --- Narrow factors ---

  // Low Kp (<= 2): stable conditions, narrow by 30%
  if (params.kp <= 2) {
    confidenceHalfWidth *= 0.7;
    snrUncertainty *= 0.7;
  }

  // Well within propagation window (MUF ratio < 0.5): narrow by 20%
  if (params.mufRatio < 0.5) {
    confidenceHalfWidth *= 0.8;
    snrUncertainty *= 0.8;
  }

  // Confidence is a percentage: its bounds live in [5, 99]. The centre from
  // calculateConfidence is within [20, 95], so these limits never cross it.
  const low = Math.max(5, Math.round(baseConfidence - confidenceHalfWidth));
  const high = Math.min(99, Math.round(baseConfidence + confidenceHalfWidth));

  // SNR bounds are the physical interval [base - u, base + u]. They are not
  // clipped here: clipping each end to a display range (formerly [-30, +30])
  // reversed the interval whenever the point estimate lay outside it, e.g. a
  // 40 dB estimate reported [38.3, 30] (#945 audit). Presentation ranges are
  // applied by the renderer, and only with one monotone clamp on all three
  // values so order and containment survive (PROP-02 #948).
  const snrLow = Math.round((baseSNR - snrUncertainty) * 10) / 10;
  const snrHigh = Math.round((baseSNR + snrUncertainty) * 10) / 10;

  return {
    confidence: baseConfidence,
    low,
    high,
    snrLow,
    snrHigh,
  };
}

/**
 * Generate complete signal strength prediction for a propagation path
 *
 * Combines all path loss factors and calculates expected receive
 * conditions including SNR, S-meter reading, and signal classification.
 *
 * This is the main entry point for signal predictions, bringing together:
 * - Free space loss
 * - D-layer absorption (from ionosphere.ts)
 * - Ground reflection losses
 * - Polarization losses
 * - Mode-specific SNR calculations
 *
 * @param frequencyMHz - Operating frequency in MHz
 * @param distanceKm - Path distance in kilometers
 * @param hops - Number of ionospheric hops
 * @param absorptionDb - D-layer absorption in dB (from calculateDLayerAbsorption)
 * @param txPowerWatts - Transmitter power in watts
 * @param mode - Operating mode ('SSB', 'CW', 'FT8', 'RTTY')
 * @param antennaGainDbi - Combined TX+RX antenna gain in dBi (default 0)
 * @param noiseEnvironment - Noise environment for ITU-R P.372 model
 * @param terrainLossDb - Terrain-specific loss override in dB
 * @param kp - Current K-index (0-9) for confidence interval calculation
 * @param sfi - Current Solar Flux Index for confidence interval calculation
 * @param muf - Maximum Usable Frequency in MHz for confidence interval calculation
 * @param support - Circuit support from the path solver (contract M07). An
 *   unsupported mode contributes no power: the loss breakdown is still
 *   reported, but expectedSNR and the SNR bounds are -Infinity, sUnit is S0,
 *   signalClass is "none" and the confidence and its bounds are 0. Defaults to
 *   "supported" for callers that have already established support.
 * @param atmosphericOptions - Receiver time/season/latitude context for the
 *   ITU-R P.372 atmospheric noise term. Omitting it is not neutral -- see
 *   calculateReferenceNoise.
 * @returns Complete SignalPrediction object with optional confidence intervals
 *
 * @example
 * ```ts
 * // Predict 20m FT8 signal over 8000 km path
 * const prediction = predictSignalStrength(
 *   14.074,    // 20m FT8 frequency
 *   8000,      // Distance in km
 *   3,         // 3 hops
 *   8,         // 8 dB D-layer absorption
 *   50,        // 50 watts
 *   'FT8',     // Mode
 *   3          // 3 dBi antenna gain
 * );
 *
 * console.log(prediction);
 * // {
 * //   pathLoss: 152.3,
 * //   freeSpaceLoss: 141.5,
 * //   absorptionLoss: 8,
 * //   groundReflectionLoss: 4,
 * //   expectedSNR: -8,
 * //   sUnit: { value: 3, text: 'S3', dBm: -109 },
 * //   signalClass: 'moderate',
 * //   confidence: 80,
 * //   mode: 'FT8'
 * // }
 * ```
 */
export function predictSignalStrength(
  frequencyMHz: number,
  distanceKm: number,
  hops: number,
  absorptionDb: number,
  txPowerWatts: number,
  mode: OperatingMode,
  antennaGainDbi: number = 0,
  noiseEnvironment?: NoiseEnvironment,
  terrainLossDb?: number,
  kp?: number,
  sfi?: number,
  muf?: number,
  support: CircuitSupport = "supported",
  atmosphericOptions?: AtmosphericNoiseOptions,
): SignalPrediction {
  // Calculate individual loss components
  const freeSpaceLoss = calculateFreeSpaceLoss(frequencyMHz, distanceKm);
  const groundReflectionLoss = calculateGroundReflectionLoss(hops, "mixed");

  // Total path loss (swap default ground loss for terrain-specific if available)
  let pathLoss = calculateTotalPathLoss(
    frequencyMHz,
    distanceKm,
    hops,
    absorptionDb,
    "mixed",
  );
  if (terrainLossDb !== undefined) {
    pathLoss = pathLoss - groundReflectionLoss + terrainLossDb;
  }

  // One noise plane for the SNR and the reported assumption (M09/M10)
  const noise = calculateReferenceNoise(
    frequencyMHz,
    noiseEnvironment,
    atmosphericOptions,
  );

  // An unsupported ordinary mode contributes no power (M07): zero received
  // power is -Infinity dBm, so SNR and S-meter follow from that, not from a
  // budget computed as if the hop reflected.
  const isSupported = support === "supported";

  // Calculate expected SNR
  const expectedSNR = isSupported
    ? calculateExpectedSNR(
        txPowerWatts,
        pathLoss,
        mode,
        antennaGainDbi,
        frequencyMHz,
        noiseEnvironment,
        atmosphericOptions,
      )
    : Number.NEGATIVE_INFINITY;

  // Calculate received signal level for S-meter reading (M08: 30 + 10log10 P_W)
  const txPowerDbm = 30 + 10 * Math.log10(txPowerWatts);
  const rxSignalDbm = isSupported
    ? txPowerDbm + antennaGainDbi - pathLoss
    : Number.NEGATIVE_INFINITY;

  // Get S-unit reading
  const sUnit = dBmToSUnits(rxSignalDbm);

  // Classify signal strength
  const signalClass = getSignalClass(expectedSNR, mode);

  // Calculate prediction confidence. An unsupported mode has no predicted
  // signal to be confident about, so the confidence is 0, not the distance/hop
  // heuristic's 65-75 (PROP-02 #948). The interval below collapses to [0, 0]
  // for the same reason: there is no spread around "no circuit".
  const confidence = isSupported
    ? calculateConfidence(distanceKm, hops, expectedSNR, mode)
    : 0;

  // Build base prediction
  const prediction: SignalPrediction = {
    pathLoss: Math.round(pathLoss * 10) / 10,
    freeSpaceLoss: Math.round(freeSpaceLoss * 10) / 10,
    absorptionLoss: absorptionDb,
    groundReflectionLoss,
    expectedSNR,
    sUnit,
    signalClass,
    confidence,
    mode,
    support,
    noise,
  };

  // An unsupported mode carries its bounds unconditionally: [0, 0] confidence
  // and -Infinity SNR bounds are part of the no-power contract, not a
  // by-product of the solar inputs (Codex round 4, PR #1081). Supported modes
  // get an interval only when solar/geomagnetic data is available.
  if (!isSupported) {
    prediction.confidenceLow = 0;
    prediction.confidenceHigh = 0;
    prediction.snrLow = Number.NEGATIVE_INFINITY;
    prediction.snrHigh = Number.NEGATIVE_INFINITY;
  } else if (kp !== undefined && sfi !== undefined) {
    const modeParams = MODE_PARAMETERS[mode];
    const snrMargin = expectedSNR - modeParams.minSNR;
    const mufRatio = muf && muf > 0 ? frequencyMHz / muf : 0.6; // Default 0.6 if MUF unknown

    const interval = calculateConfidenceInterval(
      {
        distanceKm,
        hops,
        snrMargin,
        kp,
        sfi,
        frequency: frequencyMHz,
        mufRatio,
      },
      confidence,
      expectedSNR,
    );

    prediction.confidenceLow = interval.low;
    prediction.confidenceHigh = interval.high;
    prediction.snrLow = interval.snrLow;
    prediction.snrHigh = interval.snrHigh;
  }

  return prediction;
}

/**
 * Get human-readable description for signal class
 *
 * @param signalClass - Signal classification
 * @returns Description text for UI display
 */
export function getSignalClassDescription(signalClass: SignalClass): string {
  switch (signalClass) {
    case "strong":
      return "Strong signal - excellent copy expected";
    case "moderate":
      return "Moderate signal - good copy with some fading";
    case "weak":
      return "Weak signal - readable but challenging";
    case "marginal":
      return "Marginal signal - near threshold";
    case "none":
      return "No usable signal expected";
  }
}

/**
 * Get color class for signal classification (Tailwind)
 *
 * @param signalClass - Signal classification
 * @returns Tailwind text color class
 */
export function getSignalClassColor(signalClass: SignalClass): string {
  switch (signalClass) {
    case "strong":
      return "text-signal-green";
    case "moderate":
      return "text-good";
    case "weak":
      return "text-caution-amber";
    case "marginal":
      return "text-alert-red";
    case "none":
      return "text-su-muted";
  }
}

/**
 * Get background color class for signal classification (Tailwind)
 *
 * @param signalClass - Signal classification
 * @returns Tailwind background color class
 */
export function getSignalClassBgColor(signalClass: SignalClass): string {
  switch (signalClass) {
    case "strong":
      return "bg-signal-green/20";
    case "moderate":
      return "bg-good/20";
    case "weak":
      return "bg-caution-amber/20";
    case "marginal":
      return "bg-alert-red/20";
    case "none":
      return "bg-su-line/20";
  }
}

/**
 * Estimate number of hops for a given distance
 *
 * Typical F-layer hop distances:
 * - Low angle (DX): ~3000-4000 km per hop
 * - Medium angle: ~2000-2500 km per hop
 * - High angle (NVIS): ~500 km or less
 *
 * @param distanceKm - Path distance in kilometers
 * @param layerHeight - Reflection layer height in km (default 300 for F2)
 * @returns Estimated number of hops
 */
export function estimateHops(
  distanceKm: number,
  layerHeight: number = 300,
): number {
  // Maximum single-hop ground distance (radio-horizon geometry):
  // hop_max ≈ 2 × √(2 × R × h) for small angles.
  // For F2 at 300 km this gives ≈ 3900 km; scales with √height.
  const R = 6371; // Earth radius in km
  const maxHopDistance = 2 * Math.sqrt(2 * R * layerHeight);

  if (distanceKm <= 0) {
    return 1;
  }

  // Dividing by the maximum hop length gives the minimum hop count — the
  // standard assumption, since the fewest-hop mode suffers the least loss
  // and usually dominates the received signal.
  const hops = Math.ceil(distanceKm / maxHopDistance);
  return Math.max(1, Math.min(hops, 10)); // Cap at 10 hops
}

/**
 * Check if signal is likely decodable for a given mode
 *
 * @param snrDb - Signal-to-noise ratio in dB
 * @param mode - Operating mode
 * @returns True if signal should be decodable/copyable
 */
export function isSignalDecodable(snrDb: number, mode: OperatingMode): boolean {
  const modeParams = MODE_PARAMETERS[mode];
  // Allow 3 dB margin for fading
  return snrDb >= modeParams.minSNR - 3;
}

export type { NoiseEnvironment } from "./noiseModel";
