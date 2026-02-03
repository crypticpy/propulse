/**
 * SpotContextMenu Component
 *
 * A right-click context menu for DX spots providing quick access to
 * common operations like setting targets, watching callsigns/grids,
 * copying data, and opening external lookups.
 *
 * Uses glassmorphism styling consistent with GlobeFlyout.
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { DXSpot } from "@/types/dxcluster";

/** Available context menu actions */
export type SpotContextAction =
  | "setTarget"
  | "researchGrid"
  | "watchCallsign"
  | "watchGrid"
  | "copyFrequency"
  | "copyCallsign"
  | "openQRZ"
  | "openClubLog"
  | "hideSpot";

export interface SpotContextMenuProps {
  /** The spot to show context menu for */
  spot: DXSpot;
  /** Screen position for the menu */
  position: { x: number; y: number };
  /** Callback when menu should close */
  onClose: () => void;
  /** Callback when an action is selected */
  onAction: (action: SpotContextAction, spot: DXSpot) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Menu dimensions for positioning calculations */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 320; // Approximate max height with all items
const EDGE_PADDING = 10;

/** Menu item configuration */
interface MenuItem {
  action: SpotContextAction;
  icon: string;
  label: string;
  title: string;
  shortcut?: string;
  /** Whether to show a separator after this item */
  divider?: boolean;
  /** Dynamic label function based on spot data */
  getLabel?: (spot: DXSpot) => string;
  /** Whether to hide this item based on spot data */
  isHidden?: (spot: DXSpot) => boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    action: "setTarget",
    icon: "\uD83D\uDCCD", // pin/target emoji
    label: "Set as Target",
    title: "Set this location as path analysis target",
    shortcut: "T",
  },
  {
    action: "researchGrid",
    icon: "\uD83D\uDD0D", // magnifying glass
    label: "Research Grid",
    title: "View detailed grid information",
    shortcut: "R",
    isHidden: (spot) => !spot.dxGrid,
  },
  {
    action: "watchCallsign",
    icon: "\uD83D\uDC41\uFE0F", // eye
    label: "Watch Callsign",
    title: "Watch this callsign for activity",
    getLabel: (spot) => `Watch ${spot.dx}`,
    divider: true,
  },
  {
    action: "watchGrid",
    icon: "\uD83D\uDC41\uFE0F", // eye
    label: "Watch Grid",
    title: "Watch this grid for activity",
    getLabel: (spot) => `Watch ${spot.dxGrid?.slice(0, 4) || "Grid"}`,
    isHidden: (spot) => !spot.dxGrid,
  },
  {
    action: "copyFrequency",
    icon: "\uD83D\uDCCB", // clipboard
    label: "Copy Frequency",
    title: "Copy frequency to clipboard",
    shortcut: "F",
    divider: true,
  },
  {
    action: "copyCallsign",
    icon: "\uD83D\uDCCB", // clipboard
    label: "Copy Callsign",
    title: "Copy callsign to clipboard",
    shortcut: "C",
  },
  {
    action: "openQRZ",
    icon: "\uD83D\uDD17", // link
    label: "Open on QRZ.com",
    title: "View station details on QRZ.com",
    shortcut: "Q",
    divider: true,
  },
  {
    action: "openClubLog",
    icon: "\uD83D\uDD17", // link
    label: "Open on ClubLog",
    title: "View log search on ClubLog",
  },
  {
    action: "hideSpot",
    icon: "\u274C", // X mark
    label: "Hide this Spot",
    title: "Hide this spot from the list",
    divider: true,
  },
];

/**
 * SpotContextMenu Component
 *
 * Renders a context menu at the specified position with spot-specific actions.
 * Dismisses on click outside or Escape key press.
 */
export function SpotContextMenu({
  spot,
  position,
  onClose,
  onAction,
  className = "",
}: SpotContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate adjusted position to keep menu on screen
  const adjustedPosition = useMemo(() => {
    const { x, y } = position;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    let adjustedX: number;
    let adjustedY: number;

    // X position: prefer right of cursor, flip to left if near right edge
    if (x + MENU_WIDTH + EDGE_PADDING <= viewportWidth) {
      adjustedX = x;
    } else {
      adjustedX = Math.max(EDGE_PADDING, x - MENU_WIDTH);
    }

    // Y position: prefer below cursor, flip above if near bottom edge
    if (y + MENU_HEIGHT + EDGE_PADDING <= viewportHeight) {
      adjustedY = y;
    } else {
      adjustedY = Math.max(EDGE_PADDING, y - MENU_HEIGHT);
    }

    return { x: adjustedX, y: adjustedY };
  }, [position]);

  // Filter menu items based on spot data
  const visibleItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => !item.isHidden?.(spot));
  }, [spot]);

  // Handle click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  // Handle menu item click
  const handleItemClick = useCallback(
    (action: SpotContextAction) => {
      onAction(action, spot);
      onClose();
    },
    [onAction, onClose, spot],
  );

  // Handle Escape key and keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Check for keyboard shortcuts (single key press, no modifiers)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toUpperCase();
        const item = visibleItems.find((item) => item.shortcut === key);
        if (item) {
          e.preventDefault();
          handleItemClick(item.action);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, visibleItems, handleItemClick]);

  const menuContent = (
    <div
      ref={menuRef}
      className={`
        fixed z-[100]
        bg-gray-900/95 backdrop-blur-md
        border border-white/10 rounded-lg
        shadow-xl shadow-black/50
        py-1
        animate-in fade-in zoom-in-95 duration-150
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: MENU_WIDTH,
      }}
      role="menu"
      aria-label="Spot context menu"
    >
      {/* Header with spot info */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="text-white font-mono font-bold text-sm">{spot.dx}</div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono">
            {(spot.frequency / 1000).toFixed(3)} MHz
          </span>
          {spot.mode && <span className="text-gray-500">({spot.mode})</span>}
        </div>
        {spot.dxGrid && (
          <div className="text-xs text-cyan-400/70 font-mono mt-0.5">
            {spot.dxGrid}
          </div>
        )}
      </div>

      {/* Menu items */}
      <div className="py-1">
        {visibleItems.map((item, index) => {
          const label = item.getLabel?.(spot) || item.label;
          const showDivider = item.divider && index < visibleItems.length - 1;

          return (
            <div key={item.action}>
              <button
                onClick={() => handleItemClick(item.action)}
                className="
                  w-full px-3 py-2
                  flex items-center justify-between gap-2
                  text-left text-sm text-gray-200
                  hover:bg-white/10
                  transition-colors duration-100
                "
                role="menuitem"
                title={item.title}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm w-5 text-center">{item.icon}</span>
                  <span>{label}</span>
                </div>
                {item.shortcut && (
                  <span className="text-xs text-gray-500 font-mono">
                    {item.shortcut}
                  </span>
                )}
              </button>
              {showDivider && <div className="my-1 border-t border-white/10" />}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render via portal to document.body
  return createPortal(menuContent, document.body);
}

SpotContextMenu.displayName = "SpotContextMenu";

export default SpotContextMenu;
