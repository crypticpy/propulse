/**
 * FeedlineRunNode — Expanded feedline run showing cable + inline components.
 *
 * Renders as an SVG `<g>` group with a taller body that stacks
 * the feedline cable info and each inline component vertically.
 * Height expands dynamically based on the number of inline components.
 */

import React from "react";
import type { FeedlineRun } from "@/types/stationChain";
import type { ConnectorType } from "@/types/shack";
import type { NodePerformance } from "@/hooks/useChainPerformance";
import { TransmissionLineSymbol } from "./ElectricalSymbols";

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

const BG_COLOR = "rgba(20,184,166,0.12)"; // teal-500/12
const BG_SELECTED = "rgba(20,184,166,0.22)";
const BORDER_DEFAULT = "rgba(255,255,255,0.1)";
const BORDER_SELECTED = "rgba(249,115,22,0.5)"; // plasma-orange/50
const TEXT_PRIMARY = "#E5E7EB"; // gray-200
const TEXT_SECONDARY = "#9CA3AF"; // gray-400
const COLOR_LOSS = "#EF4444"; // alert-red
const INLINE_BG = "rgba(255,255,255,0.03)";
const DIVIDER = "rgba(255,255,255,0.06)";

// ─── Layout constants ────────────────────────────────────────────────────────

const HEADER_HEIGHT = 64;
const INLINE_ROW_HEIGHT = 28;
const FOOTER_HEIGHT = 28;
const PADDING_X = 8;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FeedlineRunNodeProps {
  feedlineRun: FeedlineRun;
  feedlineLabel: string;
  feedlineSubLabel?: string;
  inlineLabels: Array<{ id: string; name: string; lossDb: number }>;
  totalLossDb?: number;
  nodePerformance?: NodePerformance;
  inputConnector: ConnectorType | null;
  outputConnector: ConnectorType | null;
  inputCompatible?: boolean;
  outputCompatible?: boolean;
  isSelected?: boolean;
  /** Characteristic impedance in ohms (e.g. 50, 75, 300) */
  impedanceOhms?: number;
  x: number;
  y: number;
  width: number;
  onClick?: () => void;
  /** Context menu handler (kebab button + right-click) */
  onContextMenu?: (e: React.MouseEvent) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getFeedlineRunNodeHeight(inlineCount: number): number {
  return HEADER_HEIGHT + inlineCount * INLINE_ROW_HEIGHT + FOOTER_HEIGHT;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FeedlineRunNode({
  inlineLabels,
  feedlineLabel,
  feedlineSubLabel,
  totalLossDb,
  inputConnector,
  outputConnector,
  inputCompatible,
  outputCompatible,
  isSelected,
  impedanceOhms,
  x,
  y,
  width,
  onClick,
  onContextMenu,
}: FeedlineRunNodeProps) {
  const totalHeight = getFeedlineRunNodeHeight(inlineLabels.length);
  const centerX = x + width / 2;
  const maxLabelChars = Math.floor((width - PADDING_X * 2) / 6);

  const bgColor = isSelected ? BG_SELECTED : BG_COLOR;
  const borderColor = isSelected ? BORDER_SELECTED : BORDER_DEFAULT;

  return (
    <g
      style={{ cursor: "pointer" }}
      onClick={onClick}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        onContextMenu?.(e);
      }}
    >
      {/* Main container rect with dashed border */}
      <rect
        x={x}
        y={y}
        width={width}
        height={totalHeight}
        rx={12}
        ry={12}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray="6 3"
      />

      {/* Kebab menu button (top-right) */}
      <g
        style={{ cursor: "pointer" }}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onContextMenu?.(e);
        }}
      >
        <circle
          cx={x + width - 14}
          cy={y + 16}
          r={10}
          fill="rgba(255,255,255,0.05)"
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

      {/* Transmission line symbol in header */}
      <TransmissionLineSymbol
        cx={centerX}
        cy={y + 14}
        color="#14B8A6"
        size={16}
      />

      {/* Header: feedline name */}
      <text
        x={centerX}
        y={y + 30}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={TEXT_PRIMARY}
        fontSize={14}
        fontFamily="system-ui, sans-serif"
        fontWeight={500}
      >
        {truncate(feedlineLabel, maxLabelChars)}
      </text>

      {/* Header sub-label (cable type + length) */}
      {feedlineSubLabel && (
        <text
          x={centerX}
          y={y + 44}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={TEXT_SECONDARY}
          fontSize={11}
          fontFamily="system-ui, sans-serif"
        >
          {truncate(feedlineSubLabel, maxLabelChars + 4)}
        </text>
      )}

      {/* Impedance annotation */}
      {impedanceOhms != null && (
        <text
          x={centerX}
          y={y + 56}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#9CA3AF"
          fontSize={11}
          fontFamily="monospace"
        >
          Z = {impedanceOhms}
          {"\u03A9"}
        </text>
      )}

      {/* Divider below header */}
      <line
        x1={x + PADDING_X}
        y1={y + HEADER_HEIGHT}
        x2={x + width - PADDING_X}
        y2={y + HEADER_HEIGHT}
        stroke={DIVIDER}
        strokeWidth={1}
      />

      {/* Inline component rows */}
      {inlineLabels.map((inline, i) => {
        const rowY = y + HEADER_HEIGHT + i * INLINE_ROW_HEIGHT;
        return (
          <g key={inline.id}>
            {/* Row background */}
            <rect
              x={x + 4}
              y={rowY + 1}
              width={width - 8}
              height={INLINE_ROW_HEIGHT - 2}
              rx={4}
              fill={INLINE_BG}
            />
            {/* Component name (left) */}
            <text
              x={x + PADDING_X + 4}
              y={rowY + INLINE_ROW_HEIGHT / 2}
              textAnchor="start"
              dominantBaseline="middle"
              fill={TEXT_SECONDARY}
              fontSize={10}
              fontFamily="system-ui, sans-serif"
            >
              {truncate(inline.name, Math.floor(maxLabelChars * 0.65))}
            </text>
            {/* Loss value (right) */}
            <text
              x={x + width - PADDING_X - 4}
              y={rowY + INLINE_ROW_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fill={COLOR_LOSS}
              fontSize={10}
              fontFamily="system-ui, sans-serif"
              fontWeight={500}
            >
              {inline.lossDb > 0
                ? `-${inline.lossDb.toFixed(1)} dB`
                : `${inline.lossDb.toFixed(1)} dB`}
            </text>
            {/* Divider */}
            {i < inlineLabels.length - 1 && (
              <line
                x1={x + PADDING_X + 4}
                y1={rowY + INLINE_ROW_HEIGHT}
                x2={x + width - PADDING_X - 4}
                y2={rowY + INLINE_ROW_HEIGHT}
                stroke={DIVIDER}
                strokeWidth={0.5}
              />
            )}
          </g>
        );
      })}

      {/* Footer: total loss badge */}
      {totalLossDb != null && (
        <g>
          <rect
            x={centerX - 40}
            y={y + totalHeight - FOOTER_HEIGHT + 4}
            width={80}
            height={20}
            rx={10}
            fill="rgba(239,68,68,0.12)"
            stroke={COLOR_LOSS}
            strokeWidth={0.5}
          />
          <text
            x={centerX}
            y={y + totalHeight - FOOTER_HEIGHT + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={COLOR_LOSS}
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            Total: -{Math.abs(totalLossDb).toFixed(1)} dB
          </text>
        </g>
      )}

      {/* Connector labels at bottom of node */}
      {inputConnector && inputConnector !== "none" && (
        <text
          x={x + 8}
          y={y + totalHeight - 8}
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
          y={y + totalHeight - 8}
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
