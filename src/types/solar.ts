/**
 * Solar data types for Propulse
 * Types representing solar indices and HF band propagation conditions
 */

/**
 * Band propagation condition rating
 * Based on calculated score from solar indices
 */
export type BandCondition = "Excellent" | "Good" | "Fair" | "Poor";

/**
 * VHF-specific condition that can include Aurora
 */
export type VHFCondition = BandCondition | "Aurora";

/**
 * Status and conditions for an amateur radio band
 */
export interface BandStatus {
  /** Band designation (e.g., '20m', '40m') */
  name: string;
  /** Center frequency (e.g., '14.0 MHz') */
  freq: string;
  /** Expected propagation during daylight hours */
  dayCondition: BandCondition | VHFCondition;
  /** Expected propagation during nighttime */
  nightCondition: BandCondition | VHFCondition;
  /** Typical use case (e.g., 'Daytime DX', 'Night DX', 'Regional') */
  bestFor: string;
}

/**
 * Solar indices from NOAA SWPC
 * These values determine HF propagation conditions
 */
export interface SolarIndices {
  /** Solar Flux Index (10.7cm radio flux) - typical range 70-300 sfu */
  sfi: number;
  /** Planetary K-index (geomagnetic disturbance) - scale 0-9 */
  kp: number;
  /** Sunspot Number - daily count */
  ssn: number;
  /** A-index (24-hour geomagnetic activity) - derived from K-index */
  aIndex: number;
}

/**
 * Overall propagation assessment summary
 */
export interface OverallCondition {
  /** General HF band conditions */
  hf: BandCondition;
  /** VHF propagation conditions */
  vhf: BandCondition | VHFCondition;
  /** Plain language description of current conditions */
  summary: string;
}
