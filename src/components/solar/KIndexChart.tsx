import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { getKIndexDescription } from "@/lib/utils/bands";

export interface KIndexDataPoint {
  time_tag: string;
  kp_index: number;
}

export interface KIndexChartProps {
  /** Array of K-index data points (last 24 hours) */
  data: KIndexDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/**
 * Get bar color based on K-index severity
 */
function getBarColor(kp: number): string {
  if (kp <= 2) return "#00ff88"; // Green - Quiet
  if (kp <= 4) return "#ffaa00"; // Yellow - Unsettled
  if (kp <= 6) return "#ff7700"; // Orange - Storm
  return "#ff4455"; // Red - Severe
}

/**
 * Get severity label for K-index value
 */
function getSeverityLabel(kp: number): string {
  if (kp <= 2) return "Quiet";
  if (kp <= 4) return "Unsettled";
  if (kp <= 6) return "Storm";
  return "Severe";
}

/**
 * KIndexChart Component
 *
 * SVG-based bar chart showing 24-hour K-index history.
 * Bars are colored by severity level with a storm threshold line at K=5.
 *
 * @example
 * ```tsx
 * <KIndexChart data={kIndexData} loading={false} />
 * ```
 */
export const KIndexChart: React.FC<KIndexChartProps> = ({
  data,
  loading = false,
  onExpand,
}) => {
  // Chart dimensions - use wider aspect ratio like SolarFluxChart
  const chartWidth = 400;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Process data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Take last 8 data points (3-hour intervals for 24 hours)
    const recentData = data.slice(-8);

    return recentData.map((point, index) => {
      const date = new Date(point.time_tag);
      const hour = date.getUTCHours();
      return {
        ...point,
        hour,
        label: `${hour.toString().padStart(2, "0")}:00`,
        index,
      };
    });
  }, [data]);

  // Current K-index (most recent)
  const currentKIndex =
    data && data.length > 0 ? data[data.length - 1].kp_index : 0;

  // 3-hour forecast (if available, use second-to-last as estimate)
  const forecastKIndex =
    data && data.length > 1
      ? Math.round(
          (data[data.length - 1].kp_index + data[data.length - 2].kp_index) / 2,
        )
      : currentKIndex;

  // Calculate bar dimensions
  const barWidth =
    chartData.length > 0 ? (innerWidth / chartData.length) * 0.7 : 10;
  const barGap =
    chartData.length > 0 ? (innerWidth / chartData.length) * 0.3 : 2;

  // Y-axis scale (0-9 for K-index)
  const maxY = 9;
  const yScale = (value: number) =>
    padding.top + innerHeight - (value / maxY) * innerHeight;

  // X position for each bar
  const xPosition = (index: number) =>
    padding.left + index * (barWidth + barGap) + barGap / 2;

  // Y-axis tick marks
  const yTicks = [0, 3, 5, 7, 9];

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          K-INDEX (Last 24 Hours)
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

      {/* Chart */}
      <div
        className="relative w-full"
        style={{ aspectRatio: `${chartWidth}/${chartHeight}` }}
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          role="img"
          aria-label="K-Index bar chart showing last 24 hours of geomagnetic activity"
        >
          {/* Y-axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + innerHeight}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />

          {/* Y-axis tick marks and labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left - 8}
                y1={yScale(tick)}
                x2={padding.left}
                y2={yScale(tick)}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 12}
                y={yScale(tick)}
                fill="rgba(255,255,255,0.5)"
                fontSize="11"
                fontFamily="monospace"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {tick}
              </text>
              {/* Horizontal grid line */}
              <line
                x1={padding.left}
                y1={yScale(tick)}
                x2={padding.left + innerWidth}
                y2={yScale(tick)}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Storm threshold line at K=5 */}
          <line
            x1={padding.left}
            y1={yScale(5)}
            x2={padding.left + innerWidth}
            y2={yScale(5)}
            stroke="#ff4455"
            strokeWidth="1"
            strokeDasharray="6,4"
            opacity="0.6"
          />
          <text
            x={padding.left + innerWidth + 4}
            y={yScale(5)}
            fill="#ff4455"
            fontSize="10"
            fontFamily="sans-serif"
            dominantBaseline="middle"
            opacity="0.8"
          >
            Storm
          </text>

          {/* X-axis */}
          <line
            x1={padding.left}
            y1={padding.top + innerHeight}
            x2={padding.left + innerWidth}
            y2={padding.top + innerHeight}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
          />

          {/* Bars */}
          {chartData.map((point, index) => {
            const barHeight = (point.kp_index / maxY) * innerHeight;
            const x = xPosition(index);
            const y = yScale(point.kp_index);

            return (
              <g key={`bar-${index}`}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={getBarColor(point.kp_index)}
                  rx="2"
                  opacity="0.85"
                  className="transition-all duration-300"
                >
                  <title>
                    {point.label} UTC: K={point.kp_index} (
                    {getSeverityLabel(point.kp_index)})
                  </title>
                </rect>

                {/* X-axis label */}
                <text
                  x={x + barWidth / 2}
                  y={padding.top + innerHeight + 18}
                  fill="rgba(255,255,255,0.5)"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {point.label.slice(0, 2)}
                </text>
              </g>
            );
          })}

          {/* Current time marker - last bar highlight */}
          {chartData.length > 0 && (
            <rect
              x={xPosition(chartData.length - 1) - 2}
              y={padding.top}
              width={barWidth + 4}
              height={innerHeight}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="4,4"
              rx="2"
            />
          )}
        </svg>
      </div>

      {/* Footer with current value and forecast */}
      <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              Current
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="font-mono text-2xl font-bold"
                style={{ color: getBarColor(currentKIndex) }}
              >
                {currentKIndex}
              </span>
              <span className="text-xs text-gray-400">
                {getKIndexDescription(currentKIndex)}
              </span>
            </div>
          </div>

          <div className="pl-4 border-l border-white/10">
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              3hr Forecast
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="font-mono text-lg font-semibold"
                style={{ color: getBarColor(forecastKIndex) }}
              >
                {forecastKIndex}
              </span>
              <span className="text-xs text-gray-400">
                {getKIndexDescription(forecastKIndex)}
              </span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden md:flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#00ff88" }}
            ></span>
            <span className="text-gray-400">Quiet (0-2)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#ffaa00" }}
            ></span>
            <span className="text-gray-400">Unsettled (3-4)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#ff7700" }}
            ></span>
            <span className="text-gray-400">Storm (5-6)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: "#ff4455" }}
            ></span>
            <span className="text-gray-400">Severe (7-9)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

KIndexChart.displayName = "KIndexChart";

export default KIndexChart;
