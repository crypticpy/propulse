import { useEffect, useRef } from "react";
import type { PathPointDescriptor } from "@/lib/views/spotContracts";
import { pathPointListLabel } from "@/lib/spots/pathPoints";

export interface PathPointListProps {
  points: PathPointDescriptor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PathPointList({
  points,
  selectedId,
  onSelect,
}: PathPointListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const selected = listRef.current.querySelector(
      `[data-point-id="${selectedId}"]`,
    );
    if (selected instanceof HTMLElement) selected.focus();
  }, [selectedId]);

  if (points.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-su-muted">
        No inspectable path points.
      </p>
    );
  }

  const selectedIndex = Math.max(
    0,
    points.findIndex((point) => point.id === selectedId),
  );

  const move = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(points.length - 1, nextIndex));
    const next = points[clamped];
    if (next) onSelect(next.id);
  };

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label="Path points"
      className="max-h-40 overflow-y-auto border-b border-su-line/40"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(selectedIndex + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(selectedIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(points.length - 1);
        }
      }}
    >
      {points.map((point) => {
        const selected = point.id === selectedId;
        return (
          <li key={point.id} role="presentation">
            <button
              type="button"
              role="option"
              data-point-id={point.id}
              aria-selected={selected}
              tabIndex={selected || (!selectedId && point.id === points[0]?.id) ? 0 : -1}
              onClick={() => onSelect(point.id)}
              className={`block w-full px-3 py-1.5 text-left text-[11px] ${
                selected
                  ? "bg-cyan-400/15 text-su-text"
                  : "text-su-muted hover:bg-su-line/10 hover:text-su-text"
              }`}
            >
              {pathPointListLabel(point)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
