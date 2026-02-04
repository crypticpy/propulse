/**
 * MapFlyout Component
 *
 * A click action menu overlay for map views providing location-based
 * actions like setting a target, adding a pin, or researching a grid.
 * Uses glassmorphism styling and supports click-outside/escape dismissal.
 *
 * Features:
 * - Auto-dismiss when mouse moves away (configurable)
 * - Fade animation on dismiss
 * - Smart positioning to stay on screen
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FeasibilityBadge } from "./FeasibilityBadge";
import { useFeasibility } from "@/hooks/useFeasibility";
import { useUserStore, useUIInteractionPrefs } from "@/stores/userStore";

/** Action types available in the flyout menu */
export type MapFlyoutAction =
  | "setTarget"
  | "addPin"
  | "researchGrid"
  | "watchGrid";

export interface MapFlyoutProps {
  /** Whether the flyout is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** Latitude of the clicked location */
  lat: number;
  /** Longitude of the clicked location */
  lon: number;
  /** Maidenhead grid locator */
  grid: string;
  /** Callback when an action is selected */
  onAction: (action: MapFlyoutAction) => void;
  /** Callback to close the flyout */
  onClose: () => void;
  /** Callback to open AddPinDialog with location data */
  onOpenAddPinDialog?: (lat: number, lon: number, grid: string) => void;
  /** Callback to open GridResearchPanel for a grid */
  onOpenResearchPanel?: (grid: string) => void;
  /** Callback to add a grid to the watch list */
  onWatchGrid?: (grid: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Flyout dimensions for positioning calculations */
const FLYOUT_WIDTH = 200;
const FLYOUT_HEIGHT = 180;
const EDGE_PADDING = 10;
/** Offset from cursor when showing flyout */
const CURSOR_OFFSET = 15;

/**
 * Format coordinate for display (e.g., "47.6N" or "122.3W")
 */
function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
  return `${Math.abs(val).toFixed(1)}${dir}`;
}

/** Action button configuration */
interface ActionButton {
  action: MapFlyoutAction;
  icon: string;
  label: string;
  title: string;
}

const ACTION_BUTTONS: ActionButton[] = [
  {
    action: "setTarget",
    icon: "\uD83C\uDFAF",
    label: "Set Target",
    title: "Set this location as path analysis target",
  },
  {
    action: "addPin",
    icon: "\uD83D\uDCCC",
    label: "Add Pin",
    title: "Bookmark this location",
  },
  {
    action: "researchGrid",
    icon: "\uD83D\uDD0D",
    label: "Research Grid",
    title: "View detailed grid information",
  },
  {
    action: "watchGrid",
    icon: "\uD83D\uDC41\uFE0F",
    label: "Watch Grid",
    title: "Watch this grid for DX activity",
  },
];

/**
 * MapFlyout Component
 *
 * Renders an action menu overlay with location-based actions.
 * Dismisses on click outside or Escape key press.
 */
export function MapFlyout({
  visible,
  position,
  lat,
  lon,
  grid,
  onAction,
  onClose,
  onOpenAddPinDialog,
  onOpenResearchPanel,
  onWatchGrid,
  className = "",
}: MapFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const { station } = useUserStore();
  const homeGrid = station?.grid || "";

  // Get UI interaction preferences for auto-dismiss settings
  const uiPrefs = useUIInteractionPrefs();
  const autoDismissEnabled = uiPrefs.flyoutAutoDismissEnabled;
  const autoDismissMs = uiPrefs.flyoutAutoDismissMs;

  // Auto-dismiss state
  const [isFading, setIsFading] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInFlyoutRef = useRef(false);

  // Padding around flyout for mouse proximity detection
  const PROXIMITY_PADDING = 50;

  // Calculate feasibility when flyout is visible and we have a home grid
  const feasibility = useFeasibility({
    fromGrid: homeGrid,
    toGrid: grid,
  });

  // Calculate adjusted position to keep flyout on screen
  // Default: slightly up and to the right of cursor
  // Flips to left if near right edge, above if near bottom
  const adjustedPosition = useMemo(() => {
    const { x, y } = position;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    let adjustedX: number;
    let adjustedY: number;

    // X position: default to right of cursor, flip to left if near right edge
    const spaceOnRight = viewportWidth - x - EDGE_PADDING;
    const spaceOnLeft = x - EDGE_PADDING;

    if (spaceOnRight >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      // Enough space on right - show to the right of cursor
      adjustedX = x + CURSOR_OFFSET;
    } else if (spaceOnLeft >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      // Not enough on right, flip to left
      adjustedX = x - FLYOUT_WIDTH - CURSOR_OFFSET;
    } else {
      // Not enough space on either side - center horizontally and clamp
      adjustedX = Math.max(
        EDGE_PADDING,
        Math.min(
          x - FLYOUT_WIDTH / 2,
          viewportWidth - FLYOUT_WIDTH - EDGE_PADDING,
        ),
      );
    }

    // Y position: default to slightly above cursor, flip below if near top
    const spaceAbove = y - EDGE_PADDING;
    const spaceBelow = viewportHeight - y - EDGE_PADDING;

    if (spaceAbove >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      // Enough space above - show above cursor (offset up)
      adjustedY = y - FLYOUT_HEIGHT - CURSOR_OFFSET;
    } else if (spaceBelow >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      // Not enough above, flip to below
      adjustedY = y + CURSOR_OFFSET;
    } else {
      // Not enough space either way - clamp to visible area
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

  // Format coordinates for display
  const formattedCoords = useMemo(() => {
    return `${formatCoord(lat, true)}, ${formatCoord(lon, false)}`;
  }, [lat, lon]);

  // Handle click outside to dismiss
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout to avoid immediate dismissal from the triggering click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, onClose]);

  // Handle Escape key to dismiss
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

  // Auto-dismiss when mouse leaves flyout proximity area
  useEffect(() => {
    if (!visible || !autoDismissEnabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!flyoutRef.current) return;

      const rect = flyoutRef.current.getBoundingClientRect();
      const isNear =
        e.clientX >= rect.left - PROXIMITY_PADDING &&
        e.clientX <= rect.right + PROXIMITY_PADDING &&
        e.clientY >= rect.top - PROXIMITY_PADDING &&
        e.clientY <= rect.bottom + PROXIMITY_PADDING;

      if (isNear) {
        // Mouse is near - clear any pending dismiss timer
        mouseInFlyoutRef.current = true;
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        // Cancel fading if it started
        if (isFading) {
          setIsFading(false);
        }
      } else {
        // Mouse moved away - start dismiss timer if not already running
        if (mouseInFlyoutRef.current && !dismissTimerRef.current) {
          mouseInFlyoutRef.current = false;
          dismissTimerRef.current = setTimeout(() => {
            // Start fade animation
            setIsFading(true);
            // Close after fade completes
            setTimeout(() => {
              onClose();
            }, 200); // Match CSS transition duration
          }, autoDismissMs);
        }
      }
    };

    // Track mouse movement
    document.addEventListener("mousemove", handleMouseMove);

    // Initially mark mouse as near (flyout just opened)
    mouseInFlyoutRef.current = true;

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [visible, autoDismissEnabled, autoDismissMs, isFading, onClose]);

  // Reset fading state when flyout becomes visible
  useEffect(() => {
    if (visible) {
      setIsFading(false);
    }
  }, [visible]);

  // Handle action button click
  const handleActionClick = useCallback(
    (action: MapFlyoutAction) => {
      // Handle special actions with dedicated callbacks
      switch (action) {
        case "addPin":
          if (onOpenAddPinDialog) {
            onOpenAddPinDialog(lat, lon, grid);
            onClose();
            return;
          }
          break;
        case "researchGrid":
          if (onOpenResearchPanel) {
            onOpenResearchPanel(grid);
            onClose();
            return;
          }
          break;
        case "watchGrid":
          if (onWatchGrid) {
            onWatchGrid(grid);
            onClose();
            return;
          }
          break;
      }
      // Fall back to generic action handler
      onAction(action);
      onClose();
    },
    [
      onAction,
      onClose,
      onOpenAddPinDialog,
      onOpenResearchPanel,
      onWatchGrid,
      lat,
      lon,
      grid,
    ],
  );

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  const flyoutContent = (
    <div
      ref={flyoutRef}
      className={`
        fixed z-50
        bg-gray-900/90 backdrop-blur-md
        border border-white/10 rounded-lg
        shadow-xl
        transition-all duration-200
        ${isFading ? "opacity-0 scale-95" : visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: FLYOUT_WIDTH,
      }}
      role="menu"
      aria-label="Map location actions"
    >
      {/* Header with grid, coordinates, and feasibility */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="text-white font-mono font-bold text-sm">{grid}</div>
          {homeGrid && feasibility.level !== "unlikely" && (
            <FeasibilityBadge
              level={feasibility.level}
              isGrayline={feasibility.isGrayline}
              size="sm"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-gray-400 text-xs font-mono">
            {formattedCoords}
          </div>
          {feasibility.isGrayline && (
            <span
              className="text-amber-400 text-xs"
              title="Enhanced propagation near terminator"
            >
              Grayline
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="py-1">
        {ACTION_BUTTONS.map((button) => (
          <button
            key={button.action}
            onClick={() => handleActionClick(button.action)}
            className="
              w-full px-3 py-2
              flex items-center gap-2
              text-left text-sm text-gray-200
              hover:bg-white/10
              transition-colors duration-150
            "
            role="menuitem"
            title={button.title}
          >
            <span className="text-base">{button.icon}</span>
            <span>{button.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // Render via portal to document.body
  return createPortal(flyoutContent, document.body);
}

MapFlyout.displayName = "MapFlyout";

export default MapFlyout;
