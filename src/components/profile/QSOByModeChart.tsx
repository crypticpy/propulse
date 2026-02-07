/**
 * SVG donut chart showing QSO distribution by mode.
 * Displays top 5 modes with remaining grouped as "Other".
 */

import { useMemo } from "react";

const CHART_COLORS = [
  "rgb(255,107,53)", // plasma-orange
  "rgb(0,255,136)", // signal-green
  "rgb(26,26,46)", // nebula-blue (dark, use stroke over dark bg)
  "#ffd23f", // caution-yellow
  "#ff4455", // alert-red
  "rgba(255,255,255,0.3)", // Other
] as const;

// Brighter variant of nebula-blue for visibility on dark backgrounds
const LEGEND_COLORS = [
  "rgb(255,107,53)",
  "rgb(0,255,136)",
  "#3a86ff", // sunspot-blue (visible alternative for chart)
  "#ffd23f",
  "#ff4455",
  "rgba(255,255,255,0.3)",
];

const SIZE = 160;
const STROKE_WIDTH = 28;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ModeSlice {
  label: string;
  count: number;
  percentage: number;
  color: string;
  legendColor: string;
  offset: number;
  dashLength: number;
}

export function QSOByModeChart({ data }: { data: Record<string, number> }) {
  const { slices, total } = useMemo(() => {
    const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
    const totalCount = entries.reduce((sum, [, c]) => sum + c, 0);

    if (totalCount === 0) {
      return { slices: [] as ModeSlice[], total: 0 };
    }

    // Top 5, rest as "Other"
    const top = entries.slice(0, 5);
    const otherCount = entries.slice(5).reduce((sum, [, c]) => sum + c, 0);

    const items: { label: string; count: number }[] = top.map(
      ([label, count]) => ({ label, count }),
    );
    if (otherCount > 0) {
      items.push({ label: "Other", count: otherCount });
    }

    let cumulativeOffset = 0;
    const result: ModeSlice[] = items.map((item, i) => {
      const pct = (item.count / totalCount) * 100;
      const dashLength = (item.count / totalCount) * CIRCUMFERENCE;
      const slice: ModeSlice = {
        label: item.label,
        count: item.count,
        percentage: pct,
        color: CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)],
        legendColor: LEGEND_COLORS[Math.min(i, LEGEND_COLORS.length - 1)],
        offset: cumulativeOffset,
        dashLength,
      };
      cumulativeOffset += dashLength;
      return slice;
    });

    return { slices: result, total: totalCount };
  }, [data]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No QSOs logged yet
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Donut */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={STROKE_WIDTH}
          />
          {/* Slices */}
          {slices.map((slice) => (
            <circle
              key={slice.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={slice.color === "rgb(26,26,46)" ? "#3a86ff" : slice.color}
              strokeWidth={STROKE_WIDTH}
              strokeDasharray={`${slice.dashLength} ${CIRCUMFERENCE - slice.dashLength}`}
              strokeDashoffset={-slice.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white font-mono">
            {total}
          </span>
          <span className="text-[10px] text-gray-400 uppercase">QSOs</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: slice.legendColor }}
            />
            <span className="text-gray-300">{slice.label}</span>
            <span className="text-gray-500 ml-auto tabular-nums">
              {slice.count}
            </span>
            <span className="text-gray-600 tabular-nums">
              ({slice.percentage.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
