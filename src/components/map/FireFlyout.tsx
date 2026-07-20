/**
 * FireFlyout Component
 *
 * A portal-rendered flyout that appears when clicking a fire hotspot marker
 * on the 3D globe. Shows the VIIRS detection details: fire radiative power,
 * brightness temperature, confidence, and location.
 *
 * Uses the same glassmorphism styling and viewport-aware anchored-popover
 * positioning as WeatherAlertFlyout.
 */

import { useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { FireHotspot } from "@/lib/api/fires";
import { latLonToGrid } from "@/lib/utils/grid";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FireFlyoutProps {
  /** Whether the flyout is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** The fire hotspot to display */
  hotspot: FireHotspot | null;
  /** Callback to close the flyout */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Flyout dimensions for positioning calculations */
const FLYOUT_WIDTH = 280;
const FLYOUT_HEIGHT = 190;
const EDGE_PADDING = 10;
/** Offset from anchor point */
const CURSOR_OFFSET = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize VIIRS confidence codes ("l"/"n"/"h" or words) to a label. */
function confidenceLabel(confidence: string): string {
  const c = confidence.toLowerCase();
  if (c === "h" || c === "high") return "High";
  if (c === "l" || c === "low") return "Low";
  return "Nominal";
}

function confidenceColor(confidence: string): string {
  switch (confidenceLabel(confidence)) {
    case "High":
      return "#ff4422";
    case "Low":
      return "#ffdd44";
    default:
      return "#ff8800";
  }
}

/** Format a coordinate pair like 34.05°N 118.24°W. */
function formatCoords(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${latStr} ${lonStr}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FireFlyout({
  visible,
  position,
  hotspot,
  onClose,
}: FireFlyoutProps) {
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
    if (!visible) return;

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
  }, [visible, onClose]);

  // Escape key to dismiss
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  // ------- Render -------

  if (!visible || !hotspot) {
    return null;
  }

  const confLabel = confidenceLabel(hotspot.confidence);
  const confColor = confidenceColor(hotspot.confidence);

  let grid = "";
  try {
    grid = latLonToGrid(hotspot.lat, hotspot.lon, 4);
  } catch {
    // Out-of-range coordinates — omit the grid line
  }

  const flyoutContent = (
    <div
      ref={flyoutRef}
      className="fixed z-[200] bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl transition-all duration-150"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: FLYOUT_WIDTH,
        borderTopColor: "#ff4422",
        borderTopWidth: "2px",
      }}
      role="dialog"
      aria-label="Active fire detection"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-base flex-shrink-0">{"🔥"}</span>
          <span className="text-white font-semibold text-sm leading-tight flex-1 min-w-0 truncate">
            Active Fire Detection
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
          NASA FIRMS · VIIRS (last 24h)
        </div>
      </div>

      {/* Detection details */}
      <div className="px-3 py-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Fire radiative power</span>
          <span className="text-white font-mono">
            {hotspot.frp.toFixed(1)} MW
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Brightness temp</span>
          <span className="text-white font-mono">
            {hotspot.brightness.toFixed(0)} K
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Confidence</span>
          <span
            className="font-semibold px-2 py-0.5 rounded-full"
            style={{
              color: confColor,
              backgroundColor: `${confColor}22`,
              border: `1px solid ${confColor}44`,
            }}
          >
            {confLabel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Location</span>
          <span className="text-white font-mono">
            {formatCoords(hotspot.lat, hotspot.lon)}
            {grid ? ` (${grid})` : ""}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-2 py-2 border-t border-white/10 flex items-center">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 transition-colors duration-150"
        >
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(flyoutContent, document.body);
}

FireFlyout.displayName = "FireFlyout";

export default FireFlyout;
