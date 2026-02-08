/**
 * ChainNode — Individual node in the signal chain pipeline.
 *
 * Renders as an SVG `<g>` group with a colored background rect,
 * icon, label, sub-label, performance badge, and connector badges.
 * This is the main building block of the visual station builder.
 */

import React from "react";
import type { ChainNode as ChainNodeType } from "@/types/stationChain";
import type { ConnectorType } from "@/types/shack";
import type { NodePerformance } from "@/hooks/useChainPerformance";
import { ConnectorBadge } from "./ConnectorBadge";

// ─── Colors ──────────────────────────────────────────────────────────────────

const NODE_BG: Record<ChainNodeType["type"], string> = {
  radio: "rgba(249,115,22,0.15)", // plasma-orange/15
  accessory: "rgba(59,130,246,0.15)", // nebula-blue/15
  feedline_run: "rgba(245,158,11,0.15)", // caution-amber/15
  antenna: "rgba(34,197,94,0.15)", // signal-green/15
};

const NODE_BG_SELECTED: Record<ChainNodeType["type"], string> = {
  radio: "rgba(249,115,22,0.25)",
  accessory: "rgba(59,130,246,0.25)",
  feedline_run: "rgba(245,158,11,0.25)",
  antenna: "rgba(34,197,94,0.25)",
};

const BORDER_DEFAULT = "rgba(255,255,255,0.1)";
const BORDER_SELECTED = "rgba(249,115,22,0.5)"; // plasma-orange/50
const TEXT_PRIMARY = "#E5E7EB"; // gray-200
const TEXT_SECONDARY = "#9CA3AF"; // gray-400
const COLOR_GAIN = "#22C55E"; // signal-green
const COLOR_LOSS = "#EF4444"; // alert-red

// ─── Node Icons (simple SVG paths) ──────────────────────────────────────────

function RadioIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 8},${cy - 8})`}>
      {/* Radio wave icon */}
      <path
        d="M4 10 Q8 2 12 10 Q16 18 12 10"
        stroke="#F97316"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={8} cy={10} r={2} fill="#F97316" />
      <path
        d="M1 10 Q8 -2 15 10"
        stroke="#F97316"
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
        opacity={0.5}
      />
    </g>
  );
}

function AccessoryIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 7},${cy - 8})`}>
      {/* Bolt/lightning icon */}
      <path
        d="M8 1 L3 9 L7 9 L6 15 L11 7 L7 7 Z"
        fill="#3B82F6"
        stroke="none"
      />
    </g>
  );
}

function FeedlineIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 8},${cy - 6})`}>
      {/* Cable icon — wavy horizontal line */}
      <path
        d="M0 6 Q4 2 8 6 Q12 10 16 6"
        stroke="#F59E0B"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function AntennaIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 7},${cy - 9})`}>
      {/* Antenna tower icon */}
      <line
        x1={7}
        y1={2}
        x2={7}
        y2={16}
        stroke="#22C55E"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={2}
        y1={6}
        x2={7}
        y2={2}
        stroke="#22C55E"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={12}
        y1={6}
        x2={7}
        y2={2}
        stroke="#22C55E"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <line
        x1={3}
        y1={11}
        x2={11}
        y2={11}
        stroke="#22C55E"
        strokeWidth={1}
        strokeLinecap="round"
        opacity={0.6}
      />
    </g>
  );
}

const NODE_ICON: Record<
  ChainNodeType["type"],
  React.FC<{ cx: number; cy: number }>
> = {
  radio: RadioIcon,
  accessory: AccessoryIcon,
  feedline_run: FeedlineIcon,
  antenna: AntennaIcon,
};

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ChainNodeProps {
  node: ChainNodeType;
  label: string;
  subLabel?: string;
  nodePerformance?: NodePerformance;
  inputConnector: ConnectorType | null;
  outputConnector: ConnectorType | null;
  inputCompatible?: boolean;
  outputCompatible?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  /** Position in the SVG canvas */
  x: number;
  y: number;
  /** Node dimensions */
  width: number;
  height: number;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChainNode({
  node,
  label,
  subLabel,
  nodePerformance,
  inputConnector,
  outputConnector,
  inputCompatible,
  outputCompatible,
  isSelected,
  isDragging,
  x,
  y,
  width,
  height,
  onClick,
  onDragStart,
  onDragEnd,
}: ChainNodeProps) {
  const centerX = x + width / 2;
  const bgColor = isSelected ? NODE_BG_SELECTED[node.type] : NODE_BG[node.type];
  const borderColor = isSelected ? BORDER_SELECTED : BORDER_DEFAULT;

  const IconComponent = NODE_ICON[node.type];

  // Performance badge
  const netDb = nodePerformance?.netDb;
  const showPerf = netDb != null && netDb !== 0;
  const perfText = showPerf
    ? netDb! > 0
      ? `+${netDb!.toFixed(1)} dB`
      : `${netDb!.toFixed(1)} dB`
    : null;
  const perfColor = netDb != null && netDb >= 0 ? COLOR_GAIN : COLOR_LOSS;

  // Layout zones
  const iconCy = y + 24;
  const labelY = y + 48;
  const subLabelY = y + 62;

  // Max chars based on width (rough: ~7px per char at font 11)
  const maxChars = Math.floor(width / 7.5);

  return (
    <g
      style={{ cursor: "pointer", opacity: isDragging ? 0.5 : 1 }}
      onClick={onClick}
      {...({
        draggable: "true",
        onDragStart,
        onDragEnd,
      } as React.SVGAttributes<SVGGElement>)}
    >
      {/* Background rect */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={12}
        ry={12}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Icon */}
      <IconComponent cx={centerX} cy={iconCy} />

      {/* Label */}
      <text
        x={centerX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={TEXT_PRIMARY}
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fontWeight={500}
      >
        {truncateLabel(label, maxChars)}
      </text>

      {/* Sub-label */}
      {subLabel && (
        <text
          x={centerX}
          y={subLabelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={TEXT_SECONDARY}
          fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {truncateLabel(subLabel, maxChars + 2)}
        </text>
      )}

      {/* Performance badge (bottom right) */}
      {showPerf && perfText && (
        <g>
          <rect
            x={x + width - 56}
            y={y + height - 20}
            width={50}
            height={16}
            rx={8}
            fill={netDb! >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}
            stroke={perfColor}
            strokeWidth={0.5}
          />
          <text
            x={x + width - 31}
            y={y + height - 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={perfColor}
            fontSize={8}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            {perfText}
          </text>
        </g>
      )}

      {/* Input connector badge (left edge) */}
      {inputConnector !== null && (
        <g transform={`translate(${x},${y + height / 2})`}>
          <ConnectorBadge
            connector={inputConnector}
            compatible={inputCompatible}
            side="left"
          />
        </g>
      )}

      {/* Output connector badge (right edge) */}
      {outputConnector !== null && (
        <g transform={`translate(${x + width},${y + height / 2})`}>
          <ConnectorBadge
            connector={outputConnector}
            compatible={outputCompatible}
            side="right"
          />
        </g>
      )}
    </g>
  );
}
