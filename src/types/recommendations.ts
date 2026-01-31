/**
 * Types for the Intelligent Recommendations Engine
 * Provides actionable band recommendations with time windows for target paths
 */

/**
 * Operating mode for signal threshold calculations
 */
export type OperatingMode = "SSB" | "CW" | "FT8" | "RTTY";

/**
 * Individual band recommendation with scoring and assessment
 */
export interface BandRecommendation {
  /** Band name (e.g., '20m') */
  band: string;
  /** Confidence score 0-100, higher is better */
  score: number;
  /** Expected SNR in dB */
  snr: number;
  /** S-meter reading (e.g., 'S7') */
  sUnit: string;
  /** Propagation status assessment */
  status: "excellent" | "good" | "fair" | "poor" | "closed";
  /** Human-readable explanation for the recommendation */
  reason: string;
}

/**
 * Time window for optimal propagation on a specific band
 */
export interface TimeWindow {
  /** Band name (e.g., '20m') */
  band: string;
  /** Start hour in UTC (0-23) */
  startHour: number;
  /** End hour in UTC (0-23) */
  endHour: number;
  /** Peak hour within the window (best conditions) */
  peakHour: number;
  /** Status at peak hour */
  peakStatus: string;
  /** Hours until window starts, -1 if currently active */
  hoursUntilStart: number;
}

/**
 * Complete propagation recommendations package
 */
export interface PropagationRecommendations {
  /** Best band recommendation */
  optimal: BandRecommendation;
  /** Alternative bands ranked by score (2nd, 3rd, 4th best) */
  alternatives: BandRecommendation[];
  /** Best operating windows for the next 24 hours */
  timeWindows: TimeWindow[];
  /** Human-readable summary of recommendations */
  summary: string;
  /** Operating mode context for threshold calculations */
  mode: OperatingMode;
  /** Timestamp when recommendations were generated */
  generatedAt: Date;
}
