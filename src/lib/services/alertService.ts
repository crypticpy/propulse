/**
 * Alert service - pure functions for evaluating solar conditions
 * Designed for future server-side use (Supabase Edge Functions)
 *
 * NO React dependencies - this is a pure utility module
 */

import type {
  SolarAlert,
  AlertType,
  AlertPriority,
  AlertSource,
} from "@/types/alerts";
import type { SolarProbabilities } from "@/lib/api/types";
import {
  KP_THRESHOLDS,
  BZ_THRESHOLDS,
  FLARE_THRESHOLDS,
  PROTON_THRESHOLDS,
  ALERT_EXPIRY_HOURS,
  getAffectedBands,
  getDegradationDescription,
} from "@/constants/alertThresholds";

// =============================================================================
// ALERT MESSAGE TEMPLATES
// =============================================================================

const ALERT_MESSAGES = {
  GEOMAGNETIC_STORM: {
    INFO: (kp: number) =>
      `Minor geomagnetic storm in progress (Kp ${kp}). HF propagation on high bands may be degraded.`,
    WARNING: (kp: number) =>
      `Moderate geomagnetic storm (Kp ${kp}). DX conditions poor, expect fading on 10-20m bands.`,
    CRITICAL: (kp: number) =>
      `Strong geomagnetic storm (Kp ${kp})! Severe HF disruption. Low bands may still be usable.`,
  },
  IMF_SOUTHWARD: {
    INFO: (bz: number) =>
      `IMF Bz is southward (${bz.toFixed(1)} nT). Conditions favorable for geomagnetic activity.`,
    WARNING: (bz: number) =>
      `IMF Bz strongly southward (${bz.toFixed(1)} nT). Storm conditions developing.`,
    CRITICAL: (bz: number) =>
      `IMF Bz severely southward (${bz.toFixed(1)} nT)! High probability of major storm.`,
  },
  SOLAR_FLARE: {
    INFO: (mProb: number, xProb: number) =>
      `Elevated flare probability: ${mProb}% M-class, ${xProb}% X-class. Monitor conditions.`,
    WARNING: (mProb: number, xProb: number) =>
      `High flare probability: ${mProb}% M-class, ${xProb}% X-class. Radio blackouts possible.`,
    CRITICAL: (mProb: number, xProb: number) =>
      `Very high flare probability: ${mProb}% M-class, ${xProb}% X-class! Blackouts likely.`,
  },
  PROTON_EVENT: {
    INFO: (prob: number) =>
      `Solar proton event probability ${prob}%. Polar paths may be affected.`,
    WARNING: (prob: number) =>
      `Elevated proton event probability ${prob}%. Avoid transpolar paths.`,
    CRITICAL: (prob: number) =>
      `High proton event probability ${prob}%! Polar paths severely degraded.`,
  },
} as const;

const ALERT_TITLES = {
  GEOMAGNETIC_STORM: {
    INFO: "Minor Geomagnetic Storm",
    WARNING: "Moderate Geomagnetic Storm",
    CRITICAL: "Strong Geomagnetic Storm",
  },
  IMF_SOUTHWARD: {
    INFO: "IMF Turning Southward",
    WARNING: "IMF Strongly Southward",
    CRITICAL: "IMF Severely Southward",
  },
  SOLAR_FLARE: {
    INFO: "Elevated Flare Probability",
    WARNING: "High Flare Probability",
    CRITICAL: "Very High Flare Probability",
  },
  PROTON_EVENT: {
    INFO: "Proton Event Possible",
    WARNING: "Proton Event Likely",
    CRITICAL: "Proton Event Warning",
  },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a random 4-character alphanumeric string
 * @returns Random string for unique ID generation
 */
function generateRandom4Chars(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Determine alert priority based on value and thresholds
 * @param value - Current measured value
 * @param thresholds - Object containing info, warning, and critical threshold values
 * @param isNegative - If true, more negative values are worse (for Bz-style thresholds)
 * @returns AlertPriority based on which threshold is exceeded
 */
export function getPriorityForValue(
  value: number,
  thresholds: { info: number; warning: number; critical: number },
  isNegative?: boolean,
): AlertPriority {
  if (isNegative) {
    // For negative thresholds (like Bz), lower values are worse
    if (value <= thresholds.critical) return "CRITICAL";
    if (value <= thresholds.warning) return "WARNING";
    return "INFO";
  } else {
    // For positive thresholds (like Kp), higher values are worse
    if (value >= thresholds.critical) return "CRITICAL";
    if (value >= thresholds.warning) return "WARNING";
    return "INFO";
  }
}

// =============================================================================
// ALERT ID AND EXPIRY FUNCTIONS
// =============================================================================

/**
 * Generate a unique alert ID
 * @param type - Alert type
 * @param timestamp - Timestamp when alert was triggered
 * @returns Unique ID string in format: TYPE-timestamp-random4
 */
export function generateAlertId(type: AlertType, timestamp: Date): string {
  return `${type}-${timestamp.getTime()}-${generateRandom4Chars()}`;
}

/**
 * Calculate when an alert should expire based on its type
 * @param type - Alert type
 * @param triggeredAt - Date when the alert was triggered
 * @returns Date object representing expiry time
 */
export function calculateAlertExpiry(type: AlertType, triggeredAt: Date): Date {
  const expiryHours = ALERT_EXPIRY_HOURS[type];
  const expiryTime = new Date(triggeredAt);
  expiryTime.setHours(expiryTime.getHours() + expiryHours);
  return expiryTime;
}

// =============================================================================
// EVALUATION FUNCTIONS
// =============================================================================

/**
 * Evaluate K-index value and generate alert if threshold exceeded
 * @param kpValue - Current Kp index value (0-9)
 * @returns Partial SolarAlert if threshold exceeded, null otherwise
 */
export function evaluateKpAlert(kpValue: number): Partial<SolarAlert> | null {
  // Return null if below info threshold
  if (kpValue < KP_THRESHOLDS.infoThreshold) {
    return null;
  }

  const priority = getPriorityForValue(kpValue, {
    info: KP_THRESHOLDS.infoThreshold,
    warning: KP_THRESHOLDS.warningThreshold,
    critical: KP_THRESHOLDS.criticalThreshold,
  });

  const affectedBands = getAffectedBands(kpValue);
  const title = ALERT_TITLES.GEOMAGNETIC_STORM[priority];
  const message = ALERT_MESSAGES.GEOMAGNETIC_STORM[priority](kpValue);

  return {
    type: "GEOMAGNETIC_STORM",
    priority,
    title,
    message,
    affectedBands,
    source: "K_INDEX" as AlertSource,
    thresholdValue: KP_THRESHOLDS.infoThreshold,
    currentValue: kpValue,
  };
}

/**
 * Evaluate IMF Bz value and generate alert if threshold exceeded
 * Note: Bz thresholds are negative (more negative = worse conditions)
 * @param bzValue - Current Bz value in nT
 * @returns Partial SolarAlert if threshold exceeded, null otherwise
 */
export function evaluateBzAlert(bzValue: number): Partial<SolarAlert> | null {
  // Return null if not negative enough (above info threshold)
  // Remember: thresholds are negative, so ">" means "not negative enough"
  if (bzValue > BZ_THRESHOLDS.infoThreshold) {
    return null;
  }

  const priority = getPriorityForValue(
    bzValue,
    {
      info: BZ_THRESHOLDS.infoThreshold,
      warning: BZ_THRESHOLDS.warningThreshold,
      critical: BZ_THRESHOLDS.criticalThreshold,
    },
    true, // isNegative
  );

  const title = ALERT_TITLES.IMF_SOUTHWARD[priority];
  const message = ALERT_MESSAGES.IMF_SOUTHWARD[priority](bzValue);

  return {
    type: "IMF_SOUTHWARD",
    priority,
    title,
    message,
    affectedBands: [], // Bz doesn't directly map to bands, storm effects do
    source: "BZ_GSM" as AlertSource,
    thresholdValue: BZ_THRESHOLDS.infoThreshold,
    currentValue: bzValue,
  };
}

/**
 * Evaluate solar flare probabilities and generate alert if thresholds exceeded
 * X-class takes priority if both M and X exceed thresholds
 * @param probabilities - Solar probabilities data from NOAA
 * @returns Partial SolarAlert if threshold exceeded, null otherwise
 */
export function evaluateFlareAlert(
  probabilities: SolarProbabilities,
): Partial<SolarAlert> | null {
  const { m_prob, x_prob } = probabilities;

  // Check X-class first (takes priority)
  const xExceedsThreshold = x_prob >= FLARE_THRESHOLDS.xClass.infoThreshold;
  const mExceedsThreshold = m_prob >= FLARE_THRESHOLDS.mClass.infoThreshold;

  // Return null if neither exceeds threshold
  if (!xExceedsThreshold && !mExceedsThreshold) {
    return null;
  }

  // Determine priority - X-class thresholds take precedence
  let priority: AlertPriority;

  if (xExceedsThreshold) {
    priority = getPriorityForValue(x_prob, {
      info: FLARE_THRESHOLDS.xClass.infoThreshold,
      warning: FLARE_THRESHOLDS.xClass.warningThreshold,
      critical: FLARE_THRESHOLDS.xClass.criticalThreshold,
    });
  } else {
    priority = getPriorityForValue(m_prob, {
      info: FLARE_THRESHOLDS.mClass.infoThreshold,
      warning: FLARE_THRESHOLDS.mClass.warningThreshold,
      critical: FLARE_THRESHOLDS.mClass.criticalThreshold,
    });
  }

  const title = ALERT_TITLES.SOLAR_FLARE[priority];
  const message = ALERT_MESSAGES.SOLAR_FLARE[priority](m_prob, x_prob);

  return {
    type: "SOLAR_FLARE",
    priority,
    title,
    message,
    affectedBands: [], // Flares affect all HF when they occur
    source: "FLARE_PROBABILITY" as AlertSource,
    thresholdValue: xExceedsThreshold
      ? FLARE_THRESHOLDS.xClass.infoThreshold
      : FLARE_THRESHOLDS.mClass.infoThreshold,
    currentValue: xExceedsThreshold ? x_prob : m_prob,
  };
}

/**
 * Evaluate proton event probability and generate alert if threshold exceeded
 * @param protonProb - Proton event probability percentage
 * @returns Partial SolarAlert if threshold exceeded, null otherwise
 */
export function evaluateProtonAlert(
  protonProb: number,
): Partial<SolarAlert> | null {
  // Return null if below info threshold
  if (protonProb < PROTON_THRESHOLDS.infoThreshold) {
    return null;
  }

  const priority = getPriorityForValue(protonProb, {
    info: PROTON_THRESHOLDS.infoThreshold,
    warning: PROTON_THRESHOLDS.warningThreshold,
    critical: PROTON_THRESHOLDS.criticalThreshold,
  });

  const title = ALERT_TITLES.PROTON_EVENT[priority];
  const message = ALERT_MESSAGES.PROTON_EVENT[priority](protonProb);

  return {
    type: "PROTON_EVENT",
    priority,
    title,
    message,
    affectedBands: [], // Proton events primarily affect polar paths
    source: "PROTON_FLUX" as AlertSource,
    thresholdValue: PROTON_THRESHOLDS.infoThreshold,
    currentValue: protonProb,
  };
}

// =============================================================================
// AFFECTED BANDS COMPUTATION
// =============================================================================

/**
 * Compute affected bands based on Kp and Bz values
 * Uses Kp-based bands as base, adds VHF bands when Bz is severely negative
 * (auroral propagation possible but HF conditions worse)
 * @param kp - Current Kp index value
 * @param bz - Current Bz value in nT
 * @returns Unique sorted array of affected band designators
 */
export function computeAffectedBands(kp: number, bz: number): string[] {
  // Start with Kp-based affected bands
  const bands = new Set(getAffectedBands(kp));

  // If Bz is severely southward (<-15), add VHF bands
  // This indicates potential for auroral propagation but worse HF
  if (bz < -15) {
    bands.add("6m");
    bands.add("2m");
  }

  // Convert to array and sort by frequency (higher bands first)
  const bandOrder = [
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
  ];

  return Array.from(bands).sort(
    (a, b) => bandOrder.indexOf(a) - bandOrder.indexOf(b),
  );
}

// =============================================================================
// ALERT LIFECYCLE FUNCTIONS
// =============================================================================

/**
 * Build a complete SolarAlert from partial data
 * Fills in missing fields with defaults, generates ID, calculates expiry
 * @param partial - Partial alert data from evaluation functions
 * @returns Complete SolarAlert object ready for storage
 */
export function buildCompleteAlert(partial: Partial<SolarAlert>): SolarAlert {
  const now = new Date();
  const triggeredAt = partial.triggeredAt ? new Date(partial.triggeredAt) : now;
  const type = partial.type || "GEOMAGNETIC_STORM";

  const expiresAt = calculateAlertExpiry(type, triggeredAt);

  return {
    id: partial.id || generateAlertId(type, triggeredAt),
    type,
    priority: partial.priority || "INFO",
    status: "ACTIVE",
    title: partial.title || "Solar Weather Alert",
    message: partial.message || "Conditions may affect radio propagation.",
    affectedBands: partial.affectedBands || [],
    triggeredAt: triggeredAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: partial.source || "MANUAL",
    thresholdValue: partial.thresholdValue || 0,
    currentValue: partial.currentValue || 0,
    ...(partial.resolvedAt && { resolvedAt: partial.resolvedAt }),
    ...(partial.dismissedAt && { dismissedAt: partial.dismissedAt }),
  };
}

/**
 * Determine if an alert should be resolved based on current conditions
 * Implements hysteresis to prevent rapid toggling at boundary values
 * @param alert - Active alert to check
 * @param currentValue - Current measured value for the alert's source
 * @returns True if alert should be resolved, false otherwise
 */
export function shouldResolveAlert(
  alert: SolarAlert,
  currentValue: number,
): boolean {
  // Get the appropriate resolve threshold based on alert type
  switch (alert.type) {
    case "GEOMAGNETIC_STORM":
      // Must drop below resolve threshold (e.g., Kp 4)
      return currentValue < KP_THRESHOLDS.resolveThreshold;

    case "IMF_SOUTHWARD":
      // Must rise above resolve threshold (less negative, e.g., > -3)
      return currentValue > BZ_THRESHOLDS.resolveThreshold;

    case "SOLAR_FLARE": {
      // Check both M and X class resolve thresholds
      // Resolve if the triggering class drops below threshold
      const isXClass =
        alert.thresholdValue === FLARE_THRESHOLDS.xClass.infoThreshold;
      if (isXClass) {
        return currentValue < FLARE_THRESHOLDS.xClass.resolveThreshold;
      }
      return currentValue < FLARE_THRESHOLDS.mClass.resolveThreshold;
    }

    case "PROTON_EVENT":
      return currentValue < PROTON_THRESHOLDS.resolveThreshold;

    default:
      // For unknown types, use simple comparison with threshold
      return currentValue < alert.thresholdValue;
  }
}

// =============================================================================
// BATCH EVALUATION
// =============================================================================

/**
 * Evaluate all conditions and return array of alerts that should be triggered
 * @param kp - Current Kp index value
 * @param bz - Current Bz value in nT
 * @param probabilities - Solar probabilities from NOAA (optional)
 * @returns Array of complete SolarAlert objects
 */
export function evaluateAllConditions(
  kp: number,
  bz: number,
  probabilities?: SolarProbabilities,
): SolarAlert[] {
  const alerts: SolarAlert[] = [];

  // Evaluate Kp
  const kpAlert = evaluateKpAlert(kp);
  if (kpAlert) {
    // Add computed affected bands including Bz influence
    kpAlert.affectedBands = computeAffectedBands(kp, bz);
    alerts.push(buildCompleteAlert(kpAlert));
  }

  // Evaluate Bz
  const bzAlert = evaluateBzAlert(bz);
  if (bzAlert) {
    alerts.push(buildCompleteAlert(bzAlert));
  }

  // Evaluate flare and proton probabilities if provided
  if (probabilities) {
    const flareAlert = evaluateFlareAlert(probabilities);
    if (flareAlert) {
      alerts.push(buildCompleteAlert(flareAlert));
    }

    const protonAlert = evaluateProtonAlert(probabilities.proton_prob);
    if (protonAlert) {
      alerts.push(buildCompleteAlert(protonAlert));
    }
  }

  return alerts;
}

// =============================================================================
// RE-EXPORT UTILITIES
// =============================================================================

// Re-export threshold helpers for external use
export { getAffectedBands, getDegradationDescription };
