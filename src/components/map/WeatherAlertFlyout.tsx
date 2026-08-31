/**
 * WeatherAlertFlyout Component
 *
 * A portal-rendered interactive flyout that appears when clicking a weather
 * alert marker on the 3D globe. Shows alert summary with severity badge,
 * headline, area description, and action buttons.
 *
 * Uses glassmorphism styling matching PinFlyout and other map overlays.
 * Supports click-outside dismiss, Escape key dismiss, and smart
 * viewport-aware positioning.
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type { WeatherAlert } from "@/lib/api/weather";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WeatherAlertFlyoutProps {
  /** Whether the flyout is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** The weather alert to display */
  alert: WeatherAlert | null;
  /** Callback to close the flyout */
  onClose: () => void;
  /** Callback to view full alert details in a modal */
  onViewDetails: (alert: WeatherAlert) => void;
  /**
   * Keep the flyout mounted as a durable focus-restoration target while a
   * child detail dialog owns input. Outside-click and Escape listeners are
   * suspended until that dialog closes.
   */
  suspended?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Flyout dimensions for positioning calculations */
const FLYOUT_WIDTH = 320;
const FLYOUT_HEIGHT = 220;
const EDGE_PADDING = 10;
/** Offset from anchor point */
const CURSOR_OFFSET = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get weather-appropriate emoji based on the event type.
 */
function getWeatherEmoji(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "\uD83C\uDF2A\uFE0F";
  if (e.includes("hurricane") || e.includes("tropical")) return "\uD83C\uDF00";
  if (e.includes("thunderstorm") || e.includes("lightning"))
    return "\u26C8\uFE0F";
  if (e.includes("flood") || e.includes("flash")) return "\uD83C\uDF0A";
  if (
    e.includes("winter") ||
    e.includes("blizzard") ||
    e.includes("ice") ||
    e.includes("snow") ||
    e.includes("freeze") ||
    e.includes("frost")
  )
    return "\u2744\uFE0F";
  if (e.includes("wind") || e.includes("gale")) return "\uD83D\uDCA8";
  if (e.includes("heat") || e.includes("excessive")) return "\uD83D\uDD25";
  if (e.includes("fog")) return "\uD83C\uDF2B\uFE0F";
  if (e.includes("rain") || e.includes("shower")) return "\uD83C\uDF27\uFE0F";
  if (e.includes("fire")) return "\uD83D\uDD25";
  return "\u26A0\uFE0F";
}

/**
 * Return the severity color matching the severity palette.
 */
function severityColor(severity: WeatherAlert["severity"]): string {
  switch (severity) {
    case "Extreme":
      return "#ff0040";
    case "Severe":
      return "#ff6600";
    case "Moderate":
      return "#ffaa00";
    default:
      return "#ffdd44";
  }
}

/**
 * Return the severity badge background color (semi-transparent).
 */
function severityBgColor(severity: WeatherAlert["severity"]): string {
  switch (severity) {
    case "Extreme":
      return "rgba(255, 0, 64, 0.2)";
    case "Severe":
      return "rgba(255, 102, 0, 0.2)";
    case "Moderate":
      return "rgba(255, 170, 0, 0.2)";
    default:
      return "rgba(255, 221, 68, 0.2)";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeatherAlertFlyout({
  visible,
  position,
  alert,
  onClose,
  onViewDetails,
  suspended = false,
}: WeatherAlertFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);

  // ------- Positioning (viewport-aware) -------

  const adjustedPosition = useMemo(() => {
    const { x, y } = position;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    let adjustedX: number;
    let adjustedY: number;

    // X position: default to right of anchor, flip to left if near right edge
    const spaceOnRight = viewportWidth - x - EDGE_PADDING;
    const spaceOnLeft = x - EDGE_PADDING;

    if (spaceOnRight >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      adjustedX = x + CURSOR_OFFSET;
    } else if (spaceOnLeft >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      adjustedX = x - FLYOUT_WIDTH - CURSOR_OFFSET;
    } else {
      adjustedX = Math.max(
        EDGE_PADDING,
        Math.min(
          x - FLYOUT_WIDTH / 2,
          viewportWidth - FLYOUT_WIDTH - EDGE_PADDING,
        ),
      );
    }

    // Y position: default to slightly above anchor, flip below if near top
    const spaceAbove = y - EDGE_PADDING;
    const spaceBelow = viewportHeight - y - EDGE_PADDING;

    if (spaceAbove >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y - FLYOUT_HEIGHT - CURSOR_OFFSET;
    } else if (spaceBelow >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y + CURSOR_OFFSET;
    } else {
      adjustedY = Math.max(
        EDGE_PADDING,
        Math.min(
          y - FLYOUT_HEIGHT / 2,
          viewportHeight - FLYOUT_HEIGHT - EDGE_PADDING,
        ),
      );
    }

    return { x: adjustedX, y: adjustedY };
  }, [position]);

  // ------- Dismissal behaviors -------

  // Click outside to dismiss
  useEffect(() => {
    if (!visible || suspended) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, suspended, onClose]);

  // Escape key to dismiss
  useEffect(() => {
    if (!visible || suspended) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, suspended, onClose]);

  // ------- Action handlers -------

  const handleViewDetails = useCallback(() => {
    if (alert) {
      onViewDetails(alert);
    }
  }, [alert, onViewDetails]);

  // ------- Render -------

  if (!visible || !alert) {
    return null;
  }

  const color = severityColor(alert.severity);
  const bgColor = severityBgColor(alert.severity);
  const emoji = getWeatherEmoji(alert.event);

  // Truncate headline for flyout display
  const truncatedHeadline =
    alert.headline && alert.headline.length > 120
      ? alert.headline.slice(0, 120) + "\u2026"
      : alert.headline;

  // Truncate area for flyout display
  const truncatedArea =
    alert.areaDesc && alert.areaDesc.length > 80
      ? alert.areaDesc.slice(0, 80) + "\u2026"
      : alert.areaDesc;

  const flyoutContent = (
    <div
      ref={flyoutRef}
      className="fixed z-[200] bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl transition-all duration-150"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: FLYOUT_WIDTH,
        borderTopColor: color,
        borderTopWidth: "2px",
      }}
      role="dialog"
      aria-label={`Weather alert: ${alert.event}`}
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-base flex-shrink-0">{emoji}</span>
          <span className="text-white font-semibold text-sm leading-tight flex-1 min-w-0 truncate">
            {alert.event}
          </span>
        </div>
      </div>

      {/* Severity badge */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 text-xs">{"\u26A0\uFE0F"}</span>
          <span className="text-gray-400 text-xs">Severity:</span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: color,
              backgroundColor: bgColor,
              border: `1px solid ${color}44`,
            }}
          >
            {alert.severity}
          </span>
        </div>
      </div>

      {/* Headline */}
      {truncatedHeadline && (
        <div className="px-3 py-1.5">
          <p className="text-sm text-gray-300 leading-relaxed">
            &ldquo;{truncatedHeadline}&rdquo;
          </p>
        </div>
      )}

      {/* Area */}
      {truncatedArea && (
        <div className="px-3 pb-2">
          <div className="flex items-start gap-1.5">
            <span className="text-gray-400 text-xs flex-shrink-0 mt-0.5">
              {"\uD83D\uDCCD"}
            </span>
            <span className="text-xs text-gray-400 leading-relaxed">
              {truncatedArea}
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-2 py-2 border-t border-white/10 flex items-center gap-2">
        <button
          onClick={handleViewDetails}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition-colors duration-150"
        >
          View Full Alert
        </button>
        <button
          onClick={onClose}
          className="flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-colors duration-150"
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(flyoutContent, document.body);
}

WeatherAlertFlyout.displayName = "WeatherAlertFlyout";

export default WeatherAlertFlyout;
