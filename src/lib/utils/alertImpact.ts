/**
 * Alert Impact Utility
 *
 * Maps alert types and priorities to practical ham radio advice.
 * Used by EmergencyTickerBar and other alert display components
 * to show actionable recommendations alongside space weather events.
 */

import type { AlertPriority, AlertType } from "@/types/alerts";
import { BAND_DEGRADATION_MAP } from "@/constants/alertThresholds";

// =============================================================================
// TYPES
// =============================================================================

export interface RadioImpact {
  /** Bands affected by the current conditions */
  affectedBands: string[];
  /** Actionable recommendation for operators */
  recommendation: string;
  /** Estimated duration of the event */
  estimatedDuration: string;
}

// =============================================================================
// IMPACT MAPPING
// =============================================================================

/**
 * Get radio impact information for a given alert type and priority.
 * Returns affected bands, a recommendation, and estimated duration.
 */
export function getRadioImpact(
  alertType: AlertType,
  priority: AlertPriority,
): RadioImpact {
  // INFO priority always returns mild impact
  if (priority === "INFO") {
    return getInfoImpact(alertType);
  }

  switch (alertType) {
    case "GEOMAGNETIC_STORM":
    case "DST_STORM":
      return priority === "CRITICAL"
        ? {
            affectedBands: getBandsFromDegradationMap(7),
            recommendation:
              "Switch to 80m/160m CW. Monitor VHF for aurora openings.",
            estimatedDuration: "12-48 hours",
          }
        : {
            affectedBands: getBandsFromDegradationMap(6),
            recommendation: "Try 40m/80m for DX. VHF aurora scatter possible.",
            estimatedDuration: "6-24 hours",
          };

    case "RADIO_BLACKOUT":
      return priority === "CRITICAL"
        ? {
            affectedBands: [
              "10m",
              "12m",
              "15m",
              "17m",
              "20m",
              "30m",
              "40m",
              "60m",
              "80m",
            ],
            recommendation: "All HF degraded. Wait for conditions to recover.",
            estimatedDuration: "2-8 hours",
          }
        : {
            affectedBands: ["10m", "12m", "15m", "17m", "20m"],
            recommendation: "Move to 40m or lower bands.",
            estimatedDuration: "1-2 hours",
          };

    case "PROTON_EVENT":
      return priority === "CRITICAL"
        ? {
            affectedBands: ["10m", "12m", "15m", "17m", "20m", "30m", "40m"],
            recommendation:
              "Severe polar cap absorption. Only low-latitude low-band paths viable.",
            estimatedDuration: "2-7 days",
          }
        : {
            affectedBands: ["10m", "12m", "15m", "17m", "20m"],
            recommendation: "Avoid polar paths. Use low-latitude DX routes.",
            estimatedDuration: "1-3 days",
          };

    case "SOLAR_FLARE":
      return priority === "CRITICAL"
        ? {
            affectedBands: ["10m", "12m", "15m", "17m", "20m", "30m"],
            recommendation:
              "X-class flare probable. Expect HF degradation on sunlit side.",
            estimatedDuration: "1-4 hours",
          }
        : {
            affectedBands: ["10m", "12m", "15m"],
            recommendation:
              "M-class flare probable. Watch for short-wave fadeout on daytime paths.",
            estimatedDuration: "30 min - 2 hours",
          };

    case "CME_INCOMING":
      return {
        affectedBands: ["10m", "12m", "15m", "17m", "20m"],
        recommendation:
          "CME impact expected. Prepare for possible G-class storm.",
        estimatedDuration: "12-36 hours to arrival",
      };

    case "IMF_SOUTHWARD":
      return priority === "CRITICAL"
        ? {
            affectedBands: ["10m", "12m", "15m", "17m", "20m"],
            recommendation:
              "Strong southward IMF \u2014 geomagnetic storm conditions expected.",
            estimatedDuration: "Hours",
          }
        : {
            affectedBands: ["10m", "12m", "15m"],
            recommendation:
              "Elevated geomagnetic activity likely. Monitor K-index.",
            estimatedDuration: "Variable",
          };

    case "BAND_OPENING":
      return {
        affectedBands: [],
        recommendation:
          "Band opening detected! Excellent propagation \u2014 get on the air.",
        estimatedDuration: "30 min - 3 hours",
      };

    case "GREYLINE_APPROACHING":
      return {
        affectedBands: [],
        recommendation:
          "Greyline propagation window approaching. Great for low-band DX.",
        estimatedDuration: "15-45 minutes",
      };

    case "AURORA_WARNING":
      return priority === "CRITICAL"
        ? {
            affectedBands: ["10m", "12m", "15m", "17m", "20m"],
            recommendation:
              "Strong aurora activity. Try 50/144 MHz for aurora scatter QSOs.",
            estimatedDuration: "2-8 hours",
          }
        : {
            affectedBands: ["10m", "12m", "15m"],
            recommendation:
              "Aurora activity rising. Monitor VHF for scatter openings.",
            estimatedDuration: "1-4 hours",
          };

    case "BAND_DEGRADATION":
      return priority === "CRITICAL"
        ? {
            affectedBands: getBandsFromDegradationMap(7),
            recommendation:
              "Significant band degradation. Stick to low bands and CW.",
            estimatedDuration: "6-24 hours",
          }
        : {
            affectedBands: getBandsFromDegradationMap(5),
            recommendation:
              "Upper HF bands degraded. Try 30m-80m for reliable contacts.",
            estimatedDuration: "3-12 hours",
          };

    default:
      return {
        affectedBands: [],
        recommendation: "Monitor conditions.",
        estimatedDuration: "Unknown",
      };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get INFO-level impact (mild, all types)
 */
function getInfoImpact(alertType: AlertType): RadioImpact {
  const positiveTypes: AlertType[] = [
    "BAND_OPENING",
    "GREYLINE_APPROACHING",
    "AURORA_WARNING",
  ];

  if (positiveTypes.includes(alertType)) {
    return getRadioImpact(alertType, "WARNING");
  }

  return {
    affectedBands: [],
    recommendation: "Conditions mildly elevated. Keep monitoring.",
    estimatedDuration: "Variable",
  };
}

/**
 * Retrieve affected bands from BAND_DEGRADATION_MAP at a given Kp level.
 */
function getBandsFromDegradationMap(kpLevel: number): string[] {
  const match = BAND_DEGRADATION_MAP.filter((d) => d.kpLevel <= kpLevel).sort(
    (a, b) => b.kpLevel - a.kpLevel,
  )[0];
  return match?.bands ?? [];
}
