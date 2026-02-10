import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";

export interface BzDataPoint {
  time_tag: string;
  bz_gsm: number;
}

export interface BzChartProps {
  /** Array of magnetometer data points */
  data: BzDataPoint[];
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/** Chart dimensions */
const CHART_WIDTH = 400;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 40, bottom: 30, left: 45 };

/** Calculate inner chart dimensions */
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Get Bz condition description
 * Negative Bz (southward IMF) is concerning for geomagnetic storms
 */
function getBzCondition(bz: number): {
  label: string;
  color: string;
  description: string;
} {
  if (bz >= 5) {
    return {
      label: "Strongly Northward",
      color: "#00ff88",
      description: "Very stable, excellent HF conditions",
    };
  }
  if (bz >= 0) {
    return {
      label: "Northward",
      color: "#44dd66",
      description: "Stable conditions, good propagation",
    };
  }
  if (bz >= -5) {
    return {
      label: "Weakly Southward",
      color: "#ffaa00",
      description: "Some energy coupling, watch for changes",
    };
  }
  if (bz >= -10) {
    return {
      label: "Southward",
      color: "#ff7700",
      description: "Energy transfer occurring, possible storm development",
    };
  }
  if (bz >= -20) {
    return {
      label: "Strongly Southward",
      color: "#ff4455",
      description: "High energy coupling, storm conditions likely",
    };
  }
  return {
    label: "Extreme Southward",
    color: "#ff0088",
    description: "Severe storm conditions expected",
  };
}

/**
 * Get color for Bz value (gradient from green to red)
 */
function getBzColor(bz: number): string {
  if (bz >= 5) {
    return "#00ff88";
  }
  if (bz >= 0) {
    return "#44dd66";
  }
  if (bz >= -5) {
    return "#ffaa00";
  }
  if (bz >= -10) {
    return "#ff7700";
  }
  if (bz >= -20) {
    return "#ff4455";
  }
  return "#ff0088";
}

/**
 * BzChart Component
 *
 * Displays IMF Bz (Interplanetary Magnetic Field - Z component in GSM coordinates).
 * Negative Bz is critical for geomagnetic storm prediction - when the IMF is
 * directed southward, it couples energy into Earth's magnetosphere.
 *
 * @example
 * ```tsx
 * <BzChart data={magnetometerData} loading={false} />
 * ```
 */
export const BzChart: React.FC<BzChartProps> = ({
  data,
  loading = false,
  onExpand,
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        positivePath: "",
        negativePath: "",
        positiveAreaPath: "",
        negativeAreaPath: "",
        yMin: -15,
        yMax: 15,
        currentBz: 0,
        minBz: 0,
        maxBz: 0,
        avgBz: 0,
        trend: "stable" as const,
      };
    }

    // Sample data to show ~60 points (1 hour at 1-min intervals)
    const sampledData = data.slice(-60);

    // Calculate Y-axis range (symmetric around 0)
    const bzValues = sampledData.map((d) => d.bz_gsm);
    const dataMin = Math.min(...bzValues);
    const dataMax = Math.max(...bzValues);
    const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax), 10);
    const yMin = -Math.ceil(absMax / 5) * 5;
    const yMax = Math.ceil(absMax / 5) * 5;

    // Scale functions
    const xScale = (index: number) =>
      PADDING.left + (index / (sampledData.length - 1 || 1)) * INNER_WIDTH;
    const yScale = (value: number) =>
      PADDING.top + INNER_HEIGHT / 2 - (value / yMax) * (INNER_HEIGHT / 2);

    // Generate points
    const points = sampledData.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.bz_gsm),
      bz: d.bz_gsm,
      time_tag: d.time_tag,
    }));

    // Generate line path (full line)
    const linePath = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(" ");

    // Zero line Y position
    const zeroY = yScale(0);

    // Generate positive area (above zero)
    let positiveAreaPath = "";
    let negativeAreaPath = "";

    if (points.length > 0) {
      // Positive area
      const positivePoints = points.map((p) => ({
        x: p.x,
        y: Math.min(p.y, zeroY),
      }));
      positiveAreaPath =
        `M ${positivePoints[0].x.toFixed(1)} ${zeroY.toFixed(1)} ` +
        positivePoints
          .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") +
        ` L ${positivePoints[positivePoints.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

      // Negative area
      const negativePoints = points.map((p) => ({
        x: p.x,
        y: Math.max(p.y, zeroY),
      }));
      negativeAreaPath =
        `M ${negativePoints[0].x.toFixed(1)} ${zeroY.toFixed(1)} ` +
        negativePoints
          .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") +
        ` L ${negativePoints[negativePoints.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;
    }

    // Calculate stats
    const currentBz = sampledData[sampledData.length - 1]?.bz_gsm ?? 0;
    const minBz = Math.min(...bzValues);
    const maxBz = Math.max(...bzValues);
    const avgBz = bzValues.reduce((a, b) => a + b, 0) / bzValues.length;

    // Calculate trend
    let trend: "rising" | "falling" | "stable" = "stable";
    if (sampledData.length >= 10) {
      const recentAvg =
        sampledData.slice(-5).reduce((sum, d) => sum + d.bz_gsm, 0) / 5;
      const olderAvg =
        sampledData.slice(-10, -5).reduce((sum, d) => sum + d.bz_gsm, 0) / 5;
      if (recentAvg - olderAvg > 2) {
        trend = "rising";
      } else if (olderAvg - recentAvg > 2) {
        trend = "falling";
      }
    }

    return {
      points,
      linePath,
      positiveAreaPath,
      negativeAreaPath,
      yMin,
      yMax,
      zeroY,
      currentBz,
      minBz,
      maxBz,
      avgBz,
      trend,
    };
  }, [data]);

  // Y-axis labels
  const yLabels = useMemo(() => {
    const labels: { value: number; y: number }[] = [];
    const step = chartData.yMax <= 15 ? 5 : 10;
    for (let v = chartData.yMin; v <= chartData.yMax; v += step) {
      const y =
        PADDING.top +
        INNER_HEIGHT / 2 -
        (v / chartData.yMax) * (INNER_HEIGHT / 2);
      labels.push({ value: v, y });
    }
    return labels;
  }, [chartData.yMin, chartData.yMax]);

  const bzCondition = getBzCondition(chartData.currentBz);

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
            IMF Bz (1 Hour)
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Interplanetary Magnetic Field - Z component
          </p>
        </div>
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
              aria-label="IMF Bz chart showing last hour of interplanetary magnetic field data"
            >
              <defs>
                {/* Positive area gradient (green for northward) */}
                <linearGradient
                  id="bzPositiveGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0.05" />
                </linearGradient>

                {/* Negative area gradient (red for southward) */}
                <linearGradient
                  id="bzNegativeGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#ff4455" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#ff4455" stopOpacity="0.4" />
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
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {value > 0 ? `+${value}` : value}
                  </text>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={PADDING.left + INNER_WIDTH}
                    y2={y}
                    stroke={
                      value === 0
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(255,255,255,0.05)"
                    }
                    strokeWidth={value === 0 ? 2 : 1}
                    strokeDasharray="none"
                  />
                </g>
              ))}

              {/* Zero reference label */}
              <text
                x={CHART_WIDTH - 4}
                y={chartData.zeroY || PADDING.top + INNER_HEIGHT / 2}
                fill="rgba(255,255,255,0.6)"
                fontSize="10"
                fontFamily="sans-serif"
                dominantBaseline="middle"
                textAnchor="end"
              >
                0 nT
              </text>

              {/* X-axis */}
              <line
                x1={PADDING.left}
                y1={PADDING.top + INNER_HEIGHT}
                x2={PADDING.left + INNER_WIDTH}
                y2={PADDING.top + INNER_HEIGHT}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Positive area fill (northward) */}
              {chartData.positiveAreaPath && (
                <path
                  d={chartData.positiveAreaPath}
                  fill="url(#bzPositiveGradient)"
                  className="transition-all duration-500"
                />
              )}

              {/* Negative area fill (southward) */}
              {chartData.negativeAreaPath && (
                <path
                  d={chartData.negativeAreaPath}
                  fill="url(#bzNegativeGradient)"
                  className="transition-all duration-500"
                />
              )}

              {/* Line */}
              {chartData.linePath && (
                <path
                  d={chartData.linePath}
                  fill="none"
                  stroke={getBzColor(chartData.currentBz)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-500"
                />
              )}

              {/* Current value marker */}
              {chartData.points.length > 0 && (
                <>
                  {/* Outer glow */}
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="8"
                    fill={`${getBzColor(chartData.currentBz)}33`}
                    className="animate-pulse"
                  />
                  {/* Inner dot */}
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="4"
                    fill={getBzColor(chartData.currentBz)}
                    stroke="#0a0a0f"
                    strokeWidth="2"
                  />
                </>
              )}

              {/* X-axis time labels */}
              {[
                0,
                Math.floor(chartData.points.length / 2),
                chartData.points.length - 1,
              ]
                .filter((i) => chartData.points[i])
                .map((i) => {
                  const point = chartData.points[i];
                  const date = new Date(point.time_tag);
                  const label = `${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}`;
                  return (
                    <text
                      key={i}
                      x={point.x}
                      y={PADDING.top + INNER_HEIGHT + 18}
                      fill="rgba(255,255,255,0.5)"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  );
                })}
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
                    style={{ color: getBzColor(chartData.currentBz) }}
                  >
                    {chartData.currentBz > 0 ? "+" : ""}
                    {chartData.currentBz.toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-400">nT</span>
                </div>
              </div>

              <div className="pl-4 border-l border-white/10">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  1hr Min/Max
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="font-mono text-sm"
                    style={{ color: getBzColor(chartData.minBz) }}
                  >
                    {chartData.minBz.toFixed(1)}
                  </span>
                  <span className="text-gray-500">/</span>
                  <span
                    className="font-mono text-sm"
                    style={{ color: getBzColor(chartData.maxBz) }}
                  >
                    {chartData.maxBz > 0 ? "+" : ""}
                    {chartData.maxBz.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Condition indicator */}
            <div className="text-right">
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Status
              </span>
              <div
                className="font-semibold text-sm mt-1"
                style={{ color: bzCondition.color }}
              >
                {bzCondition.label}
              </div>
            </div>
          </div>

          {/* Storm risk indicator for negative Bz */}
          {chartData.currentBz < -5 && (
            <div className="mt-3 p-2 bg-alert-red/10 border border-alert-red/30 rounded-lg">
              <div className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-alert-red"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs text-alert-red font-medium">
                  Southward IMF - Energy coupling into magnetosphere
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

BzChart.displayName = "BzChart";

export default BzChart;
