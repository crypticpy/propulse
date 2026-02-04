import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { kpToAp } from "@/lib/utils/solarConversions";

export interface AIndexDataPoint {
  time_tag: string;
  kp_index: number;
}

export interface AIndexChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AIndexDataPoint[];
}

/**
 * A-index condition thresholds and descriptions
 */
const A_INDEX_SCALE = [
  {
    range: "0-7",
    level: "Quiet",
    color: "#00ff88",
    hfImpact:
      "Excellent HF propagation on all bands. No geomagnetic interference.",
    description:
      "Minimal geomagnetic activity. Ideal conditions for DX work on all HF bands including polar paths.",
  },
  {
    range: "8-15",
    level: "Unsettled",
    color: "#88cc44",
    hfImpact: "Good HF conditions. Minor degradation possible on polar paths.",
    description:
      "Slightly elevated geomagnetic activity. Most paths unaffected, but sensitive high-latitude circuits may show some flutter.",
  },
  {
    range: "16-29",
    level: "Active",
    color: "#ffaa00",
    hfImpact: "HF may be degraded. Polar and high-latitude paths affected.",
    description:
      "Elevated geomagnetic activity. Expect some signal absorption and path instability, especially on trans-polar routes.",
  },
  {
    range: "30-49",
    level: "Minor Storm",
    color: "#ff7700",
    hfImpact:
      "HF degraded at mid and high latitudes. Polar paths may be unusable.",
    description:
      "Geomagnetic storm conditions (G1). Significant propagation degradation. Move to lower frequencies (40m, 80m) for better results.",
  },
  {
    range: "50-99",
    level: "Major Storm",
    color: "#ff4455",
    hfImpact: "HF severely degraded worldwide. Only low bands may be viable.",
    description:
      "Moderate to strong geomagnetic storm (G2-G3). Expect widespread HF blackouts. Aurora may be visible at mid-latitudes.",
  },
  {
    range: "100+",
    level: "Severe Storm",
    color: "#ff0088",
    hfImpact:
      "Complete HF blackout possible. Use digital modes on lowest bands.",
    description:
      "Severe to extreme storm (G4-G5). Total HF communication breakdown likely. Aurora visible at low latitudes.",
  },
];

/**
 * Get color based on A-index value
 */
function getAIndexColor(ap: number): string {
  if (ap <= 7) {
    return "#00ff88";
  }
  if (ap <= 15) {
    return "#88cc44";
  }
  if (ap <= 29) {
    return "#ffaa00";
  }
  if (ap <= 49) {
    return "#ff7700";
  }
  if (ap <= 99) {
    return "#ff4455";
  }
  return "#ff0088";
}

/**
 * Get condition label
 */
function getAIndexCondition(ap: number): string {
  if (ap <= 7) {
    return "Quiet";
  }
  if (ap <= 15) {
    return "Unsettled";
  }
  if (ap <= 29) {
    return "Active";
  }
  if (ap <= 49) {
    return "Minor Storm";
  }
  if (ap <= 99) {
    return "Major Storm";
  }
  return "Severe Storm";
}

/**
 * AIndexChartModal Component
 *
 * Expanded view of A-index with scale reference, HF impact descriptions,
 * and educational content about the A-index.
 */
export const AIndexChartModal: React.FC<AIndexChartModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  // Chart dimensions - larger for modal
  const chartWidth = 600;
  const chartHeight = 260;
  const padding = { top: 20, right: 60, bottom: 40, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Take last 8 data points
    const recentData = data.slice(-8);

    return recentData.map((point, index) => {
      const date = new Date(point.time_tag);
      const hour = date.getUTCHours();
      const ap = kpToAp(point.kp_index);
      return {
        ...point,
        ap,
        hour,
        label: `${hour.toString().padStart(2, "0")}:00`,
        index,
      };
    });
  }, [data]);

  // Calculate current A-index (24-hour average equivalent)
  const currentAp =
    chartData.length > 0 ? chartData[chartData.length - 1].ap : 0;
  const avgAp =
    chartData.length > 0
      ? Math.round(
          chartData.reduce((sum, d) => sum + d.ap, 0) / chartData.length,
        )
      : 0;
  const maxAp =
    chartData.length > 0 ? Math.max(...chartData.map((d) => d.ap)) : 0;

  // Y-axis scale
  const yMax = Math.max(50, Math.ceil(maxAp / 10) * 10 + 10);
  const yScale = (value: number) =>
    padding.top + innerHeight - (value / yMax) * innerHeight;

  const xPosition = (index: number) =>
    padding.left + (index / (chartData.length - 1 || 1)) * innerWidth;

  // Y-axis ticks
  const yTicks: number[] = [];
  const step = yMax <= 50 ? 10 : 20;
  for (let v = 0; v <= yMax; v += step) {
    yTicks.push(v);
  }

  // Threshold lines
  const thresholds = [
    { value: 30, label: "Minor Storm", color: "#ff7700" },
    { value: 50, label: "Major Storm", color: "#ff4455" },
  ].filter((t) => t.value <= yMax);

  // Generate line path
  const linePath =
    chartData.length > 0
      ? chartData
          .map(
            (d, i) =>
              `${i === 0 ? "M" : "L"} ${xPosition(i).toFixed(1)} ${yScale(d.ap).toFixed(1)}`,
          )
          .join(" ")
      : "";

  // Area path
  const areaPath =
    chartData.length > 0
      ? linePath +
        ` L ${xPosition(chartData.length - 1).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)}` +
        ` L ${xPosition(0).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`
      : "";

  // Find current scale level
  const currentScale = A_INDEX_SCALE.find((s) => {
    const [min, max] = s.range.includes("+")
      ? [100, 999]
      : s.range.split("-").map(Number);
    return currentAp >= min && currentAp <= max;
  });

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="A-Index Analysis"
      subtitle="Geomagnetic activity indicator derived from K-index"
      size="xl"
    >
      <div className="space-y-6">
        {/* Chart */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-4">
            A-Index (Last 24 Hours)
          </h4>
          <div
            className="relative w-full"
            style={{ aspectRatio: `${chartWidth}/${chartHeight}` }}
          >
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full h-full"
              role="img"
              aria-label="A-Index chart showing 24-hour geomagnetic activity"
            >
              <defs>
                <linearGradient
                  id="aIndexAreaGradientModal"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0.02" />
                </linearGradient>
              </defs>

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

              {/* Threshold lines */}
              {thresholds.map(({ value, label, color }) => (
                <g key={value}>
                  <line
                    x1={padding.left}
                    y1={yScale(value)}
                    x2={padding.left + innerWidth}
                    y2={yScale(value)}
                    stroke={color}
                    strokeWidth="1.5"
                    strokeDasharray="8,4"
                    opacity="0.6"
                  />
                  <text
                    x={padding.left + innerWidth + 8}
                    y={yScale(value)}
                    fill={color}
                    fontSize="10"
                    fontFamily="sans-serif"
                    dominantBaseline="middle"
                  >
                    {label}
                  </text>
                </g>
              ))}

              {/* X-axis */}
              <line
                x1={padding.left}
                y1={padding.top + innerHeight}
                x2={padding.left + innerWidth}
                y2={padding.top + innerHeight}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Area fill */}
              {areaPath && (
                <path
                  d={areaPath}
                  fill="url(#aIndexAreaGradientModal)"
                  className="transition-all duration-500"
                />
              )}

              {/* Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-500"
                />
              )}

              {/* Data points */}
              {chartData.map((point, index) => (
                <g key={`point-${index}`}>
                  {/* Outer glow for current point */}
                  {index === chartData.length - 1 && (
                    <circle
                      cx={xPosition(index)}
                      cy={yScale(point.ap)}
                      r="10"
                      fill={`${getAIndexColor(point.ap)}33`}
                      className="animate-pulse"
                    />
                  )}
                  <circle
                    cx={xPosition(index)}
                    cy={yScale(point.ap)}
                    r={index === chartData.length - 1 ? 6 : 5}
                    fill={getAIndexColor(point.ap)}
                    stroke="#0a0a0f"
                    strokeWidth="2"
                  >
                    <title>
                      {point.label} UTC: A={point.ap} (
                      {getAIndexCondition(point.ap)})
                    </title>
                  </circle>

                  {/* Value label above point */}
                  <text
                    x={xPosition(index)}
                    y={yScale(point.ap) - 14}
                    fill="rgba(255,255,255,0.8)"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {point.ap}
                  </text>

                  {/* X-axis label */}
                  <text
                    x={xPosition(index)}
                    y={padding.top + innerHeight + 20}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="11"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {point.label}
                  </text>
                </g>
              ))}

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

        {/* Current Status and Stats */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Current A-Index
            </h4>
            <div className="flex items-center gap-3">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: getAIndexColor(currentAp) }}
              >
                {currentAp}
              </div>
              <div>
                <div className="text-white font-medium">
                  {getAIndexCondition(currentAp)}
                </div>
                <div className="text-sm text-gray-400">
                  {currentScale?.hfImpact}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              24-Hour Average
            </h4>
            <div className="flex items-center gap-3">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: getAIndexColor(avgAp) }}
              >
                {avgAp}
              </div>
              <div className="text-white font-medium">
                {getAIndexCondition(avgAp)}
              </div>
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              24-Hour Peak
            </h4>
            <div className="flex items-center gap-3">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: getAIndexColor(maxAp) }}
              >
                {maxAp}
              </div>
              <div className="text-white font-medium">
                {getAIndexCondition(maxAp)}
              </div>
            </div>
          </div>
        </div>

        {/* A-Index Scale Reference */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            A-Index Scale & HF Impact
          </h4>
          <div className="space-y-3">
            {A_INDEX_SCALE.map((level) => {
              const isCurrentLevel = currentScale?.level === level.level;
              return (
                <div
                  key={level.level}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isCurrentLevel
                      ? "bg-white/5 border border-white/10"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="w-14 h-10 rounded flex items-center justify-center font-mono font-bold text-sm shrink-0"
                    style={{
                      backgroundColor: `${level.color}20`,
                      color: level.color,
                      border: `1px solid ${level.color}40`,
                    }}
                  >
                    {level.range}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">
                        {level.level}
                      </span>
                      {isCurrentLevel && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-plasma-orange mt-1">
                      {level.hfImpact}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {level.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Educational Content */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Understanding the A-Index
          </h4>
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              The <strong className="text-white">A-index</strong> (also called
              Ap-index for planetary) is a daily measure of geomagnetic
              activity. Unlike the 3-hourly K-index which uses a
              quasi-logarithmic scale (0-9), the A-index is a linear scale that
              better represents cumulative disturbance levels.
            </p>
            <p>
              <strong className="text-white">How it's calculated:</strong> Eight
              3-hour Kp values are converted to their equivalent linear "a"
              values, then averaged to produce the daily A-index. The conversion
              is non-linear: Kp=5 equals ap=48, while Kp=9 equals ap=400.
            </p>
            <p>
              <strong className="text-white">For HF operators:</strong> The
              A-index provides a "bigger picture" view of geomagnetic
              conditions. A low A-index over several days indicates stable
              propagation, while elevated values suggest ongoing disturbances
              that may affect multiple operating sessions.
            </p>
            <div className="bg-white/5 rounded p-3 mt-3">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                Rule of Thumb
              </div>
              <p className="text-plasma-orange">
                A-index below 10: Good DX conditions expected
              </p>
              <p className="text-caution-amber">
                A-index 10-20: Conditions may be variable
              </p>
              <p className="text-alert-red">
                A-index above 30: Expect degraded propagation
              </p>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

AIndexChartModal.displayName = "AIndexChartModal";

export default AIndexChartModal;
