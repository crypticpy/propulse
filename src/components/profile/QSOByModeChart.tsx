/**
 * SVG donut chart showing QSO distribution by mode.
 * Displays top 5 modes with remaining grouped as "Other".
 */

import { useMemo } from "react";

/** Chart-friendly color palette — all colors chosen for visibility on dark backgrounds */
const CHART_COLORS = [
  "#f97316", // orange (FT8)
  "#22c55e", // green (SSB)
  "#3b82f6", // blue (CW)
  "#a855f7", // purple (FT4)
  "#eab308", // yellow (RTTY)
  "#ec4899", // pink (Other)
  "#06b6d4", // cyan
  "#f43f5e", // rose
] as const;

const SIZE = 160;
const STROKE_WIDTH = 28;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ModeSlice {
  label: string;
  count: number;
  percentage: number;
  color: string;
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
        color: CHART_COLORS[i % CHART_COLORS.length],
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
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width="100%"
          className="max-w-full transform -rotate-90"
          style={{ aspectRatio: "1 / 1" }}
        >
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
              stroke={slice.color}
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
              style={{ backgroundColor: slice.color }}
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
