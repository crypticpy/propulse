import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { kpToAp } from "@/lib/utils/solarConversions";

export interface AIndexDataPoint {
  time_tag: string;
  kp_index: number;
}

export interface AIndexChartProps {
  /** Array of K-index data points (used to derive A-index) */
  data: AIndexDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/** Chart dimensions */
const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 30, left: 45 };

/** Calculate inner chart dimensions */
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Get condition color based on A-index value
 * A-index thresholds:
 * 0-7: Quiet (green)
 * 8-15: Unsettled (yellow)
 * 16-29: Active (orange)
 * 30-49: Minor Storm (red)
 * 50+: Major Storm (magenta)
 */
function getAIndexColor(ap: number): string {
  if (ap <= 7) return "#00ff88"; // Quiet - green
  if (ap <= 15) return "#88cc44"; // Unsettled - yellow-green
  if (ap <= 29) return "#ffaa00"; // Active - amber
  if (ap <= 49) return "#ff7700"; // Minor storm - orange
  if (ap <= 99) return "#ff4455"; // Major storm - red
  return "#ff0088"; // Severe - magenta
}

/**
 * Get condition label based on A-index value
 */
function getAIndexCondition(ap: number): string {
  if (ap <= 7) return "Quiet";
  if (ap <= 15) return "Unsettled";
  if (ap <= 29) return "Active";
  if (ap <= 49) return "Minor Storm";
  if (ap <= 99) return "Major Storm";
  return "Severe Storm";
}

/**
 * AIndexChart Component
 *
 * Displays A-index values derived from K-index data.
 * A-index is a daily linear measure of geomagnetic activity,
 * converted from the 3-hour Kp readings.
 *
 * @example
 * ```tsx
 * <AIndexChart data={kIndexData} loading={false} />
 * ```
 */
export const AIndexChart: React.FC<AIndexChartProps> = ({
  data,
  loading = false,
  onExpand,
}) => {
  // Process data to calculate A-index for each 3-hour period
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        path: "",
        areaPath: "",
        yMin: 0,
        yMax: 50,
        currentAp: 0,
        avgAp: 0,
        maxAp: 0,
        trend: "stable" as const,
      };
    }

    // Take last 8 data points (same as K-index display)
    const recentData = data.slice(-8);

    // Convert Kp to Ap for each data point
    const apValues = recentData.map((d) => ({
      time_tag: d.time_tag,
      ap: kpToAp(d.kp_index),
    }));

    // Calculate Y-axis range
    const apNums = apValues.map((d) => d.ap);
    const dataMax = Math.max(...apNums, 15); // At least show up to 15
    const yMin = 0;
    const yMax = Math.max(50, Math.ceil(dataMax / 10) * 10 + 10);

    // Scale functions
    const xScale = (index: number) =>
      PADDING.left + (index / (apValues.length - 1 || 1)) * INNER_WIDTH;
    const yScale = (value: number) =>
      PADDING.top +
      INNER_HEIGHT -
      ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT;

    // Generate points
    const points = apValues.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.ap),
      ap: d.ap,
      time_tag: d.time_tag,
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

    // Calculate stats
    const currentAp = apValues[apValues.length - 1]?.ap || 0;
    const avgAp = Math.round(apNums.reduce((a, b) => a + b, 0) / apNums.length);
    const maxAp = Math.max(...apNums);

    // Calculate trend
    let trend: "rising" | "falling" | "stable" = "stable";
    if (apValues.length >= 4) {
      const recentAvg =
        apValues.slice(-2).reduce((sum, d) => sum + d.ap, 0) / 2;
      const olderAvg =
        apValues.slice(-4, -2).reduce((sum, d) => sum + d.ap, 0) / 2;
      if (recentAvg - olderAvg > 5) trend = "rising";
      else if (olderAvg - recentAvg > 5) trend = "falling";
    }

    return {
      points,
      path,
      areaPath,
      yMin,
      yMax,
      currentAp,
      avgAp,
      maxAp,
      trend,
    };
  }, [data]);

  // Y-axis labels
  const yLabels = useMemo(() => {
    const labels: { value: number; y: number }[] = [];
    const step = chartData.yMax <= 50 ? 10 : 20;
    for (let v = 0; v <= chartData.yMax; v += step) {
      const y =
        PADDING.top +
        INNER_HEIGHT -
        ((v - chartData.yMin) / (chartData.yMax - chartData.yMin)) *
          INNER_HEIGHT;
      labels.push({ value: v, y });
    }
    return labels;
  }, [chartData.yMin, chartData.yMax]);

  // Threshold lines for storm levels
  const thresholds = [
    { value: 30, label: "Minor Storm", color: "#ff770066" },
    { value: 50, label: "Major Storm", color: "#ff445566" },
  ].filter((t) => t.value <= chartData.yMax);

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          A-INDEX (24 Hours)
        </h2>
        <div className="flex items-center gap-2">
          {loading && <LoadingSpinner size="sm" />}
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 text-gray-500 hover:text-white transition-colors"
              aria-label="Expand chart"
            >
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
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <LoadingSpinner size="md" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex items-center justify-center min-h-[200px] text-gray-500 text-sm">
          No data available
        </div>
      ) : (
        <>
          {/* SVG Chart */}
          <div
            className="relative w-full"
            style={{ aspectRatio: `${CHART_WIDTH}/${CHART_HEIGHT}` }}
          >
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full"
              role="img"
              aria-label="A-Index line chart showing 24-hour geomagnetic activity"
            >
              <defs>
                {/* Gradient for area fill */}
                <linearGradient
                  id="aIndexAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0.05" />
                </linearGradient>

                {/* Gradient for line */}
                <linearGradient
                  id="aIndexLineGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="1" />
                </linearGradient>
              </defs>

              {/* Y-axis */}
              <line
                x1={PADDING.left}
                y1={PADDING.top}
                x2={PADDING.left}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Y-axis labels and grid */}
              {yLabels.map(({ value, y }) => (
                <g key={value}>
                  <line
                    x1={PADDING.left - 8}
                    y1={y}
                    x2={PADDING.left}
                    y2={y}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                  />
                  <text
                    x={PADDING.left - 12}
                    y={y}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {value}
                  </text>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={PADDING.left + INNER_WIDTH}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="1"
                  />
                </g>
              ))}

              {/* Storm threshold lines */}
              {thresholds.map(({ value, label, color }) => {
                const y =
                  PADDING.top +
                  INNER_HEIGHT -
                  ((value - chartData.yMin) /
                    (chartData.yMax - chartData.yMin)) *
                    INNER_HEIGHT;
                return (
                  <g key={value}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={PADDING.left + INNER_WIDTH}
                      y2={y}
                      stroke={color}
                      strokeWidth="1"
                      strokeDasharray="6,4"
                    />
                    <text
                      x={PADDING.left + INNER_WIDTH + 4}
                      y={y}
                      fill={color.replace("66", "ff")}
                      fontSize="9"
                      fontFamily="sans-serif"
                      dominantBaseline="middle"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* X-axis */}
              <line
                x1={PADDING.left}
                y1={PADDING.top + INNER_HEIGHT}
                x2={PADDING.left + INNER_WIDTH}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Area fill */}
              <path
                d={chartData.areaPath}
                fill="url(#aIndexAreaGradient)"
                className="transition-all duration-500"
              />

              {/* Line */}
              <path
                d={chartData.path}
                fill="none"
                stroke="url(#aIndexLineGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500"
              />

              {/* Data points with color coding */}
              {chartData.points.map((point, index) => (
                <g key={index}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={index === chartData.points.length - 1 ? 5 : 4}
                    fill={getAIndexColor(point.ap)}
                    stroke="#0a0a0f"
                    strokeWidth="2"
                  >
                    <title>
                      A={point.ap} ({getAIndexCondition(point.ap)})
                    </title>
                  </circle>

                  {/* X-axis label for each point */}
                  <text
                    x={point.x}
                    y={PADDING.top + INNER_HEIGHT + 18}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {new Date(point.time_tag)
                      .getUTCHours()
                      .toString()
                      .padStart(2, "0")}
                  </text>
                </g>
              ))}

              {/* Current value highlight */}
              {chartData.points.length > 0 && (
                <circle
                  cx={chartData.points[chartData.points.length - 1].x}
                  cy={chartData.points[chartData.points.length - 1].y}
                  r="8"
                  fill={`${getAIndexColor(chartData.currentAp)}33`}
                  className="animate-pulse"
                />
              )}
            </svg>
          </div>

          {/* Footer with stats */}
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  Current
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="font-mono text-2xl font-bold"
                    style={{ color: getAIndexColor(chartData.currentAp) }}
                  >
                    {chartData.currentAp}
                  </span>
                  <span className="text-xs text-gray-400">
                    {getAIndexCondition(chartData.currentAp)}
                  </span>
                </div>
              </div>

              <div className="pl-4 border-l border-white/10">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  24h Average
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="font-mono text-lg font-semibold"
                    style={{ color: getAIndexColor(chartData.avgAp) }}
                  >
                    {chartData.avgAp}
                  </span>
                </div>
              </div>

              <div className="pl-4 border-l border-white/10">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  Peak
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="font-mono text-lg font-semibold"
                    style={{ color: getAIndexColor(chartData.maxAp) }}
                  >
                    {chartData.maxAp}
                  </span>
                </div>
              </div>
            </div>

            {/* Trend indicator */}
            <div className="text-right">
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Trend
              </span>
              <div
                className={`font-mono text-sm mt-1 ${
                  chartData.trend === "rising"
                    ? "text-alert-red"
                    : chartData.trend === "falling"
                      ? "text-signal-green"
                      : "text-caution-amber"
                }`}
              >
                {chartData.trend === "rising"
                  ? "↗ Rising"
                  : chartData.trend === "falling"
                    ? "↘ Falling"
                    : "→ Stable"}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

AIndexChart.displayName = "AIndexChart";

export default AIndexChart;
