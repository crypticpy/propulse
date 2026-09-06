/**
 * FloatingPanel Component
 *
 * Draggable + resizable panel for Pro mode full-screen map view.
 * Uses native PointerEvent API for smooth drag and resize interactions.
 * Designed for glass-morphism overlay panels (BandConditions, PathAnalysis, DXSpotList, etc.).
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FloatingPanelProps {
  id: string;
  title: string;

  // Position & size (percentage of viewport for responsiveness)
  defaultPosition: { x: number; y: number }; // 0-100 percentage
  defaultSize: { width: number; height: number }; // pixels
  minSize?: { width: number; height: number }; // default 200x100
  maxSize?: { width: number; height: number }; // default 800x600

  /** Bottom of the toolbar; title bars stay below this viewport coordinate. */
  minTop?: number;

  // State
  collapsed?: boolean;
  onCollapse?: () => void;

  // Persistence callback
  onLayoutChange?: (layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;

  // Restore from persisted layout
  persistedLayout?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;

  // Styling
  className?: string;
  headerClassName?: string;

  // Z-index management
  zIndex?: number;
  onFocus?: () => void; // called when panel is clicked, parent brings to front

  /** Called during drag with current panel position + dimensions.
   *  May return a snapped {x, y} to override position. */
  onDragMove?: (
    panelId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => { x: number; y: number } | void;
  /** Called when drag ends with final position + dimensions */
  onDragEnd?: (
    panelId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  /** External snap target indicator to render */
  snapTarget?: {
    edge: "top" | "bottom" | "left" | "right";
    position: number;
  } | null;
  /** When set, overrides panel width (controlled by dock group) */
  dockGroupWidth?: number;
  /** Called when panel width changes via resize (for dock group propagation) */
  onResizeWidth?: (panelId: string, newWidth: number) => void;
  /** Icon for collapsed pill display */
  icon?: React.ReactNode;

  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MIN_SIZE = { width: 200, height: 100 };
const DEFAULT_MAX_SIZE = { width: 800, height: 600 };
const TITLE_BAR_HEIGHT = 32;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamp panel position so at least 50% of panel width remains visible */
function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  minTop = 0,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return {
    x: clamp(x, 0, Math.max(0, vw - width)),
    y: clamp(y, minTop, Math.max(minTop, vh - height)),
  };
}

/** Resolve the largest panel size that still leaves its bottom-right edge in
 * the viewport. The configured minimum wins on very small screens so content
 * never becomes unusably narrow just to satisfy an impossible viewport fit. */
function clampSizeToViewport(
  width: number,
  height: number,
  position: { x: number; y: number },
  minSize: { width: number; height: number },
  maxSize: { width: number; height: number },
): { width: number; height: number; maxWidth: number; maxHeight: number } {
  const maxWidth = Math.min(
    maxSize.width,
    Math.max(0, window.innerWidth - Math.max(0, position.x) - 4),
  );
  const maxHeight = Math.min(
    maxSize.height,
    Math.max(0, window.innerHeight - Math.max(0, position.y) - 4),
  );

  return {
    width: clamp(width, Math.min(minSize.width, maxWidth), maxWidth),
    height: clamp(height, Math.min(minSize.height, maxHeight), maxHeight),
    maxWidth,
    maxHeight,
  };
}

/** Restore saved geometry by fitting its size first, then moving the complete
 * panel into view. This avoids shrinking a panel to zero merely because its
 * saved origin came from a larger monitor. */
function fitLayoutToViewport(
  layout: { x: number; y: number; width: number; height: number },
  minSize: { width: number; height: number },
  maxSize: { width: number; height: number },
  minTop = 0,
) {
  const maxWidth = Math.min(
    maxSize.width,
    Math.max(0, window.innerWidth - 4),
  );
  const maxHeight = Math.min(
    maxSize.height,
    Math.max(0, window.innerHeight - minTop - 4),
  );
  const width = clamp(
    layout.width,
    Math.min(minSize.width, maxWidth),
    maxWidth,
  );
  const height = clamp(
    layout.height,
    Math.min(minSize.height, maxHeight),
    maxHeight,
  );
  return {
    ...clampPosition(layout.x, layout.y, width, height, minTop),
    width,
    height,
  };
}

/** Get CSS styles for a snap indicator line */
function getSnapIndicatorStyle(target: {
  edge: string;
  position: number;
}): React.CSSProperties {
  const base: React.CSSProperties = {
    background: "rgba(0, 220, 220, 0.6)",
    boxShadow: "0 0 8px rgba(0, 220, 220, 0.4)",
  };
  switch (target.edge) {
    case "top":
      return { ...base, left: 0, right: 0, top: target.position, height: 2 };
    case "bottom":
      return { ...base, left: 0, right: 0, top: target.position - 2, height: 2 };
    case "left":
      return { ...base, top: 0, bottom: 0, left: target.position, width: 2 };
    case "right":
      return { ...base, top: 0, bottom: 0, left: target.position - 2, width: 2 };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloatingPanel({
  id,
  title,
  defaultPosition,
  defaultSize,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = DEFAULT_MAX_SIZE,
  minTop = 0,
  collapsed = false,
  onCollapse,
  onLayoutChange,
  persistedLayout,
  className = "",
  headerClassName = "",
  zIndex,
  onFocus,
  onDragMove,
  onDragEnd,
  snapTarget,
  dockGroupWidth,
  onResizeWidth,
  icon,
  children,
}: FloatingPanelProps): React.ReactElement {
  // ---- Resolve initial layout (clamped to viewport) ----
  const rawLayout = persistedLayout ?? {
    x: (defaultPosition.x / 100) * window.innerWidth,
    y: (defaultPosition.y / 100) * window.innerHeight,
    width: defaultSize.width,
    height: defaultSize.height,
  };
  const initialLayout = fitLayoutToViewport(rawLayout, minSize, maxSize, minTop);

  // ---- Layout state (only updated on interaction END for perf) ----
  const [layout, setLayout] = useState(initialLayout);

  // ---- Refs for interaction-in-progress (avoid re-renders during drag/resize) ----
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragStart = useRef({ pointerX: 0, pointerY: 0, panelX: 0, panelY: 0 });
  const resizeStart = useRef({
    pointerX: 0,
    pointerY: 0,
    width: 0,
    height: 0,
  });

  // Keep a mutable ref of the latest layout for clamping during window resize
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const persistedX = persistedLayout?.x;
  const persistedY = persistedLayout?.y;
  const persistedWidth = persistedLayout?.width;
  const persistedHeight = persistedLayout?.height;

  // Keep the mounted panel in sync when its persisted geometry is replaced
  // externally (for example by the toolbar's Reset Layout action or an
  // imported workspace). useState only consumes its initializer once, so
  // without this bridge the store resets while the visible panel stays put
  // until Pro mode is closed and reopened.
  useEffect(() => {
    if (
      persistedX === undefined ||
      persistedY === undefined ||
      persistedWidth === undefined ||
      persistedHeight === undefined ||
      isDragging.current ||
      isResizing.current
    ) {
      return;
    }

    const nextLayout = fitLayoutToViewport(
      {
        x: persistedX,
        y: persistedY,
        width: persistedWidth,
        height: persistedHeight,
      },
      minSize,
      maxSize,
      minTop,
    );
    const current = layoutRef.current;

    if (
      current.x === nextLayout.x &&
      current.y === nextLayout.y &&
      current.width === nextLayout.width &&
      current.height === nextLayout.height
    ) {
      return;
    }

    layoutRef.current = nextLayout;
    setLayout(nextLayout);
  }, [
    persistedX,
    persistedY,
    persistedWidth,
    persistedHeight,
    minSize,
    maxSize,
    minTop,
  ]);

  // ---- Drag handlers ----
  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only primary button
      if (e.button !== 0) return;

      isDragging.current = true;
      dragStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panelX: layoutRef.current.x,
        panelY: layoutRef.current.y,
      };

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      document.body.classList.add("select-none");

      // Drag visual feedback — via direct DOM for zero re-renders
      const el = panelRef.current;
      if (el) {
        el.style.opacity = "0.92";
        el.style.boxShadow = "0 25px 60px rgba(0,0,0,0.5)";
        el.style.transform = "scale(1.01)";
      }

      onFocus?.();
    },
    [onFocus],
  );

  const handleDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;

      const dx = e.clientX - dragStart.current.pointerX;
      const dy = e.clientY - dragStart.current.pointerY;
      const newX = dragStart.current.panelX + dx;
      const newY = dragStart.current.panelY + dy;
      const clamped = clampPosition(
        newX,
        newY,
        layoutRef.current.width,
        layoutRef.current.height,
        minTop,
      );

      // Direct DOM update for smoothness (no React re-render)
      const el = panelRef.current;
      if (el) {
        el.style.left = `${clamped.x}px`;
        el.style.top = `${clamped.y}px`;
      }

      // Notify docking hook — may return snapped position
      const snapped = onDragMove?.(
        id,
        clamped.x,
        clamped.y,
        layoutRef.current.width,
        layoutRef.current.height,
      );

      const finalPosition = clampPosition(
        snapped?.x ?? clamped.x,
        snapped?.y ?? clamped.y,
        layoutRef.current.width,
        layoutRef.current.height,
        minTop,
      );
      const { x: finalX, y: finalY } = finalPosition;

      // Apply snapped position to DOM if it differs
      if (snapped && el) {
        el.style.left = `${finalX}px`;
        el.style.top = `${finalY}px`;
      }

      // Store in ref for commit on pointer up
      layoutRef.current = { ...layoutRef.current, x: finalX, y: finalY };
    },
    [id, minTop, onDragMove],
  );

  const handleDragPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;

      isDragging.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      document.body.classList.remove("select-none");

      // Reset drag visual feedback
      const el = panelRef.current;
      if (el) {
        el.style.opacity = "";
        el.style.boxShadow = "";
        el.style.transform = "";
      }

      // Commit to React state
      const newLayout = { ...layoutRef.current };
      setLayout(newLayout);
      onLayoutChange?.(newLayout);

      onDragEnd?.(
        id,
        newLayout.x,
        newLayout.y,
        newLayout.width,
        newLayout.height,
      );
    },
    [id, onLayoutChange, onDragEnd],
  );

  // ---- Resize handlers ----
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation(); // prevent drag from firing

      isResizing.current = true;
      resizeStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        width: layoutRef.current.width,
        height: layoutRef.current.height,
      };

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      document.body.classList.add("select-none");
      onFocus?.();
    },
    [onFocus],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing.current) return;

      const dx = e.clientX - resizeStart.current.pointerX;
      const dy = e.clientY - resizeStart.current.pointerY;
      // Respect the panel's configured maximum while also preventing the
      // bottom-right handle from growing beyond the current viewport. A very
      // large configured max is useful for wide forecast strips on 4K walls,
      // but must remain safe on a laptop-sized viewport.
      const resized = clampSizeToViewport(
        resizeStart.current.width + dx,
        resizeStart.current.height + dy,
        layoutRef.current,
        minSize,
        maxSize,
      );

      // Direct DOM update
      const el = panelRef.current;
      if (el) {
        el.style.width = `${resized.width}px`;
        el.style.height = `${resized.height}px`;
      }

      layoutRef.current = {
        ...layoutRef.current,
        width: resized.width,
        height: resized.height,
      };
    },
    [minSize, maxSize],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing.current) return;

      isResizing.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      document.body.classList.remove("select-none");

      const committed = { ...layoutRef.current };
      setLayout(committed);
      onLayoutChange?.(committed);

      onResizeWidth?.(id, committed.width);
    },
    [id, onLayoutChange, onResizeWidth],
  );

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!e.key.startsWith("Arrow")) return;

      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 50 : 10;
      const current = layoutRef.current;
      const widthDelta =
        e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
      const heightDelta =
        e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
      const resized = clampSizeToViewport(
        current.width + widthDelta,
        current.height + heightDelta,
        current,
        minSize,
        maxSize,
      );
      const committed = {
        ...current,
        width: resized.width,
        height: resized.height,
      };

      layoutRef.current = committed;
      setLayout(committed);
      onLayoutChange?.(committed);
      if (widthDelta !== 0) onResizeWidth?.(id, committed.width);
      onFocus?.();
    },
    [id, maxSize, minSize, onFocus, onLayoutChange, onResizeWidth],
  );

  // ---- Window resize: re-clamp position ----
  useEffect(() => {
    const handleWindowResize = () => {
      const cur = layoutRef.current;
      const nextLayout = fitLayoutToViewport(cur, minSize, maxSize, minTop);
      if (
        nextLayout.x !== cur.x ||
        nextLayout.y !== cur.y ||
        nextLayout.width !== cur.width ||
        nextLayout.height !== cur.height
      ) {
        layoutRef.current = nextLayout;
        setLayout(nextLayout);

        const el = panelRef.current;
        if (el) {
          el.style.left = `${nextLayout.x}px`;
          el.style.top = `${nextLayout.y}px`;
          el.style.width = `${nextLayout.width}px`;
          el.style.height = `${nextLayout.height}px`;
        }

        // Persist the usable geometry so another render cannot restore the
        // oversized layout that this viewport just corrected.
        onLayoutChange?.(nextLayout);
        if (nextLayout.width !== cur.width) {
          onResizeWidth?.(id, nextLayout.width);
        }
      }
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [id, maxSize, minSize, minTop, onLayoutChange, onResizeWidth]);

  // ---- Focus on pointer down anywhere ----
  const handlePanelPointerDown = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  // ---- Effective width (dock group may override) ----
  const effectiveWidth = dockGroupWidth ?? layout.width;
  const resizeLimits = clampSizeToViewport(
    layout.width,
    layout.height,
    layout,
    minSize,
    maxSize,
  );

  // ---- Render: Collapsed pill mode ----
  if (collapsed) {
    return (
      <>
        <div
          ref={panelRef}
          className="fixed bg-black/70 backdrop-blur-md border border-white/20 rounded-full shadow-lg
                     hover:bg-white/10 transition-all duration-150 px-3 py-1.5 flex items-center gap-2 select-none"
          style={{
            left: layout.x,
            top: layout.y,
            zIndex: zIndex ?? "auto",
            cursor: "grab",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            onFocus?.();
            // Start drag
            isDragging.current = true;
            dragStart.current = {
              pointerX: e.clientX,
              pointerY: e.clientY,
              panelX: layoutRef.current.x,
              panelY: layoutRef.current.y,
            };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!isDragging.current) return;
            const dx = e.clientX - dragStart.current.pointerX;
            const dy = e.clientY - dragStart.current.pointerY;
            const newX = dragStart.current.panelX + dx;
            const newY = dragStart.current.panelY + dy;
            const clamped = clampPosition(
              newX,
              newY,
              panelRef.current?.offsetWidth || 120,
              TITLE_BAR_HEIGHT,
              minTop,
            );
            const el = panelRef.current;
            if (el) {
              el.style.left = `${clamped.x}px`;
              el.style.top = `${clamped.y}px`;
            }
            layoutRef.current = {
              ...layoutRef.current,
              x: clamped.x,
              y: clamped.y,
            };
          }}
          onPointerUp={(e) => {
            if (!isDragging.current) return;
            isDragging.current = false;
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            const newLayout = { ...layoutRef.current };
            setLayout(newLayout);
            onLayoutChange?.({
              x: newLayout.x,
              y: newLayout.y,
              width: newLayout.width,
              height: newLayout.height,
            });
          }}
          onClick={(e) => {
            // Only toggle if we didn't drag (detect minimal movement)
            if (
              Math.abs(e.clientX - dragStart.current.pointerX) < 5 &&
              Math.abs(e.clientY - dragStart.current.pointerY) < 5
            ) {
              onCollapse?.();
            }
          }}
        >
          {icon && <span className="text-white/60 flex-shrink-0">{icon}</span>}
          <span className="text-[11px] font-medium text-white/80 whitespace-nowrap">
            {title.length > 12 ? title.slice(0, 12) + "\u2026" : title}
          </span>
        </div>
        {snapTarget && (
          <div
            className="fixed pointer-events-none z-[9999]"
            style={getSnapIndicatorStyle(snapTarget)}
          />
        )}
      </>
    );
  }

  // ---- Render: Expanded panel ----
  return (
    <>
      <div
        ref={panelRef}
        id={`floating-panel-${id}`}
        className={`group fixed bg-black/60 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl overflow-hidden ${className}`}
        style={{
          left: layout.x,
          top: layout.y,
          width: effectiveWidth,
          height: layout.height,
          zIndex: zIndex ?? "auto",
          transition:
            "opacity 150ms ease, box-shadow 150ms ease, transform 150ms ease",
        }}
        onPointerDown={handlePanelPointerDown}
      >
        {/* Title bar (drag handle) */}
        <div
          className={`flex items-center gap-1.5 bg-white/5 border-b border-white/10 px-3 py-1.5 cursor-grab active:cursor-grabbing ${headerClassName}`}
          style={{ touchAction: "none", height: TITLE_BAR_HEIGHT }}
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
        >
          {/* 6-dot drag grip icon */}
          <svg
            className="w-3 h-4 text-white/30 flex-shrink-0"
            viewBox="0 0 6 10"
            fill="currentColor"
          >
            <circle cx="1.5" cy="1.5" r="1" />
            <circle cx="4.5" cy="1.5" r="1" />
            <circle cx="1.5" cy="5" r="1" />
            <circle cx="4.5" cy="5" r="1" />
            <circle cx="1.5" cy="8.5" r="1" />
            <circle cx="4.5" cy="8.5" r="1" />
          </svg>

          {/* Title */}
          <span className="flex-1 text-xs font-medium text-white/80 truncate select-none">
            {title}
          </span>

          {/* Collapse/expand chevron */}
          {onCollapse && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              className="p-1 text-white/40 hover:text-white transition-colors rounded hover:bg-white/10"
              aria-label="Collapse panel"
            >
              <svg
                className="w-3.5 h-3.5 transition-transform duration-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Content area */}
        <div
          className="overflow-auto"
          style={{ height: `calc(100% - ${TITLE_BAR_HEIGHT}px)` }}
        >
          {children}
        </div>

        {/* Resize handle (bottom-right corner) — 20px touch target, visual grip stays small */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70 transition-opacity flex items-end justify-end pr-0.5 pb-0.5"
          style={{ touchAction: "none" }}
          role="separator"
          aria-label={`Resize ${title} panel`}
          aria-orientation="vertical"
          aria-valuemin={Math.round(minSize.width)}
          aria-valuemax={Math.round(resizeLimits.maxWidth)}
          aria-valuenow={Math.round(layout.width)}
          aria-valuetext={`${Math.round(layout.width)} by ${Math.round(layout.height)} pixels`}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onKeyDown={handleResizeKeyDown}
        >
          {/* Diagonal grip lines */}
          <svg
            className="w-3 h-3 text-white/40"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          >
            <line x1="6" y1="1" x2="1" y2="6" />
            <line x1="6" y1="4" x2="4" y2="6" />
          </svg>
        </div>
      </div>

      {/* Snap indicator overlay */}
      {snapTarget && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={getSnapIndicatorStyle(snapTarget)}
        />
      )}
    </>
  );
}
