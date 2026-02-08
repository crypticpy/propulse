/**
 * ConnectionLine — SVG connection between two chain nodes.
 *
 * Renders a line/path with optional dB loss/gain annotation and
 * an arrowhead at the destination end.
 */

import { useId } from "react";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR_COMPATIBLE = "#22C55E"; // signal-green
const COLOR_INCOMPATIBLE = "#EF4444"; // alert-red
const COLOR_GAIN = "#22C55E"; // signal-green
const COLOR_LOSS = "#EF4444"; // alert-red

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ConnectionLineProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  compatible: boolean;
  /** If provided, show loss annotation above line */
  lossDb?: number;
  /** If provided, show gain annotation above line (green) */
  gainDb?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  compatible,
  lossDb,
  gainDb,
}: ConnectionLineProps) {
  const markerId = useId() + "-arrow";
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  const strokeColor = compatible ? COLOR_COMPATIBLE : COLOR_INCOMPATIBLE;

  // Determine annotation text and color
  let annotationText: string | null = null;
  let annotationColor = COLOR_LOSS;

  if (gainDb != null && gainDb !== 0) {
    annotationText = `+${gainDb.toFixed(1)} dB`;
    annotationColor = COLOR_GAIN;
  } else if (lossDb != null && lossDb !== 0) {
    annotationText = `-${Math.abs(lossDb).toFixed(1)} dB`;
    annotationColor = COLOR_LOSS;
  }

  return (
    <g>
      {/* Arrow marker definition */}
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill={strokeColor} />
        </marker>
      </defs>

      {/* Connection line */}
      <line
        x1={fromX}
        y1={fromY}
        x2={toX - 10}
        y2={toY}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeDasharray={compatible ? "none" : "6 3"}
        markerEnd={`url(#${markerId})`}
      />

      {/* dB annotation centered above line */}
      {annotationText && (
        <text
          x={midX}
          y={midY - 10}
          textAnchor="middle"
          dominantBaseline="auto"
          fill={annotationColor}
          fontSize={9}
          fontFamily="system-ui, sans-serif"
          fontWeight={600}
        >
          {annotationText}
        </text>
      )}
    </g>
  );
}
