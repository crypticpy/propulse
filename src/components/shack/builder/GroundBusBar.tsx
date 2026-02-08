/**
 * GroundBusBar — SVG ground bus bar rendered at the bottom of BuilderCanvas.
 *
 * Shows a horizontal ground bus bar with earth ground fork symbols at each end,
 * dashed vertical stubs from equipment nodes down to the bar, optional
 * resistance labels, and ground-type labels beneath each stub.
 */

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLOR_GROUND = "#22C55E"; // signal-green
const COLOR_LABEL = "#6B7280"; // gray-500

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GroundStub {
  /** X center of the node this connects to */
  nodeX: number;
  /** Bottom Y of the node rectangle */
  nodeBottomY: number;
  /** Display label (e.g., "Chassis GND", "Radials", "Bus Bar") */
  label: string;
  /** Ground resistance in ohms, if known */
  resistanceOhms?: number;
  /** Ground type for additional context */
  groundType?: string;
}

export interface GroundBusBarProps {
  /** Left X of the bus bar */
  startX: number;
  /** Right X of the bus bar */
  endX: number;
  /** Y coordinate of the bus bar line */
  busY: number;
  /** Ground connections from nodes */
  groundStubs: GroundStub[];
}

// ─── Internal: Earth ground fork symbol ──────────────────────────────────────

/**
 * Standard earth ground symbol — a short vertical stub with three
 * horizontal lines of decreasing width.
 */
function GroundFork({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {/* Vertical stub down */}
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y + 4}
        stroke={COLOR_GROUND}
        strokeWidth={2}
        strokeOpacity={0.5}
      />
      {/* Three horizontal lines, decreasing width */}
      <line
        x1={x - 8}
        y1={y + 4}
        x2={x + 8}
        y2={y + 4}
        stroke={COLOR_GROUND}
        strokeWidth={2}
        strokeOpacity={0.5}
      />
      <line
        x1={x - 5}
        y1={y + 7}
        x2={x + 5}
        y2={y + 7}
        stroke={COLOR_GROUND}
        strokeWidth={1.5}
        strokeOpacity={0.4}
      />
      <line
        x1={x - 2}
        y1={y + 10}
        x2={x + 2}
        y2={y + 10}
        stroke={COLOR_GROUND}
        strokeWidth={1}
        strokeOpacity={0.3}
      />
    </g>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GroundBusBar({
  startX,
  endX,
  busY,
  groundStubs,
}: GroundBusBarProps) {
  if (groundStubs.length === 0) return null;

  return (
    <g>
      {/* Bus bar horizontal line */}
      <line
        x1={startX}
        y1={busY}
        x2={endX}
        y2={busY}
        stroke={COLOR_GROUND}
        strokeWidth={2}
        strokeOpacity={0.5}
      />

      {/* Ground fork at left end */}
      <GroundFork x={startX} y={busY} />

      {/* Ground fork at right end */}
      <GroundFork x={endX} y={busY} />

      {/* Stub connections from nodes */}
      {groundStubs.map((stub, i) => (
        <g key={i}>
          {/* Dashed vertical line from node bottom to bus bar */}
          <line
            x1={stub.nodeX}
            y1={stub.nodeBottomY + 4}
            x2={stub.nodeX}
            y2={busY}
            stroke={COLOR_GROUND}
            strokeWidth={1}
            strokeDasharray="4 3"
            strokeOpacity={0.4}
          />

          {/* Junction dot at bus bar */}
          <circle
            cx={stub.nodeX}
            cy={busY}
            r={3}
            fill={COLOR_GROUND}
            fillOpacity={0.6}
          />

          {/* Resistance label (midpoint of stub, offset right) */}
          {stub.resistanceOhms != null && (
            <text
              x={stub.nodeX + 8}
              y={(stub.nodeBottomY + busY) / 2}
              fill={COLOR_LABEL}
              fontSize={7}
              fontFamily="monospace"
              dominantBaseline="middle"
            >
              {stub.resistanceOhms}&Omega;
            </text>
          )}

          {/* Label below bus bar */}
          <text
            x={stub.nodeX}
            y={busY + 14}
            textAnchor="middle"
            fill={COLOR_LABEL}
            fontSize={8}
          >
            {stub.label}
          </text>
        </g>
      ))}
    </g>
  );
}
