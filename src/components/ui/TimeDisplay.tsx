import React, { useMemo } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export interface TimeDisplayProps {
  /** The time to display - accepts Date object or Unix timestamp (milliseconds) */
  time: Date | number;
  /** Which format to show as the primary display (default: 'utc') */
  format?: "utc" | "local";
  /** Additional CSS classes for the wrapper span */
  className?: string;
  /** Whether to show seconds in the time display (default: false) */
  showSeconds?: boolean;
}

/**
 * TimeDisplay Component
 *
 * A reusable time display that shows both UTC and local time on hover.
 * Automatically detects the user's timezone and displays an abbreviated name.
 *
 * @example
 * ```tsx
 * // Basic usage - shows UTC time, hover for local
 * <TimeDisplay time={new Date()} />
 *
 * // Show local time as primary, hover for UTC
 * <TimeDisplay time={Date.now()} format="local" />
 *
 * // With seconds
 * <TimeDisplay time={new Date()} showSeconds />
 *
 * ```
 */
export const TimeDisplay: React.FC<TimeDisplayProps> = ({
  time,
  format = "utc",
  className = "",
  showSeconds = false,
}) => {
  const hour12 = useSettingsStore((s) => s.timeFormat !== "24h");
  const date = useMemo(
    () => (time instanceof Date ? time : new Date(time)),
    [time],
  );

  const formatOptions: Intl.DateTimeFormatOptions = useMemo(
    () => ({
      hour: "2-digit",
      minute: "2-digit",
      ...(showSeconds && { second: "2-digit" }),
      hour12,
    }),
    [showSeconds, hour12],
  );

  // Format UTC time
  const utcTime = useMemo(
    () =>
      date.toLocaleTimeString("en-US", {
        ...formatOptions,
        timeZone: "UTC",
      }),
    [date, formatOptions],
  );

  // Format local time
  const localTime = useMemo(
    () => date.toLocaleTimeString("en-US", formatOptions),
    [date, formatOptions],
  );

  // Get timezone abbreviation (e.g., "EST", "PST", "CET")
  const tzAbbrev = useMemo(() => {
    try {
      // Get the timezone name from the system
      const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Try to get short timezone name (e.g., "EST", "PST")
      const parts = date.toLocaleTimeString("en-US", {
        timeZoneName: "short",
      });
      // Extract the timezone abbreviation (last word typically)
      const match = parts.match(/[A-Z]{2,5}$/);
      if (match) {
        return match[0];
      }

      // Fallback: create abbreviated form from IANA timezone
      // e.g., "America/New_York" -> "NY", "Europe/London" -> "LON"
      const cityPart = timezoneName.split("/").pop() || timezoneName;
      return cityPart.replace(/_/g, " ").slice(0, 3).toUpperCase();
    } catch {
      return "Local";
    }
  }, [date]);

  // Displayed time based on format preference
  const displayedTime = format === "utc" ? utcTime : localTime;
  const displayedSuffix = format === "utc" ? "UTC" : tzAbbrev;

  // Tooltip content showing both times
  const tooltipContent = `UTC: ${utcTime} / Local: ${localTime} ${tzAbbrev}`;

  return (
    <span className={`relative inline-flex group ${className}`}>
      <span className="cursor-help border-b border-dotted border-white/30 hover:border-white/50 transition-colors">
        {displayedTime} {displayedSuffix}
      </span>
      <span
        role="tooltip"
        className={[
          // Positioning
          "absolute",
          "bottom-full",
          "left-1/2",
          "-translate-x-1/2",
          "mb-2",
          "z-[70]",

          // Sizing
          "px-3",
          "py-2",
          "w-max",

          // Appearance
          "bg-panel",
          "border",
          "border-white/10",
          "rounded-lg",
          "shadow-lg",

          // Typography
          "text-sm",
          "text-gray-200",
          "font-sans",
          "font-mono",
          "whitespace-nowrap",

          // Visibility & Animation
          "opacity-0",
          "invisible",
          "group-hover:opacity-100",
          "group-hover:visible",
          "transition-all",
          "duration-200",

          // Prevent pointer events on tooltip itself
          "pointer-events-none",
        ].join(" ")}
      >
        {tooltipContent}
        {/* Arrow */}
        <span
          className={[
            "absolute",
            "top-full",
            "left-1/2",
            "-translate-x-1/2",
            "border-4",
            "border-transparent",
            "border-t-panel",
          ].join(" ")}
          aria-hidden="true"
        />
      </span>
    </span>
  );
};

TimeDisplay.displayName = "TimeDisplay";

export default TimeDisplay;
