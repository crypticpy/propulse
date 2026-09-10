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
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
  type OverlayFrame,
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
  /** Map-owned portal (e.g. GlobeView's `mapOverlayPortal`) to both bound
   * AND render into, matching `PathPointInspector`'s pattern. When set, the
   * popover is a DOM child of this element (`position: absolute`). Falls
   * back to `document.body` — a viewport-sized frame — when omitted. */
  portalTarget?: Element | null;
  /** A map-surface container (e.g. `AzimuthalView`/`FlatMapView`'s
   * `containerRef.current`) to bound the popover by WITHOUT portaling into
   * it — the popover still renders at `document.body` (`position: fixed`),
   * clamped to this element's rect instead of the full viewport. Ignored
   * when `portalTarget` is set. Ineffective for a view whose map host is
   * shorter than the viewport if neither prop is supplied (#846 rework). */
  boundsHost?: Element | null;
  /** True only on the HamClock wall. `HamClockView` mounts the map views
   * directly and is deliberately outside `WorkspacePage` (see
   * `useHamClockWallOperatingState.ts`'s doc comment), so
   * `useEffectiveCanvasType()` — which reads `workspaceStore` — can never
   * actually resolve to `"wall"` on the production wall mount; it only ever
   * did in tests that set `canvasTypeOverride("wall")` directly (#846/#871
   * round 3, same class of bug as PR #868: the predicate was never
   * reachable from the real mount). Threaded explicitly instead, from the
   * one literal `HAMCLOCK_WALL_CANVAS_TYPE` in
   * `useHamClockWallOperatingState.ts`, through `HamClockView` ->
   * `FlatMapView`/`AzimuthalView`/`GlobeView` ->
   * `ClusterDetailPopover`/`SpotCollectionPopover`. Defaults to `false`. */
  isWallCanvas?: boolean;
}

const POPOVER_WIDTH = 330;
const POPOVER_HEIGHT = 430;
const EDGE_PADDING = 10;
/** No in-widget scrolling on the HamClock wall (owner rule, 2026-09-05): cap
 * the list and show a "+N more" affordance instead of an internal scrollbar. */
const WALL_MAX_VISIBLE_SPOTS = 6;

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
  portalTarget,
  boundsHost,
  isWallCanvas = false,
}: SpotCollectionPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstSpotRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  // Whether focus actually entered this popover while it was open (#824,
  // Codex round 3). See `PinFlyout.tsx` for the full reasoning: without this,
  // the fallback below can't tell "focus died with the popover" from "focus
  // was never here to die". In practice this popover always focuses its own
  // first row on open, so the flag is set well before any close path can
  // reach this cleanup — this exists for uniformity with the other three
  // overlays (#848 will extract them into one hook), not because this
  // popover has an observed body-origin-close-without-entering gap.
  const heldFocusRef = useRef(false);
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

  // Rows shown when the wall's no-scroll rule caps the list instead of
  // scrolling it. `sortedSpots` itself (and its `.length`) is left untouched
  // — the focus-restore effect below depends on the full count, not the
  // wall-visible slice (see its dep array note).
  const visibleSpots = isWallCanvas
    ? sortedSpots.slice(0, WALL_MAX_VISIBLE_SPOTS)
    : sortedSpots;
  const hiddenSpotCount = sortedSpots.length - visibleSpots.length;

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
    const root = panelRef.current;
    const active = document.activeElement;
    // Containment check for the same child-before-parent race as
    // `PathPointInspector.tsx` (#824, Codex round 4). This popover's own
    // auto-focus below runs in a zero-delay timeout, which always lands
    // after this synchronous setup, so `active` is never already inside
    // `root` here — a no-op today, kept for the shape's uniformity ahead of
    // the #848 hook extraction.
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body && !root?.contains(active)
        ? active
        : null;
    heldFocusRef.current = root?.contains(active) ?? false;
    const handleFocusIn = () => {
      heldFocusRef.current = true;
    };
    root?.addEventListener("focusin", handleFocusIn);
    const timeout = window.setTimeout(() => firstSpotRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timeout);
      root?.removeEventListener("focusin", handleFocusIn);
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
      // You cannot restore what was never taken (#824 round 3; moved ahead
      // of the restore branch in round 5, Codex on PR #842): a pointer-only
      // interaction can blur a persistent control to `<body>` without focus
      // ever entering this popover. `<body>` here otherwise reads the same
      // as "this popover held focus and its removal dropped it", so both the
      // restore below and the fallback beneath it must be gated on
      // `heldFocusRef`: cleanup only ever gives back focus it actually held.
      if (!heldFocusRef.current) return;
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

  // Bound by the map host frame, not the window — a map host shorter than
  // the viewport still let this popover spill past its own bottom edge
  // (#846). `portalTarget` (an actual DOM destination) wins over `boundsHost`
  // (bounds-only, no re-parenting): resolveOverlayFrame returns "absolute"
  // for either since both are real Elements, but only a real `portalTarget`
  // means the popover is actually a child of that element — a bounds-only
  // host must stay `position: fixed` (the popover still portals to
  // `document.body`) with its frame's own `left`/`top` added back into the
  // final on-screen position below, since `placeAnchoredOverlayInFrame`
  // returns coordinates local to the frame's origin.
  const measuredHost = portalTarget ?? boundsHost;
  const rawFrame = resolveOverlayFrame(measuredHost);
  const frame: OverlayFrame =
    !portalTarget && boundsHost ? { ...rawFrame, position: "fixed" } : rawFrame;
  const overlaySize = {
    width: Math.min(POPOVER_WIDTH, frame.width - EDGE_PADDING * 2),
    height: Math.min(POPOVER_HEIGHT, frame.height - EDGE_PADDING * 2),
  };
  const adjustedPosition = placeAnchoredOverlayInFrame(
    position,
    overlaySize,
    frame,
    { axis: "horizontal", gap: 12, padding: EDGE_PADDING },
  );
  // The height the clamp above actually used to place `adjustedPosition.y`,
  // not `frame.height - padding*2` in isolation — the two disagreed
  // whenever `overlaySize.height` was clamped smaller than the frame, which
  // let the rendered box still cross the frame's bottom edge even though
  // `max-height` looked frame-bound (#871 review, F2).
  const maxHeight = Math.max(0, frame.height - adjustedPosition.y - EDGE_PADDING);
  const screenLeft =
    frame.position === "fixed" ? frame.left + adjustedPosition.x : adjustedPosition.x;
  const screenTop =
    frame.position === "fixed" ? frame.top + adjustedPosition.y : adjustedPosition.y;
  const visibleSpotLabel = isWallCanvas
    ? `${title}: showing ${visibleSpots.length} of ${sortedSpots.length} spots`
    : `${title}: ${sortedSpots.length} spots`;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={visibleSpotLabel}
      className="pointer-events-auto z-[65] flex flex-col overflow-hidden rounded-xl border border-su-line/50 bg-deep-space/95 text-su-text shadow-2xl backdrop-blur-xl"
      style={{
        position: frame.position,
        left: screenLeft,
        top: screenTop,
        width: overlaySize.width,
        maxHeight,
      }}
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

      <div
        className={
          isWallCanvas ? "min-h-0 overflow-hidden p-1" : "min-h-0 overflow-y-auto p-1"
        }
      >
        {visibleSpots.map((rawSpot, index) => {
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
        {isWallCanvas && hiddenSpotCount > 0 && (
          <div className="px-2.5 py-2 text-center font-mono text-xs font-semibold text-su-muted">
            +{hiddenSpotCount} more
          </div>
        )}
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
    portalTarget ?? document.body,
  );
}

SpotCollectionPopover.displayName = "SpotCollectionPopover";

export default SpotCollectionPopover;
