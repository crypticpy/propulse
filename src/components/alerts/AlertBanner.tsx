/**
 * AlertBanner - Full-width alert banner for solar weather warnings
 *
 * Displays below the header when solar conditions trigger alerts.
 * Shows the highest priority alert with option to view all.
 */

import React, { useMemo } from "react";
import { Card } from "@/components/ui";
import type { SolarAlert, AlertPriority } from "@/types/alerts";
import { ALERT_ICONS, ALERT_COLORS } from "@/constants/alertThresholds";

// =============================================================================
// TYPES
// =============================================================================

export interface AlertBannerProps {
  /** Array of active alerts to display */
  alerts: SolarAlert[];
  /** Callback when an alert is dismissed */
  onDismiss: (alertId: string) => void;
  /** Callback to view all alerts */
  onViewAll?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    // Validate the date is actually valid
    if (isNaN(date.getTime())) {
      return isoTimestamp;
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
      return "Just now";
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }
    return date.toLocaleDateString();
  } catch {
    return isoTimestamp;
  }
}

/**
 * Get the highest priority active alert from a list
 */
function getHighestPriorityAlert(alerts: SolarAlert[]): SolarAlert | null {
  const priorityOrder: AlertPriority[] = ["CRITICAL", "WARNING", "INFO"];

  for (const priority of priorityOrder) {
    const match = alerts.find(
      (a) => a.priority === priority && a.status === "ACTIVE",
    );
    if (match) {
      return match;
    }
  }

  // Return first active alert if no priority match
  const activeAlert = alerts.find((a) => a.status === "ACTIVE");
  return activeAlert || alerts[0] || null;
}

/**
 * Count remaining active alerts (excluding the displayed one)
 */
function getActiveAlertCount(alerts: SolarAlert[], excludeId?: string): number {
  return alerts.filter((a) => a.status === "ACTIVE" && a.id !== excludeId)
    .length;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Close/dismiss icon component
 */
const CloseIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`w-5 h-5 ${className}`}
    aria-hidden="true"
  >
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </svg>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AlertBanner Component
 *
 * A full-width banner that displays the highest priority active solar alert.
 * Features glass-morphism styling, priority-based coloring, and smooth animations.
 *
 * @example
 * ```tsx
 * <AlertBanner
 *   alerts={activeAlerts}
 *   onDismiss={(id) => dismissAlert(id)}
 *   onViewAll={() => setShowAlertHistory(true)}
 * />
 * ```
 */
export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  onDismiss,
  onViewAll,
  className = "",
}) => {
  // Get the highest priority alert to display
  const primaryAlert = useMemo(() => getHighestPriorityAlert(alerts), [alerts]);

  // Count remaining active alerts
  const moreCount = useMemo(
    () => getActiveAlertCount(alerts, primaryAlert?.id),
    [alerts, primaryAlert?.id],
  );

  // Get styling based on priority
  const colors = primaryAlert
    ? ALERT_COLORS[primaryAlert.priority]
    : ALERT_COLORS.INFO;

  // Get icon for alert type
  const icon = primaryAlert ? ALERT_ICONS[primaryAlert.type] : "";

  // Check if we have any alerts to display
  const hasAlerts = primaryAlert !== null && primaryAlert.status === "ACTIVE";

  // Handle dismiss
  const handleDismiss = () => {
    if (primaryAlert) {
      onDismiss(primaryAlert.id);
    }
  };

  // Handle keyboard navigation for dismiss button
  const handleDismissKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDismiss();
    }
  };

  // Handle view all keyboard navigation
  const handleViewAllKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onViewAll?.();
    }
  };

  // Don't render if no active alerts
  if (!hasAlerts) {
    return null;
  }

  const isCritical = primaryAlert.priority === "CRITICAL";

  return (
    <div
      className={`
        w-full
        transition-all duration-300 ease-in-out
        ${className}
      `}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <Card
        variant="alert"
        animate
        className={`
          relative overflow-hidden
          border-l-4
          ${colors.border}
          ${isCritical ? "animate-pulse-glow" : ""}
        `}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Alert icon */}
          <span
            className={`
              text-2xl flex-shrink-0
              ${colors.icon}
            `}
            role="img"
            aria-label={primaryAlert.type.replace(/_/g, " ").toLowerCase()}
          >
            {icon}
          </span>

          {/* Content section */}
          <div className="flex-1 min-w-0">
            {/* Header row with title and priority badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-mono font-semibold text-white truncate">
                {primaryAlert.title}
              </h4>
              <span
                className={`
                  px-2 py-0.5 rounded-full text-xs font-mono font-medium
                  ${colors.bg} ${colors.text}
                  flex-shrink-0
                `}
              >
                {primaryAlert.priority}
              </span>
            </div>

            {/* Alert message */}
            <p className="text-sm text-gray-300 mt-1 leading-relaxed truncate sm:whitespace-normal sm:line-clamp-2">
              {primaryAlert.message}
            </p>

            {/* Timestamp */}
            <p className="text-xs text-gray-500 mt-1 font-mono">
              {formatTimeAgo(primaryAlert.triggeredAt)}
            </p>
          </div>

          {/* More alerts link */}
          {moreCount > 0 && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              onKeyDown={handleViewAllKeyDown}
              className={`
                flex-shrink-0
                text-sm font-mono
                text-cosmic-cyan hover:text-cosmic-cyan/80
                hover:underline
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-cosmic-cyan/30 focus:ring-offset-2 focus:ring-offset-transparent
                rounded px-2 py-1
                hidden sm:block
              `}
              aria-label={`View ${moreCount} more alert${moreCount !== 1 ? "s" : ""}`}
            >
              +{moreCount} more
            </button>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            onKeyDown={handleDismissKeyDown}
            className={`
              flex-shrink-0 p-1.5 rounded-lg
              text-gray-500 hover:text-white
              hover:bg-white/10
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-white/20
            `}
            aria-label="Dismiss alert"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Mobile: More alerts link shown below content */}
        {moreCount > 0 && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className={`
              sm:hidden
              mt-3 pt-3 w-full
              border-t border-white/10
              text-sm font-mono text-center
              text-cosmic-cyan hover:text-cosmic-cyan/80
              hover:underline
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-cosmic-cyan/30
            `}
            aria-label={`View ${moreCount} more alert${moreCount !== 1 ? "s" : ""}`}
          >
            +{moreCount} more alert{moreCount !== 1 ? "s" : ""}
          </button>
        )}

        {/* Critical priority indicator bar */}
        {isCritical && (
          <div
            className="
              absolute bottom-0 left-0 right-0 h-0.5
              bg-gradient-to-r from-alert-red via-plasma-orange to-alert-red
              animate-pulse
            "
            aria-hidden="true"
          />
        )}
      </Card>
    </div>
  );
};

AlertBanner.displayName = "AlertBanner";

export default AlertBanner;
