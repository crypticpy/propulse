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
  buildCompleteAlert,
  shouldResolveAlert,
} from "@/lib/services/alertService";
import {
  KP_THRESHOLDS,
  BZ_THRESHOLDS,
  FLARE_THRESHOLDS,
} from "@/constants/alertThresholds";
import type { SolarAlert } from "@/types/alerts";

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

  // =========================================================================
  // SOLAR DATA QUERIES
  // =========================================================================

  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();
  const probabilitiesQuery = useProbabilities();

  // =========================================================================
  // USER PREFERENCES
  // =========================================================================

  const notificationPrefs = useUserStore(
    (state) => state.preferences.notifications,
  );

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
    alerts,
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
    const data = kIndexQuery.data;
    if (!data || data.length === 0) return null;
    return data[data.length - 1];
  }, [kIndexQuery.data]);

  /**
   * Extract the most recent valid Bz value from magnetometer data
   * Bz can sometimes be null in the feed, so we search backward for a valid reading
   */
  const latestBz = useMemo(() => {
    const data = magnetometerQuery.data;
    if (!data || data.length === 0) return null;

    // Find most recent entry with a valid Bz reading
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].bz_gsm !== null) {
        return data[i];
      }
    }
    return null;
  }, [magnetometerQuery.data]);

  /**
   * Solar flare probabilities (M-class and X-class)
   */
  const probabilities = probabilitiesQuery.data;

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
   * Check if a value has crossed a threshold (going up)
   * Used to prevent re-alerting when value stays above threshold
   */
  const hasCrossedThresholdUp = useCallback(
    (previous: number | null, current: number, threshold: number): boolean => {
      if (previous === null) return false; // No previous value, don't alert
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
      if (previous === null) return false;
      return previous > threshold && current <= threshold;
    },
    [],
  );

  // =========================================================================
  // MAIN EVALUATION EFFECT
  // =========================================================================

  useEffect(() => {
    // Bail early if monitoring is disabled
    if (!enabled) return;

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
      return;
    }

    // Skip if not using live data
    if (!isLiveData) return;

    // Debounce rapid evaluations
    const now = Date.now();
    if (now - lastEvaluationTime.current < EVALUATION_DEBOUNCE_MS) return;
    lastEvaluationTime.current = now;

    // Update last check time in store
    setLastCheckTime(new Date());

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

          if (crossedThreshold && noActiveAlert && notInCooldown) {
            const partialAlert = evaluateKpAlert(kpValue);
            if (partialAlert) {
              const completeAlert = buildCompleteAlert(partialAlert);
              addAlert(completeAlert);
              recordAlertFired("GEOMAGNETIC_STORM");
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

          if (crossedThreshold && noActiveAlert && notInCooldown) {
            const partialAlert = evaluateBzAlert(bzValue);
            if (partialAlert) {
              const completeAlert = buildCompleteAlert(partialAlert);
              addAlert(completeAlert);
              recordAlertFired("IMF_SOUTHWARD");
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

        if (crossedThreshold && noActiveAlert && notInCooldown) {
          const partialAlert = evaluateFlareAlert(probabilities);
          if (partialAlert) {
            const completeAlert = buildCompleteAlert(partialAlert);
            addAlert(completeAlert);
            recordAlertFired("SOLAR_FLARE");
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
  // COMPUTED VALUES
  // =========================================================================

  /**
   * Get current active alerts
   * Re-computed when the alerts array changes
   */
  const activeAlerts = useMemo(() => getActiveAlerts(), [alerts]);

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
