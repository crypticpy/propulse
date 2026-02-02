/**
 * AlertToastContainer - Container for stacking toast notifications
 *
 * Positioned fixed in bottom-right corner.
 * Manages toast queue and animations.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AlertToast } from "./AlertToast";
import { useAlertsStore } from "@/stores/alertsStore";
import type { SolarAlert, AlertPriority } from "@/types/alerts";

// =============================================================================
// TYPES
// =============================================================================

export interface AlertToastContainerProps {
  /** Maximum number of visible toasts (default: 3) */
  maxVisible?: number;
  /** Callback when a toast is dismissed */
  onDismiss: (alertId: string) => void;
  /** Callback when a toast is clicked */
  onToastClick?: (alertId: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Priority order for sorting alerts (highest first)
 */
const PRIORITY_ORDER: Record<AlertPriority, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sort alerts by priority (CRITICAL > WARNING > INFO) then by triggered time
 */
function sortAlertsByPriority(alerts: SolarAlert[]): SolarAlert[] {
  return [...alerts].sort((a, b) => {
    // First sort by priority
    const priorityDiff =
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by triggered time (most recent first)
    return (
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    );
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AlertToastContainer Component
 *
 * A fixed-position container that manages a queue of toast notifications.
 * Shows up to maxVisible toasts at once, with the rest queued.
 * Critical alerts are always shown first.
 *
 * @example
 * ```tsx
 * <AlertToastContainer
 *   maxVisible={3}
 *   onDismiss={(id) => dismissAlert(id)}
 *   onToastClick={(id) => openAlertDetails(id)}
 * />
 * ```
 */
export const AlertToastContainer: React.FC<AlertToastContainerProps> = ({
  maxVisible = 3,
  onDismiss,
  onToastClick,
}) => {
  // Track IDs of alerts that have been shown as toasts (persists through queue)
  const [shownToastIds, setShownToastIds] = useState<Set<string>>(new Set());

  // Queue of alerts to display as toasts
  const [toastQueue, setToastQueue] = useState<SolarAlert[]>([]);

  // Get current alerts from the store
  const alerts = useAlertsStore((state) => state.alerts);

  /**
   * Detect new alerts and add them to the toast queue
   */
  useEffect(() => {
    // Find alerts that are active and haven't been shown yet
    const newAlerts = alerts.filter(
      (alert) => alert.status === "ACTIVE" && !shownToastIds.has(alert.id),
    );

    if (newAlerts.length > 0) {
      // Add new alerts to the queue
      setToastQueue((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const toAdd = newAlerts.filter((a) => !existingIds.has(a.id));
        if (toAdd.length === 0) return prev;
        return sortAlertsByPriority([...prev, ...toAdd]);
      });

      // Mark these alerts as shown
      setShownToastIds((prev) => {
        const next = new Set(prev);
        newAlerts.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }, [alerts, shownToastIds]);

  /**
   * Update queue when alerts change status (e.g., resolved externally)
   */
  useEffect(() => {
    const activeAlertIds = new Set(
      alerts.filter((a) => a.status === "ACTIVE").map((a) => a.id),
    );

    setToastQueue((prev) => {
      const filtered = prev.filter((toast) => activeAlertIds.has(toast.id));
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  }, [alerts]);

  /**
   * Handle toast dismissal - remove from queue and call onDismiss callback
   */
  const handleDismiss = useCallback(
    (alertId: string) => {
      setToastQueue((prev) => prev.filter((a) => a.id !== alertId));
      onDismiss(alertId);
    },
    [onDismiss],
  );

  /**
   * Handle toast click - navigate to details
   */
  const handleToastClick = useCallback(
    (alertId: string) => {
      onToastClick?.(alertId);
    },
    [onToastClick],
  );

  // Get the visible toasts (limited by maxVisible)
  const visibleToasts = useMemo(
    () => toastQueue.slice(0, maxVisible),
    [toastQueue, maxVisible],
  );

  // Count of queued toasts not currently visible
  const queuedCount = useMemo(
    () => Math.max(0, toastQueue.length - maxVisible),
    [toastQueue.length, maxVisible],
  );

  // Check if there are any critical alerts in the queue
  const hasCriticalQueued = useMemo(
    () =>
      toastQueue
        .slice(maxVisible)
        .some((alert) => alert.priority === "CRITICAL"),
    [toastQueue, maxVisible],
  );

  // Don't render if no toasts to display
  if (toastQueue.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[70] flex flex-col-reverse gap-2"
      role="region"
      aria-label="Alert notifications"
      aria-live="polite"
    >
      {/* Render visible toasts in reverse order (newest on top) */}
      {visibleToasts.map((alert, index) => (
        <AlertToast
          key={alert.id}
          alert={alert}
          onDismiss={handleDismiss}
          onClick={handleToastClick}
          index={index}
        />
      ))}

      {/* Queued count indicator */}
      {queuedCount > 0 && (
        <div
          className={`
            text-xs font-mono text-right pr-2
            ${hasCriticalQueued ? "text-alert-red animate-pulse" : "text-gray-500"}
            transition-colors duration-200
          `}
          role="status"
          aria-live="polite"
        >
          +{queuedCount} more alert{queuedCount !== 1 ? "s" : ""}
          {hasCriticalQueued && (
            <span className="ml-1 text-alert-red">(critical)</span>
          )}
        </div>
      )}
    </div>
  );
};

AlertToastContainer.displayName = "AlertToastContainer";

export default AlertToastContainer;
