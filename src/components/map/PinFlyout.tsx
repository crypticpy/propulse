/**
 * PinFlyout Component
 *
 * A hover flyout overlay for pin markers on the PropSphere globe.
 * Shows pin-specific information including name, grid, category,
 * feasibility, notes, recent DX activity, and open bands.
 *
 * Uses glassmorphism styling and supports auto-dismiss, escape,
 * and click-outside dismissal (matching MapFlyout patterns).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FeasibilityBadge } from "./FeasibilityBadge";
import { useFeasibility } from "@/hooks/useFeasibility";
import { useUserStore, useUIInteractionPrefs } from "@/stores/userStore";
import type { MapPin } from "@/types/pin";
import { getCategoryMeta } from "@/types/pin";
import type { DXSpot } from "@/types/dxcluster";
import { getModeColor, inkOnFill } from "@/lib/utils/spotColors";
import { useMapSurfaceFocus } from "./MapSurfaceContext";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PinFlyoutProps {
  /** Whether the flyout is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** Full pin object */
  pin: MapPin;
  /** All current DX spots (for activity lookup) */
  spots: DXSpot[];
  /** Current target grid (to show "Currently targeted" badge) */
  currentTargetGrid?: string;
  /** Callback to set this pin as path analysis target */
  onSetTarget: (lat: number, lon: number, grid: string) => void;
  /** Select a recent spot through the canonical map details flow. */
  onSpotSelect?: (spot: DXSpot, position: { x: number; y: number }) => void;
  /** Callback to open pin editor */
  onEditPin: (pin: MapPin) => void;
  /** Callback to delete this pin */
  onDeletePin?: () => void;
  /** Callback to close the flyout */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Flyout dimensions for positioning calculations */
const FLYOUT_WIDTH = 240;
const FLYOUT_HEIGHT = 280;
const EDGE_PADDING = 10;
/** Offset from cursor when showing flyout */
const CURSOR_OFFSET = 15;
/** Padding around flyout for mouse proximity detection */
const PROXIMITY_PADDING = 50;
/** Maximum number of recent spots to display */
const MAX_RECENT_SPOTS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format coordinate for display (e.g., "47.6N" or "122.3W")
 */
function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
  return `${Math.abs(val).toFixed(1)}${dir}`;
}

/**
 * Format frequency for display.
 * If >= 1000 kHz, show as MHz (e.g., 14074 -> "14.074 MHz").
 * Otherwise show as kHz.
 */
function formatFrequency(freqKHz: number): string {
  if (freqKHz >= 1000) {
    return `${(freqKHz / 1000).toFixed(3)}`;
  }
  return `${freqKHz.toFixed(0)} kHz`;
}

/**
 * Compute a human-readable age string from a Date.
 * Returns e.g. "2m ago", "1h ago", etc.
 */
function formatSpotAge(spotTime: Date): string {
  const now = Date.now();
  const diffMs = now - spotTime.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMin < 1) {
    return "now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Compute expiration info from an ISO date string.
 */
function formatExpiration(expiresAt: string): {
  text: string;
  isExpired: boolean;
} {
  const expDate = new Date(expiresAt);
  const now = Date.now();
  const diffMs = expDate.getTime() - now;

  if (diffMs <= 0) {
    return { text: "Expired", isExpired: true };
  }

  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    return { text: "Expires in 1 day", isExpired: false };
  }
  return { text: `Expires in ${diffDays} days`, isExpired: false };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PinFlyout Component
 *
 * Renders a hover info overlay for a pin on the globe map.
 * Shows pin metadata, feasibility, recent DX activity, and action buttons.
 */
export function PinFlyout({
  visible,
  position,
  pin,
  spots,
  currentTargetGrid,
  onSetTarget,
  onSpotSelect,
  onEditPin,
  onDeletePin,
  onClose,
  className = "",
}: PinFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  // Whether focus actually entered this flyout while it was open (#824,
  // Codex round 3). Hovering a pin and letting the ordinary auto-dismiss
  // (mouse leaves proximity, timer closes it) close the flyout without ever
  // tabbing into its buttons leaves `previousFocusRef` null — the pre-open
  // `activeElement` was already `<body>`, since hovering never moves focus —
  // and the cleanup below still reads `activeElement === body` at close time,
  // because hovering never moved it off `<body>` in the first place. Without
  // this flag the fallback cannot distinguish "focus died with the flyout"
  // from "focus was never here to die", and fires in both cases: merely
  // hovering a pin and moving away would move keyboard focus to the map
  // surface. Set by a `focusin` listener on the flyout's own root so it only
  // reflects focus actually landing inside this overlay's content.
  const heldFocusRef = useRef(false);
  const focusMapSurface = useMapSurfaceFocus();
  const { station } = useUserStore();
  const homeGrid = station?.grid || "";

  // UI interaction preferences for auto-dismiss settings
  const uiPrefs = useUIInteractionPrefs();
  const autoDismissEnabled = uiPrefs.flyoutAutoDismissEnabled;
  const autoDismissMs = uiPrefs.flyoutAutoDismissMs;

  // Auto-dismiss state
  const [isFading, setIsFading] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mouseInFlyoutRef = useRef(false);

  // Category metadata
  const categoryMeta = useMemo(
    () => getCategoryMeta(pin.category),
    [pin.category],
  );

  // Whether this pin is the current target
  const isCurrentTarget = useMemo(() => {
    if (!currentTargetGrid || !pin.grid) {
      return false;
    }
    return pin.grid.toUpperCase() === currentTargetGrid.toUpperCase();
  }, [pin.grid, currentTargetGrid]);

  // Calculate feasibility
  const feasibility = useFeasibility({
    fromGrid: homeGrid,
    toGrid: pin.grid,
  });

  // ------- Recent activity and open bands from spots -------

  const gridPrefix = useMemo(
    () => pin.grid.substring(0, 4).toUpperCase(),
    [pin.grid],
  );

  // Single pass: filter all matching spots, derive recent + bands
  const { nearbySpots, openBands } = useMemo(() => {
    if (!gridPrefix) {
      return {
        nearbySpots: [] as DXSpot[],
        openBands: [] as { band: string; color: string }[],
      };
    }

    // Filter all spots matching this grid once
    const allMatching = spots.filter((spot) => {
      const dxMatch = spot.dxGrid
        ? spot.dxGrid.substring(0, 4).toUpperCase() === gridPrefix
        : false;
      const spotterMatch = spot.spotterGrid
        ? spot.spotterGrid.substring(0, 4).toUpperCase() === gridPrefix
        : false;
      return dxMatch || spotterMatch;
    });

    // Sort by time (most recent first) for display
    const sorted = allMatching.sort(
      (a, b) => b.time.getTime() - a.time.getTime(),
    );

    // Build band map from all matching spots (most recent mode color wins)
    const bandMap = new Map<string, string>();
    for (const spot of sorted) {
      const { band } = spot;
      if (band && !bandMap.has(band)) {
        bandMap.set(band, getModeColor(spot.mode));
      }
    }

    return {
      nearbySpots: sorted.slice(0, MAX_RECENT_SPOTS),
      openBands: Array.from(bandMap.entries()).map(([band, color]) => ({
        band,
        color,
      })),
    };
  }, [spots, gridPrefix]);

  // ------- Expiration -------

  const expirationInfo = useMemo(() => {
    if (!pin.expiresAt) {
      return null;
    }
    return formatExpiration(pin.expiresAt);
  }, [pin.expiresAt]);

  // ------- Positioning (viewport-aware) -------

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

    // Y position: default to slightly above cursor, flip below if near top
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

  // ------- Formatted coordinates -------

  const formattedCoords = useMemo(
    () => `${formatCoord(pin.lat, true)}, ${formatCoord(pin.lon, false)}`,
    [pin.lat, pin.lon],
  );

  // ------- Truncated notes -------

  const truncatedNotes = useMemo(() => {
    if (!pin.notes) {
      return null;
    }
    if (pin.notes.length <= 80) {
      return pin.notes;
    }
    return pin.notes.substring(0, 80) + "...";
  }, [pin.notes]);

  // ------- Dismissal behaviors (matching MapFlyout) -------

  // Focus home (#797/#824). This flyout opens on hover and never steals
  // focus into itself, but its own buttons are real, tabbable elements — a
  // keyboard user can Tab into "Set target"/"Edit Pin"/"Delete Pin" while the
  // mouse keeps it open. If it then closes (auto-dismiss, Escape, or a click
  // outside) while one of those buttons is focused, the browser drops focus
  // to `<body>` once the flyout unmounts, which is the gap #797 covers.
  useEffect(() => {
    if (!visible) return;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const root = flyoutRef.current;
    const active = document.activeElement;
    // Containment check for the same child-before-parent race as
    // `PathPointInspector.tsx` (#824, Codex round 4). This flyout never
    // auto-focuses anything of its own, so `active` can never already be
    // inside `root` when this setup runs — a no-op here, kept for the
    // shape's uniformity ahead of the #848 hook extraction.
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body && !root?.contains(active)
        ? active
        : null;
    heldFocusRef.current = root?.contains(active) ?? false;
    const handleFocusIn = () => {
      heldFocusRef.current = true;
    };
    root?.addEventListener("focusin", handleFocusIn);
    return () => {
      root?.removeEventListener("focusin", handleFocusIn);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      // Gate the whole restore on focus having actually died with this
      // flyout (#824). React detaches host nodes in the mutation phase,
      // before passive `useEffect` cleanups flush: if focus was inside the
      // flyout when it closed, the focused child is already detached and
      // the browser has already moved focus to `<body>` by the time this
      // cleanup runs. So `activeElement === body` means "focus died with
      // the overlay, restore it"; anything else means a live element
      // legitimately owns focus — e.g. the user tabbed to a different
      // persistent control before this closed — and must be left alone.
      // The explicit non-null check matters too: `document.activeElement`
      // can be null in a detached document, and `null !== body` would
      // otherwise skip a restore that should happen. Without this gate the
      // restore below fires unconditionally and yanks focus back to the
      // stale captured control even when it never lost focus to `<body>`;
      // the fallback branch further down already carried this guard, the
      // restore branch did not. Same reasoning applies to the identical
      // cleanup shape in `SpotCollectionPopover`, `PathPointInspector`, and
      // `SelectedSpotCard`.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      // You cannot restore what was never taken (#824 round 3; moved ahead
      // of the restore branch in round 5, Codex on PR #842): a pointer-only
      // interaction can blur a persistent control to `<body>` — e.g. a click
      // on non-focusable flyout content — without focus ever entering this
      // flyout. `<body>` here otherwise reads the same as "this overlay held
      // focus and its removal dropped it", so both the restore below and the
      // fallback beneath it must be gated on `heldFocusRef`: cleanup only
      // ever gives back focus it actually held.
      if (!heldFocusRef.current) return;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
        return;
      }
      // Deferred one tick, not called inline: "Edit Pin" closes this flyout
      // and opens `AddPinDialog` in the same click handler, so this cleanup
      // and that dialog's own focus-capture effect can land in the same
      // commit. Calling `focusMapSurface` synchronously here would move
      // focus to the surface before the dialog's mount effect reads
      // `document.activeElement`, so the dialog would capture the surface as
      // ITS restore target instead of correctly finding nothing to restore —
      // turning ITS close-time fallback into an unconditional steal later
      // (see the identical hazard fixed in `SpotCollectionPopover`, #824).
      // Cancelled if setup runs again (#824, found by Codex on PR #842).
      // Under StrictMode the effect runs setup -> cleanup -> setup on mount,
      // so the simulated cleanup schedules this timer while the overlay is
      // in fact still open; without the cancel it fires and moves focus to
      // the surface, and merely hovering changes keyboard focus in dev. Any
      // re-run of setup means the overlay is open again, which makes a
      // pending fallback stale by definition.
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        if (document.activeElement === document.body) focusMapSurface?.();
      }, 0);
    };
  }, [focusMapSurface, visible]);

  // Click outside to dismiss
  useEffect(() => {
    if (!visible) {
      return;
    }

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
    if (!visible) {
      return;
    }

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
    if (!visible || !autoDismissEnabled) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!flyoutRef.current) {
        return;
      }

      const rect = flyoutRef.current.getBoundingClientRect();
      const isNear =
        e.clientX >= rect.left - PROXIMITY_PADDING &&
        e.clientX <= rect.right + PROXIMITY_PADDING &&
        e.clientY >= rect.top - PROXIMITY_PADDING &&
        e.clientY <= rect.bottom + PROXIMITY_PADDING;

      if (isNear) {
        mouseInFlyoutRef.current = true;
        if (dismissTimerRef.current) {
          clearTimeout(dismissTimerRef.current);
          dismissTimerRef.current = null;
        }
        if (isFading) {
          setIsFading(false);
        }
      } else if (mouseInFlyoutRef.current && !dismissTimerRef.current) {
        mouseInFlyoutRef.current = false;
        dismissTimerRef.current = setTimeout(() => {
          setIsFading(true);
          setTimeout(() => {
            onClose();
          }, 200);
        }, autoDismissMs);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
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

  // ------- Action handlers -------

  const handleSetTarget = useCallback(() => {
    if (isCurrentTarget) {
      return;
    }
    onSetTarget(pin.lat, pin.lon, pin.grid);
    onClose();
  }, [pin, isCurrentTarget, onSetTarget, onClose]);

  const handleEditPin = useCallback(() => {
    onEditPin(pin);
    onClose();
  }, [pin, onEditPin, onClose]);

  const handleDeletePin = useCallback(() => {
    onDeletePin?.();
    onClose();
  }, [onDeletePin, onClose]);

  // ------- Render -------

  if (!visible) {
    return null;
  }

  const displayName = pin.name || pin.grid;

  const flyoutContent = (
    <div
      ref={flyoutRef}
      className={`
        fixed z-50
        bg-su-canvas/90 backdrop-blur-md
        border border-su-line/40 rounded-lg
        shadow-xl
        transition-all duration-200
        ${isFading ? "opacity-0 scale-95" : "opacity-100 scale-100"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        width: FLYOUT_WIDTH,
      }}
      role="dialog"
      aria-label={`Pin info: ${displayName}`}
    >
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-su-line/40">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm flex-shrink-0" aria-hidden="true">
              {categoryMeta.icon}
            </span>
            <span className="text-su-text font-semibold text-sm truncate max-w-[130px]">
              {displayName}
            </span>
            {pin.category === "friend" && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-medium border border-green-500/30">
                Friend
              </span>
            )}
          </div>
          {homeGrid && feasibility.level !== "unlikely" && (
            <FeasibilityBadge
              level={feasibility.level}
              isGrayline={feasibility.isGrayline}
              size="sm"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="text-su-muted text-xs font-mono">
            {pin.grid}
            <span className="text-su-muted mx-1">&middot;</span>
            {formattedCoords}
          </div>
        </div>
        {expirationInfo && (
          <div className="mt-1">
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                expirationInfo.isExpired
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}
            >
              {expirationInfo.text}
            </span>
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="px-3 py-1.5 border-b border-su-line/40">
        {truncatedNotes ? (
          <p className="text-su-muted text-xs leading-relaxed">
            {truncatedNotes}
          </p>
        ) : (
          <p className="text-su-muted text-xs italic">No notes</p>
        )}
      </div>

      {/* ── Recent Activity ── */}
      <div className="px-3 py-1.5 border-b border-su-line/40">
        <div className="flex items-center justify-between mb-1">
          <span className="text-su-muted text-[10px] font-medium uppercase tracking-wider">
            Recent Activity
          </span>
          {nearbySpots.length > 0 && (
            <span className="text-cyan-400 text-[10px] font-mono">
              {nearbySpots.length}
            </span>
          )}
        </div>
        {nearbySpots.length > 0 ? (
          <div className="space-y-0.5">
            {nearbySpots.map((spot) => (
              <button
                type="button"
                key={spot.id}
                disabled={!onSpotSelect}
                onClick={() => {
                  onSpotSelect?.(spot, position);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-su-line/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 disabled:pointer-events-none"
                aria-label={`Select ${spot.dx} and view details`}
              >
                <span className="text-su-text font-mono truncate max-w-[80px]">
                  {spot.dx}
                </span>
                <span className="text-su-muted font-mono text-[10px]">
                  {formatFrequency(spot.frequency)}
                </span>
                <span
                  className="rounded px-1 text-[10px] font-bold"
                  style={{
                    backgroundColor: getModeColor(spot.mode),
                    color: inkOnFill(getModeColor(spot.mode)),
                  }}
                >
                  {spot.mode || "?"}
                </span>
                <span className="text-su-muted text-[10px]">
                  {formatSpotAge(spot.time)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-su-muted text-xs italic">No recent activity</p>
        )}
      </div>

      {/* ── Open Bands (only if we have data) ── */}
      {openBands.length > 0 && (
        <div className="px-3 py-1.5 border-b border-su-line/40">
          <span className="text-su-muted text-[10px] font-medium uppercase tracking-wider block mb-1">
            Open Bands
          </span>
          <div className="flex flex-wrap gap-1">
            {openBands.map(({ band, color }) => (
              <span
                key={band}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
                style={{
                  backgroundColor: color,
                  color: inkOnFill(color),
                }}
              >
                {band}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="px-2 py-1.5 flex items-center gap-1">
        <button
          onClick={handleSetTarget}
          disabled={isCurrentTarget}
          className={`
            flex-1 flex items-center justify-center gap-1
            px-2 py-1.5 rounded
            text-xs font-medium
            transition-colors duration-150
            ${
              isCurrentTarget
                ? "bg-su-line/10 text-su-muted cursor-default"
                : "bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20"
            }
          `}
          title={
            isCurrentTarget
              ? "This pin is already the current target"
              : "Set this pin as path analysis target"
          }
        >
          <span aria-hidden="true">{"\uD83C\uDFAF"}</span>
          <span>{isCurrentTarget ? "Targeted" : "Target"}</span>
        </button>
        <button
          onClick={handleEditPin}
          className="
            flex-1 flex items-center justify-center gap-1
            px-2 py-1.5 rounded
            text-xs font-medium
            bg-su-line/10 text-su-muted hover:bg-su-line/20
            border border-su-line/40
            transition-colors duration-150
          "
          title="Edit this pin"
        >
          <span aria-hidden="true">{"\u270F\uFE0F"}</span>
          <span>Edit Pin</span>
        </button>
        {onDeletePin && (
          <button
            onClick={handleDeletePin}
            className="
              flex items-center justify-center
              px-2 py-1.5 rounded
              text-xs font-medium
              bg-red-500/10 text-red-400 hover:bg-red-500/20
              border border-red-500/20
              transition-colors duration-150
            "
            title="Delete this pin"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                fillRule="evenodd"
                d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(flyoutContent, document.body);
}

PinFlyout.displayName = "PinFlyout";

export default PinFlyout;
