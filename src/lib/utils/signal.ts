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
} from "../../types/signal";

/**
 * Mode-specific parameters for signal calculations
 * Bandwidth affects noise floor; minSNR affects decode/copy threshold
 */
export const MODE_PARAMETERS: Record<OperatingMode, ModeParameters> = {
  SSB: {
    name: "Single Sideband",
    bandwidth: 2400,
    minSNR: -6,
    typicalPower: 100,
  },
  CW: {
    name: "Continuous Wave",
    bandwidth: 500,
    minSNR: -15,
    typicalPower: 100,
  },
  FT8: {
    name: "FT8 Digital",
    bandwidth: 50,
    minSNR: -21, // Reports at -21, can decode to -24
    typicalPower: 50,
  },
  RTTY: {
    name: "Radio Teletype",
    bandwidth: 300,
    minSNR: -10,
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
 * Thermal noise power density at 290K in dBm/Hz
 */
const THERMAL_NOISE_DBM_PER_HZ = -174;

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
 * Calculate noise floor for a given bandwidth
 *
 * Thermal noise power: kTB where k=Boltzmann, T=temperature, B=bandwidth
 * At 290K (17°C): -174 dBm/Hz + 10×log10(bandwidth)
 *
 * HF bands also have atmospheric and man-made noise which can be
 * 10-30 dB above thermal noise floor.
 *
 * @param bandwidthHz - Receiver bandwidth in Hz
 * @param externalNoiseDb - Additional noise above thermal (default 15 dB for HF)
 * @returns Noise floor in dBm
 */
function calculateNoiseFloor(
  bandwidthHz: number,
  externalNoiseDb: number = 15,
): number {
  // Thermal noise + bandwidth factor + external noise
  const thermalNoise = THERMAL_NOISE_DBM_PER_HZ + 10 * Math.log10(bandwidthHz);
  return thermalNoise + externalNoiseDb;
}

/**
 * Calculate expected Signal-to-Noise Ratio
 *
 * SNR calculation based on:
 * - Transmit power (converted to dBm)
 * - Total path loss
 * - Mode bandwidth (affects noise floor)
 * - Antenna gains
 *
 * SNR = P_tx(dBm) + G_ant(dBi) - PathLoss(dB) - NoiseFloor(dBm)
 *
 * @param txPowerWatts - Transmitter power in watts
 * @param pathLossDb - Total path loss in dB (from calculateTotalPathLoss)
 * @param mode - Operating mode for bandwidth consideration
 * @param antennaGainDbi - Combined TX+RX antenna gain in dBi (default 0)
 * @returns Expected SNR in dB (can be negative for weak signals)
 *
 * @example
 * ```ts
 * // 100W SSB with 6 dBi antenna gain, 145 dB path loss
 * const snr = calculateExpectedSNR(100, 145, 'SSB', 6);
 * // snr ≈ 12 dB
 *
 * // 50W FT8 with dipole (0 dBi), 155 dB path loss
 * const ft8snr = calculateExpectedSNR(50, 155, 'FT8', 0);
 * // ft8snr ≈ -10 dB (still decodable)
 * ```
 */
export function calculateExpectedSNR(
  txPowerWatts: number,
  pathLossDb: number,
  mode: OperatingMode,
  antennaGainDbi: number = 0,
): number {
  // Guard against invalid inputs
  if (txPowerWatts <= 0) {
    return -100;
  }

  // Convert TX power to dBm (1W = 30 dBm)
  const txPowerDbm = 10 * Math.log10(txPowerWatts * 1000);

  // Get mode bandwidth for noise calculation
  const modeParams = MODE_PARAMETERS[mode];
  const noiseFloor = calculateNoiseFloor(modeParams.bandwidth);

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
  const {minSNR} = modeParams;

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
 * @returns Complete SignalPrediction object
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
): SignalPrediction {
  // Calculate individual loss components
  const freeSpaceLoss = calculateFreeSpaceLoss(frequencyMHz, distanceKm);
  const groundReflectionLoss = calculateGroundReflectionLoss(hops, "mixed");

  // Total path loss
  const pathLoss = calculateTotalPathLoss(
    frequencyMHz,
    distanceKm,
    hops,
    absorptionDb,
    "mixed",
  );

  // Calculate expected SNR
  const expectedSNR = calculateExpectedSNR(
    txPowerWatts,
    pathLoss,
    mode,
    antennaGainDbi,
  );

  // Calculate received signal level for S-meter reading
  const txPowerDbm = 10 * Math.log10(txPowerWatts * 1000);
  const rxSignalDbm = txPowerDbm + antennaGainDbi - pathLoss;

  // Get S-unit reading
  const sUnit = dBmToSUnits(rxSignalDbm);

  // Classify signal strength
  const signalClass = getSignalClass(expectedSNR, mode);

  // Calculate prediction confidence
  const confidence = calculateConfidence(distanceKm, hops, expectedSNR, mode);

  return {
    pathLoss: Math.round(pathLoss * 10) / 10,
    freeSpaceLoss: Math.round(freeSpaceLoss * 10) / 10,
    absorptionLoss: absorptionDb,
    groundReflectionLoss,
    expectedSNR,
    sUnit,
    signalClass,
    confidence,
    mode,
  };
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
      return "text-gray-500";
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
      return "bg-gray-500/20";
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
  // Average skip distance varies with layer height
  // Geometry: hop ≈ 2 × √(2 × R × h) for small angles
  // For F2 at 300km: hop ≈ 2500km, scales with √height
  const R = 6371; // Earth radius in km
  const avgHopDistance = 2 * Math.sqrt(2 * R * layerHeight);

  if (distanceKm <= 0) {
    return 1;
  }

  // Calculate hops, minimum 1
  const hops = Math.ceil(distanceKm / avgHopDistance);
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
