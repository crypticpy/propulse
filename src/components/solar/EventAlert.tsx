import React, { useState } from "react";
import { Card } from "@/components/ui";

export type EventType = "flare" | "storm" | "blackout" | null;
export type EventSeverity = "minor" | "moderate" | "major";

export interface EventAlertProps {
  /** Type of solar event (null or undefined to hide) */
  eventType?: EventType;
  /** Severity level of the event */
  severity?: EventSeverity;
  /** Alert message text */
  message?: string;
  /** ISO timestamp of the event */
  timestamp?: string;
  /** Callback when alert is dismissed */
  onDismiss?: () => void;
}

/** Event configuration by type */
const EVENT_CONFIG: Record<
  NonNullable<EventType>,
  { icon: string; borderColor: string; label: string }
> = {
  flare: {
    icon: "⚡",
    borderColor: "border-plasma-orange",
    label: "Solar Flare",
  },
  storm: {
    icon: "🌀",
    borderColor: "border-aurora-purple",
    label: "Geomagnetic Storm",
  },
  blackout: {
    icon: "📡",
    borderColor: "border-alert-red",
    label: "Radio Blackout",
  },
};

/** Severity configuration */
const SEVERITY_CONFIG: Record<
  EventSeverity,
  { label: string; textColor: string; bgColor: string }
> = {
  minor: {
    label: "Minor",
    textColor: "text-caution-amber",
    bgColor: "bg-caution-amber/10",
  },
  moderate: {
    label: "Moderate",
    textColor: "text-plasma-orange",
    bgColor: "bg-plasma-orange/10",
  },
  major: {
    label: "Major",
    textColor: "text-alert-red",
    bgColor: "bg-alert-red/10",
  },
};

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return timestamp;
  }
}

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

/**
 * EventAlert Component
 *
 * Displays a dismissible alert banner for active solar events.
 * Returns null if no event type is provided.
 *
 * @example
 * ```tsx
 * <EventAlert
 *   eventType="flare"
 *   severity="moderate"
 *   message="M2.5 flare detected from AR 3590"
 *   timestamp="2024-01-15T14:30:00Z"
 *   onDismiss={() => console.log('dismissed')}
 * />
 * ```
 */
export const EventAlert: React.FC<EventAlertProps> = ({
  eventType,
  severity = "minor",
  message,
  timestamp,
  onDismiss,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't render if no event type or dismissed
  if (!eventType || isDismissed) {
    return null;
  }

  const eventConfig = EVENT_CONFIG[eventType];
  const severityConfig = SEVERITY_CONFIG[severity];

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <Card
      variant="alert"
      animate
      className={`
        relative overflow-hidden
        ${eventConfig.borderColor}
        border-l-4
        ${severity === "major" ? "animate-pulse-glow" : ""}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Event icon */}
        <span
          className="text-2xl flex-shrink-0"
          role="img"
          aria-label={eventConfig.label}
        >
          {eventConfig.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-mono font-semibold text-white">
              {eventConfig.label}
            </h4>
            <span
              className={`
                px-2 py-0.5 rounded-full text-xs font-mono font-medium
                ${severityConfig.textColor} ${severityConfig.bgColor}
              `}
            >
              {severityConfig.label}
            </span>
          </div>

          {/* Message */}
          {message && (
            <p className="text-sm text-gray-300 mt-1 leading-relaxed">
              {message}
            </p>
          )}

          {/* Timestamp */}
          {timestamp && (
            <p className="text-xs text-gray-500 mt-2 font-mono">
              {formatTimestamp(timestamp)}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="
            flex-shrink-0 p-1 rounded-lg
            text-gray-500 hover:text-white
            hover:bg-white/10
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-white/20
          "
          aria-label="Dismiss alert"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Severity indicator bar at bottom for major events */}
      {severity === "major" && (
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
  );
};

EventAlert.displayName = "EventAlert";

export default EventAlert;
