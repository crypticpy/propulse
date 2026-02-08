/**
 * DraggableEquipmentCard — A compact HTML card for equipment items in the drawer.
 *
 * Draggable via HTML5 drag-and-drop. Sets `application/x-equipment` transfer data
 * with JSON `{ type, id }` so the canvas can identify dropped equipment.
 */

import { useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type EquipmentCardType =
  | "radio"
  | "antenna"
  | "feedline"
  | "accessory"
  | "inline";

export interface DraggableEquipmentCardProps {
  id: string;
  type: EquipmentCardType;
  name: string;
  subLabel?: string;
  /** Whether this equipment is already in the active chain */
  inUse?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// ─── Border / Accent Colors by Type ─────────────────────────────────────────

const ACCENT_COLORS: Record<EquipmentCardType, string> = {
  radio: "bg-plasma-orange",
  antenna: "bg-signal-green",
  feedline: "bg-caution-amber",
  accessory: "bg-nebula-blue",
  inline: "bg-purple-400",
};

const BORDER_COLORS: Record<EquipmentCardType, string> = {
  radio: "border-plasma-orange/30 hover:border-plasma-orange/60",
  antenna: "border-signal-green/30 hover:border-signal-green/60",
  feedline: "border-caution-amber/30 hover:border-caution-amber/60",
  accessory: "border-nebula-blue/30 hover:border-nebula-blue/60",
  inline: "border-purple-400/30 hover:border-purple-400/60",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DraggableEquipmentCard({
  id,
  type,
  name,
  subLabel,
  inUse,
  onDragStart,
  onDragEnd,
}: DraggableEquipmentCardProps) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(
      "application/x-equipment",
      JSON.stringify({ type, id }),
    );
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    onDragStart?.();
  }

  function handleDragEnd() {
    setIsDragging(false);
    onDragEnd?.();
  }

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`
        relative flex items-stretch overflow-hidden rounded-lg border
        bg-white/[0.03] transition-all duration-150 select-none
        ${BORDER_COLORS[type]}
        ${isDragging ? "opacity-40 scale-95 cursor-grabbing" : "cursor-grab"}
        ${inUse ? "opacity-60" : ""}
      `}
    >
      {/* Left accent bar */}
      <div className={`w-[3px] shrink-0 ${ACCENT_COLORS[type]}`} />

      {/* Content */}
      <div className="flex-1 min-w-0 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-200 truncate">
            {name}
          </span>
          {inUse && (
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-white/10 text-gray-400">
              In use
            </span>
          )}
        </div>
        {subLabel && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{subLabel}</p>
        )}
      </div>
    </div>
  );
}
