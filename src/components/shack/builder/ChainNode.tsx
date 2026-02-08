/**
 * ChainNode — Individual node in the signal chain pipeline.
 *
 * Renders as an SVG `<g>` group with a colored background rect,
 * icon, label, sub-label, performance badge, and connector badges.
 * This is the main building block of the visual station builder.
 */

import React from "react";
import type { ChainNode as ChainNodeType } from "@/types/stationChain";
import type { AccessoryCategory, ConnectorType } from "@/types/shack";
import type { NodePerformance } from "@/hooks/useChainPerformance";
import { getElectricalSymbol } from "./ElectricalSymbols";
import { getRadioPorts } from "@/lib/data/radioPorts";

// ─── Connector short labels ─────────────────────────────────────────────────

const CONNECTOR_SHORT_LABELS: Record<ConnectorType, string> = {
  pl259: "PL-259",
  n_type: "N",
  bnc: "BNC",
  sma: "SMA",
  sma_rp: "RP-SMA",
  tnc: "TNC",
  din_7_16: "7/16",
  f_type: "F",
  binding_post: "Bind",
  banana: "Ban",
  hardline_7_8: "\u215E HL",
  hardline_1_5_8: "1\u215D HL",
  anderson_powerpole: "PP",
  none: "",
};

// ─── Colors ──────────────────────────────────────────────────────────────────

const NODE_BG: Record<ChainNodeType["type"], string> = {
  radio: "rgba(249,115,22,0.15)", // plasma-orange/15
  accessory: "rgba(59,130,246,0.15)", // nebula-blue/15
  feedline_run: "rgba(20,184,166,0.15)", // teal-500/15
  antenna: "rgba(34,197,94,0.15)", // signal-green/15
};

const NODE_BG_SELECTED: Record<ChainNodeType["type"], string> = {
  radio: "rgba(249,115,22,0.25)",
  accessory: "rgba(59,130,246,0.25)",
  feedline_run: "rgba(20,184,166,0.25)",
  antenna: "rgba(34,197,94,0.25)",
};

const BORDER_DEFAULT = "rgba(255,255,255,0.1)";
const BORDER_SELECTED = "rgba(249,115,22,0.5)"; // plasma-orange/50
const TEXT_PRIMARY = "#E5E7EB"; // gray-200
const TEXT_SECONDARY = "#9CA3AF"; // gray-400
const COLOR_GAIN = "#22C55E"; // signal-green
const COLOR_LOSS = "#EF4444"; // alert-red

// ─── Type colors for symbols ────────────────────────────────────────────────

const TYPE_COLORS: Record<ChainNodeType["type"], string> = {
  radio: "#F97316",
  accessory: "#3B82F6",
  feedline_run: "#14B8A6",
  antenna: "#22C55E",
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
  /** Accessory category — used for symbol resolution */
  accessoryCategory?: AccessoryCategory;
  /** Impedance / gain annotation, e.g. "50\u03A9", "SWR 1.3:1", "+13 dB" */
  impedanceLabel?: string;
  /** Position in the SVG canvas */
  x: number;
  y: number;
  /** Node dimensions */
  width: number;
  height: number;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Context menu handler (kebab button + right-click) */
  onContextMenu?: (e: React.MouseEvent) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

function getTypeLabel(
  type: ChainNodeType["type"],
  category?: AccessoryCategory,
): string {
  switch (type) {
    case "radio":
      return "RADIO";
    case "antenna":
      return "ANTENNA";
    case "feedline_run":
      return "CABLE";
    case "accessory":
      if (category === "amplifier") return "AMP";
      if (category === "tuner") return "TUNER";
      if (category === "filter") return "FILTER";
      if (category === "switch") return "SWITCH";
      return "ACCESSORY";
  }
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
  accessoryCategory,
  impedanceLabel,
  x,
  y,
  width,
  height,
  onClick,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: ChainNodeProps) {
  const centerX = x + width / 2;
  const bgColor = isSelected ? NODE_BG_SELECTED[node.type] : NODE_BG[node.type];
  const borderColor = isSelected ? BORDER_SELECTED : BORDER_DEFAULT;

  const typeColor = TYPE_COLORS[node.type];
  const SymbolComp = getElectricalSymbol(node.type, accessoryCategory);

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
  const iconCy = y + 32;
  const labelY = y + 58;
  const subLabelY = y + 74;

  // Max chars based on width (rough: ~8.5px per char at font 14)
  const maxChars = Math.floor(width / 8.5);

  return (
    <g
      style={{ cursor: "pointer", opacity: isDragging ? 0.5 : 1 }}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
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

      {/* Kebab menu button (top-right) */}
      <g
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu?.(e);
        }}
      >
        <circle
          cx={x + width - 14}
          cy={y + 16}
          r={10}
          fill="rgba(255,255,255,0.05)"
          className="hover-circle"
        />
        <text
          x={x + width - 14}
          y={y + 16}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#9CA3AF"
          fontSize={12}
          fontFamily="system-ui, sans-serif"
          fontWeight={700}
        >
          {"\u22EF"}
        </text>
      </g>

      {/* Type label above icon */}
      <text
        x={centerX}
        y={y + 14}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={typeColor}
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fontWeight={700}
        letterSpacing="0.05em"
      >
        {getTypeLabel(node.type, accessoryCategory)}
      </text>

      {/* Electrical symbol */}
      <SymbolComp cx={centerX} cy={iconCy} color={typeColor} size={32} />

      {/* Label */}
      <text
        x={centerX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={TEXT_PRIMARY}
        fontSize={14}
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
          fontSize={11}
          fontFamily="system-ui, sans-serif"
        >
          {truncateLabel(subLabel, maxChars + 2)}
        </text>
      )}

      {/* Impedance / annotation label */}
      {impedanceLabel && (
        <text
          x={centerX}
          y={subLabelY + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#6B7280"
          fontSize={10}
          fontFamily="monospace"
          fontWeight={500}
        >
          {impedanceLabel}
        </text>
      )}

      {/* Performance badge (bottom right) */}
      {showPerf && perfText && (
        <g>
          <rect
            x={x + width - 70}
            y={y + height - 20}
            width={64}
            height={16}
            rx={8}
            fill={netDb! >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}
            stroke={perfColor}
            strokeWidth={0.5}
          />
          <text
            x={x + width - 38}
            y={y + height - 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={perfColor}
            fontSize={10}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            {perfText}
          </text>
        </g>
      )}

      {/* Radio port indicator pills (right inner edge) */}
      {node.type === "radio" &&
        getRadioPorts().map((port, idx) => (
          <g key={port.label}>
            <rect
              x={x + width - 54}
              y={y + 44 + idx * 24}
              width={48}
              height={20}
              rx={10}
              fill={port.color}
              fillOpacity={0.15}
              stroke={port.color}
              strokeWidth={0.5}
              strokeOpacity={0.4}
            />
            <text
              x={x + width - 30}
              y={y + 44 + idx * 24 + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={port.color}
              fontSize={11}
              fontWeight={600}
              fontFamily="system-ui, sans-serif"
            >
              {port.label}
            </text>
          </g>
        ))}

      {/* Connector labels at bottom of node */}
      {inputConnector && inputConnector !== "none" && (
        <text
          x={x + 8}
          y={y + height - 8}
          textAnchor="start"
          dominantBaseline="auto"
          fill={
            inputCompatible === false
              ? "#EF4444"
              : inputCompatible === true
                ? "#22C55E"
                : "#6B7280"
          }
          fontSize={10}
          fontFamily="system-ui, sans-serif"
          fontWeight={500}
        >
          {inputCompatible === false ? "\u26A0 " : ""}
          {CONNECTOR_SHORT_LABELS[inputConnector] || inputConnector}
        </text>
      )}
      {outputConnector && outputConnector !== "none" && (
        <text
          x={x + width - 8}
          y={y + height - 8}
          textAnchor="end"
          dominantBaseline="auto"
          fill={
            outputCompatible === false
              ? "#EF4444"
              : outputCompatible === true
                ? "#22C55E"
                : "#6B7280"
          }
          fontSize={10}
          fontFamily="system-ui, sans-serif"
          fontWeight={500}
        >
          {outputCompatible === false ? "\u26A0 " : ""}
          {CONNECTOR_SHORT_LABELS[outputConnector] || outputConnector}
        </text>
      )}
    </g>
  );
}
