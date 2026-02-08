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
  /** X coordinate of the "+" DropZone circle center; when set the line splits around it */
  gapCenterX?: number;
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
  gapCenterX,
}: ConnectionLineProps) {
  const markerId = useId() + "-arrow";
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  const strokeColor = compatible ? COLOR_COMPATIBLE : COLOR_INCOMPATIBLE;
  const dashArray = compatible ? "none" : "6 3";

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
          markerWidth="14"
          markerHeight="10"
          refX="14"
          refY="5"
          orient="auto"
        >
          <polygon points="0 0, 14 5, 0 10" fill={strokeColor} />
        </marker>
      </defs>

      {/* Connection line — split around gap or single */}
      {gapCenterX != null ? (
        <>
          {/* Left segment: source → gap (no arrowhead) */}
          <line
            x1={fromX}
            y1={fromY}
            x2={gapCenterX - 20}
            y2={fromY}
            stroke={strokeColor}
            strokeWidth={3}
            strokeDasharray={dashArray}
          />
          {/* Right segment: gap → destination (with arrowhead) */}
          <line
            x1={gapCenterX + 20}
            y1={toY}
            x2={toX - 10}
            y2={toY}
            stroke={strokeColor}
            strokeWidth={3}
            strokeDasharray={dashArray}
            markerEnd={`url(#${markerId})`}
          />
        </>
      ) : (
        <line
          x1={fromX}
          y1={fromY}
          x2={toX - 10}
          y2={toY}
          stroke={strokeColor}
          strokeWidth={3}
          strokeDasharray={dashArray}
          markerEnd={`url(#${markerId})`}
        />
      )}

      {/* dB annotation centered above line with background pill */}
      {annotationText && (
        <>
          <rect
            x={midX - 35}
            y={midY - 52}
            width={70}
            height={22}
            rx={10}
            fill="rgba(10,10,20,0.85)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.5}
          />
          <text
            x={midX}
            y={midY - 42}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={annotationColor}
            fontSize={13}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            {annotationText}
          </text>
        </>
      )}
    </g>
  );
}
