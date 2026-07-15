import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { Card } from "@/components/ui/Card";

export interface SolarFluxDataPoint {
  time_tag: string;
  flux: number;
}

export interface SolarFluxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: number;
  data: SolarFluxDataPoint[];
}

/** Chart dimensions for the expanded view */
const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Get activity level based on SFI value
 */
function getActivityLevel(sfi: number): {
  level: string;
  color: string;
  description: string;
} {
  if (sfi >= 150) {
    return {
      level: "Active",
      color: "#00ff88",
      description: "Excellent HF propagation conditions",
    };
  }
  if (sfi >= 90) {
    return {
      level: "Moderate",
      color: "#ffaa00",
      description: "Good HF propagation on most bands",
    };
  }
  return {
    level: "Quiet",
    color: "#ff4455",
    description: "Limited HF propagation, focus on lower bands",
  };
}

/**
 * Get recommended bands based on SFI value
 */
function getRecommendedBands(sfi: number): string[] {
  if (sfi >= 200) {
    return ["10m", "12m", "15m", "17m", "20m"];
  }
  if (sfi >= 150) {
    return ["12m", "15m", "17m", "20m", "30m"];
  }
  if (sfi >= 100) {
    return ["17m", "20m", "30m", "40m"];
  }
  if (sfi >= 80) {
    return ["20m", "30m", "40m", "80m"];
  }
  return ["40m", "80m", "160m"];
}

/**
 * Format date for chart label
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * SolarFluxModal Component
 *
 * Displays detailed solar flux information including:
 * - Current value with activity level interpretation
 * - 30-day trend chart
 * - Impact on HF propagation
 * - Recommended bands for current conditions
 */
export const SolarFluxModal: React.FC<SolarFluxModalProps> = ({
  isOpen,
  onClose,
  currentValue,
  data,
}) => {
  const activityInfo = getActivityLevel(currentValue);
  const recommendedBands = getRecommendedBands(currentValue);

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return { path: "", areaPath: "", yLabels: [], xLabels: [], points: [] };
    }

    const fluxValues = data.map((d) => d.flux);
    const dataMin = Math.min(...fluxValues);
    const dataMax = Math.max(...fluxValues);
    const yPadding = (dataMax - dataMin) * 0.15 || 10;
    const yMin = Math.max(60, Math.floor((dataMin - yPadding) / 10) * 10);
    const yMax = Math.min(300, Math.ceil((dataMax + yPadding) / 10) * 10);

    const xScale = (index: number) =>
      PADDING.left + (index / (data.length - 1 || 1)) * INNER_WIDTH;
    const yScale = (value: number) =>
      PADDING.top +
      INNER_HEIGHT -
      ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT;

    const points = data.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.flux),
      flux: d.flux,
      date: d.time_tag,
    }));

    const path = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(" ");

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

    return { path, areaPath, yLabels, xLabels, points };
  }, [data]);

  // Calculate average
  const average =
    data.length > 0
      ? Math.round(data.reduce((sum, d) => sum + d.flux, 0) / data.length)
      : 0;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Solar Flux Index (SFI)"
      subtitle="10.7 cm radio flux measurement"
      size="lg"
    >
      <div className="space-y-6">
        {/* Current Value Section */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                Current Value
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-5xl font-orbitron font-bold"
                  style={{ color: activityInfo.color }}
                >
                  {currentValue}
                </span>
                <span className="text-lg text-gray-400">sfu</span>
              </div>
            </div>
            <div className="text-right">
              <span
                className="text-lg font-semibold"
                style={{ color: activityInfo.color }}
              >
                {activityInfo.level}
              </span>
              <p className="text-sm text-gray-400 mt-1 max-w-xs">
                {activityInfo.description}
              </p>
            </div>
          </div>
        </Card>

        {/* What is Solar Flux? */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-2">
            What is Solar Flux?
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            The Solar Flux Index (SFI) measures solar radio emissions at 10.7 cm
            wavelength (2800 MHz). It is one of the longest-running indicators
            of solar activity and directly correlates with ionospheric
            ionization levels. Higher SFI values indicate stronger ionization,
            enabling better long-distance HF radio propagation, especially on
            higher bands like 10m, 12m, and 15m.
          </p>
        </Card>

        {/* 30-Day Trend Chart */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-4">
            30-Day Trend
          </h3>
          {data.length > 0 ? (
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
                  <linearGradient
                    id="modalFluxAreaGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.4" />
                    <stop
                      offset="100%"
                      stopColor="#ff6b35"
                      stopOpacity="0.05"
                    />
                  </linearGradient>
                  <linearGradient
                    id="modalFluxLineGradient"
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
                  fill="url(#modalFluxAreaGradient)"
                />

                {/* Line */}
                <path
                  d={chartData.path}
                  fill="none"
                  stroke="url(#modalFluxLineGradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Current value marker */}
                {chartData.points.length > 0 && (
                  <>
                    <circle
                      cx={chartData.points[chartData.points.length - 1].x}
                      cy={chartData.points[chartData.points.length - 1].y}
                      r="8"
                      fill="rgba(255, 107, 53, 0.3)"
                      className="animate-pulse"
                    />
                    <circle
                      cx={chartData.points[chartData.points.length - 1].x}
                      cy={chartData.points[chartData.points.length - 1].y}
                      r="4"
                      fill="#ff6b35"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  </>
                )}

                {/* Y-axis labels */}
                {chartData.yLabels.map(({ label, y }, i) => (
                  <text
                    key={`y-label-${i}`}
                    x={PADDING.left - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-gray-500 text-[11px] font-mono"
                  >
                    {label}
                  </text>
                ))}

                {/* X-axis labels */}
                {chartData.xLabels.map(({ label, x }, i) => (
                  <text
                    key={`x-label-${i}`}
                    x={x}
                    y={CHART_HEIGHT - 10}
                    textAnchor="middle"
                    className="fill-gray-500 text-[10px] font-mono"
                  >
                    {label}
                  </text>
                ))}

                {/* Axes */}
                <line
                  x1={PADDING.left}
                  y1={PADDING.top}
                  x2={PADDING.left}
                  y2={PADDING.top + INNER_HEIGHT}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />
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
          ) : (
            <div className="text-center text-gray-500 py-8">
              No data available
            </div>
          )}

          {/* Stats footer */}
          <div className="flex items-center gap-6 mt-4 pt-3 border-t border-white/5">
            <div>
              <span className="text-xs text-gray-500 block">30d Average</span>
              <span className="text-sm font-mono text-gray-300">
                {average} sfu
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block">Range</span>
              <span className="text-sm font-mono text-gray-300">
                {data.length > 0
                  ? `${Math.min(...data.map((d) => d.flux))} - ${Math.max(...data.map((d) => d.flux))} sfu`
                  : "N/A"}
              </span>
            </div>
          </div>
        </Card>

        {/* Activity Level Interpretation */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Activity Level Scale
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: "#ff4455" }}
              />
              <span className="text-sm text-gray-400">
                <span className="text-white font-medium">&lt;90 sfu</span> -
                Low: limited global high-band support
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: "#ffaa00" }}
              />
              <span className="text-sm text-gray-400">
                <span className="text-white font-medium">90-150 sfu</span> -
                Moderate: mixed-to-supportive global ionization
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: "#00ff88" }}
              />
              <span className="text-sm text-gray-400">
                <span className="text-white font-medium">&gt;150 sfu</span> -
                High: stronger high-band potential where the path supports it
              </span>
            </div>
          </div>
        </Card>

        {/* Best Bands for Current Conditions */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">
            Recommended Bands
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Based on current SFI of {currentValue} sfu:
          </p>
          <div className="flex flex-wrap gap-2">
            {recommendedBands.map((band) => (
              <span
                key={band}
                className="px-3 py-1.5 rounded-full text-sm font-mono font-medium"
                style={{
                  backgroundColor: "rgba(255, 107, 53, 0.15)",
                  color: "#ff6b35",
                  border: "1px solid rgba(255, 107, 53, 0.3)",
                }}
              >
                {band}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </DetailModal>
  );
};

SolarFluxModal.displayName = "SolarFluxModal";

export default SolarFluxModal;
