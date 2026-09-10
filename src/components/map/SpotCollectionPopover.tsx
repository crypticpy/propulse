import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { LiveSpot } from "@/types/livespot";
import {
  getSpotPresentationSource,
  normalizePresentableSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import { formatActivationFrequency } from "@/lib/map/activationMarkers";
import {
  placeAnchoredOverlay,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";
import { getModeColor, modeInk } from "@/lib/utils/spotColors";
import {
  formatSpotAge,
  getAgeBadgeColors,
  getSpotAgeInfo,
} from "./LiveSpotArcs";
import { useMapSurfaceFocus } from "./MapSurfaceContext";

export interface SpotCollectionPopoverProps {
  visible: boolean;
  position: ScreenAnchor;
  title: string;
  subtitle?: string;
  spots: readonly PresentableSpot[];
  onClose: () => void;
  onSpotSelect: (spot: LiveSpot) => void;
  onMapTheseSpots?: () => void;
}

const POPOVER_WIDTH = 330;
const POPOVER_HEIGHT = 430;
const EDGE_PADDING = 10;

function formatFrequency(spot: PresentableSpot) {
  if (spot.activation) {
    const value = formatActivationFrequency(spot.frequency);
    return `${value} ${spot.frequency >= 1000 ? "MHz" : "kHz"}`;
  }
  const frequencyKhz = spot.frequency;
  return frequencyKhz >= 1000
    ? `${(frequencyKhz / 1000).toFixed(3)} MHz`
    : `${frequencyKhz.toFixed(1)} kHz`;
}

/** Shared member list for clusters, aggregate pins, collectors, and grids. */
export function SpotCollectionPopover({
  visible,
  position,
  title,
  subtitle,
  spots,
  onClose,
  onSpotSelect,
  onMapTheseSpots,
}: SpotCollectionPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstSpotRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const focusMapSurface = useMapSurfaceFocus();
  const sortedSpots = useMemo(
    () =>
      [...spots].sort((a, b) => {
        const aTime =
          a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
        const bTime =
          b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
        return bTime - aTime;
      }),
    [spots],
  );
  const summary = useMemo(() => {
    const modes = new Map<string, number>();
    const bands = new Set<string>();
    for (const spot of spots) {
      const mode = spot.mode?.toUpperCase() || "UNKNOWN";
      modes.set(mode, (modes.get(mode) || 0) + 1);
      if (spot.band) bands.add(spot.band);
    }
    return {
      modes: [...modes.entries()].sort((a, b) => b[1] - a[1]),
      bands: bands.size,
    };
  }, [spots]);

  const adjustedPosition = useMemo(() => {
    const viewport = {
      width: typeof window === "undefined" ? 1920 : window.innerWidth,
      height: typeof window === "undefined" ? 1080 : window.innerHeight,
    };
    return placeAnchoredOverlay(
      position,
      {
        width: Math.min(POPOVER_WIDTH, viewport.width - EDGE_PADDING * 2),
        height: Math.min(POPOVER_HEIGHT, viewport.height - EDGE_PADDING * 2),
      },
      viewport,
      { axis: "horizontal", gap: 12, padding: EDGE_PADDING },
    );
  }, [position]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!visible) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };
    const timeout = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, onClose, visible]);

  useEffect(() => {
    if (!visible || sortedSpots.length === 0) return;
    // `document.body` is not a restore target (see `SelectedSpotCard`): every
    // opener for this popover is a canvas hit-test or a touch tap, neither of
    // which focuses anything, so the pre-open activeElement is body far more
    // often than not.
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const timeout = window.setTimeout(() => firstSpotRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timeout);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      // Gate the whole restore on focus having actually died with this
      // popover, not just the deferred fallback below (#824). See
      // `PinFlyout.tsx` for the full mutation-phase reasoning: by the time
      // this cleanup runs, `activeElement === body` means focus died with
      // the popover; anything else means a live element legitimately owns
      // focus and must not be yanked back.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
        return;
      }
      // Only when nothing else has focus (#797/#824). A row click that opens
      // `SelectedSpotCard` clears this popover in the same commit, so this
      // cleanup and the card's own mount effect can both run before either
      // element repaints. If this fired synchronously here, the map surface
      // would already hold focus by the time the card's mount effect reads
      // `document.activeElement`, and the card would wrongly capture the
      // surface as ITS `previousFocus` — turning its own close-time fallback
      // guard into an unconditional restore that steals focus from whatever
      // the user tabs to next. Deferring one tick lets every same-commit
      // sibling's mount effect capture the real (pre-fallback) activeElement
      // first; the sibling's own focus-in timer (also `setTimeout(0)`, always
      // scheduled after this one) then wins.
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
  }, [focusMapSurface, sortedSpots.length, visible]);
  if (!visible || sortedSpots.length === 0) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${title}: ${sortedSpots.length} spots`}
      className="fixed z-[65] flex max-h-[calc(100vh-20px)] w-[min(330px,calc(100vw-20px))] flex-col overflow-hidden rounded-xl border border-su-line/50 bg-deep-space/95 text-su-text shadow-2xl backdrop-blur-xl"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3 border-b border-su-line/40 px-3 py-2.5">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-signal-green">
            {title}
          </div>
          <div className="mt-0.5 text-xs text-su-muted">
            {subtitle || "Select a station to target and inspect"}
          </div>
        </div>
        <button
          type="button"
          className="rounded p-1 text-su-muted hover:bg-su-line/20 hover:text-su-text"
          onClick={onClose}
          aria-label="Close spot collection"
        >
          ×
        </button>
      </div>

      <div className="overflow-y-auto p-1">
        {sortedSpots.map((rawSpot, index) => {
          const spot = normalizePresentableSpot(rawSpot);
          // Activation reports retain their provider outside LiveSpot.source
          // so they remain transport-compatible. Resolve presentation from the
          // richer raw shape before normalization strips that type information.
          const sourcePresentation = getSpotPresentationSource(rawSpot);
          const time =
            spot.time instanceof Date ? spot.time : new Date(spot.time);
          const modeColor = getModeColor(spot.mode);
          const modeInkColor = modeInk(spot.mode);
          const ageColors = getAgeBadgeColors(
            getSpotAgeInfo(time).ageCategory,
          );
          return (
            <button
              type="button"
              ref={index === 0 ? firstSpotRef : undefined}
              key={spot.id || `${spot.dx}-${spot.frequency}-${index}`}
              onClick={() => onSpotSelect(spot)}
              className="group w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-su-line/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signal-green"
              aria-label={`Select ${spot.dx} and view details`}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-su-text">
                  {spot.dx}
                </span>
                <span className="font-mono text-xs text-su-muted">
                  {formatFrequency(rawSpot)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {spot.band && (
                  <span className="rounded bg-su-line/20 px-1 py-0.5 text-xs font-bold text-su-muted">
                    {spot.band}
                  </span>
                )}
                {spot.mode && (
                  <span
                    className="rounded px-1 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: modeColor, color: modeInkColor }}
                  >
                    {spot.mode}
                  </span>
                )}
                <span
                  className="rounded px-1 py-0.5 text-xs"
                  style={{
                    backgroundColor: sourcePresentation.bgColor,
                    color: sourcePresentation.color,
                  }}
                >
                  {sourcePresentation.label}
                </span>
                <span
                  className={`rounded border px-1 py-0.5 text-xs ${ageColors.bg} ${ageColors.text} ${ageColors.border}`}
                >
                  {formatSpotAge(time)}
                </span>
                {spot.snr !== undefined && (
                  <span className="ml-auto font-mono text-xs text-cyan-300">
                    {spot.snr} dB
                  </span>
                )}
              </div>
              {(spot.dxGrid || spot.comment) && (
                <div className="mt-1 truncate text-xs text-su-muted">
                  {spot.dxGrid || "Grid unavailable"}
                  {spot.comment ? ` · ${spot.comment}` : ""}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-su-line/40 px-3 py-2 text-xs text-su-muted">
        <span className="truncate">
          {summary.modes
            .slice(0, 3)
            .map(([mode, count]) => `${mode} ${count}`)
            .join(" · ")}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {onMapTheseSpots && (
            <button
              type="button"
              className="rounded border border-signal-green/40 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-signal-green hover:bg-signal-green/10"
              onClick={onMapTheseSpots}
            >
              Map these spots
            </button>
          )}
          <span>
            {summary.bands} band{summary.bands === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

SpotCollectionPopover.displayName = "SpotCollectionPopover";

export default SpotCollectionPopover;
