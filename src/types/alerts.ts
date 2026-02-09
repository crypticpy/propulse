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
  | "BAND_OPENING"; // Band opening detected on monitored band

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
