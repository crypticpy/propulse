import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  pathPointHoverText,
  type PathPointSet,
} from "@/lib/spots/pathPoints";
import {
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";
import { PathPointCard } from "./PathPointCard";
import { PathPointList } from "./PathPointList";
import { useMapSurfaceFocus } from "./MapSurfaceContext";

const CARD_WIDTH = 340;
const CARD_HEIGHT = 460;
const HOVER_WIDTH = 260;
const HOVER_HEIGHT = 64;
const EDGE_PADDING = 10;
const FALLBACK_ANCHOR: ScreenAnchor = { x: 80, y: 80 };

export type PathPointInspectorOpen = "closed" | "hover" | "card" | "path";

export interface PathPointInspectorProps {
  pointSet: PathPointSet;
  selectedId: string | null;
  hoveredId: string | null;
  open: PathPointInspectorOpen;
  anchor: ScreenAnchor | null;
  pathSummary?: string;
  portalTarget?: Element | null;
  /** Skip the document portal when already mounted through drei Html. */
  inline?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onOpenPathAnalysis?: () => void;
  onOpenList?: () => void;
}

export function PathPointInspector({
  pointSet,
  selectedId,
  hoveredId,
  open,
  anchor,
  pathSummary,
  portalTarget,
  inline = false,
  onSelect,
  onClose,
  onOpenPathAnalysis,
  onOpenList,
}: PathPointInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  // Whether focus actually entered this panel while it was open (#824, Codex
  // round 3). See `PinFlyout.tsx` for the full reasoning. This one has a real
  // body-origin path where focus never enters: clicking the path trace
  // itself (`RayPathArc`'s `onTraceClick`) opens the panel in "path" overview
  // mode with no `selectedId`, so `PathPointList`'s own mount-time focus
  // effect early-returns and nothing inside ever takes focus unless the user
  // tabs in. Closing from there without ever having done so must not move
  // focus to the map surface.
  const heldFocusRef = useRef(false);
  const focusMapSurface = useMapSurfaceFocus();
  const selected = pointSet.points.find((point) => point.id === selectedId) ?? null;
  const hovered = pointSet.points.find((point) => point.id === hoveredId) ?? null;
  const showPanel = open === "card" || open === "path";
  const showHover = open === "hover" && hovered && !showPanel;

  const frame = resolveOverlayFrame(portalTarget);
  const panelAnchor = anchor ?? FALLBACK_ANCHOR;
  const panelPosition = useMemo(() => {
    if (!showPanel) return null;
    return placeAnchoredOverlayInFrame(
      panelAnchor,
      { width: CARD_WIDTH, height: CARD_HEIGHT },
      frame,
      { axis: "horizontal", gap: 14, padding: EDGE_PADDING },
    );
  }, [frame, panelAnchor, showPanel]);

  const hoverPosition = useMemo(() => {
    if (!anchor || !showHover) return null;
    return placeAnchoredOverlayInFrame(
      anchor,
      { width: HOVER_WIDTH, height: HOVER_HEIGHT },
      frame,
      { axis: "vertical", gap: 10, padding: EDGE_PADDING },
    );
  }, [anchor, frame, showHover]);

  useEffect(() => {
    if (!showPanel) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A modal dialog opened above this inspector (e.g. a weather-alert
      // flow reachable through the drei `Html` wrapper's pointer-events-none
      // area) must get Escape instead of this window-capture handler
      // swallowing it before `document` capture listeners ever see it.
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, showPanel]);

  // Focus home (#797/#824). The panel opens from a 3D hit-test (never a DOM
  // focus change) and does not steal focus into itself, but `PathPointList`
  // and `PathPointCard` render real tabbable content, so a keyboard user can
  // Tab into the panel while it is open. If `open` then leaves "card"/"path"
  // while that content holds focus, the panel unmounts and the browser drops
  // focus to `<body>`.
  useEffect(() => {
    if (!showPanel) return;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const active = document.activeElement;
    previousFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    heldFocusRef.current = false;
    const root = panelRef.current;
    const handleFocusIn = () => {
      heldFocusRef.current = true;
    };
    root?.addEventListener("focusin", handleFocusIn);
    return () => {
      root?.removeEventListener("focusin", handleFocusIn);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      // Gate the whole restore on focus having actually died with this
      // panel, not just the deferred fallback below (#824). See
      // `PinFlyout.tsx` for the full mutation-phase reasoning: by the time
      // this cleanup runs, `activeElement === body` means focus died with
      // the panel; anything else means a live element legitimately owns
      // focus and must not be yanked back.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
        return;
      }
      // Deferred one tick for the same reason as `SpotCollectionPopover`
      // (#824): nothing in this component's own close paths chains into
      // another overlay's mount today, but calling this inline would make
      // that true for the next caller who wires one up, silently, and the
      // deferred form costs nothing when nothing else is watching.
      // Cancelled if setup runs again (#824, found by Codex on PR #842).
      // Under StrictMode the effect runs setup -> cleanup -> setup on mount,
      // so the simulated cleanup schedules this timer while the overlay is
      // in fact still open; without the cancel it fires and moves focus to
      // the surface, and merely hovering changes keyboard focus in dev. Any
      // re-run of setup means the overlay is open again, which makes a
      // pending fallback stale by definition.
      // You cannot restore what was never taken (#824, Codex round 3): the
      // "path" overview mode opens with no `selectedId`, so nothing inside
      // this panel takes focus unless the user tabs in.
      if (!heldFocusRef.current) return;
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        if (document.activeElement === document.body) focusMapSurface?.();
      }, 0);
    };
  }, [focusMapSurface, showPanel]);

  const overlay = (
    <>
      <button
        type="button"
        className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80] focus:rounded-md focus:border focus:border-cyan-400/40 focus:bg-su-canvas focus:px-3 focus:py-2 focus:text-[12px] focus:text-su-text"
        onClick={() => onOpenList?.()}
      >
        Path points
      </button>
      {showHover && hovered && hoverPosition && (
        <div
          role="tooltip"
          className="pointer-events-none z-[75] max-w-[260px] rounded-md border border-su-line/50 bg-su-canvas/95 px-2.5 py-1.5 text-[11px] text-su-text shadow-lg"
          style={{
            position: frame.position,
            left: hoverPosition.x,
            top: hoverPosition.y,
          }}
        >
          {pathPointHoverText(hovered)}
        </div>
      )}
      {showPanel && panelPosition && (
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Path point details"
          className="pointer-events-auto z-[80] flex max-h-[calc(100vh-20px)] w-[min(340px,calc(100vw-20px))] flex-col overflow-hidden rounded-xl border border-su-line/50 bg-su-canvas/95 text-su-text shadow-2xl"
          style={{
            position: frame.position,
            left: panelPosition.x,
            top: panelPosition.y,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <PathPointList
            points={pointSet.points}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <PathPointCard
            point={open === "path" ? null : selected}
            status={pointSet.status}
            unavailableReason={pointSet.unavailableReason}
            pathSummary={pathSummary}
            onClose={onClose}
            onOpenPathAnalysis={onOpenPathAnalysis}
          />
        </section>
      )}
    </>
  );

  if (inline || typeof document === "undefined") return overlay;
  return createPortal(overlay, portalTarget ?? document.body);
}
