/**
 * Alert system types for geomagnetic storms and solar events
 * Types for solar weather alerts and notifications
 */

// =============================================================================
// ALERT TYPE DEFINITIONS
// =============================================================================

/**
 * Types of solar/geomagnetic alerts
 */
export type AlertType =
  | "GEOMAGNETIC_STORM" // Kp >= 5
  | "RADIO_BLACKOUT" // X-ray flare causes HF absorption
  | "SOLAR_FLARE" // M or X-class flare detected/probable
  | "BAND_DEGRADATION" // Specific bands affected by conditions
  | "PROTON_EVENT" // Solar proton event affecting polar paths
  | "IMF_SOUTHWARD" // Bz strongly negative
  | "AURORA_WARNING" // High latitude aurora activity
  | "GREYLINE_APPROACHING" // Greyline nearing user's QTH
  | "BAND_OPENING" // Band opening detected on monitored band
  | "CME_INCOMING" // Coronal mass ejection heading toward Earth
  | "DST_STORM"; // Dst index indicates geomagnetic storm

/**
 * Alert severity levels
 */
export type AlertPriority = "INFO" | "WARNING" | "CRITICAL";

/**
 * Alert lifecycle states
 */
export type AlertStatus = "ACTIVE" | "RESOLVED" | "DISMISSED";

/**
 * Data source that triggered the alert
 */
export type AlertSource =
  | "K_INDEX"
  | "BZ_GSM"
  | "SOLAR_FLUX"
  | "FLARE_PROBABILITY"
  | "PROTON_FLUX"
  | "X_RAY_FLUX"
  | "DST_INDEX"
  | "CME_ANALYSIS"
  | "GREYLINE"
  | "SPOT_DETECTOR"
  | "MANUAL";

// =============================================================================
// ALERT INTERFACES
// =============================================================================

/**
 * Main alert interface representing a solar weather alert
 */
export interface SolarAlert {
  /** Unique identifier */
  id: string;
  /** Type of alert */
  type: AlertType;
  /** Severity level */
  priority: AlertPriority;
  /** Current lifecycle status */
  status: AlertStatus;
  /** Short alert title */
  title: string;
  /** Detailed message */
  message: string;
  /** Bands affected by this condition */
  affectedBands: string[];
  /** ISO timestamp when alert was triggered */
  triggeredAt: string;
  /** ISO timestamp when alert expires (auto-resolve) */
  expiresAt: string;
  /** ISO timestamp when condition normalized */
  resolvedAt?: string;
  /** ISO timestamp when user dismissed */
  dismissedAt?: string;
  /** Data source that triggered this alert */
  source: AlertSource;
  /** Threshold value that was exceeded */
  thresholdValue: number;
  /** Current measured value */
  currentValue: number;
}

/**
 * Configurable threshold settings for alert triggers
 */
export interface AlertThreshold {
  /** Alert type this threshold applies to */
  type: AlertType;
  /** Minimum priority to use */
  minPriority: AlertPriority;
  /** Value that triggers INFO */
  infoThreshold: number;
  /** Value that triggers WARNING */
  warningThreshold: number;
  /** Value that triggers CRITICAL */
  criticalThreshold: number;
  /** Hysteresis - value must drop below this to resolve */
  resolveThreshold: number;
  /** Cooldown in milliseconds between alerts of same type */
  cooldownMs: number;
}

/**
 * Band degradation mapping - which bands are affected at which Kp levels
 */
export interface BandDegradation {
  /** Kp level at which degradation starts */
  kpLevel: number;
  /** Bands that become degraded */
  bands: string[];
  /** Description of the degradation */
  description: string;
}

// =============================================================================
// SOLAR DATA ENTRY TYPES
// =============================================================================

/**
 * GOES X-ray flux measurement entry
 */
export interface XrayFluxEntry {
  /** ISO timestamp */
  time_tag: string;
  /** X-ray flux in W/m² */
  flux: number;
  /** Energy band, e.g. "0.1-0.8nm" */
  energy: string;
  /** GOES satellite number */
  satellite: number;
}

/**
 * GOES proton flux measurement entry (integral >= 10 MeV)
 */
export interface ProtonFluxEntry {
  /** ISO timestamp */
  time_tag: string;
  /** Proton flux in pfu (particle flux units) */
  flux: number;
  /** Energy threshold, e.g. ">=10 MeV" */
  energy: string;
  /** GOES satellite number */
  satellite: number;
}

/**
 * Dst (Disturbance Storm Time) index entry
 */
export interface DstEntry {
  /** ISO timestamp */
  time_tag: string;
  /** Dst index in nT (nanotesla) */
  dst: number;
}

/**
 * CME analysis entry from NASA DONKI
 */
export interface CMEAnalysis {
  /** CME time at 21.5 solar radii */
  time21_5: string;
  /** CME latitude in degrees */
  latitude: number;
  /** CME longitude in degrees */
  longitude: number;
  /** Half-angle of the CME cone in degrees */
  halfAngle: number;
  /** CME speed in km/s */
  speed: number;
  /** CME type: "S" (slow), "C" (common), "O" (occasional) */
  type: string;
  /** Analysis note */
  note: string;
  /** Catalog source */
  catalog: string;
  /** Link to full analysis */
  link: string;
}

/**
 * D-Region Absorption Prediction (DRAP) data
 */
export interface DRAPData {
  /** ISO timestamp of observation */
  observation_time: string;
  /** ISO timestamp of forecast validity */
  forecast_time: string;
  /** Grid of maximum usable frequencies (lat x lon) in MHz */
  frequencies: number[][];
  /** Latitude values for the grid */
  latitudes: number[];
  /** Longitude values for the grid */
  longitudes: number[];
}

/**
 * Solar flux index forecast entry
 */
export interface SolarFluxForecast {
  /** Date string for this forecast day */
  date: string;
  /** Predicted 10.7 cm solar flux */
  predicted_flux: number;
  /** Observed flux value (if available) */
  observed_flux?: number;
}
