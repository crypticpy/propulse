import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { getKIndexDescription } from "@/lib/utils/bands";

export interface KIndexDataPoint {
  time_tag: string;
  kp_index: number;
}

export interface KIndexChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: KIndexDataPoint[];
}

/**
 * G-Scale storm level definitions
 */
const G_SCALE_LEVELS = [
  {
    level: "G0",
    kpRange: "0-4",
    name: "Quiet to Unsettled",
    color: "#00ff88",
    description:
      "No geomagnetic storm conditions. HF radio propagation normal. Good conditions for DX on all bands.",
  },
  {
    level: "G1",
    kpRange: "5",
    name: "Minor Storm",
    color: "#ffaa00",
    description:
      "Weak power grid fluctuations. Minor impact on satellite operations. HF radio may be degraded at high latitudes.",
  },
  {
    level: "G2",
    kpRange: "6",
    name: "Moderate Storm",
    color: "#ff7700",
    description:
      "High-latitude power systems may experience voltage alarms. HF radio fadeouts likely at higher latitudes. Aurora may be visible as low as New York.",
  },
  {
    level: "G3",
    kpRange: "7",
    name: "Strong Storm",
    color: "#ff4400",
    description:
      "Voltage corrections required in power systems. Intermittent HF radio blackouts at mid-latitudes. Aurora visible at mid-latitudes.",
  },
  {
    level: "G4",
    kpRange: "8",
    name: "Severe Storm",
    color: "#ff0044",
    description:
      "Possible widespread voltage control problems. HF radio blackouts likely for hours. Aurora visible at tropical latitudes.",
  },
  {
    level: "G5",
    kpRange: "9",
    name: "Extreme Storm",
    color: "#ff0088",
    description:
      "Widespread power system collapse possible. Complete HF radio blackout for days. Aurora visible near the equator.",
  },
];

/**
 * Get bar color based on K-index severity
 */
function getBarColor(kp: number): string {
  if (kp <= 2) return "#00ff88";
  if (kp <= 4) return "#ffaa00";
  if (kp <= 6) return "#ff7700";
  return "#ff4455";
}

/**
 * Calculate storm probability based on K-index trend
 */
function calculateStormProbability(data: KIndexDataPoint[]): {
  current: string;
  trend: "increasing" | "decreasing" | "stable";
  probability: number;
} {
  if (!data || data.length < 2) {
    return { current: "Unknown", trend: "stable", probability: 0 };
  }

  const recent = data.slice(-3);
  const currentKp = recent[recent.length - 1].kp_index;
  const avgRecent =
    recent.reduce((sum, d) => sum + d.kp_index, 0) / recent.length;

  const older = data.slice(-6, -3);
  const avgOlder =
    older.length > 0
      ? older.reduce((sum, d) => sum + d.kp_index, 0) / older.length
      : avgRecent;

  let trend: "increasing" | "decreasing" | "stable" = "stable";
  if (avgRecent - avgOlder > 1) trend = "increasing";
  else if (avgOlder - avgRecent > 1) trend = "decreasing";

  // Estimate probability of storm (Kp >= 5) in next 6 hours
  let probability = 0;
  if (currentKp >= 5) probability = 80;
  else if (currentKp >= 4) probability = trend === "increasing" ? 50 : 25;
  else if (currentKp >= 3) probability = trend === "increasing" ? 25 : 10;
  else probability = trend === "increasing" ? 10 : 5;

  const current =
    G_SCALE_LEVELS.find((g) => g.kpRange.includes(String(currentKp)))?.level ||
    "G0";

  return { current, trend, probability };
}

/**
 * KIndexChartModal Component
 *
 * Expanded view of K-index chart with G-scale legend, storm probability,
 * and operational tips for ham radio operators.
 */
export const KIndexChartModal: React.FC<KIndexChartModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  // Chart dimensions - larger for modal
  const chartWidth = 600;
  const chartHeight = 280;
  const padding = { top: 20, right: 40, bottom: 40, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

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

  const currentKIndex =
    data && data.length > 0 ? data[data.length - 1].kp_index : 0;

  const stormInfo = calculateStormProbability(data);

  // Calculate bar dimensions
  const barWidth =
    chartData.length > 0 ? (innerWidth / chartData.length) * 0.7 : 10;
  const barGap =
    chartData.length > 0 ? (innerWidth / chartData.length) * 0.3 : 2;

  // Y-axis scale (0-9 for K-index)
  const maxY = 9;
  const yScale = (value: number) =>
    padding.top + innerHeight - (value / maxY) * innerHeight;

  const xPosition = (index: number) =>
    padding.left + index * (barWidth + barGap) + barGap / 2;

  const yTicks = [0, 3, 5, 7, 9];

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Geomagnetic Activity"
      subtitle="K-index history and storm forecast"
      size="xl"
    >
      <div className="space-y-6">
        {/* Larger Chart */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
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

              {/* Y-axis labels and grid */}
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
                    fill="rgba(255,255,255,0.6)"
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {tick}
                  </text>
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
                strokeWidth="2"
                strokeDasharray="8,4"
                opacity="0.7"
              />
              <text
                x={padding.left + innerWidth + 8}
                y={yScale(5)}
                fill="#ff4455"
                fontSize="11"
                fontFamily="sans-serif"
                dominantBaseline="middle"
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
                // Minimum visual height of 6px for zero values so they're visible
                const MIN_BAR_HEIGHT = 6;
                const calculatedHeight = (point.kp_index / maxY) * innerHeight;
                const barHeight = Math.max(calculatedHeight, MIN_BAR_HEIGHT);
                const x = xPosition(index);
                // Adjust y position for minimum height bars
                const y =
                  point.kp_index === 0
                    ? padding.top + innerHeight - MIN_BAR_HEIGHT
                    : yScale(point.kp_index);
                const isZero = point.kp_index === 0;

                return (
                  <g key={`bar-${index}`}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill={getBarColor(point.kp_index)}
                      rx="3"
                      opacity={isZero ? 0.6 : 0.85}
                      className="transition-all duration-300"
                    >
                      <title>
                        {point.label} UTC: K={point.kp_index} (
                        {getKIndexDescription(point.kp_index)})
                      </title>
                    </rect>

                    {/* Zero indicator - diamond marker to show it's real data */}
                    {isZero && (
                      <polygon
                        points={`${x + barWidth / 2},${padding.top + innerHeight - 12} ${x + barWidth / 2 + 5},${padding.top + innerHeight - 6} ${x + barWidth / 2},${padding.top + innerHeight} ${x + barWidth / 2 - 5},${padding.top + innerHeight - 6}`}
                        fill="#00ff88"
                        opacity="0.9"
                      />
                    )}

                    {/* Value label on bar */}
                    <text
                      x={x + barWidth / 2}
                      y={isZero ? y - 18 : y - 8}
                      fill="rgba(255,255,255,0.8)"
                      fontSize="11"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {point.kp_index}
                    </text>

                    {/* X-axis label */}
                    <text
                      x={x + barWidth / 2}
                      y={padding.top + innerHeight + 20}
                      fill="rgba(255,255,255,0.5)"
                      fontSize="11"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {point.label}
                    </text>
                  </g>
                );
              })}

              {/* Current time marker */}
              {chartData.length > 0 && (
                <rect
                  x={xPosition(chartData.length - 1) - 3}
                  y={padding.top}
                  width={barWidth + 6}
                  height={innerHeight}
                  fill="none"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  rx="4"
                />
              )}

              {/* X-axis label */}
              <text
                x={padding.left + innerWidth / 2}
                y={chartHeight - 5}
                fill="rgba(255,255,255,0.4)"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                Time (UTC)
              </text>
            </svg>
          </div>
        </div>

        {/* Current Status and Storm Probability */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Current Status */}
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Current Status
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: getBarColor(currentKIndex) }}
              >
                K{currentKIndex}
              </div>
              <div>
                <div className="text-white font-medium">
                  {getKIndexDescription(currentKIndex)}
                </div>
                <div className="text-sm text-gray-400">
                  Storm Level: {stormInfo.current}
                </div>
              </div>
            </div>
          </div>

          {/* Storm Probability */}
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              6-Hour Storm Forecast
            </h4>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-mono font-bold text-plasma-orange">
                {stormInfo.probability}%
              </div>
              <div>
                <div className="text-white font-medium">
                  Trend:{" "}
                  {stormInfo.trend === "increasing"
                    ? "Rising"
                    : stormInfo.trend === "decreasing"
                      ? "Falling"
                      : "Stable"}
                </div>
                <div className="text-sm text-gray-400">
                  {stormInfo.trend === "increasing"
                    ? "Geomagnetic activity increasing"
                    : stormInfo.trend === "decreasing"
                      ? "Conditions improving"
                      : "Stable conditions expected"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* G-Scale Legend */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            NOAA Geomagnetic Storm Scale
          </h4>
          <div className="space-y-3">
            {G_SCALE_LEVELS.map((level) => (
              <div
                key={level.level}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  stormInfo.current === level.level
                    ? "bg-white/5 border border-white/10"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <div
                  className="w-12 h-8 rounded flex items-center justify-center font-mono font-bold text-sm shrink-0"
                  style={{
                    backgroundColor: `${level.color}20`,
                    color: level.color,
                    border: `1px solid ${level.color}40`,
                  }}
                >
                  {level.level}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{level.name}</span>
                    <span className="text-xs text-gray-500">
                      Kp {level.kpRange}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {level.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tips for High K-Index */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Operating Tips During Elevated K-Index
          </h4>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">1.</span>
              <span>
                <strong>Avoid polar paths</strong> - Trans-polar routes (NA to
                EU/Asia over the pole) are most affected. Try lower latitude
                paths.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">2.</span>
              <span>
                <strong>Move to lower frequencies</strong> - During storms, 40m
                and 80m are often more stable than higher bands.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">3.</span>
              <span>
                <strong>Watch for aurora propagation</strong> - K-index of 5+
                can create aurora scatter opportunities on 6m and 2m. Listen for
                characteristic flutter.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">4.</span>
              <span>
                <strong>Be patient</strong> - Conditions can change rapidly
                during recovery. Bands may suddenly open after being dead.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">5.</span>
              <span>
                <strong>Use digital modes</strong> - FT8/FT4 can decode signals
                well below the noise floor, making them effective during
                marginal conditions.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </DetailModal>
  );
};

KIndexChartModal.displayName = "KIndexChartModal";

export default KIndexChartModal;
