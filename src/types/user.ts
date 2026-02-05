/**
 * User-related types for Propulse
 * Types for user station configuration and preferences
 */

import type { UserRadio, RadioEquipment } from "./radio";
import type { ColorBlindMode } from "@/lib/themes/colorblind";

// =============================================================================
// LOCATION TYPES
// =============================================================================

/**
 * Location type for categorizing operating locations
 */
export type LocationType =
  | "home"
  | "portable"
  | "mobile"
  | "pota"
  | "sota"
  | "fieldday"
  | "other";

/**
 * Operating location with full metadata
 * Represents a specific place where the operator can transmit from
 */
export interface OperatingLocation {
  /** Unique identifier for this location */
  id: string;
  /** Friendly name (e.g., "Home", "POTA K-1234", "Field Day Site") */
  name: string;
  /** Maidenhead grid square (4 or 6 characters) */
  grid: string;
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lon: number;
  /** IANA timezone identifier (e.g., 'America/Chicago') */
  timezone?: string;
  /** Location type for UI hints and filtering */
  type: LocationType;
  /** Optional park/summit reference for POTA/SOTA activations */
  activationRef?: string;
  /** ISO-8601 timestamp when this location was created */
  createdAt: string;
}

/**
 * Ham radio station configuration with multi-location support
 * Represents the user's identity and operating locations
 */
export interface UserStation {
  /** Amateur radio callsign (e.g., 'N5XXX', 'W1AW') */
  callsign: string;
  /** ID of the home/primary location */
  homeLocationId: string;
  /** ID of the currently active location (null = use home) */
  activeLocationId: string | null;
  /** All saved operating locations */
  savedLocations: OperatingLocation[];
  /** Optional operator name */
  operatorName?: string;

  // Legacy compatibility fields - computed from active location
  // These are maintained for backward compatibility with existing code
  /** @deprecated Use getActiveLocation() helper - Maidenhead grid of active location */
  grid: string;
  /** @deprecated Use getActiveLocation() helper - Latitude of active location */
  lat: number;
  /** @deprecated Use getActiveLocation() helper - Longitude of active location */
  lon: number;
  /** @deprecated Use getActiveLocation() helper - Timezone of active location */
  timezone?: string;
  /** @deprecated Use operatorName - Friendly name */
  name?: string;
}

// =============================================================================
// LICENSE TYPES
// =============================================================================

/**
 * Country/region for license administration
 * Used to determine available license classes
 */
export type LicenseCountry =
  | "US" // United States
  | "CA" // Canada
  | "UK" // United Kingdom
  | "DE" // Germany
  | "JP" // Japan
  | "AU" // Australia
  | "NZ" // New Zealand
  | "FR" // France
  | "ES" // Spain
  | "IT" // Italy
  | "BR" // Brazil
  | "MX" // Mexico
  | "OTHER"; // Other countries

/**
 * Amateur radio license class
 * Includes US classes, international classes, and other radio services
 * Uses string union with fallback string for extensibility
 */
export type LicenseClass =
  // US Amateur classes
  | "NOVICE"
  | "TECHNICIAN"
  | "GENERAL"
  | "ADVANCED"
  | "EXTRA"
  // Other US radio services
  | "GMRS"
  | "MURS"
  | "CB"
  | "MARINE"
  // UK classes
  | "FOUNDATION"
  | "INTERMEDIATE"
  | "FULL"
  // German classes
  | "KLASSE_A"
  | "KLASSE_E"
  // Canadian classes
  | "BASIC"
  | "BASIC_HONOURS"
  | "ADVANCED_CA"
  // Generic fallback for other countries
  | (string & {});

/**
 * License details with expiration tracking
 */
export interface LicenseInfo {
  /** Country/region of license administration */
  country: LicenseCountry;
  /** License class within that country's system */
  class: LicenseClass;
  /** ISO-8601 date of expiration (null = no expiration, e.g., CB) */
  expirationDate: string | null;
  /** ISO-8601 date of grant/issue */
  grantDate?: string;
  /** FRN or license ID (for US licenses) */
  licenseId?: string;
}

// =============================================================================
// BAND AND NOTIFICATION PREFERENCES
// =============================================================================

/**
 * HF/VHF/UHF band identifiers
 */
export type BandId =
  | "160m"
  | "80m"
  | "60m"
  | "40m"
  | "30m"
  | "20m"
  | "17m"
  | "15m"
  | "12m"
  | "10m"
  | "6m"
  | "2m"
  | "70cm";

/**
 * Favored bands configuration
 * Controls how bands are prioritized and displayed in the UI
 */
export interface FavoredBands {
  /** Bands to show prominently at the top of band displays */
  primary: BandId[];
  /** Bands to hide or deprioritize (user not interested) */
  hidden: BandId[];
}

/**
 * Band preset for quick filtering
 * Allows users to save and quickly apply favorite band combinations
 */
export interface BandPreset {
  /** Unique identifier for this preset */
  id: string;
  /** User-friendly name for the preset (e.g., "HF Low", "Contest Bands") */
  name: string;
  /** Array of band strings to filter by when this preset is applied */
  bands: string[];
}

/**
 * Notification/alert preferences
 * Controls which alerts the user wants to receive
 */
export interface NotificationPreferences {
  /** Greyline alerts at sunrise/sunset */
  greylineAlerts: boolean;
  /** Geomagnetic storm warnings (Kp >= threshold) */
  stormAlerts: boolean;
  /** Kp threshold for storm alerts (default: 5) */
  stormAlertKpThreshold: number;
  /** Solar flare probability alerts */
  flareAlerts: boolean;
  /** Band opening notifications */
  bandOpeningAlerts: boolean;
  /** Bands to monitor for openings */
  bandOpeningBands: BandId[];
  /** Sound enabled for alerts */
  soundEnabled: boolean;
  /** Quiet hours start (UTC hour 0-23, undefined = disabled) */
  quietHoursStart?: number;
  /** Quiet hours end (UTC hour 0-23, undefined = disabled) */
  quietHoursEnd?: number;
}

/**
 * Watch audio alert type for different alert sounds
 */
export type WatchAlertType = "callsign" | "grid" | "entity";

/**
 * Watch System audio alert preferences
 * Controls audio notifications when watched items are spotted
 */
export interface WatchAlertPreferences {
  /** Master enable/disable for watch audio alerts */
  enabled: boolean;
  /** Master mute toggle (silences alerts without disabling) */
  muted: boolean;
  /** Volume level 0-100 (default: 50) */
  volume: number;
  /** Cooldown in seconds before re-alerting same spot (default: 300 = 5 min) */
  cooldownSeconds: number;
  /** Enable alert for watched callsigns */
  callsignAlerts: boolean;
  /** Enable alert for watched grids */
  gridAlerts: boolean;
  /** Enable alert for watched entities/DXCC */
  entityAlerts: boolean;
}

/**
 * Spot clustering preferences for PropSphere globe view
 * Controls how nearby DX spots are grouped together
 */
export interface SpotClusteringPreferences {
  /** Whether spot clustering is enabled */
  enabled: boolean;
  /** Grid cell size in degrees for clustering (5-15) */
  gridSize: number;
  /** Minimum number of spots to form a cluster (2-10) */
  minClusterSize: number;
}

/**
 * Beam width options for compass rose visualization
 */
export type BeamWidthOption = 30 | 45 | 60 | 90;

/**
 * Compass rose preferences for PropSphere globe view
 * Controls the compass rose overlay at operator's QTH location
 */
export interface CompassRosePreferences {
  /** Whether the compass rose is displayed */
  enabled: boolean;
  /** Beam width in degrees for wedge visualization */
  beamWidth: BeamWidthOption;
  /** Whether to show the beam width wedge overlay */
  showBeamWidth: boolean;
}

/**
 * Spot age visualization preferences
 * Controls how spot markers decay visually based on age
 */
export interface SpotAgePreferences {
  /** Whether age-based visual decay is enabled */
  enabled: boolean;
  /** Maximum age in minutes before spots are considered 'old' (default: 30) */
  maxAgeMinutes: number;
  /** Show age column in DX Cluster list */
  showAgeColumn: boolean;
}

/**
 * Forecast display preferences for the PropagationForecastMini component
 * Controls which bands are shown, display density, and info modules
 */
export interface ForecastDisplayPreferences {
  /** Which bands to show: "common" = 5 key bands, "all" = full 8 HF bands, "custom" = user-selected */
  bandMode: "common" | "all" | "custom";
  /** Custom band selection when bandMode is "custom" */
  customBands: BandId[];
  /** Show SNR values overlaid on heatmap cells */
  showSnrValues: boolean;
  /** Show the detailed footer (recommendations, greyline, tips) or compact single-line */
  detailedFooter: boolean;
  /** Number of hours to display (13 or 24) */
  hoursToShow: 13 | 24;
}

/**
 * UI Interaction preferences for globe and map controls
 * Controls gesture detection and menu behavior
 */
export interface UIInteractionPreferences {
  /** Press-and-hold duration in milliseconds to trigger menu (1500-5000, default: 2500) */
  holdDurationMs: number;
  /** Auto-dismiss timeout for flyout in milliseconds (1000-10000, default: 2500) */
  flyoutAutoDismissMs: number;
  /** Whether auto-dismiss is enabled (default: true) */
  flyoutAutoDismissEnabled: boolean;
  /** Show callsign labels on globe spots (default: true) */
  showSpotCallsignLabels: boolean;
  /** Show spotter labels in addition to DX labels (default: false) */
  showSpotterLabels: boolean;
  /** Hit radius multiplier for spot hover detection (0.5-2.0, default: 1.0) */
  spotHitRadiusMultiplier: number;
  /** Spot color coding mode: "mode" colors by operating mode (FT8/CW/SSB), "band" colors by frequency band (20m/40m) */
  spotColorMode: "mode" | "band";
  /** Visual style: "realistic" is the default clean look, "high-viz" uses bolder colors and larger markers inspired by OpenHamClock */
  visualStyle: "realistic" | "high-viz";
}

// =============================================================================
// PROFILE VALIDATION
// =============================================================================

/**
 * Profile field identifiers for validation
 */
export type ProfileField =
  | "callsign"
  | "grid"
  | "licenseClass"
  | "licenseExpiration"
  | "ituRegion"
  | "radio"
  | "timezone"
  | "name";

/**
 * Profile warning with severity level
 */
export interface ProfileWarning {
  field: ProfileField;
  message: string;
  severity: "info" | "warning" | "error";
}

/**
 * Profile completeness validation result
 */
export interface ProfileValidation {
  /** Whether the profile meets minimum requirements */
  isComplete: boolean;
  /** Completeness percentage (0-100) */
  completenessScore: number;
  /** Missing required fields */
  missingRequired: ProfileField[];
  /** Missing optional but recommended fields */
  missingRecommended: ProfileField[];
  /** Warnings (e.g., license expiring soon) */
  warnings: ProfileWarning[];
}

// =============================================================================
// EXISTING TYPES (Preserved)
// =============================================================================

/**
 * ITU radio region identifier
 * The world is divided into three regions for radio frequency allocation
 */
export type ITURegion = "ITU1" | "ITU2" | "ITU3";

/**
 * Text scale preference for accessibility
 * Allows users to increase/decrease text size for readability
 * - sm: 90% scale (compact display)
 * - md: 100% scale (default)
 * - lg: 115% scale (larger for older eyes/glasses)
 */
export type TextScale = "sm" | "md" | "lg";

// =============================================================================
// USER PREFERENCES
// =============================================================================

/**
 * User application preferences
 */
export interface UserPreferences {
  /** Current station configuration, null if not set up */
  station: UserStation | null;
  /** Measurement units for distance (metric only, standardized on km) */
  units: "metric";
  /** Time display format */
  timeFormat: "12h" | "24h";
  /** Application color theme */
  theme: "dark" | "light";
  /** ITU region for band plan compliance */
  ituRegion?: ITURegion;
  /**
   * @deprecated Use license.class instead
   * Amateur license class for privilege checks (kept for migration)
   */
  licenseClass?: LicenseClass;
  /** User's radio equipment collection */
  radios?: UserRadio[];
  /** User-defined custom radio equipment definitions */
  customRadios?: RadioEquipment[];
  /**
   * Currently active user-owned radio instance ID.
   * (Older persisted data may contain an equipment ID; migration should normalize.)
   */
  activeRadioId?: string | null;
  /**
   * Prefer tested (Sherwood) specs over factory specs when available.
   * When true, uses lab-tested measurements; when false, uses manufacturer-claimed specs.
   */
  preferTestedSpecs?: boolean;
  /**
   * Text scale for accessibility - affects UI text sizes
   * sm = 90% (compact), md = 100% (default), lg = 115% (larger for readability)
   */
  textScale?: TextScale;

  // === New Profile Fields ===

  /** License information with country, class, and expiration */
  license?: LicenseInfo;
  /** Favored bands for UI personalization */
  favoredBands?: FavoredBands;
  /** Notification/alert preferences */
  notifications?: NotificationPreferences;
  /** Spot clustering preferences for PropSphere globe view */
  spotClustering?: SpotClusteringPreferences;
  /** Compass rose preferences for PropSphere globe view */
  compassRose?: CompassRosePreferences;
  /** Spot age visualization preferences */
  spotAge?: SpotAgePreferences;
  /** Watch system audio alert preferences */
  watchAlerts?: WatchAlertPreferences;
  /** UI interaction preferences for globe controls and gestures */
  uiInteraction?: UIInteractionPreferences;
  /** Saved band presets for quick filtering (max 5) */
  bandPresets?: BandPreset[];
  /** Color blind mode for accessibility */
  colorBlindMode?: ColorBlindMode;
  /** Forecast display preferences for the 24h propagation forecast mini */
  forecastDisplay?: ForecastDisplayPreferences;
}

// =============================================================================
// HELPER CONSTANTS
// =============================================================================

/**
 * License classes available by country
 */
export const LICENSE_CLASSES_BY_COUNTRY: Record<
  LicenseCountry,
  LicenseClass[]
> = {
  US: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA", "NOVICE"],
  CA: ["BASIC", "BASIC_HONOURS", "ADVANCED_CA"],
  UK: ["FOUNDATION", "INTERMEDIATE", "FULL"],
  DE: ["KLASSE_E", "KLASSE_A"],
  JP: ["TECHNICIAN", "GENERAL", "ADVANCED", "EXTRA"], // Similar to US
  AU: ["FOUNDATION", "INTERMEDIATE", "FULL"], // Similar to UK
  NZ: ["FOUNDATION", "INTERMEDIATE", "FULL"], // Similar to UK
  FR: ["TECHNICIAN", "GENERAL", "EXTRA"], // Simplified
  ES: ["TECHNICIAN", "GENERAL", "EXTRA"], // Simplified
  IT: ["TECHNICIAN", "GENERAL", "EXTRA"], // Simplified
  BR: ["TECHNICIAN", "GENERAL", "EXTRA"], // Simplified
  MX: ["TECHNICIAN", "GENERAL", "EXTRA"], // Simplified
  OTHER: ["BASIC", "ADVANCED", "EXTRA"], // Generic fallback
};

/**
 * Country display names
 */
export const LICENSE_COUNTRY_NAMES: Record<LicenseCountry, string> = {
  US: "United States",
  CA: "Canada",
  UK: "United Kingdom",
  DE: "Germany",
  JP: "Japan",
  AU: "Australia",
  NZ: "New Zealand",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  BR: "Brazil",
  MX: "Mexico",
  OTHER: "Other",
};

/**
 * All available bands in order
 */
export const ALL_BANDS: BandId[] = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
];

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  greylineAlerts: false,
  stormAlerts: false,
  stormAlertKpThreshold: 5,
  flareAlerts: false,
  bandOpeningAlerts: false,
  bandOpeningBands: [],
  soundEnabled: true,
};

/**
 * Default watch alert preferences
 */
export const DEFAULT_WATCH_ALERT_PREFERENCES: WatchAlertPreferences = {
  enabled: true,
  muted: false,
  volume: 50,
  cooldownSeconds: 300, // 5 minutes
  callsignAlerts: true,
  gridAlerts: true,
  entityAlerts: true,
};

/**
 * Default favored bands configuration
 */
export const DEFAULT_FAVORED_BANDS: FavoredBands = {
  primary: ["20m", "40m"],
  hidden: [],
};

/**
 * Default spot clustering preferences
 */
export const DEFAULT_SPOT_CLUSTERING: SpotClusteringPreferences = {
  enabled: true,
  gridSize: 5,
  minClusterSize: 3,
};

/**
 * Default compass rose preferences
 */
export const DEFAULT_COMPASS_ROSE: CompassRosePreferences = {
  enabled: false,
  beamWidth: 45,
  showBeamWidth: true,
};

/**
 * Default spot age preferences
 */
export const DEFAULT_SPOT_AGE: SpotAgePreferences = {
  enabled: true,
  maxAgeMinutes: 30,
  showAgeColumn: true,
};

/**
 * Default forecast display preferences
 */
export const DEFAULT_FORECAST_DISPLAY: ForecastDisplayPreferences = {
  bandMode: "common",
  customBands: ["80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"],
  showSnrValues: false,
  detailedFooter: true,
  hoursToShow: 13,
};

/**
 * Default UI interaction preferences
 */
export const DEFAULT_UI_INTERACTION: UIInteractionPreferences = {
  holdDurationMs: 2500,
  flyoutAutoDismissMs: 2500,
  flyoutAutoDismissEnabled: true,
  showSpotCallsignLabels: true,
  showSpotterLabels: false,
  spotHitRadiusMultiplier: 1.0,
  spotColorMode: "mode",
  visualStyle: "realistic",
};
