/**
 * AlertToast - Individual toast notification for solar alerts
 *
 * Slides in from the right, auto-dismisses based on priority.
 * Click to expand or navigate to full alert details.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import type { SolarAlert, AlertPriority } from "@/types/alerts";
import { ALERT_ICONS, ALERT_COLORS } from "@/constants/alertThresholds";

// =============================================================================
// TYPES
// =============================================================================

export interface AlertToastProps {
  /** The alert to display */
  alert: SolarAlert;
  /** Callback when toast is dismissed (manual or auto) */
  onDismiss: (alertId: string) => void;
  /** Callback when toast is clicked (to view details) */
  onClick?: (alertId: string) => void;
  /** Index for stagger animation */
  index?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Auto-dismiss timers in milliseconds by priority
 * CRITICAL alerts never auto-dismiss (requires manual action)
 */
const AUTO_DISMISS_MS: Record<AlertPriority, number | null> = {
  INFO: 8000,
  WARNING: 15000,
  CRITICAL: null, // No auto-dismiss
};

/**
 * Animation duration for exit transition
 */
const EXIT_ANIMATION_MS = 200;

/**
 * Progress bar update interval
 */
const PROGRESS_INTERVAL_MS = 50;

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
    className={`w-4 h-4 ${className}`}
    aria-hidden="true"
  >
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </svg>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AlertToast Component
 *
 * A compact toast notification for solar weather alerts. Features slide-in
 * animation, auto-dismiss timer with progress indicator, and click handling
 * for viewing full alert details.
 *
 * @example
 * ```tsx
 * <AlertToast
 *   alert={solarAlert}
 *   onDismiss={(id) => dismissAlert(id)}
 *   onClick={(id) => viewAlertDetails(id)}
 *   index={0}
 * />
 * ```
 */
export const AlertToast: React.FC<AlertToastProps> = ({
  alert,
  onDismiss,
  onClick,
  index = 0,
}) => {
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntered, setIsEntered] = useState(false);

  // Refs for cleanup and pause functionality
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number | null>(null);

  // Get auto-dismiss timing for this priority level
  const autoDismissMs = AUTO_DISMISS_MS[alert.priority];

  // Get colors and icon based on alert type and priority
  const colors = ALERT_COLORS[alert.priority];
  const icon = ALERT_ICONS[alert.type];

  // Ref to track exiting state to avoid stale closure in callbacks
  const isExitingRef = useRef(false);

  /**
   * Handle toast dismissal with exit animation
   * Uses ref to check exiting state to avoid recreating callback on every render
   */
  const handleDismiss = useCallback(() => {
    if (isExitingRef.current) {
      return;
    } // Prevent double dismiss
    isExitingRef.current = true;
    setIsExiting(true);
    // Wait for exit animation to complete before calling onDismiss
    setTimeout(() => onDismiss(alert.id), EXIT_ANIMATION_MS);
  }, [alert.id, onDismiss]);

  /**
   * Handle toast click (for viewing details)
   * Does not trigger if clicking the dismiss button
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger if clicking dismiss button
      if ((e.target as HTMLElement).closest("button")) {
        return;
      }
      onClick?.(alert.id);
    },
    [alert.id, onClick],
  );

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(alert.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
      }
    },
    [alert.id, onClick, handleDismiss],
  );

  /**
   * Pause auto-dismiss on hover
   */
  const handleMouseEnter = useCallback(() => {
    if (!autoDismissMs || intervalRef.current === null) {
      return;
    }
    pausedTimeRef.current = Date.now();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [autoDismissMs]);

  /**
   * Resume auto-dismiss on mouse leave
   */
  const handleMouseLeave = useCallback(() => {
    if (!autoDismissMs || pausedTimeRef.current === null) {
      return;
    }

    // Adjust start time to account for paused duration
    const pauseDuration = Date.now() - pausedTimeRef.current;
    startTimeRef.current += pauseDuration;
    pausedTimeRef.current = null;

    // Restart the interval
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / autoDismissMs) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        handleDismiss();
      }
    }, PROGRESS_INTERVAL_MS);
  }, [autoDismissMs, handleDismiss]);

  /**
   * Entry animation trigger
   */
  useEffect(() => {
    // Staggered entry animation
    const entryDelay = index * 100;
    const entryTimer = setTimeout(() => {
      setIsEntered(true);
    }, entryDelay);

    return () => clearTimeout(entryTimer);
  }, [index]);

  /**
   * Auto-dismiss timer effect
   */
  useEffect(() => {
    if (!autoDismissMs) {
      return;
    }

    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / autoDismissMs) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        handleDismiss();
      }
    }, PROGRESS_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoDismissMs, handleDismiss]);

  // Determine if this is a critical alert (for special styling)
  const isCritical = alert.priority === "CRITICAL";

  return (
    <div
      className={`
        w-80
        bg-deep-space/95 backdrop-blur-sm
        border ${colors.border} border-l-4 rounded-lg
        shadow-lg shadow-black/20
        cursor-pointer
        transform transition-all duration-200 ease-out
        ${isExiting ? "translate-x-full opacity-0" : isEntered ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
        ${isCritical ? "ring-1 ring-alert-red/30" : ""}
        hover:scale-[1.02] hover:shadow-xl
        focus:outline-none focus:ring-2 focus:ring-white/20
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live={isCritical ? "assertive" : "polite"}
      aria-atomic="true"
      tabIndex={0}
    >
      {/* Main content area */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          {/* Alert icon */}
          <span
            className={`text-xl flex-shrink-0 ${colors.icon}`}
            role="img"
            aria-label={alert.type.replace(/_/g, " ").toLowerCase()}
          >
            {icon}
          </span>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            {/* Title with priority badge for critical */}
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-mono font-semibold text-white truncate">
                {alert.title}
              </h4>
              {isCritical && (
                <span
                  className={`
                    px-1.5 py-0.5 rounded text-[10px] font-mono font-bold
                    ${colors.bg} ${colors.text}
                    flex-shrink-0 animate-pulse
                  `}
                >
                  CRITICAL
                </span>
              )}
            </div>

            {/* Message - truncated to 2 lines */}
            <p className="text-xs text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
              {alert.message}
            </p>

            {/* Affected bands indicator (if any) */}
            {alert.affectedBands.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-1 font-mono truncate">
                Affects: {alert.affectedBands.slice(0, 3).join(", ")}
                {alert.affectedBands.length > 3 &&
                  ` +${alert.affectedBands.length - 3}`}
              </p>
            )}
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className={`
              flex-shrink-0 p-1 rounded
              text-gray-500 hover:text-white
              hover:bg-white/10
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-white/20
            `}
            aria-label="Dismiss alert"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Progress bar for auto-dismiss countdown */}
      {autoDismissMs && (
        <div className="h-0.5 bg-gray-800 rounded-b-lg overflow-hidden">
          <div
            className={`h-full ${colors.bg} transition-[width] duration-50 ease-linear`}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Time until auto-dismiss"
          />
        </div>
      )}

      {/* Critical alert indicator line */}
      {isCritical && (
        <div
          className="
            absolute bottom-0 left-0 right-0 h-0.5
            bg-gradient-to-r from-alert-red via-plasma-orange to-alert-red
            animate-pulse
            rounded-b-lg
          "
          aria-hidden="true"
        />
      )}
    </div>
  );
};

AlertToast.displayName = "AlertToast";

export default AlertToast;
