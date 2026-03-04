/**
 * useSolarAlerts - Hook for monitoring solar conditions and triggering alerts
 *
 * Monitors K-index, Bz, and flare probabilities from NOAA data feeds
 * and generates alerts when conditions exceed configured thresholds.
 *
 * Features:
 * - Real-time monitoring of K-index, IMF Bz, and flare probabilities
 * - Respects user notification preferences from userStore
 * - Manages alert lifecycle (creation, resolution, cooldowns)
 * - Prevents duplicate alerts and handles edge cases (initial load, stale data)
 * - Debounces rapid fluctuations to avoid alert spam
 *
 * @example
 * ```tsx
 * function AlertBanner() {
 *   const { activeAlerts, hasAlerts, dismissAlert } = useSolarAlerts();
 *
 *   if (!hasAlerts) return null;
 *
 *   return (
 *     <div>
 *       {activeAlerts.map(alert => (
 *         <Alert key={alert.id} onDismiss={() => dismissAlert(alert.id)}>
 *           {alert.message}
 *         </Alert>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useKIndex, useMagnetometer, useProbabilities } from "./useSolarData";
import { useXrayFlux, useProtonFlux, useDstIndex } from "./useSolarExpanded";
import {
  useAlertsStore,
  selectActiveAlertCount,
  selectCriticalAlertCount,
  selectHasActiveAlerts,
  selectHighestPriorityAlert,
} from "@/stores/alertsStore";
import { useUserStore } from "@/stores/userStore";
import {
  evaluateKpAlert,
  evaluateBzAlert,
  evaluateFlareAlert,
  evaluateGreylineAlert,
  evaluateBandOpeningAlert,
  evaluateBandClosingAlert,
  buildCompleteAlert,
  shouldResolveAlert,
  getPriorityForValue,
} from "@/lib/services/alertService";
import {
  KP_THRESHOLDS,
  BZ_THRESHOLDS,
  FLARE_THRESHOLDS,
  GREYLINE_THRESHOLDS,
  BAND_OPENING_THRESHOLDS,
  BAND_CLOSING_THRESHOLDS,
  XRAY_THRESHOLDS,
  ACTUAL_PROTON_THRESHOLDS,
  DST_THRESHOLDS,
} from "@/constants/alertThresholds";
import type { SolarAlert, AlertPriority, AlertSource } from "@/types/alerts";
import { isQuietHours } from "@/lib/utils/time";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import {
  getGreylineStatus,
  isGreylineActiveForBand,
  GREYLINE_LOW_BANDS,
  type GreylineIntensity,
} from "@/lib/utils/greyline";
import { getBandOpeningDetector } from "@/lib/services/bandOpeningService";
import { playSolarAlertSound } from "@/lib/services/watchAudioService";
import type { BandId } from "@/types/user";

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================

/** Maximum age of data before it's considered stale (10 minutes) */
const STALE_DATA_THRESHOLD_MS = 10 * 60 * 1000;

/** Minimum time between alert evaluations to prevent rapid-fire updates */
const EVALUATION_DEBOUNCE_MS = 2000;

/** Number of render cycles to skip on initial mount to avoid firing alerts on page load */
const INITIAL_SKIP_RENDERS = 2;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for configuring the useSolarAlerts hook
 */
export interface UseSolarAlertsOptions {
  /**
   * Enable or disable alert monitoring
   * When false, no new alerts will be generated but existing alerts remain
   * @default true
   */
  enabled?: boolean;
}

/**
 * Return value from the useSolarAlerts hook
 */
export interface UseSolarAlertsReturn {
  /** All currently active alerts (not dismissed or resolved) */
  activeAlerts: SolarAlert[];
  /** Count of active alerts */
  activeCount: number;
  /** Count of critical-priority active alerts */
  criticalCount: number;
  /** Whether any alerts are currently active */
  hasAlerts: boolean;
  /** The highest priority active alert, or null if none */
  highestPriorityAlert: SolarAlert | null;
  /** Dismiss an alert by its ID (user action, persisted) */
  dismissAlert: (alertId: string) => void;
  /** Full alert history including resolved and dismissed alerts */
  alertHistory: SolarAlert[];
  /** Whether the detection system is actively monitoring live data */
  isMonitoring: boolean;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for monitoring solar conditions and triggering alerts
 *
 * This hook monitors solar weather data from NOAA feeds and generates
 * alerts when conditions exceed configured thresholds. It handles:
 *
 * - K-index monitoring for geomagnetic storms
 * - IMF Bz monitoring for southward IMF conditions
 * - Solar flare probability monitoring
 *
 * The hook respects user notification preferences and manages alert
 * lifecycle including cooldown periods and hysteresis for resolution.
 *
 * @param options - Configuration options for the hook
 * @returns Alert state and actions
 */
export function useSolarAlerts(
  options: UseSolarAlertsOptions = {},
): UseSolarAlertsReturn {
  const { enabled = true } = options;

  // =========================================================================
  // REFS FOR TRACKING STATE ACROSS RENDERS
  // =========================================================================

  /**
   * Track render count to skip initial alerts
   * We don't want to fire alerts for conditions that existed before the user
   * opened the page - only for changes that happen while they're watching
   */
  const renderCount = useRef(0);

  /**
   * Track last evaluation time to debounce rapid updates
   * Prevents alert spam when data fluctuates rapidly
   */
  const lastEvaluationTime = useRef<number>(0);

  /**
   * Track previous values to detect actual changes vs re-renders
   * Only fire alerts when values actually cross thresholds, not on every render
   */
  const previousKp = useRef<number | null>(null);
  const previousBz = useRef<number | null>(null);
  const previousMProb = useRef<number | null>(null);
  const previousXProb = useRef<number | null>(null);

  /**
   * Track previous X-ray flux value for threshold crossing detection
   */
  const previousXray = useRef<number | null>(null);

  /**
   * Track previous proton flux value for threshold crossing detection
   */
  const previousProton = useRef<number | null>(null);

  /**
   * Track previous Dst index value for threshold crossing detection
   */
  const previousDst = useRef<number | null>(null);

  /**
   * Track previous greyline intensity to detect transitions
   * Only fires when intensity changes from none/normal → enhanced/peak
   */
  const previousGreylineIntensity = useRef<GreylineIntensity>("none");

  // =========================================================================
  // SOLAR DATA QUERIES
  // =========================================================================

  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();
  const probabilitiesQuery = useProbabilities();
  const xrayFluxQuery = useXrayFlux();
  const protonFluxQuery = useProtonFlux();
  const dstIndexQuery = useDstIndex();

  // =========================================================================
  // USER PREFERENCES
  // =========================================================================

  const notificationPrefs = useUserStore(
    (state) => state.preferences.notifications,
  );

  const activeLocation = useActiveLocation();

  // =========================================================================
  // ALERT STORE STATE AND ACTIONS
  // =========================================================================

  const {
    addAlert,
    resolveAlert,
    dismissAlert,
    isInCooldown,
    recordAlertFired,
    getActiveAlerts,
    hasActiveAlertOfType,
    alertHistory,
    setLastCheckTime,
    cleanupExpiredHistory,
  } = useAlertsStore();

  // Computed selectors from store
  const activeCount = useAlertsStore(selectActiveAlertCount);
  const criticalCount = useAlertsStore(selectCriticalAlertCount);
  const hasAlerts = useAlertsStore(selectHasActiveAlerts);
  const highestPriorityAlert = useAlertsStore(selectHighestPriorityAlert);

  // =========================================================================
  // EXTRACTED DATA VALUES
  // =========================================================================

  /**
   * Extract the most recent K-index value from the data array
   * Returns null if no data is available
   */
  const latestKp = useMemo(() => {
    if (!kIndexQuery.data || kIndexQuery.data.length === 0) {
      return null;
    }
    return kIndexQuery.data[kIndexQuery.data.length - 1];
  }, [kIndexQuery.data]);

  /**
   * Extract the most recent valid Bz value from magnetometer data
   * Bz can sometimes be null in the feed, so we search backward for a valid reading
   */
  const latestBz = useMemo(() => {
    if (!magnetometerQuery.data || magnetometerQuery.data.length === 0) {
      return null;
    }

    // Find most recent entry with a valid Bz reading
    for (let i = magnetometerQuery.data.length - 1; i >= 0; i--) {
      if (magnetometerQuery.data[i].bz_gsm !== null) {
        return magnetometerQuery.data[i];
      }
    }
    return null;
  }, [magnetometerQuery.data]);

  /**
   * Solar flare probabilities (M-class and X-class)
   */
  const probabilities = probabilitiesQuery.data;

  /**
   * Extract the most recent X-ray flux value
   */
  const latestXray = useMemo(() => {
    if (!xrayFluxQuery.data || xrayFluxQuery.data.length === 0) return null;
    return xrayFluxQuery.data[xrayFluxQuery.data.length - 1];
  }, [xrayFluxQuery.data]);

  /**
   * Extract the most recent proton flux value (>= 10 MeV)
   */
  const latestProton = useMemo(() => {
    if (!protonFluxQuery.data || protonFluxQuery.data.length === 0) return null;
    return protonFluxQuery.data[protonFluxQuery.data.length - 1];
  }, [protonFluxQuery.data]);

  /**
   * Extract the most recent Dst index value
   */
  const latestDst = useMemo(() => {
    if (!dstIndexQuery.data || dstIndexQuery.data.length === 0) return null;
    return dstIndexQuery.data[dstIndexQuery.data.length - 1];
  }, [dstIndexQuery.data]);

  // =========================================================================
  // HELPER FUNCTIONS
  // =========================================================================

  /**
   * Check if a data timestamp is fresh (within the stale threshold)
   * @param timeTag - ISO timestamp string from the data
   * @returns true if data is fresh, false if stale
   */
  const isDataFresh = useCallback((timeTag: string): boolean => {
    try {
      const dataTime = new Date(timeTag).getTime();
      const now = Date.now();
      return now - dataTime < STALE_DATA_THRESHOLD_MS;
    } catch {
      // If we can't parse the timestamp, consider it stale
      return false;
    }
  }, []);

  /**
   * Check if we're using live data vs placeholder/demo data
   * We don't want to fire alerts based on placeholder data
   */
  const isLiveData = useMemo(() => {
    return (
      !kIndexQuery.isPlaceholderData &&
      !magnetometerQuery.isPlaceholderData &&
      !probabilitiesQuery.isPlaceholderData
    );
  }, [
    kIndexQuery.isPlaceholderData,
    magnetometerQuery.isPlaceholderData,
    probabilitiesQuery.isPlaceholderData,
  ]);

  /**
   * Check if expanded data queries are returning live data
   * These are optional — alerts still work without them
   */
  const isExpandedDataLive = useMemo(() => {
    return (
      !xrayFluxQuery.isPlaceholderData &&
      !protonFluxQuery.isPlaceholderData &&
      !dstIndexQuery.isPlaceholderData
    );
  }, [
    xrayFluxQuery.isPlaceholderData,
    protonFluxQuery.isPlaceholderData,
    dstIndexQuery.isPlaceholderData,
  ]);

  /**
   * Check if a value has crossed a threshold (going up)
   * Used to prevent re-alerting when value stays above threshold
   */
  const hasCrossedThresholdUp = useCallback(
    (previous: number | null, current: number, threshold: number): boolean => {
      if (previous === null) {
        return false;
      } // No previous value, don't alert
      return previous < threshold && current >= threshold;
    },
    [],
  );

  /**
   * Check if a value has crossed a threshold going down (for Bz which is negative)
   * Used to detect when Bz becomes more southward
   */
  const hasCrossedThresholdDown = useCallback(
    (previous: number | null, current: number, threshold: number): boolean => {
      if (previous === null) {
        return false;
      }
      return previous > threshold && current <= threshold;
    },
    [],
  );

  // =========================================================================
  // MAIN EVALUATION EFFECT
  // =========================================================================

  useEffect(() => {
    // Bail early if monitoring is disabled
    if (!enabled) {
      return;
    }

    // Increment render count and skip initial renders
    renderCount.current += 1;
    if (renderCount.current <= INITIAL_SKIP_RENDERS) {
      // On first couple renders, just cleanup expired history and store initial values
      cleanupExpiredHistory();

      // Store initial values for threshold crossing detection
      if (latestKp) {
        previousKp.current = latestKp.kp_index;
      }
      if (latestBz?.bz_gsm !== null && latestBz?.bz_gsm !== undefined) {
        previousBz.current = latestBz.bz_gsm;
      }
      if (probabilities) {
        previousMProb.current = probabilities.m_prob;
        previousXProb.current = probabilities.x_prob;
      }
      if (latestXray) {
        previousXray.current = latestXray.flux;
      }
      if (latestProton) {
        previousProton.current = latestProton.flux;
      }
      if (latestDst) {
        previousDst.current = latestDst.dst;
      }
      return;
    }

    // Skip if not using live data
    if (!isLiveData) {
      return;
    }

    // Debounce rapid evaluations
    const now = Date.now();
    if (now - lastEvaluationTime.current < EVALUATION_DEBOUNCE_MS) {
      return;
    }
    lastEvaluationTime.current = now;

    // Update last check time in store
    setLastCheckTime(new Date());

    // Suppress new alerts during quiet hours (still update previous values below)
    const quietStart = notificationPrefs?.quietHoursStart;
    const quietEnd = notificationPrefs?.quietHoursEnd;
    const inQuietHours = isQuietHours(quietStart, quietEnd);

    // =========================================================================
    // EVALUATE K-INDEX (GEOMAGNETIC STORM)
    // =========================================================================

    if (latestKp && notificationPrefs?.stormAlerts !== false) {
      const kpValue = latestKp.kp_index;
      const userThreshold =
        notificationPrefs?.stormAlertKpThreshold ?? KP_THRESHOLDS.infoThreshold;

      // Check if data is fresh
      if (isDataFresh(latestKp.time_tag)) {
        // Check if Kp exceeds user's threshold
        if (kpValue >= userThreshold) {
          // Only fire if:
          // 1. We crossed the threshold (wasn't already above)
          // 2. No active alert of this type
          // 3. Not in cooldown
          const crossedThreshold = hasCrossedThresholdUp(
            previousKp.current,
            kpValue,
            userThreshold,
          );

          const noActiveAlert = !hasActiveAlertOfType("GEOMAGNETIC_STORM");
          const notInCooldown = !isInCooldown(
            "GEOMAGNETIC_STORM",
            KP_THRESHOLDS.cooldownMs,
          );

          if (
            crossedThreshold &&
            noActiveAlert &&
            notInCooldown &&
            !inQuietHours
          ) {
            const partialAlert = evaluateKpAlert(kpValue);
            if (partialAlert) {
              const completeAlert = buildCompleteAlert(partialAlert);
              addAlert(completeAlert);
              recordAlertFired("GEOMAGNETIC_STORM");
              playSolarAlertSound(completeAlert.priority, completeAlert.type);
            }
          }
        } else {
          // Value is below threshold - check if we should resolve existing alert
          const activeStormAlert = getActiveAlerts().find(
            (a) => a.type === "GEOMAGNETIC_STORM",
          );
          if (
            activeStormAlert &&
            shouldResolveAlert(activeStormAlert, kpValue)
          ) {
            resolveAlert(activeStormAlert.id);
          }
        }
      }

      // Update previous value for next comparison
      previousKp.current = kpValue;
    }

    // =========================================================================
    // EVALUATE IMF Bz (SOUTHWARD IMF)
    // =========================================================================

    if (
      latestBz?.bz_gsm !== null &&
      latestBz?.bz_gsm !== undefined &&
      notificationPrefs?.stormAlerts !== false
    ) {
      const bzValue = latestBz.bz_gsm;

      // Check if data is fresh
      if (isDataFresh(latestBz.time_tag)) {
        // For Bz, lower (more negative) is worse
        // Check if below threshold (more southward)
        if (bzValue <= BZ_THRESHOLDS.infoThreshold) {
          const crossedThreshold = hasCrossedThresholdDown(
            previousBz.current,
            bzValue,
            BZ_THRESHOLDS.infoThreshold,
          );

          const noActiveAlert = !hasActiveAlertOfType("IMF_SOUTHWARD");
          const notInCooldown = !isInCooldown(
            "IMF_SOUTHWARD",
            BZ_THRESHOLDS.cooldownMs,
          );

          if (
            crossedThreshold &&
            noActiveAlert &&
            notInCooldown &&
            !inQuietHours
          ) {
            const partialAlert = evaluateBzAlert(bzValue);
            if (partialAlert) {
              const completeAlert = buildCompleteAlert(partialAlert);
              addAlert(completeAlert);
              recordAlertFired("IMF_SOUTHWARD");
              playSolarAlertSound(completeAlert.priority, completeAlert.type);
            }
          }
        } else {
          // Value is above threshold (less negative) - check for resolution
          const activeBzAlert = getActiveAlerts().find(
            (a) => a.type === "IMF_SOUTHWARD",
          );
          if (activeBzAlert && shouldResolveAlert(activeBzAlert, bzValue)) {
            resolveAlert(activeBzAlert.id);
          }
        }
      }

      // Update previous value
      previousBz.current = bzValue;
    }

    // =========================================================================
    // EVALUATE FLARE PROBABILITIES
    // =========================================================================

    if (probabilities && notificationPrefs?.flareAlerts !== false) {
      const mProb = probabilities.m_prob;
      const xProb = probabilities.x_prob;

      // Check if either probability exceeds threshold
      const mExceedsThreshold = mProb >= FLARE_THRESHOLDS.mClass.infoThreshold;
      const xExceedsThreshold = xProb >= FLARE_THRESHOLDS.xClass.infoThreshold;

      if (mExceedsThreshold || xExceedsThreshold) {
        // Check if we crossed a threshold
        const mCrossed = hasCrossedThresholdUp(
          previousMProb.current,
          mProb,
          FLARE_THRESHOLDS.mClass.infoThreshold,
        );
        const xCrossed = hasCrossedThresholdUp(
          previousXProb.current,
          xProb,
          FLARE_THRESHOLDS.xClass.infoThreshold,
        );

        const crossedThreshold = mCrossed || xCrossed;
        const noActiveAlert = !hasActiveAlertOfType("SOLAR_FLARE");
        const notInCooldown = !isInCooldown(
          "SOLAR_FLARE",
          FLARE_THRESHOLDS.mClass.cooldownMs,
        );

        if (
          crossedThreshold &&
          noActiveAlert &&
          notInCooldown &&
          !inQuietHours
        ) {
          const partialAlert = evaluateFlareAlert(probabilities);
          if (partialAlert) {
            const completeAlert = buildCompleteAlert(partialAlert);
            addAlert(completeAlert);
            recordAlertFired("SOLAR_FLARE");
            playSolarAlertSound(completeAlert.priority, completeAlert.type);
          }
        }
      } else {
        // Both below threshold - check for resolution
        const activeFlareAlert = getActiveAlerts().find(
          (a) => a.type === "SOLAR_FLARE",
        );
        if (activeFlareAlert) {
          // Use the value that was used to trigger the alert
          const wasXClass =
            activeFlareAlert.thresholdValue ===
            FLARE_THRESHOLDS.xClass.infoThreshold;
          const valueToCheck = wasXClass ? xProb : mProb;

          if (shouldResolveAlert(activeFlareAlert, valueToCheck)) {
            resolveAlert(activeFlareAlert.id);
          }
        }
      }

      // Update previous values
      previousMProb.current = mProb;
      previousXProb.current = xProb;
    }
  }, [
    enabled,
    latestKp,
    latestBz,
    latestXray,
    latestProton,
    latestDst,
    probabilities,
    isLiveData,
    notificationPrefs,
    addAlert,
    resolveAlert,
    getActiveAlerts,
    hasActiveAlertOfType,
    isInCooldown,
    recordAlertFired,
    setLastCheckTime,
    cleanupExpiredHistory,
    isDataFresh,
    hasCrossedThresholdUp,
    hasCrossedThresholdDown,
  ]);

  // =========================================================================
  // X-RAY FLUX EVALUATION (RADIO BLACKOUT)
  // =========================================================================

  /**
   * Evaluates GOES X-ray flux against NOAA R-scale thresholds.
   * Fires RADIO_BLACKOUT alerts when X-ray flux indicates C/M/X-class flare.
   * Auto-resolves when flux drops below resolve threshold.
   */
  useEffect(() => {
    if (!enabled || !isExpandedDataLive) return;
    if (!latestXray || !Number.isFinite(latestXray.flux)) return;
    if (notificationPrefs?.flareAlerts === false) return;

    const xrayValue = latestXray.flux;

    // Store initial value
    if (previousXray.current === null) {
      previousXray.current = xrayValue;
      return;
    }

    // Check if data is fresh
    if (!isDataFresh(latestXray.time_tag)) {
      previousXray.current = xrayValue;
      return;
    }

    // Check quiet hours
    const quietStart = notificationPrefs?.quietHoursStart;
    const quietEnd = notificationPrefs?.quietHoursEnd;
    const inQuietHours = isQuietHours(quietStart, quietEnd);

    // Determine if threshold is exceeded
    const exceedsThreshold = xrayValue >= XRAY_THRESHOLDS.infoThreshold;

    if (exceedsThreshold) {
      const crossedThreshold = hasCrossedThresholdUp(
        previousXray.current,
        xrayValue,
        XRAY_THRESHOLDS.infoThreshold,
      );

      const noActiveAlert = !hasActiveAlertOfType("RADIO_BLACKOUT");
      const notInCooldown = !isInCooldown(
        "RADIO_BLACKOUT",
        XRAY_THRESHOLDS.cooldownMs,
      );

      if (crossedThreshold && noActiveAlert && notInCooldown && !inQuietHours) {
        const priority = getPriorityForValue(xrayValue, {
          info: XRAY_THRESHOLDS.infoThreshold,
          warning: XRAY_THRESHOLDS.warningThreshold,
          critical: XRAY_THRESHOLDS.criticalThreshold,
        });

        // Determine flare class for human-readable message
        const flareClass =
          xrayValue >= 1e-4
            ? `X${(xrayValue / 1e-4).toFixed(1)}`
            : xrayValue >= 1e-5
              ? `M${(xrayValue / 1e-5).toFixed(1)}`
              : `C${(xrayValue / 1e-6).toFixed(1)}`;

        const affectedBands =
          priority === "CRITICAL"
            ? ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"]
            : priority === "WARNING"
              ? ["80m", "40m", "30m", "20m", "17m", "15m"]
              : ["40m", "30m", "20m"];

        const titles: Record<AlertPriority, string> = {
          INFO: "Minor Radio Absorption",
          WARNING: "Moderate Radio Blackout",
          CRITICAL: "Major Radio Blackout",
        };

        const partial: Partial<SolarAlert> = {
          type: "RADIO_BLACKOUT",
          priority,
          title: `${titles[priority]} — ${flareClass} Flare`,
          message:
            `X-ray flux at ${xrayValue.toExponential(1)} W/m\u00B2 (${flareClass} class). ` +
            `HF absorption expected on sunlit hemisphere. Bands affected: ${affectedBands.join(", ")}.`,
          affectedBands,
          source: "X_RAY_FLUX" as AlertSource,
          thresholdValue:
            priority === "CRITICAL"
              ? XRAY_THRESHOLDS.criticalThreshold
              : priority === "WARNING"
                ? XRAY_THRESHOLDS.warningThreshold
                : XRAY_THRESHOLDS.infoThreshold,
          currentValue: xrayValue,
        };

        const alert = buildCompleteAlert(partial);
        addAlert(alert);
        recordAlertFired("RADIO_BLACKOUT");
        playSolarAlertSound(alert.priority, alert.type);
      }
    } else {
      // Value below info threshold — check for resolution
      if (xrayValue < XRAY_THRESHOLDS.resolveThreshold) {
        const activeXrayAlert = getActiveAlerts().find(
          (a) => a.type === "RADIO_BLACKOUT",
        );
        if (activeXrayAlert) {
          resolveAlert(activeXrayAlert.id);
        }
      }
    }

    previousXray.current = xrayValue;
  }, [
    enabled,
    isExpandedDataLive,
    latestXray,
    notificationPrefs,
    addAlert,
    resolveAlert,
    getActiveAlerts,
    hasActiveAlertOfType,
    isInCooldown,
    recordAlertFired,
    isDataFresh,
    hasCrossedThresholdUp,
  ]);

  // =========================================================================
  // PROTON FLUX EVALUATION (SOLAR RADIATION STORM)
  // =========================================================================

  /**
   * Evaluates measured proton flux (>= 10 MeV) against NOAA S-scale thresholds.
   * Fires PROTON_EVENT alerts for solar radiation storms.
   * This uses ACTUAL_PROTON_THRESHOLDS (measured flux in pfu) rather than
   * probability-based PROTON_THRESHOLDS.
   */
  useEffect(() => {
    if (!enabled || !isExpandedDataLive) return;
    if (!latestProton || !Number.isFinite(latestProton.flux)) return;

    const protonValue = latestProton.flux;

    // Store initial value
    if (previousProton.current === null) {
      previousProton.current = protonValue;
      return;
    }

    // Check if data is fresh
    if (!isDataFresh(latestProton.time_tag)) {
      previousProton.current = protonValue;
      return;
    }

    // Check quiet hours
    const quietStart = notificationPrefs?.quietHoursStart;
    const quietEnd = notificationPrefs?.quietHoursEnd;
    const inQuietHours = isQuietHours(quietStart, quietEnd);

    const exceedsThreshold =
      protonValue >= ACTUAL_PROTON_THRESHOLDS.infoThreshold;

    if (exceedsThreshold) {
      const crossedThreshold = hasCrossedThresholdUp(
        previousProton.current,
        protonValue,
        ACTUAL_PROTON_THRESHOLDS.infoThreshold,
      );

      const noActiveAlert = !hasActiveAlertOfType("PROTON_EVENT");
      const notInCooldown = !isInCooldown(
        "PROTON_EVENT",
        ACTUAL_PROTON_THRESHOLDS.cooldownMs,
      );

      if (crossedThreshold && noActiveAlert && notInCooldown && !inQuietHours) {
        const priority = getPriorityForValue(protonValue, {
          info: ACTUAL_PROTON_THRESHOLDS.infoThreshold,
          warning: ACTUAL_PROTON_THRESHOLDS.warningThreshold,
          critical: ACTUAL_PROTON_THRESHOLDS.criticalThreshold,
        });

        const sScale =
          protonValue >= 1000
            ? "S3+"
            : protonValue >= 100
              ? "S2"
              : protonValue >= 10
                ? "S1"
                : "";

        const affectedBands =
          priority === "CRITICAL"
            ? ["160m", "80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"]
            : priority === "WARNING"
              ? ["80m", "40m", "30m", "20m"]
              : ["40m", "30m", "20m"];

        const titles: Record<AlertPriority, string> = {
          INFO: "Minor Radiation Storm",
          WARNING: "Moderate Radiation Storm",
          CRITICAL: "Strong Radiation Storm",
        };

        const partial: Partial<SolarAlert> = {
          type: "PROTON_EVENT",
          priority,
          title: `${titles[priority]}${sScale ? ` — ${sScale}` : ""}`,
          message:
            `Proton flux at ${protonValue.toFixed(0)} pfu (\u226510 MeV). ` +
            `Polar cap absorption may disrupt transpolar HF paths. ` +
            `Bands affected: ${affectedBands.join(", ")}.`,
          affectedBands,
          source: "PROTON_FLUX" as AlertSource,
          thresholdValue:
            priority === "CRITICAL"
              ? ACTUAL_PROTON_THRESHOLDS.criticalThreshold
              : priority === "WARNING"
                ? ACTUAL_PROTON_THRESHOLDS.warningThreshold
                : ACTUAL_PROTON_THRESHOLDS.infoThreshold,
          currentValue: protonValue,
        };

        const alert = buildCompleteAlert(partial);
        addAlert(alert);
        recordAlertFired("PROTON_EVENT");
        playSolarAlertSound(alert.priority, alert.type);
      }
    } else {
      // Value below info threshold — check for resolution
      if (protonValue < ACTUAL_PROTON_THRESHOLDS.resolveThreshold) {
        const activeProtonAlert = getActiveAlerts().find(
          (a) => a.type === "PROTON_EVENT" && a.source === "PROTON_FLUX",
        );
        if (activeProtonAlert) {
          resolveAlert(activeProtonAlert.id);
        }
      }
    }

    previousProton.current = protonValue;
  }, [
    enabled,
    isExpandedDataLive,
    latestProton,
    notificationPrefs,
    addAlert,
    resolveAlert,
    getActiveAlerts,
    hasActiveAlertOfType,
    isInCooldown,
    recordAlertFired,
    isDataFresh,
    hasCrossedThresholdUp,
  ]);

  // =========================================================================
  // DST INDEX EVALUATION (GEOMAGNETIC STORM)
  // =========================================================================

  /**
   * Evaluates Dst (Disturbance Storm Time) index for geomagnetic storm detection.
   * Fires DST_STORM alerts when Dst drops below thresholds (more negative = worse).
   * Uses inverted comparison: value <= threshold means exceeded.
   */
  useEffect(() => {
    if (!enabled || !isExpandedDataLive) return;
    if (!latestDst || !Number.isFinite(latestDst.dst)) return;
    if (notificationPrefs?.stormAlerts === false) return;

    const dstValue = latestDst.dst;

    // Store initial value
    if (previousDst.current === null) {
      previousDst.current = dstValue;
      return;
    }

    // Check if data is fresh
    if (!isDataFresh(latestDst.time_tag)) {
      previousDst.current = dstValue;
      return;
    }

    // Check quiet hours
    const quietStart = notificationPrefs?.quietHoursStart;
    const quietEnd = notificationPrefs?.quietHoursEnd;
    const inQuietHours = isQuietHours(quietStart, quietEnd);

    // Dst thresholds are negative: -50, -100, -200
    // Exceeds threshold when value drops below (more negative)
    const exceedsThreshold = dstValue <= DST_THRESHOLDS.infoThreshold;

    if (exceedsThreshold) {
      // Crossed down = was above threshold, now below
      const crossedThreshold = hasCrossedThresholdDown(
        previousDst.current,
        dstValue,
        DST_THRESHOLDS.infoThreshold,
      );

      const noActiveAlert = !hasActiveAlertOfType("DST_STORM");
      const notInCooldown = !isInCooldown(
        "DST_STORM",
        DST_THRESHOLDS.cooldownMs,
      );

      if (crossedThreshold && noActiveAlert && notInCooldown && !inQuietHours) {
        const priority = getPriorityForValue(
          dstValue,
          {
            info: DST_THRESHOLDS.infoThreshold,
            warning: DST_THRESHOLDS.warningThreshold,
            critical: DST_THRESHOLDS.criticalThreshold,
          },
          true, // isNegative — lower is worse
        );

        const stormLevel =
          dstValue <= -200
            ? "Severe"
            : dstValue <= -100
              ? "Intense"
              : "Moderate";

        const affectedBands =
          priority === "CRITICAL"
            ? ["80m", "40m", "30m", "20m", "17m", "15m", "12m", "10m"]
            : priority === "WARNING"
              ? ["20m", "17m", "15m", "12m", "10m"]
              : ["15m", "12m", "10m"];

        const partial: Partial<SolarAlert> = {
          type: "DST_STORM",
          priority,
          title: `${stormLevel} Geomagnetic Storm (Dst)`,
          message:
            `Dst index at ${dstValue} nT. ${stormLevel} geomagnetic storm detected. ` +
            `HF propagation disrupted, especially at higher frequencies. ` +
            `Bands affected: ${affectedBands.join(", ")}.`,
          affectedBands,
          source: "DST_INDEX" as AlertSource,
          thresholdValue:
            priority === "CRITICAL"
              ? DST_THRESHOLDS.criticalThreshold
              : priority === "WARNING"
                ? DST_THRESHOLDS.warningThreshold
                : DST_THRESHOLDS.infoThreshold,
          currentValue: dstValue,
        };

        const alert = buildCompleteAlert(partial);
        addAlert(alert);
        recordAlertFired("DST_STORM");
        playSolarAlertSound(alert.priority, alert.type);
      }
    } else {
      // Value above threshold (less negative) — check for resolution
      // Resolve when Dst recovers above resolveThreshold (e.g., > -30 nT)
      if (dstValue > DST_THRESHOLDS.resolveThreshold) {
        const activeDstAlert = getActiveAlerts().find(
          (a) => a.type === "DST_STORM",
        );
        if (activeDstAlert) {
          resolveAlert(activeDstAlert.id);
        }
      }
    }

    previousDst.current = dstValue;
  }, [
    enabled,
    isExpandedDataLive,
    latestDst,
    notificationPrefs,
    addAlert,
    resolveAlert,
    getActiveAlerts,
    hasActiveAlertOfType,
    isInCooldown,
    recordAlertFired,
    isDataFresh,
    hasCrossedThresholdDown,
  ]);

  // =========================================================================
  // GREYLINE MONITORING
  // =========================================================================

  /**
   * Polls greyline status every 60 seconds and fires an alert when intensity
   * transitions from inactive (none/normal) to active (enhanced/peak).
   * Uses a separate interval since greyline changes slowly compared to solar data.
   */
  useEffect(() => {
    if (!enabled || notificationPrefs?.greylineAlerts === false) return;

    const checkGreyline = () => {
      if (!activeLocation) return;

      const quietStart = notificationPrefs?.quietHoursStart;
      const quietEnd = notificationPrefs?.quietHoursEnd;
      if (isQuietHours(quietStart, quietEnd)) return;

      const status = getGreylineStatus(
        activeLocation.lat,
        activeLocation.lon,
        new Date(),
      );

      // Auto-resolve when greyline becomes inactive
      if (!status.isActive) {
        const activeGreylineAlert = getActiveAlerts().find(
          (a) => a.type === "GREYLINE_APPROACHING",
        );
        if (activeGreylineAlert) {
          resolveAlert(activeGreylineAlert.id);
        }
        previousGreylineIntensity.current = status.intensity;
        return;
      }

      // Only alert on transition from inactive → active
      const wasInactive =
        previousGreylineIntensity.current === "none" ||
        previousGreylineIntensity.current === "normal";
      const noActiveAlert = !hasActiveAlertOfType("GREYLINE_APPROACHING");
      const notInCooldown = !isInCooldown(
        "GREYLINE_APPROACHING",
        GREYLINE_THRESHOLDS.cooldownMs,
      );

      if (wasInactive && noActiveAlert && notInCooldown) {
        const bands = GREYLINE_LOW_BANDS.filter((b) =>
          isGreylineActiveForBand(b, status.intensity),
        );
        const partial = evaluateGreylineAlert(status, [...bands]);
        if (partial) {
          const alert = buildCompleteAlert(partial);
          addAlert(alert);
          recordAlertFired("GREYLINE_APPROACHING");
          playSolarAlertSound(alert.priority, alert.type);
        }
      }

      previousGreylineIntensity.current = status.intensity;
    };

    // Delay initial check to let data stabilize after mount
    const initialTimeout = setTimeout(checkGreyline, 5_000);
    const interval = setInterval(checkGreyline, 60_000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [
    enabled,
    notificationPrefs?.greylineAlerts,
    notificationPrefs?.quietHoursStart,
    notificationPrefs?.quietHoursEnd,
    activeLocation,
    addAlert,
    resolveAlert,
    getActiveAlerts,
    hasActiveAlertOfType,
    isInCooldown,
    recordAlertFired,
  ]);

  // =========================================================================
  // BAND OPENING MONITORING
  // =========================================================================

  /**
   * Subscribes to the shared BandOpeningDetector singleton.
   * When a band opening is detected, fires an alert if the opened band is
   * in the user's monitored bands list and not in cooldown.
   */
  useEffect(() => {
    if (!enabled || notificationPrefs?.bandOpeningAlerts === false) return;
    const monitoredBands: BandId[] = notificationPrefs?.bandOpeningBands ?? [];
    if (monitoredBands.length === 0) return;

    const detector = getBandOpeningDetector();

    const unsub = detector.subscribe((opening) => {
      const quietStart = notificationPrefs?.quietHoursStart;
      const quietEnd = notificationPrefs?.quietHoursEnd;
      if (isQuietHours(quietStart, quietEnd)) return;

      // Only alert for bands the user selected
      if (!monitoredBands.includes(opening.band as BandId)) return;

      // Per-band cooldown using composite key
      const cooldownKey = `BAND_OPENING_${opening.band}`;
      if (isInCooldown(cooldownKey, BAND_OPENING_THRESHOLDS.cooldownMs)) return;

      const partial = evaluateBandOpeningAlert(opening);
      if (partial) {
        const alert = buildCompleteAlert(partial);
        addAlert(alert);
        recordAlertFired(cooldownKey);
        playSolarAlertSound(alert.priority, alert.type);
      }
    });

    return unsub;
  }, [
    enabled,
    notificationPrefs?.bandOpeningAlerts,
    notificationPrefs?.bandOpeningBands,
    notificationPrefs?.quietHoursStart,
    notificationPrefs?.quietHoursEnd,
    addAlert,
    isInCooldown,
    recordAlertFired,
  ]);

  // =========================================================================
  // BAND CLOSING MONITORING
  // =========================================================================

  /**
   * Subscribes to band closing events from the shared BandOpeningDetector.
   * Fires BAND_CLOSING alerts when monitored bands close (timeout or fading).
   */
  useEffect(() => {
    if (!enabled || notificationPrefs?.bandOpeningAlerts === false) return;
    const monitoredBands: BandId[] = notificationPrefs?.bandOpeningBands ?? [];
    if (monitoredBands.length === 0) return;

    const detector = getBandOpeningDetector();

    const unsub = detector.subscribeToClosings((event) => {
      const quietStart = notificationPrefs?.quietHoursStart;
      const quietEnd = notificationPrefs?.quietHoursEnd;
      if (isQuietHours(quietStart, quietEnd)) return;

      // Only alert for bands the user selected
      if (!monitoredBands.includes(event.opening.band as BandId)) return;

      // Per-band cooldown
      const cooldownKey = `BAND_CLOSING_${event.opening.band}`;
      if (isInCooldown(cooldownKey, BAND_CLOSING_THRESHOLDS.cooldownMs)) return;

      const partial = evaluateBandClosingAlert(event.opening, event.reason);
      if (partial) {
        const alert = buildCompleteAlert(partial);
        addAlert(alert);
        recordAlertFired(cooldownKey);
        playSolarAlertSound(alert.priority, alert.type);
      }
    });

    return unsub;
  }, [
    enabled,
    notificationPrefs?.bandOpeningAlerts,
    notificationPrefs?.bandOpeningBands,
    notificationPrefs?.quietHoursStart,
    notificationPrefs?.quietHoursEnd,
    addAlert,
    isInCooldown,
    recordAlertFired,
  ]);

  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================

  /**
   * Get current active alerts
   * Re-computed when store alerts change
   */
  const activeAlerts = useMemo(() => getActiveAlerts(), [getActiveAlerts]);

  // =========================================================================
  // RETURN VALUE
  // =========================================================================

  return {
    activeAlerts,
    activeCount,
    criticalCount,
    hasAlerts,
    highestPriorityAlert,
    dismissAlert,
    alertHistory,
    isMonitoring: enabled && isLiveData,
  };
}

export default useSolarAlerts;
