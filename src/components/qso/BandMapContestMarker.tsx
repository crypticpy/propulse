/**
 * BandMapContestMarker — SVG overlay for contest sub-band boundaries.
 *
 * Renders shaded rectangles over contest sub-band frequency ranges on the
 * band map. Colors are keyed by mode type (CW/SSB/Digital) and kept at low
 * opacity to avoid obscuring spots.
 *
 * Dashed boundary lines mark sub-band edges, with a label at the top of
 * each region.
 */

import {
  getSubBandsForBand,
  type SubBandRange,
} from "@/lib/data/contestSubBands";

// ── Props ────────────────────────────────────────────────────────────────────

export interface BandMapContestMarkerProps {
  /** Band designator (e.g. "20m") */
  band: string;
  /** Scale function: kHz → SVG x coordinate */
  xScale: (freqKHz: number) => number;
  /** Height of the plot area in pixels */
  height: number;
  /** Y offset for the top of the plot area */
  yOffset: number;
  /** Whether to render the markers */
  visible: boolean;
}

// ── Mode → Color mapping ─────────────────────────────────────────────────────

const MODE_COLORS: Record<
  SubBandRange["type"],
  { fill: string; stroke: string }
> = {
  cw: {
    fill: "rgba(59, 130, 246, 0.12)", // nebula-blue/12
    stroke: "rgba(59, 130, 246, 0.35)", // nebula-blue/35
  },
  ssb: {
    fill: "rgba(34, 197, 94, 0.12)", // signal-green/12
    stroke: "rgba(34, 197, 94, 0.35)", // signal-green/35
  },
  digital: {
    fill: "rgba(168, 85, 247, 0.12)", // purple/12
    stroke: "rgba(168, 85, 247, 0.35)", // purple/35
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export function BandMapContestMarker({
  band,
  xScale,
  height,
  yOffset,
  visible,
}: BandMapContestMarkerProps) {
  if (!visible) return null;

  const subBands = getSubBandsForBand(band);
  if (subBands.length === 0) return null;

  return (
    <g className="band-map-contest-markers">
      {subBands.map((sb) => {
        const x1 = xScale(sb.startKHz);
        const x2 = xScale(sb.endKHz);
        const width = x2 - x1;

        // Skip if off-screen or too narrow to render
        if (width < 1) return null;

        const colors = MODE_COLORS[sb.type];

        return (
          <g key={`${sb.type}-${sb.startKHz}`}>
            {/* Shaded region */}
            <rect
              x={x1}
              y={yOffset}
              width={width}
              height={height}
              fill={colors.fill}
              rx={1}
            />

            {/* Left boundary line (dashed) */}
            <line
              x1={x1}
              y1={yOffset}
              x2={x1}
              y2={yOffset + height}
              stroke={colors.stroke}
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />

            {/* Right boundary line (dashed) */}
            <line
              x1={x2}
              y1={yOffset}
              x2={x2}
              y2={yOffset + height}
              stroke={colors.stroke}
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />

            {/* Label at top of region */}
            {width > 30 && (
              <text
                x={x1 + width / 2}
                y={yOffset + 10}
                fill={colors.stroke}
                fontSize={7}
                fontFamily="monospace"
                fontWeight={500}
                textAnchor="middle"
                opacity={0.8}
              >
                {sb.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
