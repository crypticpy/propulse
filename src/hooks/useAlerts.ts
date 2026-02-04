/**
 * useAlerts Hook
 *
 * React hook for managing DX alert rules and notifications.
 * Features:
 * - Alert rule CRUD operations
 * - Live spot monitoring against rules
 * - Browser notification integration
 * - Duplicate alert prevention
 * - Alert history tracking
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLiveSpots } from "./useLiveSpots";
import * as alertStore from "@/lib/db/alertStore";
import {
  checkSpotsForAlerts,
  type SpotAlertMatch,
} from "@/lib/utils/alertMatcher";
import {
  showSpotNotification,
  isNotificationPermissionGranted,
  requestNotificationPermission,
  getNotificationPermissionState,
} from "@/lib/utils/notifications";
import type { AlertRule } from "@/lib/db/types";

/**
 * Options for the useAlerts hook
 */
export interface UseAlertsOptions {
  /** Grid locator for PSKReporter queries */
  grid?: string;
  /** Enable live spot monitoring (default: true) */
  enabled?: boolean;
}

/**
 * Return type for the useAlerts hook
 */
export interface UseAlertsResult {
  /** All alert rules */
  rules: AlertRule[];
  /** Loading state for initial rule load */
  loading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Current notification permission status */
  notificationPermission: NotificationPermission;
  /** Spots that currently match alert rules */
  matchingSpots: SpotAlertMatch[];

  // Rule management
  /** Add a new alert rule */
  addRule: (rule: Omit<AlertRule, "id" | "createdAt">) => Promise<string>;
  /** Update an existing alert rule */
  updateRule: (
    id: string,
    updates: Partial<Omit<AlertRule, "id" | "createdAt">>,
  ) => Promise<void>;
  /** Delete an alert rule */
  deleteRule: (id: string) => Promise<void>;
  /** Toggle a rule's enabled state */
  toggleRule: (id: string) => Promise<void>;
  /** Refresh rules from database */
  refresh: () => Promise<void>;

  // Notification management
  /** Request browser notification permission */
  requestNotificationPermission: () => Promise<NotificationPermission>;

  // Helpers
  /** Check if a spot has already triggered an alert this session */
  isSpotAlerted: (spotId: string) => boolean;
  /** Clear the set of alerted spots (reset duplicate tracking) */
  clearAlertedSpots: () => void;
  /** Get count of unread/new alerts */
  newAlertCount: number;
  /** Mark all current alerts as seen */
  markAlertsSeen: () => void;
}

/**
 * Hook for managing DX alert rules and notifications
 *
 * Monitors live spots against configured alert rules and triggers
 * browser notifications when matches are found.
 *
 * @param options - Configuration options
 * @returns Alert management interface
 *
 * @example
 * ```tsx
 * function AlertsPanel() {
 *   const {
 *     rules,
 *     matchingSpots,
 *     addRule,
 *     toggleRule,
 *     notificationPermission,
 *     requestNotificationPermission,
 *   } = useAlerts({ grid: 'FN31', enabled: true });
 *
 *   return (
 *     <div>
 *       <h2>Alert Rules ({rules.length})</h2>
 *       {matchingSpots.length > 0 && (
 *         <div className="alert">
 *           {matchingSpots.length} spots match your alerts!
 *         </div>
 *       )}
 *       {notificationPermission === 'default' && (
 *         <button onClick={requestNotificationPermission}>
 *           Enable Notifications
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useAlerts(options: UseAlertsOptions = {}): UseAlertsResult {
  const { grid, enabled = true } = options;

  // State
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  // Track already-alerted spots to avoid duplicates (by spot.id)
  const [alertedSpotIds, setAlertedSpotIds] = useState<Set<string>>(new Set());

  // Track new alerts (unseen by user)
  const [seenAlertCount, setSeenAlertCount] = useState(0);

  // Use ref to track if this is the first render (to avoid alerting on initial load)
  const isFirstRender = useRef(true);
  const previousSpotIds = useRef<Set<string>>(new Set());

  // Get live spots for monitoring
  const { spots } = useLiveSpots({
    grid,
    enabled: enabled,
  });

  /**
   * Load rules from database
   */
  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allRules = await alertStore.getAllAlertRules();
      setRules(allRules);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load alert rules";
      setError(message);
      console.error("Error loading alert rules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Check notification permission on mount
  useEffect(() => {
    const permission = getNotificationPermissionState();
    // Handle 'unsupported' case by treating it as 'denied'
    setNotificationPermission(
      permission === "unsupported" ? "denied" : permission,
    );
  }, []);

  // Check for matching spots
  const matchingSpots = useMemo(() => {
    if (!rules.length || !spots.length) {
      return [];
    }
    return checkSpotsForAlerts(spots, rules);
  }, [spots, rules]);

  // Calculate new alert count (matching spots that user hasn't seen)
  const newAlertCount = useMemo(() => {
    return Math.max(0, matchingSpots.length - seenAlertCount);
  }, [matchingSpots.length, seenAlertCount]);

  // Fire notifications for new matches
  useEffect(() => {
    // Skip notifications on first render to avoid alerting for existing spots
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Store current spot IDs to track what's "new"
      previousSpotIds.current = new Set(spots.map((s) => s.id));
      return;
    }

    // Only proceed if notifications are granted
    if (!isNotificationPermissionGranted()) {
      return;
    }

    matchingSpots.forEach(({ spot, rules: matchedRules }) => {
      // Skip if already alerted
      if (alertedSpotIds.has(spot.id)) {
        return;
      }

      // Skip if this spot existed before this session started
      // (only alert for truly new spots)
      if (previousSpotIds.current.has(spot.id)) {
        return;
      }

      // Find first rule that wants browser notification
      const notifyRule = matchedRules.find((r) => r.notification.browser);
      if (notifyRule) {
        showSpotNotification(spot, notifyRule.name);

        // Mark this spot as alerted
        setAlertedSpotIds((prev) => new Set([...prev, spot.id]));

        // Save to history
        alertStore
          .addAlertHistoryEntry({
            ruleId: notifyRule.id,
            ruleName: notifyRule.name,
            spotId: spot.id,
            callsign: spot.dx,
            frequency: spot.frequency,
            band: spot.band || "unknown",
            mode: spot.mode,
            triggeredAt: new Date().toISOString(),
            dismissed: false,
          })
          .catch((err) => {
            console.error("Failed to save alert history:", err);
          });

        // Update rule's lastTriggered timestamp
        alertStore
          .updateAlertRule(notifyRule.id, {
            lastTriggered: new Date().toISOString(),
          })
          .catch((err) => {
            console.error("Failed to update rule lastTriggered:", err);
          });
      }
    });

    // Update the set of known spot IDs
    for (const spot of spots) {
      previousSpotIds.current.add(spot.id);
    }
  }, [matchingSpots, alertedSpotIds, spots]);

  /**
   * Add a new alert rule
   */
  const addRule = useCallback(
    async (rule: Omit<AlertRule, "id" | "createdAt">): Promise<string> => {
      try {
        setError(null);
        const id = await alertStore.addAlertRule(rule);
        await loadRules();
        return id;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to add alert rule";
        setError(message);
        throw err;
      }
    },
    [loadRules],
  );

  /**
   * Update an existing alert rule
   */
  const updateRule = useCallback(
    async (
      id: string,
      updates: Partial<Omit<AlertRule, "id" | "createdAt">>,
    ): Promise<void> => {
      try {
        setError(null);
        await alertStore.updateAlertRule(id, updates);
        await loadRules();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update alert rule";
        setError(message);
        throw err;
      }
    },
    [loadRules],
  );

  /**
   * Delete an alert rule
   */
  const deleteRule = useCallback(
    async (id: string): Promise<void> => {
      try {
        setError(null);
        await alertStore.deleteAlertRule(id);
        await loadRules();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete alert rule";
        setError(message);
        throw err;
      }
    },
    [loadRules],
  );

  /**
   * Toggle a rule's enabled state
   */
  const toggleRule = useCallback(
    async (id: string): Promise<void> => {
      const rule = rules.find((r) => r.id === id);
      if (!rule) {
        setError(`Rule with id ${id} not found`);
        return;
      }

      try {
        setError(null);
        await alertStore.updateAlertRule(id, { enabled: !rule.enabled });
        await loadRules();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to toggle alert rule";
        setError(message);
        throw err;
      }
    },
    [rules, loadRules],
  );

  /**
   * Request notification permission from the browser
   */
  const requestPermission =
    useCallback(async (): Promise<NotificationPermission> => {
      const permission = await requestNotificationPermission();
      setNotificationPermission(permission);
      return permission;
    }, []);

  /**
   * Check if a spot has already triggered an alert
   */
  const isSpotAlerted = useCallback(
    (spotId: string): boolean => {
      return alertedSpotIds.has(spotId);
    },
    [alertedSpotIds],
  );

  /**
   * Clear all alerted spot IDs (reset duplicate tracking)
   */
  const clearAlertedSpots = useCallback(() => {
    setAlertedSpotIds(new Set());
  }, []);

  /**
   * Mark all current alerts as seen
   */
  const markAlertsSeen = useCallback(() => {
    setSeenAlertCount(matchingSpots.length);
  }, [matchingSpots.length]);

  return {
    rules,
    loading,
    error,
    notificationPermission,
    matchingSpots,

    // Rule management
    addRule,
    updateRule,
    deleteRule,
    toggleRule,
    refresh: loadRules,

    // Notification management
    requestNotificationPermission: requestPermission,

    // Helpers
    isSpotAlerted,
    clearAlertedSpots,
    newAlertCount,
    markAlertsSeen,
  };
}

export default useAlerts;
