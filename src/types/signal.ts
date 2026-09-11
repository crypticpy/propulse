/**
 * Signal types for PropSphere Professional
 * Types for signal strength predictions and mode-specific parameters
 */

/**
 * S-meter reading representation
 * Standard amateur radio signal strength measurement
 */
export interface SUnit {
  /** Numeric S-unit value (0-9, or 9 plus dB over S9 for strong signals) */
  value: number;
  /** Human-readable display text (e.g., 'S7', 'S9', 'S9+20') */
  text: string;
  /** Actual signal strength in dBm (S9 = -73 dBm on HF) */
  dBm: number;
}

/**
 * Signal quality classification
 * Qualitative assessment of expected signal readability
 */
export type SignalClass = "strong" | "moderate" | "weak" | "marginal" | "none";

/**
 * Operating mode identifier for signal predictions
 */
export type OperatingMode = "SSB" | "CW" | "FT8" | "RTTY";

/**
 * Whether the ordinary skywave mode behind a prediction is supported.
 *
 * Mathematical contract M07 (#982): a supported mode may be weak but still
 * contributes power; an unsupported mode contributes no power. This engine's
 * only support test today is frequency <= median basic MUF at every hop. A hop
 * above its basic MUF would need the explicit above-MUF loss of ITU-R P.533-14
 * section 5.3 to contribute; that loss model is not implemented, so the mode
 * is excluded rather than given a fabricated received power.
 */
export type CircuitSupport = "supported" | "above_basic_muf";

/**
 * The receiver-noise assumption a prediction was made with (contract M09/M10).
 * `source` keeps an assumed default distinguishable from a caller-specified
 * environment; the noise floor is always in the 2500 Hz reference bandwidth.
 */
export interface NoiseAssumption {
  /** ITU-R P.372 man-made noise category used for the external noise factor */
  environment: "city" | "residential" | "rural" | "quiet_rural";
  /** "specified" when the caller supplied the environment, "assumed" when it did not */
  source: "specified" | "assumed";
  /** External noise factor Fa in dB above kT0B (ITU-R P.372) */
  fa_dB: number;
  /** Noise power in dBm in `referenceBandwidthHz` */
  noiseFloorDbm: number;
  /** Reference bandwidth for SNR and noise floor (always 2500 Hz) */
  referenceBandwidthHz: number;
}

/**
 * Complete signal prediction for a propagation path
 * Combines all loss factors and provides expected receive conditions
 */
export interface SignalPrediction {
  /** Total path loss in dB (sum of all loss components) */
  pathLoss: number;
  /** Free space path loss component in dB (distance-dependent) */
  freeSpaceLoss: number;
  /** D-layer absorption loss in dB (frequency and solar zenith angle dependent) */
  absorptionLoss: number;
  /** Ground reflection loss in dB per hop (terrain and conductivity dependent) */
  groundReflectionLoss: number;
  /** Expected signal-to-noise ratio at receiver in dB */
  expectedSNR: number;
  /** Predicted S-meter reading at the receive station */
  sUnit: SUnit;
  /** Qualitative signal classification based on expected SNR and mode */
  signalClass: SignalClass;
  /** Prediction confidence level as percentage (0-100) */
  confidence: number;
  /** Lower bound of confidence interval (0-100) */
  confidenceLow?: number;
  /** Upper bound of confidence interval (0-100) */
  confidenceHigh?: number;
  /** Pessimistic SNR estimate in dB (lower bound of uncertainty range) */
  snrLow?: number;
  /** Optimistic SNR estimate in dB (upper bound of uncertainty range) */
  snrHigh?: number;
  /** Operating mode used for this prediction */
  mode: OperatingMode;
  /**
   * Circuit support (contract M07). When not "supported" the mode contributes
   * no power: expectedSNR, snrLow and snrHigh are -Infinity, sUnit is S0 and
   * signalClass is "none".
   */
  support: CircuitSupport;
  /** Receiver-noise assumption behind expectedSNR (contract M09/M10) */
  noise: NoiseAssumption;
}

/**
 * Mode-specific operating parameters
 * Defines characteristics that affect signal prediction thresholds
 */
export interface ModeParameters {
  /** Mode name for display (e.g., 'Single Sideband', 'Continuous Wave') */
  name: string;
  /** Signal bandwidth in Hz (affects noise floor calculation) */
  bandwidth: number;
  /** Minimum SNR in dB required for reliable decode/copy */
  minSNR: number;
  /** Typical transmit power in watts for this mode */
  typicalPower: number;
}
