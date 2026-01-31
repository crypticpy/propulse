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
  /** Operating mode used for this prediction */
  mode: OperatingMode;
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
