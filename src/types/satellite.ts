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

// ---------------------------------------------------------------------------
// SatNOGS Transmitter Data
// ---------------------------------------------------------------------------

/**
 * Transponder / transmitter from SatNOGS DB with operational status.
 * Mapped from the SatNOGS API response format.
 */
export interface SatNOGSTransmitter {
  uuid: string;
  description: string;
  alive: boolean;
  type: "Transmitter" | "Transceiver" | "Transponder";
  uplink_low: number | null;
  uplink_high: number | null;
  downlink_low: number | null;
  downlink_high: number | null;
  mode: string | null;
  invert: boolean;
  baud: number | null;
  norad_cat_id: number;
  status: "active" | "inactive" | "invalid";
  service: string;
}

// ---------------------------------------------------------------------------
// Custom TLE Sets
// ---------------------------------------------------------------------------

/**
 * Custom TLE set stored by user (e.g. new launches, classified objects).
 * Extends TLEData with metadata about when and why it was added.
 */
export interface CustomTLE extends TLEData {
  /** ISO timestamp of when this TLE was added */
  addedAt: string;
  /** User-provided label like "New launch" or "Classified" */
  source: string;
}

// ---------------------------------------------------------------------------
// TLE Age
// ---------------------------------------------------------------------------

/** TLE age category for badge display */
export type TLEAge = "fresh" | "aging" | "stale";

// ---------------------------------------------------------------------------
// Extended Satellite Info
// ---------------------------------------------------------------------------

/** Extended satellite info with TLE age and custom origin flag */
export interface SatelliteInfoExtended extends SatelliteInfo {
  /** How old the TLE epoch is */
  tleAge: TLEAge;
  /** Whether this satellite came from the user's custom TLE store */
  isCustom: boolean;
}
