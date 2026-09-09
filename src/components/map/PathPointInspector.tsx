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
