/**
 * Zustand store for solar weather alerts
 * Manages active alerts, dismissals, and alert history
 * Persists dismissed alerts and history to localStorage
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SolarAlert, AlertPriority, AlertStatus } from "@/types/alerts";

/** Duration in milliseconds to keep resolved alerts in history (24 hours) */
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Persisted state (survives page reload)
 */
interface PersistedAlertState {
  /** Set of dismissed alert IDs (by unique identifier, not type) */
  dismissedAlertIds: string[];
  /** Alert history for resolved alerts (kept for 24 hours) */
  alertHistory: SolarAlert[];
}

/**
 * Runtime state (resets on page reload)
 */
interface RuntimeAlertState {
  /** Currently active alerts */
  alerts: SolarAlert[];
  /** Last time alerts were checked/evaluated */
  lastAlertCheckTime: Date | null;
  /** Timestamps of last alert by type (for cooldown) */
  lastAlertByType: Record<string, number>;
}

/**
 * Combined alerts state with actions
 */
interface AlertsState extends PersistedAlertState, RuntimeAlertState {
  // Actions

  /** Add a new alert to the store */
  addAlert: (alert: SolarAlert) => void;
  /** Resolve an alert (condition normalized) */
  resolveAlert: (alertId: string) => void;
  /** Dismiss an alert (user action, persisted) */
  dismissAlert: (alertId: string) => void;
  /** Clear all dismissed alerts from history */
  clearDismissedAlerts: () => void;
  /** Remove expired alerts from history */
  cleanupExpiredHistory: () => void;
  /** Update last check time */
  setLastCheckTime: (time: Date) => void;
  /** Record that an alert of a type was just fired */
  recordAlertFired: (alertType: string) => void;
  /** Check if an alert type is in cooldown */
  isInCooldown: (alertType: string, cooldownMs: number) => boolean;
  /** Get all active (non-dismissed, non-resolved) alerts */
  getActiveAlerts: () => SolarAlert[];
  /** Get alerts filtered by priority */
  getAlertsByPriority: (priority: AlertPriority) => SolarAlert[];
  /** Check if a specific alert type is currently active */
  hasActiveAlertOfType: (type: string) => boolean;
}

/**
 * Default runtime state values
 */
const defaultRuntimeState: RuntimeAlertState = {
  alerts: [],
  lastAlertCheckTime: null,
  lastAlertByType: {},
};

/**
 * Default persisted state values
 */
const defaultPersistedState: PersistedAlertState = {
  dismissedAlertIds: [],
  alertHistory: [],
};

// ============================================================================
// Selectors (computed values for use with useAlertsStore)
// ============================================================================

/**
 * Selector: Count of active alerts
 * @example
 * const count = useAlertsStore(selectActiveAlertCount);
 */
export const selectActiveAlertCount = (state: AlertsState): number =>
  state.alerts.filter((a) => a.status === "ACTIVE").length;

/**
 * Selector: Count of critical active alerts
 * @example
 * const criticalCount = useAlertsStore(selectCriticalAlertCount);
 */
export const selectCriticalAlertCount = (state: AlertsState): number =>
  state.alerts.filter((a) => a.status === "ACTIVE" && a.priority === "CRITICAL")
    .length;

/**
 * Selector: Whether there are any active alerts
 * @example
 * const hasAlerts = useAlertsStore(selectHasActiveAlerts);
 */
export const selectHasActiveAlerts = (state: AlertsState): boolean =>
  state.alerts.some((a) => a.status === "ACTIVE");

/**
 * Selector: Get the highest priority active alert
 * Priority order: CRITICAL > WARNING > INFO
 * @example
 * const topAlert = useAlertsStore(selectHighestPriorityAlert);
 */
export const selectHighestPriorityAlert = (
  state: AlertsState,
): SolarAlert | null => {
  const active = state.alerts.filter((a) => a.status === "ACTIVE");
  if (active.length === 0) return null;

  // Priority order: CRITICAL > WARNING > INFO
  const priorityOrder: AlertPriority[] = ["CRITICAL", "WARNING", "INFO"];
  for (const priority of priorityOrder) {
    const match = active.find((a) => a.priority === priority);
    if (match) return match;
  }
  return active[0];
};

/**
 * Selector: Get all alerts (active, resolved, dismissed)
 * @example
 * const allAlerts = useAlertsStore(selectAllAlerts);
 */
export const selectAllAlerts = (state: AlertsState): SolarAlert[] =>
  state.alerts;

/**
 * Selector: Get alert history (resolved/dismissed alerts)
 * @example
 * const history = useAlertsStore(selectAlertHistory);
 */
export const selectAlertHistory = (state: AlertsState): SolarAlert[] =>
  state.alertHistory;

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Alerts store with localStorage persistence for dismissals and history
 *
 * @example
 * ```tsx
 * const { alerts, addAlert, dismissAlert } = useAlertsStore();
 *
 * // Add a new alert
 * addAlert({
 *   id: crypto.randomUUID(),
 *   type: 'K_INDEX_STORM',
 *   priority: 'WARNING',
 *   status: 'ACTIVE',
 *   title: 'Geomagnetic Storm Warning',
 *   message: 'K-index has reached storm levels',
 *   createdAt: new Date().toISOString(),
 *   triggerValue: 5,
 *   threshold: 5,
 * });
 *
 * // Dismiss an alert
 * dismissAlert('alert-id');
 *
 * // Check if an alert type is in cooldown
 * if (!isInCooldown('K_INDEX_STORM', 30 * 60 * 1000)) {
 *   // Fire the alert
 * }
 * ```
 */
export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      // Persisted state
      dismissedAlertIds: defaultPersistedState.dismissedAlertIds,
      alertHistory: defaultPersistedState.alertHistory,

      // Runtime state (not persisted)
      alerts: defaultRuntimeState.alerts,
      lastAlertCheckTime: defaultRuntimeState.lastAlertCheckTime,
      lastAlertByType: defaultRuntimeState.lastAlertByType,

      // ========================================================================
      // Actions
      // ========================================================================

      addAlert: (alert) =>
        set((state) => {
          // Skip if alert ID is already in dismissed list
          if (state.dismissedAlertIds.includes(alert.id)) {
            return state;
          }

          // Skip if same type is already ACTIVE
          const hasActiveOfType = state.alerts.some(
            (a) => a.type === alert.type && a.status === "ACTIVE",
          );
          if (hasActiveOfType) {
            return state;
          }

          // Skip if alert with same ID already exists
          const existingAlert = state.alerts.find((a) => a.id === alert.id);
          if (existingAlert) {
            return state;
          }

          // Add the new alert
          return {
            alerts: [...state.alerts, alert],
          };
        }),

      resolveAlert: (alertId) =>
        set((state) => {
          const alertIndex = state.alerts.findIndex((a) => a.id === alertId);
          if (alertIndex === -1) return state;

          const alert = state.alerts[alertIndex];
          if (alert.status !== "ACTIVE") return state;

          const resolvedAlert: SolarAlert = {
            ...alert,
            status: "RESOLVED" as AlertStatus,
            resolvedAt: new Date().toISOString(),
          };

          // Remove from active alerts
          const updatedAlerts = state.alerts.filter((a) => a.id !== alertId);

          // Add to history
          const updatedHistory = [resolvedAlert, ...state.alertHistory];

          return {
            alerts: updatedAlerts,
            alertHistory: updatedHistory,
          };
        }),

      dismissAlert: (alertId) =>
        set((state) => {
          const alertIndex = state.alerts.findIndex((a) => a.id === alertId);
          if (alertIndex === -1) return state;

          const alert = state.alerts[alertIndex];

          const dismissedAlert: SolarAlert = {
            ...alert,
            status: "DISMISSED" as AlertStatus,
            dismissedAt: new Date().toISOString(),
          };

          // Remove from active alerts
          const updatedAlerts = state.alerts.filter((a) => a.id !== alertId);

          // Add ID to dismissed list (persisted)
          const updatedDismissedIds = state.dismissedAlertIds.includes(alertId)
            ? state.dismissedAlertIds
            : [...state.dismissedAlertIds, alertId];

          // Add to history
          const updatedHistory = [dismissedAlert, ...state.alertHistory];

          return {
            alerts: updatedAlerts,
            dismissedAlertIds: updatedDismissedIds,
            alertHistory: updatedHistory,
          };
        }),

      clearDismissedAlerts: () =>
        set({
          dismissedAlertIds: [],
          alertHistory: [],
        }),

      cleanupExpiredHistory: () =>
        set((state) => {
          const cutoffTime = Date.now() - HISTORY_RETENTION_MS;

          const filteredHistory = state.alertHistory.filter((alert) => {
            const timestamp = alert.resolvedAt || alert.dismissedAt;
            if (!timestamp) return true;
            return new Date(timestamp).getTime() > cutoffTime;
          });

          // Also clean up dismissed IDs for alerts older than retention period
          const historyIds = new Set(filteredHistory.map((a) => a.id));
          const filteredDismissedIds = state.dismissedAlertIds.filter((id) =>
            historyIds.has(id),
          );

          return {
            alertHistory: filteredHistory,
            dismissedAlertIds: filteredDismissedIds,
          };
        }),

      setLastCheckTime: (time) =>
        set({
          lastAlertCheckTime: time,
        }),

      recordAlertFired: (alertType) =>
        set((state) => ({
          lastAlertByType: {
            ...state.lastAlertByType,
            [alertType]: Date.now(),
          },
        })),

      isInCooldown: (alertType, cooldownMs) => {
        const state = get();
        const lastFired = state.lastAlertByType[alertType];
        if (!lastFired) return false;
        return Date.now() - lastFired < cooldownMs;
      },

      getActiveAlerts: () => {
        const state = get();
        return state.alerts.filter((a) => a.status === "ACTIVE");
      },

      getAlertsByPriority: (priority) => {
        const state = get();
        return state.alerts.filter(
          (a) => a.status === "ACTIVE" && a.priority === priority,
        );
      },

      hasActiveAlertOfType: (type) => {
        const state = get();
        return state.alerts.some(
          (a) => a.type === type && a.status === "ACTIVE",
        );
      },
    }),
    {
      name: "propulse-alerts",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only persist dismissedAlertIds and alertHistory
      partialize: (state) => ({
        dismissedAlertIds: state.dismissedAlertIds,
        alertHistory: state.alertHistory,
      }),
      // Merge persisted state with runtime defaults on rehydration
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<PersistedAlertState>),
        // Ensure runtime state uses defaults, not persisted values
        alerts: defaultRuntimeState.alerts,
        lastAlertCheckTime: defaultRuntimeState.lastAlertCheckTime,
        lastAlertByType: defaultRuntimeState.lastAlertByType,
      }),
    },
  ),
);
