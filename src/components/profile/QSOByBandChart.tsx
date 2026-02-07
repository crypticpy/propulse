/**
 * SVG horizontal bar chart showing QSO distribution by band.
 * Displays up to 10 bands sorted by count descending.
 */

import { useMemo } from "react";

const BAR_HEIGHT = 20;
const BAR_GAP = 6;
const LABEL_WIDTH = 40;
const COUNT_WIDTH = 44;
const BAR_COLOR = "rgb(255,107,53)"; // plasma-orange

interface BandBar {
  band: string;
  count: number;
  widthPct: number;
}

export function QSOByBandChart({ data }: { data: Record<string, number> }) {
  const bars = useMemo(() => {
    const entries = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (entries.length === 0) return [] as BandBar[];

    const maxCount = entries[0][1];
    return entries.map(([band, count]) => ({
      band,
      count,
      widthPct: maxCount > 0 ? (count / maxCount) * 100 : 0,
    }));
  }, [data]);

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No QSOs logged yet
      </div>
    );
  }

  const chartWidth = 300;
  const barAreaWidth = chartWidth - LABEL_WIDTH - COUNT_WIDTH;
  const svgHeight = bars.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth}
        height={svgHeight}
        className="block mx-auto"
        role="img"
        aria-label="QSO distribution by band"
      >
        {bars.map((bar, i) => {
          const y = i * (BAR_HEIGHT + BAR_GAP);
          const barWidth = (bar.widthPct / 100) * barAreaWidth;
          return (
            <g key={bar.band}>
              {/* Band label */}
              <text
                x={LABEL_WIDTH - 6}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-gray-300"
                fontSize={11}
                fontFamily="monospace"
              >
                {bar.band}
              </text>
              {/* Bar background */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={barAreaWidth}
                height={BAR_HEIGHT}
                rx={3}
                fill="rgba(255,255,255,0.04)"
              />
              {/* Bar fill */}
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={Math.max(barWidth, 2)}
                height={BAR_HEIGHT}
                rx={3}
                fill={BAR_COLOR}
                opacity={0.85}
              />
              {/* Count label */}
              <text
                x={LABEL_WIDTH + barAreaWidth + 6}
                y={y + BAR_HEIGHT / 2 + 1}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-gray-400"
                fontSize={11}
                fontFamily="monospace"
              >
                {bar.count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
