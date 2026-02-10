import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";

export interface SolarFluxDataPoint {
  time_tag: string;
  flux: number;
}

export interface SolarFluxChartProps {
  /** Array of solar flux data points with time_tag and flux */
  data: SolarFluxDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/** Chart dimensions */
const CHART_WIDTH = 400;
const CHART_HEIGHT = 140;
const PADDING = { top: 10, right: 20, bottom: 30, left: 40 };

/** Calculate inner chart dimensions */
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Format date for axis label (e.g., "Jan 15")
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Calculate trend direction from data
 */
function calculateTrend(
  data: SolarFluxDataPoint[],
): "rising" | "falling" | "stable" {
  if (data.length < 5) {
    return "stable";
  }

  const recentAvg = data.slice(-5).reduce((sum, d) => sum + d.flux, 0) / 5;
  const olderAvg =
    data.slice(-10, -5).reduce((sum, d) => sum + d.flux, 0) /
    Math.min(5, data.slice(-10, -5).length || 1);

  const diff = recentAvg - olderAvg;
  if (diff > 5) {
    return "rising";
  }
  if (diff < -5) {
    return "falling";
  }
  return "stable";
}

/**
 * Get trend display info
 */
function getTrendDisplay(trend: "rising" | "falling" | "stable"): {
  label: string;
  arrow: string;
  color: string;
} {
  switch (trend) {
    case "rising":
      return { label: "Rising", arrow: "↗", color: "text-signal-green" };
    case "falling":
      return { label: "Falling", arrow: "↘", color: "text-alert-red" };
    default:
      return { label: "Stable", arrow: "→", color: "text-caution-amber" };
  }
}

/**
 * SolarFluxChart Component
 *
 * Displays a 30-day solar flux index trend chart with SVG line graph.
 * Shows current value, 30-day average, and trend indicator.
 *
 * @example
 * ```tsx
 * <SolarFluxChart
 *   data={[{ time_tag: "2024-01-01", flux: 120 }, ...]}
 *   loading={false}
 * />
 * ```
 */
export const SolarFluxChart: React.FC<SolarFluxChartProps> = ({
  data,
  loading = false,
  onExpand,
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        path: "",
        areaPath: "",
        yMin: 80,
        yMax: 200,
        xLabels: [],
        yLabels: [],
        currentValue: 0,
        average: 0,
        trend: "stable" as const,
      };
    }

    // Calculate Y-axis range with padding
    const fluxValues = data.map((d) => d.flux);
    const dataMin = Math.min(...fluxValues);
    const dataMax = Math.max(...fluxValues);
    const yPadding = (dataMax - dataMin) * 0.15 || 10;
    const yMin = Math.max(60, Math.floor((dataMin - yPadding) / 10) * 10);
    const yMax = Math.min(250, Math.ceil((dataMax + yPadding) / 10) * 10);

    // Scale functions
    const xScale = (index: number) =>
      PADDING.left + (index / (data.length - 1 || 1)) * INNER_WIDTH;
    const yScale = (value: number) =>
      PADDING.top +
      INNER_HEIGHT -
      ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT;

    // Generate points
    const points = data.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.flux),
      flux: d.flux,
      date: d.time_tag,
    }));

    // Generate line path
    const path = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(" ");

    // Generate area path (filled below line)
    const areaPath =
      path +
      ` L ${points[points.length - 1]?.x.toFixed(1) || 0} ${(PADDING.top + INNER_HEIGHT).toFixed(1)}` +
      ` L ${points[0]?.x.toFixed(1) || 0} ${(PADDING.top + INNER_HEIGHT).toFixed(1)} Z`;

    // X-axis labels (every 5th day)
    const xLabels = data
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i % 5 === 0 || i === data.length - 1)
      .map(({ d, i }) => ({
        label: formatDateLabel(d.time_tag),
        x: xScale(i),
      }));

    // Y-axis labels
    const yStep = Math.ceil((yMax - yMin) / 4 / 10) * 10;
    const yLabels: { label: string; y: number }[] = [];
    for (let v = yMin; v <= yMax; v += yStep) {
      yLabels.push({ label: String(v), y: yScale(v) });
    }

    // Calculate stats
    const currentValue = data[data.length - 1]?.flux || 0;
    const average = Math.round(
      fluxValues.reduce((a, b) => a + b, 0) / fluxValues.length,
    );
    const trend = calculateTrend(data);

    return {
      points,
      path,
      areaPath,
      yMin,
      yMax,
      xLabels,
      yLabels,
      currentValue,
      average,
      trend,
    };
  }, [data]);

  const trendDisplay = getTrendDisplay(chartData.trend);

  return (
    <Card
      animate
      className={`h-full relative ${onExpand ? "cursor-pointer hover:border-white/30 hover:bg-white/[0.05] group" : ""}`}
      onClick={onExpand}
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
      onKeyDown={
        onExpand
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExpand();
              }
            }
          : undefined
      }
    >
      {/* Expand icon - hover only */}
      {onExpand && (
        <div className="absolute top-3 right-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          Solar Flux Index 30-Day Trend
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[180px]">
          <LoadingSpinner size="md" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex items-center justify-center min-h-[180px] text-gray-500 text-sm">
          No data available
        </div>
      ) : (
        <>
          {/* SVG Chart */}
          <div
            className="w-full"
            style={{ aspectRatio: `${CHART_WIDTH}/${CHART_HEIGHT}` }}
          >
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full"
              role="img"
              aria-label="Solar Flux Index 30-day trend chart"
            >
              <defs>
                {/* Gradient for area fill */}
                <linearGradient
                  id="fluxAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#ff6b35" stopOpacity="0.05" />
                </linearGradient>

                {/* Gradient for line */}
                <linearGradient
                  id="fluxLineGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ff6b35" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {chartData.yLabels.map(({ y }, i) => (
                <line
                  key={`grid-${i}`}
                  x1={PADDING.left}
                  y1={y}
                  x2={PADDING.left + INNER_WIDTH}
                  y2={y}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              ))}

              {/* Area fill */}
              <path
                d={chartData.areaPath}
                fill="url(#fluxAreaGradient)"
                className="transition-all duration-500"
              />

              {/* Line */}
              <path
                d={chartData.path}
                fill="none"
                stroke="url(#fluxLineGradient)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500"
              />

              {/* Current value marker (end point) */}
              {chartData.points.length > 0 && (
                <>
                  {/* Outer glow */}
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="6"
                    fill="rgba(255, 107, 53, 0.3)"
                    className="animate-pulse"
                  />
                  {/* Inner dot */}
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="3"
                    fill="#ff6b35"
                    stroke="#fff"
                    strokeWidth="1"
                  />
                </>
              )}

              {/* Y-axis labels */}
              {chartData.yLabels.map(({ label, y }, i) => (
                <text
                  key={`y-label-${i}`}
                  x={PADDING.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-500 text-[10px] font-mono"
                >
                  {label}
                </text>
              ))}

              {/* X-axis labels */}
              {chartData.xLabels.map(({ label, x }, i) => (
                <text
                  key={`x-label-${i}`}
                  x={x}
                  y={CHART_HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-gray-500 text-[9px] font-mono"
                >
                  {label}
                </text>
              ))}

              {/* Y-axis line */}
              <line
                x1={PADDING.left}
                y1={PADDING.top}
                x2={PADDING.left}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />

              {/* X-axis line */}
              <line
                x1={PADDING.left}
                y1={PADDING.top + INNER_HEIGHT}
                x2={PADDING.left + INNER_WIDTH}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
            </svg>
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/5">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-gray-500 block">Current</span>
                <span className="text-sm font-mono text-plasma-orange font-medium">
                  {chartData.currentValue} sfu
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500 block">30d Avg</span>
                <span className="text-sm font-mono text-gray-300">
                  {chartData.average} sfu
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block">Trend</span>
              <span className={`text-sm font-mono ${trendDisplay.color}`}>
                {trendDisplay.arrow} {trendDisplay.label}
              </span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

SolarFluxChart.displayName = "SolarFluxChart";

export default SolarFluxChart;
