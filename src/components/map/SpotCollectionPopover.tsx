import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { LiveSpot } from "@/types/livespot";
import {
  getSpotPresentationSource,
  normalizePresentableSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";
import { formatActivationFrequency } from "@/lib/map/activationMarkers";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import {
  computeSpotCollectionPopoverLayout,
  deriveWallVisibleSpotCount,
  readRootFontPx,
  resolveSpotCollectionPortalElement,
  resolveWallRowHeights,
  ROOT_FONT_PX_DEFAULT,
} from "./spotCollectionPopoverLayout";
import { getModeColor, modeInk } from "@/lib/utils/spotColors";
import {
  formatSpotAge,
  getAgeBadgeColors,
  getSpotAgeInfo,
} from "./LiveSpotArcs";
import { useFocusHome } from "./hooks/useFocusHome";

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
  const wallListRef = useRef<HTMLDivElement>(null);
  // Real heights of the rows that are currently rendered, in render order.
  // The rem budgets are only an estimate: the badge line is `flex-wrap`, so a
  // clamped width or a large text scale makes a row taller than any
  // single-line formula predicts (#879 review round 4).
  const [measuredRowHeights, setMeasuredRowHeights] = useState<number[]>([]);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  // The wall row budgets are rem, so the cap has to know the real root font
  // size: the text-scale control takes it from 14.4px to 22px, and a 16px
  // assumption over-rendered the clipped wall body at lg/xl (#879 round 3).
  const [rootFontPx, setRootFontPx] = useState(ROOT_FONT_PX_DEFAULT);
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

  // Resolved once per open session per `portalTarget` identity, NOT from
  // `layout.portalElement`: that value is recomputed on every host resize, and
  // a host that dips below the usability threshold mid-resize would otherwise
  // swap the portal container, remount the popover, and drop keyboard focus to
  // `<body>` (#879 review round). The focus effect below also lists it as a
  // dependency so any container change that does happen re-runs focus setup.
  const portalElement = useMemo(
    () => (visible ? resolveSpotCollectionPortalElement(portalTarget) : null),
    [portalTarget, visible],
  );

  // The frame is computed from the LOCKED container, never from the raw
  // `portalTarget`: an open session that portals into `document.body` must
  // keep the fixed viewport frame even after the host becomes usable again,
  // or the panel is placed in host-local coordinates while its children hang
  // off `body` (#879 review round 4).
  const layout = useMemo(
    () =>
      computeSpotCollectionPopoverLayout(
        position,
        portalElement,
        boundsHost,
        layoutEpoch,
      ),
    [boundsHost, layoutEpoch, portalElement, position],
  );

  // Per-row heights, not a count: rows carrying a grid or comment render a
  // third line, so the cap has to budget them individually (#879 review).
  // Measured heights win; an unrendered row inherits the tallest measured
  // height of its own kind (detail vs two-line), which is why no extra probe
  // row has to be rendered to size the boundary row. The rem estimate is the
  // pre-paint fallback only.
  const wallRowHeights = useMemo(
    () => resolveWallRowHeights(sortedSpots, measuredRowHeights, rootFontPx),
    [measuredRowHeights, rootFontPx, sortedSpots],
  );

  const wallVisibleCount = useMemo(
    () =>
      isWallCanvas
        ? deriveWallVisibleSpotCount(
            layout.maxHeight,
            wallRowHeights,
            rootFontPx,
          )
        : sortedSpots.length,
    [
      isWallCanvas,
      layout.maxHeight,
      rootFontPx,
      sortedSpots.length,
      wallRowHeights,
    ],
  );

  // Rows shown when the wall's no-scroll rule caps the list instead of
  // scrolling it. `sortedSpots` itself (and its `.length`) is left untouched
  // — focus-home depends on the full count, not the wall-visible slice.
  const visibleSpots = isWallCanvas
    ? sortedSpots.slice(0, wallVisibleCount)
    : sortedSpots;
  const hiddenSpotCount = sortedSpots.length - visibleSpots.length;

  // Measured after paint, inside the same layout epoch that placed the
  // popover: `offsetHeight` of every rendered row. jsdom (and any pre-layout
  // pass) reports 0, which `resolveWallRowHeights` reads as "not measured".
  useLayoutEffect(() => {
    if (!visible || !isWallCanvas) return;
    const rows = wallListRef.current?.querySelectorAll<HTMLElement>(
      "[data-spot-row]",
    );
    if (!rows) return;
    const next = Array.from(rows, (row) => row.offsetHeight);
    setMeasuredRowHeights((previous) =>
      previous.length === next.length &&
      previous.every((height, index) => height === next[index])
        ? previous
        : next,
    );
  }, [
    isWallCanvas,
    layoutEpoch,
    rootFontPx,
    sortedSpots,
    visible,
    visibleSpots.length,
  ]);

  useEffect(() => {
    if (!visible) return;

    const measureRootFontPx = () => setRootFontPx(readRootFontPx());
    const bumpLayout = () => {
      measureRootFontPx();
      setLayoutEpoch((epoch) => epoch + 1);
    };
    measureRootFontPx();
    const observedHosts = [portalTarget, boundsHost].filter(
      (host): host is Element =>
        host instanceof Element &&
        host !== document.body &&
        host !== document.documentElement,
    );

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(bumpLayout);
      for (const host of observedHosts) observer.observe(host);
    }

    // The text-scale control rewrites `data-text-scale` on the root element,
    // which changes the root font size without any resize of the host.
    let scaleObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== "undefined") {
      scaleObserver = new MutationObserver(measureRootFontPx);
      scaleObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-text-scale", "style", "class"],
      });
    }

    window.addEventListener("resize", bumpLayout);
    return () => {
      observer?.disconnect();
      scaleObserver?.disconnect();
      window.removeEventListener("resize", bumpLayout);
    };
  }, [boundsHost, portalTarget, visible]);

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

  useFocusHome(visible && sortedSpots.length > 0, panelRef);

  useEffect(() => {
    if (!visible || sortedSpots.length === 0) return;
    const timeout = window.setTimeout(() => firstSpotRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  // `portalElement` is a dependency so a container change re-runs the
    // first-row focus (see its resolution above; it is stable while open,
    // which is what keeps that from ever being needed in practice).
  }, [portalElement, sortedSpots.length, visible]);
  if (!visible || sortedSpots.length === 0) return null;

  const { frame, overlaySize, maxHeight, screenLeft, screenTop } = layout;
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
          isWallCanvas
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "min-h-0 overflow-y-auto p-1"
        }
      >
        <div
          ref={wallListRef}
          className={
            isWallCanvas ? "min-h-0 flex-1 overflow-hidden p-1" : undefined
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
              data-spot-row=""
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
        {isWallCanvas && hiddenSpotCount > 0 && (
          <div className="shrink-0 px-2.5 py-2 text-center font-mono text-xs font-semibold text-su-muted">
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
    portalElement ?? document.body,
  );
}

SpotCollectionPopover.displayName = "SpotCollectionPopover";

export default SpotCollectionPopover;
