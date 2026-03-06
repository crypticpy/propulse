/**
 * WeatherAlertToasts — toast notification stack for AtmosPulse weather alerts.
 *
 * Renders up to 3 active weather alerts from `useWeatherAlertEngine` as
 * fixed bottom-right toasts. Each toast auto-dismisses after 15 seconds,
 * has a manual close button, and is color-coded by severity.
 *
 * Follows the existing AlertToast pattern (slide-in / slide-out animations,
 * progress bar countdown, severity-based styling).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  useWeatherAlertEngine,
  type WeatherAlertItem,
  type WeatherAlertSeverity,
  type WeatherAlertType,
} from "@/lib/atmos/weatherAlertEngine";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Auto-dismiss delay in milliseconds */
const AUTO_DISMISS_MS = 15_000;

/** Exit animation duration in milliseconds */
const EXIT_ANIMATION_MS = 200;

/** Progress bar update interval in milliseconds */
const PROGRESS_INTERVAL_MS = 50;

/** Maximum number of visible toasts */
const MAX_VISIBLE = 3;

// =============================================================================
// STYLING
// =============================================================================

const SEVERITY_STYLES: Record<
  WeatherAlertSeverity,
  { bg: string; border: string; iconColor: string }
> = {
  critical: {
    bg: "bg-alert-red/10",
    border: "border-alert-red",
    iconColor: "text-alert-red",
  },
  warning: {
    bg: "bg-caution-amber/10",
    border: "border-caution-amber",
    iconColor: "text-caution-amber",
  },
  info: {
    bg: "bg-nebula-blue/10",
    border: "border-nebula-blue",
    iconColor: "text-nebula-blue",
  },
};

// =============================================================================
// ICONS (inline SVG to avoid external dependencies)
// =============================================================================

/** SVG icon per alert type */
function AlertIcon({
  type,
  className,
}: {
  type: WeatherAlertType;
  className?: string;
}) {
  const cls = `w-5 h-5 flex-shrink-0 ${className ?? ""}`;

  switch (type) {
    // NWS severe weather — warning triangle
    case "nws-severe":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
            clipRule="evenodd"
          />
        </svg>
      );

    // RIM degraded / critical — radio / signal bars
    case "rim-degraded":
    case "rim-critical":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden="true"
        >
          <path d="M5.636 4.575a.75.75 0 0 1 0 1.061 9.004 9.004 0 0 0 0 12.728.75.75 0 1 1-1.06 1.06c-4.101-4.1-4.101-10.748 0-14.849a.75.75 0 0 1 1.06 0Zm12.728 0a.75.75 0 0 1 1.06 0c4.101 4.1 4.101 10.749 0 14.85a.75.75 0 1 1-1.06-1.061 9.004 9.004 0 0 0 0-12.728.75.75 0 0 1 0-1.06ZM7.757 6.697a.75.75 0 0 1 0 1.06 6.004 6.004 0 0 0 0 8.486.75.75 0 0 1-1.06 1.06 7.504 7.504 0 0 1 0-10.606.75.75 0 0 1 1.06 0Zm8.486 0a.75.75 0 0 1 1.06 0 7.504 7.504 0 0 1 0 10.607.75.75 0 0 1-1.06-1.06 6.004 6.004 0 0 0 0-8.486.75.75 0 0 1 0-1.06ZM12 12a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
      );

    // Kp storm — bolt / lightning-like icon
    case "kp-storm":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
            clipRule="evenodd"
          />
        </svg>
      );

    // Tropical advisory — cloud / cyclone
    case "tropical-advisory":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.5 9.75a6 6 0 0 1 11.573-2.226 3.75 3.75 0 0 1 4.133 4.303A4.5 4.5 0 0 1 18 20.25H6.75a5.25 5.25 0 0 1-2.23-10.004 6.024 6.024 0 0 1-.02-.496Z"
            clipRule="evenodd"
          />
        </svg>
      );

    default:
      return null;
  }
}

/** Close (X) icon */
function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/** Format a timestamp as relative time (e.g. "2 min ago") */
function relativeTime(timestamp: number): string {
  const deltaS = Math.floor((Date.now() - timestamp) / 1000);
  if (deltaS < 10) return "just now";
  if (deltaS < 60) return `${deltaS}s ago`;
  const deltaM = Math.floor(deltaS / 60);
  if (deltaM < 60) return `${deltaM} min ago`;
  const deltaH = Math.floor(deltaM / 60);
  return `${deltaH}h ago`;
}

// =============================================================================
// INDIVIDUAL TOAST
// =============================================================================

function WeatherAlertToastItem({
  alert,
  index,
  onDismiss,
}: {
  alert: WeatherAlertItem;
  index: number;
  onDismiss: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntered, setIsEntered] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number | null>(null);
  const isExitingRef = useRef(false);

  const styles = SEVERITY_STYLES[alert.severity];

  // ---- Dismiss handler ----
  const handleDismiss = useCallback(() => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;
    setIsExiting(true);
    setTimeout(() => onDismiss(alert.id), EXIT_ANIMATION_MS);
  }, [alert.id, onDismiss]);

  // ---- Pause on hover ----
  const handleMouseEnter = useCallback(() => {
    if (intervalRef.current === null) return;
    pausedTimeRef.current = Date.now();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ---- Resume on mouse leave ----
  const handleMouseLeave = useCallback(() => {
    if (pausedTimeRef.current === null) return;
    const pauseDuration = Date.now() - pausedTimeRef.current;
    startTimeRef.current += pauseDuration;
    pausedTimeRef.current = null;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        handleDismiss();
      }
    }, PROGRESS_INTERVAL_MS);
  }, [handleDismiss]);

  // ---- Entry animation (staggered) ----
  useEffect(() => {
    const timer = setTimeout(() => setIsEntered(true), index * 80);
    return () => clearTimeout(timer);
  }, [index]);

  // ---- Auto-dismiss countdown ----
  useEffect(() => {
    startTimeRef.current = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
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
  }, [handleDismiss]);

  const isCritical = alert.severity === "critical";

  return (
    <div
      className={`
        w-80
        ${styles.bg} backdrop-blur-md
        border ${styles.border} border-l-4 rounded-lg
        shadow-lg
        transform transition-all duration-200 ease-out
        ${isExiting ? "translate-x-full opacity-0" : isEntered ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live={isCritical ? "assertive" : "polite"}
      aria-atomic="true"
    >
      {/* Content */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          {/* Icon */}
          <AlertIcon type={alert.type} className={styles.iconColor} />

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-mono font-semibold text-white truncate">
                {alert.title}
              </h4>
              {isCritical && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-alert-red bg-alert-red/20 flex-shrink-0 animate-pulse">
                  CRITICAL
                </span>
              )}
            </div>
            <p className="text-xs text-gray-300 line-clamp-2 mt-0.5 leading-relaxed">
              {alert.message}
            </p>
            <p className="text-[10px] text-gray-500 mt-1 font-mono">
              {relativeTime(alert.timestamp)}
            </p>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-white/20"
            aria-label="Dismiss weather alert"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Progress bar countdown */}
      <div className="h-0.5 bg-gray-800 rounded-b-lg overflow-hidden">
        <div
          className={`h-full transition-[width] duration-75 ease-linear ${
            isCritical
              ? "bg-alert-red"
              : alert.severity === "warning"
                ? "bg-caution-amber"
                : "bg-nebula-blue"
          }`}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Time until auto-dismiss"
        />
      </div>

      {/* Critical pulsing indicator line */}
      {isCritical && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-alert-red via-plasma-orange to-alert-red animate-pulse rounded-b-lg"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// =============================================================================
// CONTAINER
// =============================================================================

/**
 * WeatherAlertToasts
 *
 * Drop into AtmosLayout to display weather alert toasts.
 * Renders up to 3 toasts (newest first), auto-dismisses after 15 seconds.
 *
 * @example
 * ```tsx
 * // In AtmosLayout.tsx
 * <WeatherAlertToasts />
 * ```
 */
export function WeatherAlertToasts() {
  const alerts = useWeatherAlertEngine();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter((a) => !dismissedIds.has(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="Weather alert notifications"
      aria-live="polite"
    >
      {visibleAlerts.slice(0, MAX_VISIBLE).map((alert, index) => (
        <WeatherAlertToastItem
          key={alert.id}
          alert={alert}
          index={index}
          onDismiss={handleDismiss}
        />
      ))}
      {visibleAlerts.length > MAX_VISIBLE && (
        <div className="text-xs font-mono text-right pr-2 text-gray-500">
          +{visibleAlerts.length - MAX_VISIBLE} more alert
          {visibleAlerts.length - MAX_VISIBLE !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

WeatherAlertToasts.displayName = "WeatherAlertToasts";
