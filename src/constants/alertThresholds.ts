/**
 * Alert threshold constants for solar weather monitoring
 * Based on NOAA/SWPC scales and amateur radio best practices
 */

import type {
  AlertThreshold,
  BandDegradation,
  AlertType,
  AlertPriority,
} from "@/types/alerts";

// =============================================================================
// TIME CONSTANTS
// =============================================================================

/** One minute in milliseconds */
const MINUTE = 60 * 1000;

// =============================================================================
// K-INDEX THRESHOLDS (NOAA G-SCALE)
// =============================================================================

/**
 * K-index thresholds based on NOAA G-scale
 * G1 (Minor): Kp = 5
 * G2 (Moderate): Kp = 6
 * G3 (Strong): Kp = 7
 * G4 (Severe): Kp = 8
 * G5 (Extreme): Kp = 9
 */
export const KP_THRESHOLDS: AlertThreshold = {
  type: "GEOMAGNETIC_STORM",
  minPriority: "INFO",
  infoThreshold: 5, // G1 - Minor storm
  warningThreshold: 6, // G2 - Moderate storm
  criticalThreshold: 7, // G3+ - Strong to extreme
  resolveThreshold: 4, // Must drop to Kp 4 to resolve
  cooldownMs: 5 * MINUTE,
};

// =============================================================================
// IMF Bz THRESHOLDS
// =============================================================================

/**
 * IMF Bz thresholds (southward is negative)
 * -5 to -10: Active conditions
 * -10 to -20: Storm conditions
 * < -20: Severe storm conditions
 */
export const BZ_THRESHOLDS: AlertThreshold = {
  type: "IMF_SOUTHWARD",
  minPriority: "INFO",
  infoThreshold: -5, // Active conditions
  warningThreshold: -10, // Storm likely
  criticalThreshold: -20, // Severe storm conditions
  resolveThreshold: -3, // Must rise above -3 to resolve
  cooldownMs: 5 * MINUTE,
};

// =============================================================================
// SOLAR FLARE PROBABILITY THRESHOLDS
// =============================================================================

/**
 * Solar flare probability thresholds
 * Based on M and X class flare probabilities
 */
export const FLARE_THRESHOLDS = {
  mClass: {
    type: "SOLAR_FLARE" as AlertType,
    minPriority: "INFO" as AlertPriority,
    infoThreshold: 25, // 25% M-class probability
    warningThreshold: 50, // 50% M-class probability
    criticalThreshold: 75, // 75% M-class probability
    resolveThreshold: 15, // Must drop below 15%
    cooldownMs: 30 * MINUTE,
  },
  xClass: {
    type: "SOLAR_FLARE" as AlertType,
    minPriority: "WARNING" as AlertPriority,
    infoThreshold: 5, // 5% X-class probability
    warningThreshold: 15, // 15% X-class probability
    criticalThreshold: 30, // 30% X-class probability
    resolveThreshold: 3, // Must drop below 3%
    cooldownMs: 30 * MINUTE,
  },
} as const;

// =============================================================================
// PROTON EVENT THRESHOLDS
// =============================================================================

/**
 * Proton event probability thresholds
 */
export const PROTON_THRESHOLDS: AlertThreshold = {
  type: "PROTON_EVENT",
  minPriority: "WARNING",
  infoThreshold: 10, // 10% probability
  warningThreshold: 25, // 25% probability
  criticalThreshold: 50, // 50% probability
  resolveThreshold: 5, // Must drop below 5%
  cooldownMs: 30 * MINUTE,
};

// =============================================================================
// X-RAY FLUX THRESHOLDS (NOAA R-SCALE)
// =============================================================================

/**
 * X-ray flux thresholds based on NOAA R-scale (flare classes)
 * C-class: 1e-6 W/m² (minor absorption)
 * M-class: 1e-5 W/m² (moderate blackout)
 * X-class: 1e-4 W/m² (severe blackout)
 */
export const XRAY_THRESHOLDS: AlertThreshold = {
  type: "RADIO_BLACKOUT",
  minPriority: "INFO",
  infoThreshold: 1e-6, // C-class flare
  warningThreshold: 1e-5, // M-class flare
  criticalThreshold: 1e-4, // X-class flare
  resolveThreshold: 5e-7,
  cooldownMs: 5 * MINUTE,
};

// =============================================================================
// DST INDEX THRESHOLDS
// =============================================================================

/**
 * Dst index thresholds for geomagnetic storm detection
 * Dst < -50 nT: Moderate storm
 * Dst < -100 nT: Intense storm
 * Dst < -200 nT: Severe storm
 * Note: Dst is negative during storms, so thresholds use inverted comparison
 */
export const DST_THRESHOLDS: AlertThreshold = {
  type: "DST_STORM",
  minPriority: "INFO",
  infoThreshold: -50, // Moderate storm
  warningThreshold: -100, // Intense storm
  criticalThreshold: -200, // Severe storm
  resolveThreshold: -30, // Must recover above -30 nT to resolve
  cooldownMs: 30 * MINUTE,
};

// =============================================================================
// ACTUAL PROTON FLUX THRESHOLDS (NOAA S-SCALE)
// =============================================================================

/**
 * Measured proton flux thresholds based on NOAA S-scale
 * (As opposed to PROTON_THRESHOLDS which are probability-based)
 * S1: 10 pfu (minor radiation storm)
 * S2: 100 pfu (moderate radiation storm)
 * S3+: 1000 pfu (strong+ radiation storm)
 */
export const ACTUAL_PROTON_THRESHOLDS: AlertThreshold = {
  type: "PROTON_EVENT",
  minPriority: "WARNING",
  infoThreshold: 10, // 10 pfu
  warningThreshold: 100, // 100 pfu (S1 radiation storm)
  criticalThreshold: 1000, // 1000 pfu (S2+)
  resolveThreshold: 5,
  cooldownMs: 30 * MINUTE,
};

// =============================================================================
// GREYLINE THRESHOLDS
// =============================================================================

/**
 * Greyline alert thresholds
 * Based on minutes until sunrise/sunset at user's QTH
 * Enhanced (30 min) = good low-band propagation window approaching
 * Peak (15 min) = optimal greyline propagation happening now
 */
export const GREYLINE_THRESHOLDS = {
  type: "GREYLINE_APPROACHING" as AlertType,
  enhancedMinutes: 30, // INFO: greyline approaching
  peakMinutes: 15, // WARNING: peak greyline propagation
  cooldownMs: 2 * 60 * MINUTE, // 2-hour cooldown between alerts
  expiryHours: 1,
};

// =============================================================================
// BAND OPENING THRESHOLDS
// =============================================================================

/**
 * Band opening alert thresholds
 * Triggered when BandOpeningDetector finds cross-continental activity
 * Cooldown is per-band to avoid spam but allow different bands to alert
 */
export const BAND_OPENING_THRESHOLDS = {
  type: "BAND_OPENING" as AlertType,
  minSpots: 5, // minimum cross-continental spots to trigger
  cooldownMs: 30 * MINUTE, // 30-min cooldown per band
  expiryHours: 1,
};

// =============================================================================
// BAND DEGRADATION MAP
// =============================================================================

/**
 * Band degradation by Kp level
 * Higher Kp affects more bands, starting with higher frequencies
 */
export const BAND_DEGRADATION_MAP: BandDegradation[] = [
  {
    kpLevel: 5,
    bands: ["10m", "12m", "15m"],
    description: "High HF bands may experience fading and increased noise",
  },
  {
    kpLevel: 6,
    bands: ["10m", "12m", "15m", "17m", "20m"],
    description: "Upper HF bands degraded, DX conditions poor",
  },
  {
    kpLevel: 7,
    bands: ["10m", "12m", "15m", "17m", "20m", "30m", "40m"],
    description: "Most HF bands affected, polar paths disrupted",
  },
  {
    kpLevel: 8,
    bands: ["10m", "12m", "15m", "17m", "20m", "30m", "40m", "60m", "80m"],
    description: "Severe HF degradation, only low bands marginally usable",
  },
  {
    kpLevel: 9,
    bands: [
      "10m",
      "12m",
      "15m",
      "17m",
      "20m",
      "30m",
      "40m",
      "60m",
      "80m",
      "160m",
    ],
    description: "HF blackout, VHF aurora scatter possible",
  },
];

// =============================================================================
// ALERT EXPIRY TIMES
// =============================================================================

/**
 * Alert expiry times by type (how long before auto-resolve if no updates)
 */
export const ALERT_EXPIRY_HOURS: Record<AlertType, number> = {
  GEOMAGNETIC_STORM: 3, // Storm conditions can change quickly
  RADIO_BLACKOUT: 1, // Blackouts typically short-lived
  SOLAR_FLARE: 6, // Flare effects last hours
  BAND_DEGRADATION: 3, // Tied to storm conditions
  PROTON_EVENT: 12, // Proton events can last longer
  IMF_SOUTHWARD: 2, // IMF changes frequently
  AURORA_WARNING: 6, // Aurora can last hours
  GREYLINE_APPROACHING: 1, // Greyline window is brief
  BAND_OPENING: 1, // Band openings can be fleeting
  CME_INCOMING: 24, // CME transit takes 1-3 days
  DST_STORM: 6, // Dst storms can persist for hours
};

// =============================================================================
// ALERT ICONS
// =============================================================================

/**
 * Alert icons by type (emoji for now, can replace with SVG)
 */
export const ALERT_ICONS: Record<AlertType, string> = {
  GEOMAGNETIC_STORM: "\u{1F300}", // cyclone
  RADIO_BLACKOUT: "\u{1F4E1}", // satellite antenna
  SOLAR_FLARE: "\u26A1", // high voltage
  BAND_DEGRADATION: "\u{1F4C9}", // chart decreasing
  PROTON_EVENT: "\u2622\uFE0F", // radioactive
  IMF_SOUTHWARD: "\u{1F9F2}", // magnet
  AURORA_WARNING: "\u{1F30C}", // milky way
  GREYLINE_APPROACHING: "\u{1F305}", // sunrise
  BAND_OPENING: "\u{1F4E1}", // satellite antenna (band activity)
  CME_INCOMING: "\u2604\uFE0F", // comet (CME heading toward Earth)
  DST_STORM: "\u{1F30D}", // globe (planetary magnetic disturbance)
};

// =============================================================================
// ALERT COLORS
// =============================================================================

/**
 * Alert colors by priority (Tailwind classes)
 */
export const ALERT_COLORS: Record<
  AlertPriority,
  {
    border: string;
    bg: string;
    text: string;
    icon: string;
  }
> = {
  INFO: {
    border: "border-cosmic-cyan",
    bg: "bg-cosmic-cyan/25",
    text: "text-cosmic-cyan",
    icon: "text-cosmic-cyan",
  },
  WARNING: {
    border: "border-caution-amber",
    bg: "bg-caution-amber/25",
    text: "text-caution-amber",
    icon: "text-caution-amber",
  },
  CRITICAL: {
    border: "border-alert-red",
    bg: "bg-alert-red/30",
    text: "text-alert-red",
    icon: "text-alert-red",
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get affected bands for a given Kp level
 * @param kp - Current Kp index value
 * @returns Array of band designators affected at this Kp level
 */
export function getAffectedBands(kp: number): string[] {
  // Find highest matching degradation level
  const degradation = BAND_DEGRADATION_MAP.filter((d) => kp >= d.kpLevel).sort(
    (a, b) => b.kpLevel - a.kpLevel,
  )[0];

  return degradation?.bands || [];
}

/**
 * Get degradation description for a given Kp level
 * @param kp - Current Kp index value
 * @returns Description of propagation conditions at this Kp level
 */
export function getDegradationDescription(kp: number): string {
  const degradation = BAND_DEGRADATION_MAP.filter((d) => kp >= d.kpLevel).sort(
    (a, b) => b.kpLevel - a.kpLevel,
  )[0];

  return degradation?.description || "Normal propagation conditions";
}
