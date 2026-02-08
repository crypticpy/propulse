/**
 * DropZone — Visual drop target shown between nodes during drag operations.
 *
 * Renders a dashed rectangle that highlights when a draggable hovers over it.
 * When not in drag mode, shows a small "+" button for adding equipment.
 */

import React from "react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR_BORDER = "rgba(255,255,255,0.1)";
const COLOR_ACTIVE = "#F97316"; // plasma-orange
const COLOR_PLUS = "#9CA3AF"; // gray-400

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DropZoneProps {
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when a draggable is hovering over this zone */
  isActive?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Click handler for the "+" button */
  onClick?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DropZone({
  x,
  y,
  width,
  height,
  isActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: DropZoneProps) {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const plusR = 14;

  return (
    <g>
      {/* Drop target area */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        fill={isActive ? "rgba(249,115,22,0.08)" : "transparent"}
        stroke={isActive ? COLOR_ACTIVE : COLOR_BORDER}
        strokeWidth={isActive ? 2 : 1}
        strokeDasharray="4 3"
        opacity={isActive ? 1 : 0.6}
        style={{ cursor: "pointer" }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
      >
        {isActive && (
          <animate
            attributeName="stroke-opacity"
            values="0.4;1;0.4"
            dur="1.5s"
            repeatCount="indefinite"
          />
        )}
      </rect>

      {/* "+" button circle */}
      <circle
        cx={cx}
        cy={cy}
        r={plusR}
        fill="rgba(255,255,255,0.05)"
        stroke={isActive ? COLOR_ACTIVE : COLOR_PLUS}
        strokeWidth={1.5}
        style={{ cursor: "pointer" }}
        onClick={onClick}
      />

      {/* Plus sign */}
      <line
        x1={cx - 6}
        y1={cy}
        x2={cx + 6}
        y2={cy}
        stroke={isActive ? COLOR_ACTIVE : COLOR_PLUS}
        strokeWidth={2}
        strokeLinecap="round"
        pointerEvents="none"
      />
      <line
        x1={cx}
        y1={cy - 6}
        x2={cx}
        y2={cy + 6}
        stroke={isActive ? COLOR_ACTIVE : COLOR_PLUS}
        strokeWidth={2}
        strokeLinecap="round"
        pointerEvents="none"
      />
    </g>
  );
}
