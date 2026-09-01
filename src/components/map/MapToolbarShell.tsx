import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { MapToolbarLayout } from "./mapToolbarLayout";

interface SecondaryControlContext {
  closeMenu: () => void;
  inMenu: boolean;
}

interface MoreMapControlsProps {
  compact: boolean;
  renderControls: (context: SecondaryControlContext) => ReactNode;
}

function MoreMapControls({
  compact,
  renderControls,
}: MoreMapControlsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState({
    left: 16,
    top: 0,
    width: 360,
    maxHeight: 0,
  });

  const closeMenu = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);
  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const panelGap = 6;
    const width = Math.max(
      0,
      Math.min(360, window.innerWidth - viewportPadding * 2),
    );
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - width - viewportPadding,
    );
    const naturalHeight = Math.max(
      panelRef.current?.scrollHeight ?? 0,
      panelRef.current?.getBoundingClientRect().height ?? 0,
    );
    const viewportHeight = Math.max(
      0,
      window.innerHeight - viewportPadding * 2,
    );
    const spaceBelow = Math.max(
      0,
      window.innerHeight - viewportPadding - rect.bottom - panelGap,
    );
    const spaceAbove = Math.max(
      0,
      rect.top - viewportPadding - panelGap,
    );
    const placeAbove = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
    const availableHeight = placeAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(
      naturalHeight || viewportHeight,
      availableHeight,
      viewportHeight,
    );
    const top = placeAbove
      ? Math.max(viewportPadding, rect.top - panelGap - maxHeight)
      : Math.min(
          rect.bottom + panelGap,
          window.innerHeight - viewportPadding - maxHeight,
        );

    setPanelPosition({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const focusFrame = window.requestAnimationFrame(() => {
      const firstControl = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (firstControl ?? panelRef.current)?.focus();
    });

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeMenu();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [closeMenu, open, updatePanelPosition]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 ${
          open
            ? "bg-white/15 text-white"
            : "text-gray-300 hover:bg-white/10 hover:text-white"
        } ${compact ? "justify-center" : "gap-1.5"}`}
        aria-label="More map controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="More map controls"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="2.5" cy="7" r="1.25" />
          <circle cx="7" cy="7" r="1.25" />
          <circle cx="11.5" cy="7" r="1.25" />
        </svg>
        {!compact && <span>More</span>}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[240] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-void-black/95 p-3 shadow-2xl backdrop-blur-md"
            style={panelPosition}
            role="dialog"
            aria-label="More map controls"
            tabIndex={-1}
          >
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
              More map controls
            </div>
            <div className="flex flex-col items-start gap-1.5">
              {renderControls({ closeMenu, inMenu: true })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface MapToolbarShellProps {
  layout: MapToolbarLayout;
  primaryControls: ReactNode;
  renderSecondaryControls: (context: SecondaryControlContext) => ReactNode;
  statusControls: ReactNode;
  toolbarRef: RefObject<HTMLDivElement>;
  viewsControl: ReactNode;
}

export function MapToolbarShell({
  layout,
  primaryControls,
  renderSecondaryControls,
  statusControls,
  toolbarRef,
  viewsControl,
}: MapToolbarShellProps) {
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Map controls"
      className={`flex flex-shrink-0 gap-2 border-b border-white/5 bg-void-black/50 px-3 py-1.5 ${
        layout.stacked ? "flex-wrap items-center" : "items-center"
      }`}
      data-tour="layer-controls"
      data-toolbar-layout={
        layout.stacked
          ? "stacked"
          : layout.iconOnly
            ? "compact"
            : layout.useOverflowMenu
              ? "condensed"
              : "wide"
      }
    >
      <div
        className={`flex min-w-0 flex-1 items-center gap-2 ${
          layout.stacked ? "w-full flex-wrap" : ""
        }`}
        data-testid="map-toolbar-primary"
      >
        {primaryControls}
        {layout.useOverflowMenu ? (
          <MoreMapControls
            compact={layout.iconOnly}
            renderControls={renderSecondaryControls}
          />
        ) : (
          renderSecondaryControls({ closeMenu: () => undefined, inMenu: false })
        )}
      </div>

      <div
        className={`ml-auto flex shrink-0 items-center justify-end gap-2 ${
          layout.stacked ? "w-full border-t border-white/5 pt-1" : ""
        }`}
        data-testid="map-toolbar-trailing"
      >
        {statusControls}
        {viewsControl}
      </div>
    </div>
  );
}

export default MapToolbarShell;
