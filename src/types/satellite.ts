/**
 * Satellite Tracking Type Definitions
 *
 * Types for TLE data, satellite positions, pass predictions,
 * and amateur radio satellite categorization.
 */

/**
 * Raw Two-Line Element set data for a satellite
 */
export interface TLEData {
  name: string;
  line1: string;
  line2: string;
  noradId: number;
}

/**
 * Full satellite info including computed position and metadata
 */
export interface SatelliteInfo extends TLEData {
  /** Current position */
  position: SatellitePosition;
  /** Whether currently above observer's horizon */
  isVisible: boolean;
  /** Category: "fm", "linear", "digital", "iss", "weather", "other" */
  category: SatelliteCategory;
}

/**
 * Computed satellite position in geographic coordinates
 */
export interface SatellitePosition {
  lat: number;
  lon: number;
  alt: number; // km above Earth's surface
  velocity: number; // km/s
}

/**
 * Pass prediction for a satellite over an observer location
 */
export interface PassPrediction {
  aos: Date; // acquisition of signal
  los: Date; // loss of signal
  maxEl: number; // maximum elevation in degrees
  aosAz: number; // azimuth at AOS in degrees
  losAz: number; // azimuth at LOS in degrees
}

/**
 * Amateur radio satellite categories
 */
export type SatelliteCategory =
  | "fm"
  | "linear"
  | "digital"
  | "iss"
  | "weather"
  | "other";
