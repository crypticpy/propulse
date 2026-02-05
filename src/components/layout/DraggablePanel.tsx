/**
 * DraggablePanel Component (QoL11)
 *
 * Wrapper that adds collapse/hide controls and drag handles to any panel.
 * Used by the customizable dashboard layout system.
 */

import { useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DraggablePanelProps {
  id: string;
  title: string;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  onHide?: (id: string) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: (id: string, dropIndex: number) => void;
  draggable?: boolean;
  className?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DraggablePanel({
  id,
  title,
  collapsed = false,
  onToggleCollapse,
  onHide,
  onDragStart,
  onDragEnd,
  draggable = true,
  className = "",
  children,
}: DraggablePanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true);
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      onDragStart?.(id);
    },
    [id, onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("text/plain");
      if (draggedId && draggedId !== id) {
        const panel = panelRef.current;
        if (panel) {
          const siblings = Array.from(panel.parentElement?.children ?? []);
          const dropIndex = siblings.indexOf(panel);
          onDragEnd?.(draggedId, dropIndex);
        }
      }
    },
    [id, onDragEnd],
  );

  return (
    <div
      ref={panelRef}
      className={`group/panel relative ${isDragging ? "opacity-50" : ""} ${className}`}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag handle - visible on hover */}
      {draggable && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/panel:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10">
          <svg
            className="w-3 h-6 text-gray-500"
            viewBox="0 0 6 16"
            fill="currentColor"
          >
            <circle cx="1.5" cy="2" r="1.2" />
            <circle cx="4.5" cy="2" r="1.2" />
            <circle cx="1.5" cy="6" r="1.2" />
            <circle cx="4.5" cy="6" r="1.2" />
            <circle cx="1.5" cy="10" r="1.2" />
            <circle cx="4.5" cy="10" r="1.2" />
            <circle cx="1.5" cy="14" r="1.2" />
            <circle cx="4.5" cy="14" r="1.2" />
          </svg>
        </div>
      )}

      {/* Panel controls - visible on hover */}
      <div className="absolute -right-1 top-0 flex items-center gap-0.5 opacity-0 group-hover/panel:opacity-100 transition-opacity z-10">
        {onToggleCollapse && (
          <button
            onClick={() => onToggleCollapse(id)}
            className="p-0.5 text-gray-500 hover:text-white transition-colors rounded"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg
              className={`w-3 h-3 transition-transform ${collapsed ? "rotate-180" : ""}`}
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
        {onHide && (
          <button
            onClick={() => onHide(id)}
            className="p-0.5 text-gray-500 hover:text-alert-red transition-colors rounded"
            title="Hide panel"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      {collapsed ? (
        <div
          className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
          onClick={() => onToggleCollapse?.(id)}
        >
          <span className="text-xs text-gray-400 font-medium">{title}</span>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
