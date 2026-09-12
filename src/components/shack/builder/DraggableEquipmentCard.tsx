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
  | "inline"
  | "shack_accessory";

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
  feedline: "bg-feedline-teal",
  accessory: "bg-nebula-blue",
  inline: "bg-purple-400",
  shack_accessory: "bg-su-line",
};

const BORDER_COLORS: Record<EquipmentCardType, string> = {
  radio: "border-plasma-orange/30 hover:border-plasma-orange/60",
  antenna: "border-signal-green/30 hover:border-signal-green/60",
  feedline: "border-feedline-teal/30 hover:border-feedline-teal/60",
  accessory: "border-nebula-blue/30 hover:border-nebula-blue/60",
  inline: "border-purple-400/30 hover:border-purple-400/60",
  shack_accessory: "border-su-line/40 hover:border-su-line/60",
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
    if (inUse) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      "application/x-equipment",
      JSON.stringify({ type, id }),
    );
    if (type === "inline") {
      e.dataTransfer.setData("application/x-equipment-inline", "1");
    }
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
      draggable={!inUse}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`
        relative flex items-stretch overflow-hidden rounded-lg border
        bg-su-line/10 transition-all duration-150 select-none
        ${BORDER_COLORS[type]}
        ${inUse ? "opacity-40 cursor-not-allowed" : isDragging ? "opacity-40 scale-95 cursor-grabbing" : "cursor-grab"}
      `}
    >
      {/* Left accent bar */}
      <div className={`w-[3px] shrink-0 ${ACCENT_COLORS[type]}`} />

      {/* Content */}
      <div className="flex-1 min-w-0 py-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-su-text truncate">
            {name}
          </span>
          {inUse && (
            <span className="shrink-0 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-su-line/20 text-su-muted border border-su-line/20">
              In Use
            </span>
          )}
        </div>
        {subLabel && (
          <p className="text-xs text-su-muted truncate mt-0.5">
            {subLabel}
          </p>
        )}
      </div>
    </div>
  );
}
