/**
 * AlertHistoryModal - Modal for viewing alert history
 *
 * Shows all alerts organized by status (Active, Resolved, Dismissed).
 * Allows dismissing active alerts and clearing dismissed alerts.
 */

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useAlertsStore } from "@/stores/alertsStore";
import type { SolarAlert, AlertStatus, AlertPriority } from "@/types/alerts";
import { ALERT_ICONS, ALERT_COLORS } from "@/constants/alertThresholds";

// =============================================================================
// TYPES
// =============================================================================

export interface AlertHistoryModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

type TabId = "active" | "resolved" | "dismissed";

interface Tab {
  id: TabId;
  label: string;
  status: AlertStatus;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TABS: Tab[] = [
  { id: "active", label: "Active", status: "ACTIVE" },
  { id: "resolved", label: "Resolved", status: "RESOLVED" },
  { id: "dismissed", label: "Dismissed", status: "DISMISSED" },
];

/** Empty state messages by tab */
const EMPTY_MESSAGES: Record<TabId, string> = {
  active: "No active alerts. Solar conditions are normal.",
  resolved: "No resolved alerts in history.",
  dismissed: "No dismissed alerts.",
};

/** Confirmation timeout in milliseconds */
const CONFIRMATION_TIMEOUT_MS = 3000;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format timestamp as relative time with fallback to absolute date
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    // Validate the date is actually valid
    if (isNaN(date.getTime())) {
      return isoTimestamp;
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoTimestamp;
  }
}

/**
 * Sort alerts by priority (CRITICAL first), then by time (newest first)
 */
function sortAlerts(alerts: SolarAlert[]): SolarAlert[] {
  const priorityOrder: AlertPriority[] = ["CRITICAL", "WARNING", "INFO"];

  return [...alerts].sort((a, b) => {
    const priorityDiff =
      priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return (
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    );
  });
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Close/dismiss icon component
 */
const CloseIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    className={`w-5 h-5 ${className}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

/**
 * Empty state component for when a tab has no alerts
 */
interface EmptyStateProps {
  message: string;
}

function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="text-4xl mb-3" aria-hidden="true">
        &#x2600;&#xFE0F;
      </div>
      <p className="text-gray-400">{message}</p>
    </div>
  );
}

/**
 * Individual alert item component
 */
interface AlertItemProps {
  alert: SolarAlert;
  onDismiss?: (id: string) => void;
  showDismissButton?: boolean;
}

function AlertItem({
  alert,
  onDismiss,
  showDismissButton = false,
}: AlertItemProps) {
  const colors = ALERT_COLORS[alert.priority];
  const icon = ALERT_ICONS[alert.type];

  const handleDismiss = useCallback(() => {
    onDismiss?.(alert.id);
  }, [onDismiss, alert.id]);

  return (
    <div
      className={`
        p-4 rounded-lg bg-nebula-blue/50 border-l-4 ${colors.border}
        transition-colors duration-200 hover:bg-nebula-blue/70
      `}
      role="article"
      aria-label={`${alert.priority} alert: ${alert.title}`}
    >
      <div className="flex items-start gap-3">
        {/* Alert Icon */}
        <span className="text-2xl flex-shrink-0" aria-hidden="true">
          {icon}
        </span>

        {/* Alert Content */}
        <div className="flex-1 min-w-0">
          {/* Header with title and badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-white">{alert.title}</h4>

            {/* Priority badge */}
            <span
              className={`
                px-2 py-0.5 rounded-full text-xs font-medium
                ${colors.bg} ${colors.text}
              `}
            >
              {alert.priority}
            </span>

            {/* Status badge for non-active alerts */}
            {alert.status !== "ACTIVE" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                {alert.status}
              </span>
            )}
          </div>

          {/* Alert message */}
          <p className="text-sm text-gray-300 mt-1">{alert.message}</p>

          {/* Affected bands */}
          {alert.affectedBands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 items-center">
              <span className="text-xs text-gray-500">Affected:</span>
              {alert.affectedBands.map((band) => (
                <span
                  key={band}
                  className="px-1.5 py-0.5 text-xs bg-gray-800 text-gray-400 rounded"
                >
                  {band}
                </span>
              ))}
            </div>
          )}

          {/* Timestamps */}
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span>Triggered: {formatTimestamp(alert.triggeredAt)}</span>
            {alert.resolvedAt && (
              <span>Resolved: {formatTimestamp(alert.resolvedAt)}</span>
            )}
            {alert.dismissedAt && (
              <span>Dismissed: {formatTimestamp(alert.dismissedAt)}</span>
            )}
          </div>
        </div>

        {/* Dismiss button for active alerts */}
        {showDismissButton && onDismiss && (
          <button
            onClick={handleDismiss}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors flex-shrink-0"
            aria-label={`Dismiss alert: ${alert.title}`}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Tab button component
 */
interface TabButtonProps {
  tab: Tab;
  isActive: boolean;
  count: number;
  onClick: () => void;
}

function TabButton({ tab, isActive, count, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200 relative
        ${isActive ? "text-plasma-orange" : "text-gray-400 hover:text-gray-200"}
      `}
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${tab.id}`}
    >
      {tab.label}
      {count > 0 && (
        <span className="ml-2 px-1.5 py-0.5 text-xs bg-white/10 rounded-full">
          {count}
        </span>
      )}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-plasma-orange"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AlertHistoryModal - Modal for viewing and managing alert history
 *
 * Displays alerts organized into three tabs:
 * - Active: Currently active alerts that can be dismissed
 * - Resolved: Alerts that were automatically resolved when conditions normalized
 * - Dismissed: Alerts that were manually dismissed by the user
 *
 * @example
 * ```tsx
 * <AlertHistoryModal
 *   isOpen={isHistoryOpen}
 *   onClose={() => setIsHistoryOpen(false)}
 * />
 * ```
 */
export function AlertHistoryModal({ isOpen, onClose }: AlertHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("active");
  const [confirmClear, setConfirmClear] = useState(false);

  // Ref to track the confirmation timeout for cleanup
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  // Get store state and actions
  const alerts = useAlertsStore((state) => state.alerts);
  const alertHistory = useAlertsStore((state) => state.alertHistory);
  const dismissAlert = useAlertsStore((state) => state.dismissAlert);
  const clearDismissedAlerts = useAlertsStore(
    (state) => state.clearDismissedAlerts,
  );

  // Reset confirmation state when modal closes or tab changes
  useEffect(() => {
    if (!isOpen) {
      setConfirmClear(false);
      setActiveTab("active");
    }
  }, [isOpen]);

  useEffect(() => {
    setConfirmClear(false);
  }, [activeTab]);

  // Combine and sort all alerts
  const allAlerts = useMemo(() => {
    const combined = [...alerts, ...alertHistory];
    return sortAlerts(combined);
  }, [alerts, alertHistory]);

  // Filter by current tab's status
  const filteredAlerts = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab) return [];
    return allAlerts.filter((a) => a.status === tab.status);
  }, [allAlerts, activeTab]);

  // Calculate tab counts
  const tabCounts = useMemo(
    () => ({
      active: allAlerts.filter((a) => a.status === "ACTIVE").length,
      resolved: allAlerts.filter((a) => a.status === "RESOLVED").length,
      dismissed: allAlerts.filter((a) => a.status === "DISMISSED").length,
    }),
    [allAlerts],
  );

  // Handle dismiss action
  const handleDismiss = useCallback(
    (alertId: string) => {
      dismissAlert(alertId);
    },
    [dismissAlert],
  );

  // Handle clear dismissed with confirmation
  const handleClearDismissed = useCallback(() => {
    if (confirmClear) {
      clearDismissedAlerts();
      setConfirmClear(false);
      // Clear any pending timeout
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = null;
      }
    } else {
      setConfirmClear(true);
      // Clear any existing timeout first
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
      // Auto-reset confirmation after timeout
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmClear(false);
        confirmTimeoutRef.current = null;
      }, CONFIRMATION_TIMEOUT_MS);
    }
  }, [confirmClear, clearDismissedAlerts]);

  // Handle tab change
  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
  }, []);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Alert History"
      subtitle="Solar weather alerts and notifications"
      size="lg"
    >
      {/* Tab Navigation */}
      <div
        className="flex border-b border-white/10 mb-4"
        role="tablist"
        aria-label="Alert status tabs"
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            count={tabCounts[tab.id]}
            onClick={() => handleTabChange(tab.id)}
          />
        ))}
      </div>

      {/* Alert List */}
      <div
        className="space-y-3 min-h-[200px] max-h-[400px] overflow-y-auto"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-label={`${TABS.find((t) => t.id === activeTab)?.label} alerts`}
      >
        {filteredAlerts.length === 0 ? (
          <EmptyState message={EMPTY_MESSAGES[activeTab]} />
        ) : (
          filteredAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onDismiss={handleDismiss}
              showDismissButton={alert.status === "ACTIVE"}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/10">
        <div>
          {activeTab === "dismissed" && tabCounts.dismissed > 0 && (
            <button
              onClick={handleClearDismissed}
              className={`
                px-3 py-1.5 text-sm rounded-lg transition-colors duration-200
                ${
                  confirmClear
                    ? "bg-alert-red/20 text-alert-red border border-alert-red/50"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                }
              `}
              aria-label={
                confirmClear
                  ? "Click again to confirm clearing dismissed alerts"
                  : "Clear all dismissed alerts"
              }
            >
              {confirmClear ? "Click again to confirm" : "Clear Dismissed"}
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg text-gray-300 hover:text-white hover:border-white/20 transition-colors duration-200"
        >
          Close
        </button>
      </div>
    </DetailModal>
  );
}

export default AlertHistoryModal;
