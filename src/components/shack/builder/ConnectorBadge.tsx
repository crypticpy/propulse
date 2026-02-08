/**
 * ConnectorBadge — SVG pill showing connector type label.
 *
 * Placed at node edges to show physical connector information
 * and compatibility status between adjacent equipment.
 */

import type { ConnectorType } from "@/types/shack";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COMPAT_COLORS = {
  compatible: {
    text: "#22C55E",
    bg: "rgba(34,197,94,0.15)",
    border: "rgba(34,197,94,0.3)",
  },
  incompatible: {
    text: "#EF4444",
    bg: "rgba(239,68,68,0.15)",
    border: "rgba(239,68,68,0.3)",
  },
  neutral: {
    text: "#9CA3AF",
    bg: "rgba(107,114,128,0.15)",
    border: "rgba(107,114,128,0.3)",
  },
} as const;

// ─── Short labels ────────────────────────────────────────────────────────────

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

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ConnectorBadgeProps {
  connector: ConnectorType | null;
  /** Green if true, red if false, gray if undefined */
  compatible?: boolean;
  /** Which side of the parent node */
  side: "left" | "right";
  /** Kept for backward compat but not used in new pill design */
  size?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConnectorBadge({
  connector,
  compatible,
  side,
}: ConnectorBadgeProps) {
  // Render nothing for null or "none"
  if (connector == null || connector === "none") return null;

  const label = CONNECTOR_SHORT_LABELS[connector] || connector;
  const displayLabel = compatible === false ? `\u26A0 ${label}` : label;

  // Determine colors based on compatibility
  const colors =
    compatible === undefined
      ? COMPAT_COLORS.neutral
      : compatible
        ? COMPAT_COLORS.compatible
        : COMPAT_COLORS.incompatible;

  // Pill sizing
  const pillWidth = Math.max(44, displayLabel.length * 8.5 + 20);
  const pillHeight = 24;
  const rx = 12;

  // Position offset: pill extends away from (0,0) based on side
  const x = side === "left" ? -pillWidth : 0;
  const y = -pillHeight / 2; // -10

  return (
    <g>
      {/* Background pill */}
      <rect
        x={x}
        y={y}
        width={pillWidth}
        height={pillHeight}
        rx={rx}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={0.75}
      />
      {/* Label text */}
      <text
        x={x + pillWidth / 2}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fill={colors.text}
        fontSize={12}
        fontWeight={600}
        fontFamily="system-ui, sans-serif"
      >
        {displayLabel}
      </text>
    </g>
  );
}
