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

import { useEffect, useRef, useMemo, useLayoutEffect, useState } from "react";
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

  const [bounds, setBounds] = useState({ width: FLYOUT_WIDTH, height: FLYOUT_HEIGHT });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight,
  }));
  useLayoutEffect(() => {
    if (!visible || !flyoutRef.current) return;
    const element = flyoutRef.current;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setBounds((previous) => previous.width === width && previous.height === height ? previous : { width, height });
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [visible, hotspot]);
  const adjustedPosition = useMemo(() => {
    const x = position.x + CURSOR_OFFSET + bounds.width > viewport.width - EDGE_PADDING
      ? position.x - bounds.width - CURSOR_OFFSET : position.x + CURSOR_OFFSET;
    const y = position.y + CURSOR_OFFSET + bounds.height > viewport.height - EDGE_PADDING
      ? position.y - bounds.height - CURSOR_OFFSET : position.y + CURSOR_OFFSET;
    return {
      x: Math.max(EDGE_PADDING, Math.min(x, viewport.width - bounds.width - EDGE_PADDING)),
      y: Math.max(EDGE_PADDING, Math.min(y, viewport.height - bounds.height - EDGE_PADDING)),
    };
  }, [position, bounds, viewport]);

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
      className="fixed z-[200] bg-su-canvas/95 backdrop-blur-md border border-su-line/40 rounded-xl shadow-2xl transition-all duration-150"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: "20rem",
        maxWidth: "calc(100vw - 20px)",
        maxHeight: "calc(100vh - 20px)",
        overflowY: "auto",
        borderTopColor: "#ff4422",
        borderTopWidth: "2px",
      }}
      role="dialog"
      aria-label="Active fire detection"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-su-line/40">
        <div className="flex items-center gap-2">
          <span className="text-base flex-shrink-0">{"🔥"}</span>
          <span className="text-su-text font-semibold text-sm leading-tight flex-1 min-w-0 truncate">
            Active Fire Detection
          </span>
        </div>
        <div className="text-xs text-su-muted mt-0.5 font-mono">
          NASA FIRMS · VIIRS (last 24h)
        </div>
      </div>

      {/* Detection details */}
      <div className="px-3 py-2 space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-su-muted">Fire radiative power</span>
          <span className="text-su-text font-mono">
            {hotspot.frp.toFixed(1)} MW
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-su-muted">Brightness temp</span>
          <span className="text-su-text font-mono">
            {hotspot.brightness.toFixed(0)} K
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-su-muted">Confidence</span>
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
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="text-su-muted">Location</span>
          <span className="text-su-text font-mono">
            {formatCoords(hotspot.lat, hotspot.lon)}
            {grid ? ` (${grid})` : ""}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-2 py-2 border-t border-su-line/40 flex items-center">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium bg-su-line/10 text-su-muted hover:bg-su-line/20 border border-su-line/40 transition-colors duration-150"
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
