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
import { useFocusHome } from "./hooks/useFocusHome";

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
  /** Suppress the built-in keyboard trigger when the host renders one per
   * path instead (`RayPathInspectorOverlay`: two arcs, two triggers, one
   * arbitrated panel). */
  hideTrigger?: boolean;
  /** Overrides the trigger's label so two of them can be told apart. */
  triggerLabel?: string;
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
  hideTrigger = false,
  triggerLabel = "Path points",
  onSelect,
  onClose,
  onOpenPathAnalysis,
  onOpenList,
}: PathPointInspectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Focus home (#797/#824/#848). The panel opens from a 3D hit-test and
  // does not steal focus into itself, but `PathPointList` and `PathPointCard`
  // render real tabbable content. Closing from path-overview mode without
  // ever tabbing in must not move focus to the map surface.
  useFocusHome(showPanel, panelRef);

  const overlay = (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className="pointer-events-auto sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[80] focus:rounded-md focus:border focus:border-cyan-400/40 focus:bg-su-canvas focus:px-3 focus:py-2 focus:text-xs focus:text-su-text"
          onClick={() => onOpenList?.()}
        >
          {triggerLabel}
        </button>
      )}
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
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-su-line/40 px-3 py-2.5">
            <div className="min-w-0">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-signal-green">
                Path point details
              </h2>
              <p className="mt-0.5 text-xs text-su-muted">
                Modeled bounce points along the active path
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-su-muted transition-colors hover:bg-su-line/20 hover:text-su-text"
              aria-label="Close path point details"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path
                  d="M3 3l8 8M11 3l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
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
            onOpenPathAnalysis={onOpenPathAnalysis}
          />
        </section>
      )}
    </>
  );

  if (inline || typeof document === "undefined") return overlay;
  return createPortal(overlay, portalTarget ?? document.body);
}
