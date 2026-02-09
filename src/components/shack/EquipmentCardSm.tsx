/**
 * EquipmentCardSm — Small horizontal strip card for equipment.
 *
 * ~52px tall compact strip for builder drawers, picker lists, and profile
 * summaries. Shows symbol, title, type label, up to 2 inline stats, and
 * an optional tier badge. Supports drag-and-drop + click interactions.
 *
 * Design: 3px left accent bar, dark space background, subtle hover lift.
 */

import React, { useState } from "react";
import { getEquipmentSymbol } from "./EquipmentSymbols";
import { StatIconSvg } from "./EquipmentCard";
import { useImageUrl } from "@/hooks/useImageUrl";
import {
  type EquipmentCardData,
  ACCENT_HEX,
  ACCENT_TEXT,
  TIER_LABELS,
} from "./equipmentCardTypes";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EquipmentCardSmProps extends EquipmentCardData {
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  inUse?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EquipmentCardSm({
  title,
  equipmentType,
  typeLabel,
  tier,
  stats,
  imageId,
  inUse,
  draggable,
  onDragStart,
  onDragEnd,
  onClick,
  className,
}: EquipmentCardSmProps) {
  const [hovered, setHovered] = useState(false);
  const { url: imageUrl } = useImageUrl(imageId);
  const accentHex = ACCENT_HEX[equipmentType];
  const SymbolComponent = getEquipmentSymbol(equipmentType);

  // Show at most 2 stats inline
  const displayStats = stats?.slice(0, 2);
  const resolvedTypeLabel = typeLabel || equipmentType.toUpperCase();

  return (
    <div
      role="article"
      aria-label={title}
      tabIndex={onClick && !inUse ? 0 : undefined}
      draggable={draggable && !inUse}
      onClick={inUse ? undefined : onClick}
      onKeyDown={
        onClick && !inUse
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onDragStart={inUse ? undefined : onDragStart}
      onDragEnd={inUse ? undefined : onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        // Layout — horizontal strip
        "group relative flex items-center gap-3 w-full min-h-[44px] px-3 py-2",
        // Background + shape
        "bg-[#0f1420] rounded-lg overflow-hidden",
        // Border
        "border border-white/[0.06]",
        // Transitions
        "transition-all duration-150",
        // Hover lift
        hovered && !inUse ? "-translate-y-px" : "",
        // Cursor
        onClick && !inUse ? "cursor-pointer" : "",
        // In-use disabled state
        inUse ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderColor: hovered && !inUse ? `${accentHex}50` : undefined,
      }}
    >
      {/* ── Left accent bar ── */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: accentHex }}
      />

      {/* ── Symbol / Image ── */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className={`flex-shrink-0 ${ACCENT_TEXT[equipmentType]}`}>
          <SymbolComponent className="w-6 h-6" />
        </div>
      )}

      {/* ── Text block ── */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-semibold text-white leading-tight truncate">
          {title}
        </span>
        <span
          className={`text-[10px] uppercase tracking-widest font-semibold leading-tight ${ACCENT_TEXT[equipmentType]}`}
        >
          {resolvedTypeLabel}
        </span>
      </div>

      {/* ── Inline stats ── */}
      {displayStats && displayStats.length > 0 && (
        <div className="flex items-center gap-1.5 flex-shrink-0 text-gray-400">
          {displayStats.map((stat, i) => (
            <React.Fragment key={`${stat.icon}-${stat.label}`}>
              {i > 0 && (
                <span className="text-gray-600 text-xs select-none">|</span>
              )}
              <span className="flex items-center gap-0.5 text-xs font-mono text-gray-300">
                <StatIconSvg icon={stat.icon} />
                {stat.value}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Tier badge ── */}
      {tier && (
        <span
          className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-full"
          style={{
            backgroundColor: `${accentHex}1A`,
            color: accentHex,
          }}
        >
          {TIER_LABELS[tier]}
        </span>
      )}

      {/* ── In Use indicator ── */}
      {inUse && (
        <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded bg-white/5 text-gray-500">
          In Use
        </span>
      )}
    </div>
  );
}

export default EquipmentCardSm;
