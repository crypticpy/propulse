/**
 * User-related types for Propulse
 * Types for user station configuration and preferences
 */

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
}
