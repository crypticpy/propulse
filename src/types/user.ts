/**
 * User-related types for Propulse
 * Types for user station configuration and preferences
 */

import type { UserRadio, RadioEquipment } from "./radio";

/**
 * Ham radio station configuration
 * Represents the user's operating location and identity
 */
export interface UserStation {
  /** Amateur radio callsign (e.g., 'N5XXX', 'W1AW') */
  callsign: string;
  /** Maidenhead grid square (4 or 6 characters, e.g., 'EM10fp') */
  grid: string;
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lon: number;
  /** Optional friendly name for this location (e.g., 'Home', 'Portable', 'Mobile') */
  name?: string;
  /** IANA timezone identifier (e.g., 'America/Chicago', 'Europe/London') */
  timezone?: string;
}

/**
 * ITU radio region identifier
 * The world is divided into three regions for radio frequency allocation
 */
export type ITURegion = "ITU1" | "ITU2" | "ITU3";

/**
 * Amateur radio license class (US-based, extensible for other countries)
 * Determines frequency privileges and power limits
 */
export type LicenseClass =
  | "NOVICE"
  | "TECHNICIAN"
  | "GENERAL"
  | "ADVANCED"
  | "EXTRA";

/**
 * User application preferences
 */
export interface UserPreferences {
  /** Current station configuration, null if not set up */
  station: UserStation | null;
  /** Measurement units for distance, temperature, etc. */
  units: "imperial" | "metric";
  /** Time display format */
  timeFormat: "12h" | "24h";
  /** Application color theme */
  theme: "dark" | "light";
  /** ITU region for band plan compliance */
  ituRegion?: ITURegion;
  /** Amateur license class for privilege checks */
  licenseClass?: LicenseClass;
  /** User's radio equipment collection */
  radios?: UserRadio[];
  /** User-defined custom radio equipment definitions */
  customRadios?: RadioEquipment[];
  /** Currently active radio ID */
  activeRadioId?: string | null;
  /**
   * Prefer tested (Sherwood) specs over factory specs when available.
   * When true, uses lab-tested measurements; when false, uses manufacturer-claimed specs.
   */
  preferTestedSpecs?: boolean;
}
