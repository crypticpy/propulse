/**
 * TypeScript interfaces for NOAA SWPC API responses
 * These types represent the data structures returned by NOAA's Space Weather Prediction Center
 */

/**
 * K-Index data from NOAA planetary K index endpoint
 * The K-index quantifies disturbances in the horizontal component of Earth's magnetic field
 * Scale: 0-9, with 5+ indicating geomagnetic storm conditions
 */
export interface KIndexData {
  /** ISO 8601 timestamp of the measurement */
  time_tag: string;
  /** Planetary K-index value (0-9) */
  kp_index: number;
  /** Estimated K-index when real-time data unavailable */
  estimated_kp: number;
  /** K-index as string representation */
  kp: string;
}

/**
 * Solar flux data from NOAA 10.7 cm radio flux endpoint
 * The F10.7 index is a measure of solar activity at 2800 MHz
 * Higher values indicate increased solar activity
 */
export interface SolarFluxData {
  /** ISO 8601 timestamp of the measurement */
  time_tag: string;
  /** Observed 10.7 cm radio flux in solar flux units (sfu) */
  flux: number;
  /** Adjusted flux value accounting for distance variations */
  adjusted_flux?: number;
}

/**
 * Solar event probability data from NOAA solar probabilities endpoint
 * Provides forecast probabilities for various solar events over the next 24-72 hours
 */
export interface SolarProbabilities {
  /** ISO 8601 timestamp of the forecast */
  time_tag: string;
  /** Probability of C-class solar flare (%) */
  c_prob: number;
  /** Probability of M-class solar flare (%) */
  m_prob: number;
  /** Probability of X-class solar flare (%) */
  x_prob: number;
  /** Probability of solar proton event (%) */
  proton_prob: number;
}

/**
 * Sunspot data from NOAA solar cycle sunspots endpoint
 * Sunspot numbers are a key indicator of solar activity levels
 */
export interface SunspotData {
  /** ISO 8601 timestamp or date string of the measurement */
  time_tag: string;
  /** International Sunspot Number (SSN) */
  ssn: number;
  /** Smoothed sunspot number for trend analysis */
  smoothed_ssn?: number;
}

/**
 * Generic API response wrapper for error handling
 */
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

/**
 * API error response structure
 */
export interface ApiError {
  message: string;
  status?: number;
  endpoint?: string;
}
