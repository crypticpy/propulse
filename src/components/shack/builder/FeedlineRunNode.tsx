/**
 * FeedlineRunNode — Expanded feedline run showing cable + inline components.
 *
 * Renders as an SVG `<g>` group with a taller body that stacks
 * the feedline cable info and each inline component vertically.
 * Height expands dynamically based on the number of inline components.
 */

import type { FeedlineRun } from "@/types/stationChain";
import type { ConnectorType } from "@/types/shack";
import type { NodePerformance } from "@/hooks/useChainPerformance";
import { ConnectorBadge } from "./ConnectorBadge";

// ─── Colors ──────────────────────────────────────────────────────────────────

const BG_COLOR = "rgba(245,158,11,0.12)"; // caution-amber/12
const BG_SELECTED = "rgba(245,158,11,0.22)";
const BORDER_DEFAULT = "rgba(255,255,255,0.1)";
const BORDER_SELECTED = "rgba(249,115,22,0.5)"; // plasma-orange/50
const TEXT_PRIMARY = "#E5E7EB"; // gray-200
const TEXT_SECONDARY = "#9CA3AF"; // gray-400
const COLOR_LOSS = "#EF4444"; // alert-red
const INLINE_BG = "rgba(255,255,255,0.03)";
const DIVIDER = "rgba(255,255,255,0.06)";

// ─── Layout constants ────────────────────────────────────────────────────────

const HEADER_HEIGHT = 44;
const INLINE_ROW_HEIGHT = 22;
const FOOTER_HEIGHT = 24;
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
  x: number;
  y: number;
  width: number;
  onClick?: () => void;
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
  x,
  y,
  width,
  onClick,
}: FeedlineRunNodeProps) {
  const totalHeight = getFeedlineRunNodeHeight(inlineLabels.length);
  const centerX = x + width / 2;
  const maxLabelChars = Math.floor((width - PADDING_X * 2) / 6);

  const bgColor = isSelected ? BG_SELECTED : BG_COLOR;
  const borderColor = isSelected ? BORDER_SELECTED : BORDER_DEFAULT;

  return (
    <g style={{ cursor: "pointer" }} onClick={onClick}>
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

      {/* Header: feedline name */}
      <text
        x={centerX}
        y={y + 18}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={TEXT_PRIMARY}
        fontSize={11}
        fontFamily="system-ui, sans-serif"
        fontWeight={500}
      >
        {truncate(feedlineLabel, maxLabelChars)}
      </text>

      {/* Header sub-label (cable type + length) */}
      {feedlineSubLabel && (
        <text
          x={centerX}
          y={y + 32}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={TEXT_SECONDARY}
          fontSize={9}
          fontFamily="system-ui, sans-serif"
        >
          {truncate(feedlineSubLabel, maxLabelChars + 4)}
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
              fontSize={8.5}
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
              fontSize={8.5}
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
            x={centerX - 36}
            y={y + totalHeight - FOOTER_HEIGHT + 3}
            width={72}
            height={18}
            rx={9}
            fill="rgba(239,68,68,0.12)"
            stroke={COLOR_LOSS}
            strokeWidth={0.5}
          />
          <text
            x={centerX}
            y={y + totalHeight - FOOTER_HEIGHT + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={COLOR_LOSS}
            fontSize={9}
            fontFamily="system-ui, sans-serif"
            fontWeight={600}
          >
            Total: -{Math.abs(totalLossDb).toFixed(1)} dB
          </text>
        </g>
      )}

      {/* Input connector badge (left edge) */}
      {inputConnector !== null && (
        <g transform={`translate(${x},${y + totalHeight / 2})`}>
          <ConnectorBadge
            connector={inputConnector}
            compatible={inputCompatible}
            side="left"
          />
        </g>
      )}

      {/* Output connector badge (right edge) */}
      {outputConnector !== null && (
        <g transform={`translate(${x + width},${y + totalHeight / 2})`}>
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
