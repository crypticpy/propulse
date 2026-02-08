/**
 * ConnectorBadge — Small SVG circle representing a connector type.
 *
 * Placed at node edges to show physical connector information
 * and compatibility status between adjacent equipment.
 */

import type { ConnectorType } from "@/types/shack";
import { CONNECTOR_TYPE_LABELS } from "@/types/shack";

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR_COMPATIBLE = "#22C55E"; // signal-green
const COLOR_INCOMPATIBLE = "#EF4444"; // alert-red
const COLOR_NEUTRAL = "#6B7280"; // gray-500

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ConnectorBadgeProps {
  connector: ConnectorType | null;
  /** Green if true, red if false, gray if undefined */
  compatible?: boolean;
  /** Which side of the parent node */
  side: "left" | "right";
  /** Circle diameter — default 8 */
  size?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConnectorBadge({
  connector,
  compatible,
  size = 8,
}: ConnectorBadgeProps) {
  const fill =
    connector == null || compatible === undefined
      ? COLOR_NEUTRAL
      : compatible
        ? COLOR_COMPATIBLE
        : COLOR_INCOMPATIBLE;

  const label = connector ? CONNECTOR_TYPE_LABELS[connector] : "No connector";
  const r = size / 2;

  return (
    <g>
      <circle
        cx={0}
        cy={0}
        r={r}
        fill={fill}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={1}
      />
      <title>{label}</title>
    </g>
  );
}
