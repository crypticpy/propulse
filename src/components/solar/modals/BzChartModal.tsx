import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";

export interface BzChartDataPoint {
  time_tag: string;
  bz_gsm: number;
}

export interface BzChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: BzChartDataPoint[];
}

/**
 * IMF Bz condition scale with HF impact
 */
const BZ_SCALE = [
  {
    range: "+5 to +20 nT",
    level: "Strongly Northward",
    color: "#00ff88",
    hfImpact: "Excellent, stable conditions",
    description:
      "Strong northward IMF shields Earth from solar wind energy. Ideal HF propagation conditions with minimal geomagnetic disturbance.",
  },
  {
    range: "0 to +5 nT",
    level: "Northward",
    color: "#44dd66",
    hfImpact: "Good conditions",
    description:
      "Northward IMF prevents energy transfer into magnetosphere. Good HF conditions expected.",
  },
  {
    range: "0 to -5 nT",
    level: "Weakly Southward",
    color: "#ffaa00",
    hfImpact: "Minor degradation possible",
    description:
      "Some solar wind energy coupling into magnetosphere. Watch for gradual changes in HF propagation.",
  },
  {
    range: "-5 to -10 nT",
    level: "Southward",
    color: "#ff7700",
    hfImpact: "Degradation likely, especially at high latitudes",
    description:
      "Significant energy transfer occurring. Geomagnetic storm development possible. Polar and auroral zone paths affected.",
  },
  {
    range: "-10 to -20 nT",
    level: "Strongly Southward",
    color: "#ff4455",
    hfImpact: "Significant HF degradation expected",
    description:
      "Strong geomagnetic storm conditions. Expect widespread HF propagation degradation. Aurora visible at mid-latitudes.",
  },
  {
    range: "< -20 nT",
    level: "Extreme Southward",
    color: "#ff0088",
    hfImpact: "Severe HF blackout possible",
    description:
      "Extreme geomagnetic storm. Complete HF communication breakdown likely. Major aurora displays at low latitudes.",
  },
];

const CHART_PADDING = { top: 20, right: 50, bottom: 40, left: 55 } as const;

/**
 * Get color for Bz value
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
 * Get condition label
 */
function getBzCondition(bz: number): string {
  if (bz >= 5) {
    return "Strongly Northward";
  }
  if (bz >= 0) {
    return "Northward";
  }
  if (bz >= -5) {
    return "Weakly Southward";
  }
  if (bz >= -10) {
    return "Southward";
  }
  if (bz >= -20) {
    return "Strongly Southward";
  }
  return "Extreme Southward";
}

/**
 * BzChartModal Component
 *
 * Expanded view of IMF Bz with educational content about
 * the interplanetary magnetic field and its effect on HF propagation.
 */
export const BzChartModal: React.FC<BzChartModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 280;
  const innerWidth = chartWidth - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom;

  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: [], stats: null };
    }

    const sampledData = data.slice(-60);
    const bzValues = sampledData.map((d) => d.bz_gsm);

    const dataMin = Math.min(...bzValues);
    const dataMax = Math.max(...bzValues);
    const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax), 10);
    const yMin = -Math.ceil(absMax / 5) * 5;
    const yMax = Math.ceil(absMax / 5) * 5;

    const xScale = (index: number) =>
      CHART_PADDING.left +
      (index / (sampledData.length - 1 || 1)) * innerWidth;
    const yScale = (value: number) =>
      CHART_PADDING.top + innerHeight / 2 - (value / yMax) * (innerHeight / 2);

    const points = sampledData.map((d, i) => ({
      x: xScale(i),
      y: yScale(d.bz_gsm),
      bz: d.bz_gsm,
      time_tag: d.time_tag,
    }));

    const linePath = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(" ");

    const zeroY = yScale(0);

    // Calculate areas
    const positivePoints = points.map((p) => ({
      x: p.x,
      y: Math.min(p.y, zeroY),
    }));
    const positiveAreaPath =
      `M ${positivePoints[0].x.toFixed(1)} ${zeroY.toFixed(1)} ` +
      positivePoints
        .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") +
      ` L ${positivePoints[positivePoints.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    const negativePoints = points.map((p) => ({
      x: p.x,
      y: Math.max(p.y, zeroY),
    }));
    const negativeAreaPath =
      `M ${negativePoints[0].x.toFixed(1)} ${zeroY.toFixed(1)} ` +
      negativePoints
        .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ") +
      ` L ${negativePoints[negativePoints.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    return {
      points,
      linePath,
      positiveAreaPath,
      negativeAreaPath,
      zeroY,
      yMin,
      yMax,
      stats: {
        current: sampledData[sampledData.length - 1]?.bz_gsm ?? 0,
        min: dataMin,
        max: dataMax,
        avg: bzValues.reduce((a, b) => a + b, 0) / bzValues.length,
      },
    };
  }, [data, innerWidth, innerHeight]);

  // Y-axis labels
  const yLabels = useMemo(() => {
    if (!chartData.yMax) {
      return [];
    }
    const labels: { value: number; y: number }[] = [];
    const step = chartData.yMax <= 15 ? 5 : 10;
    for (let v = chartData.yMin || -15; v <= chartData.yMax; v += step) {
      const y =
        CHART_PADDING.top +
        innerHeight / 2 -
        (v / chartData.yMax) * (innerHeight / 2);
      labels.push({ value: v, y });
    }
    return labels;
  }, [chartData.yMin, chartData.yMax, innerHeight]);

  const currentBz = chartData.stats?.current ?? 0;

  // Find current scale level
  const currentScale = BZ_SCALE.find((s) => {
    if (s.range.includes("+5 to +20")) {
      return currentBz >= 5;
    }
    if (s.range.includes("0 to +5")) {
      return currentBz >= 0 && currentBz < 5;
    }
    if (s.range.includes("0 to -5")) {
      return currentBz < 0 && currentBz >= -5;
    }
    if (s.range.includes("-5 to -10")) {
      return currentBz < -5 && currentBz >= -10;
    }
    if (s.range.includes("-10 to -20")) {
      return currentBz < -10 && currentBz >= -20;
    }
    return currentBz < -20;
  });

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Interplanetary Magnetic Field (Bz)"
      subtitle="Solar wind magnetic field - Z component in GSM coordinates"
      size="xl"
    >
      <div className="space-y-6">
        {/* Chart */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-4">
            IMF Bz (Last Hour)
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
              aria-label="IMF Bz chart"
            >
              <defs>
                <linearGradient
                  id="bzPositiveGradientModal"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient
                  id="bzNegativeGradientModal"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#ff4455" stopOpacity="0.02" />
                  <stop offset="100%" stopColor="#ff4455" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Y-axis */}
              <line
                x1={CHART_PADDING.left}
                y1={CHART_PADDING.top}
                x2={CHART_PADDING.left}
                y2={CHART_PADDING.top + innerHeight}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Y-axis labels and grid */}
              {yLabels.map(({ value, y }) => (
                <g key={value}>
                  <line
                    x1={CHART_PADDING.left - 8}
                    y1={y}
                    x2={CHART_PADDING.left}
                    y2={y}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1"
                  />
                  <text
                    x={CHART_PADDING.left - 12}
                    y={y}
                    fill="rgba(255,255,255,0.6)"
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="end"
                    dominantBaseline="middle"
                  >
                    {value > 0 ? `+${value}` : value}
                  </text>
                  <line
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={CHART_PADDING.left + innerWidth}
                    y2={y}
                    stroke={
                      value === 0
                        ? "rgba(255,255,255,0.4)"
                        : "rgba(255,255,255,0.05)"
                    }
                    strokeWidth={value === 0 ? 2 : 1}
                  />
                </g>
              ))}

              {/* X-axis */}
              <line
                x1={CHART_PADDING.left}
                y1={CHART_PADDING.top + innerHeight}
                x2={CHART_PADDING.left + innerWidth}
                y2={CHART_PADDING.top + innerHeight}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />

              {/* Positive area */}
              {chartData.positiveAreaPath && (
                <path
                  d={chartData.positiveAreaPath}
                  fill="url(#bzPositiveGradientModal)"
                />
              )}

              {/* Negative area */}
              {chartData.negativeAreaPath && (
                <path
                  d={chartData.negativeAreaPath}
                  fill="url(#bzNegativeGradientModal)"
                />
              )}

              {/* Line */}
              {chartData.linePath && (
                <path
                  d={chartData.linePath}
                  fill="none"
                  stroke={getBzColor(currentBz)}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Current point */}
              {chartData.points.length > 0 && (
                <>
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="10"
                    fill={`${getBzColor(currentBz)}33`}
                    className="animate-pulse"
                  />
                  <circle
                    cx={chartData.points[chartData.points.length - 1].x}
                    cy={chartData.points[chartData.points.length - 1].y}
                    r="5"
                    fill={getBzColor(currentBz)}
                    stroke="#0a0a0f"
                    strokeWidth="2"
                  />
                </>
              )}

              {/* X-axis time labels */}
              {chartData.points.length > 0 &&
                [
                  0,
                  Math.floor(chartData.points.length / 4),
                  Math.floor(chartData.points.length / 2),
                  Math.floor((chartData.points.length * 3) / 4),
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
                        y={CHART_PADDING.top + innerHeight + 20}
                        fill="rgba(255,255,255,0.5)"
                        fontSize="11"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {label}
                      </text>
                    );
                  })}

              {/* Axis labels */}
              <text
                x={CHART_PADDING.left + innerWidth / 2}
                y={chartHeight - 5}
                fill="rgba(255,255,255,0.4)"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                Time (UTC)
              </text>

              <text
                x={CHART_PADDING.left + innerWidth + 8}
                y={chartData.zeroY || CHART_PADDING.top + innerHeight / 2}
                fill="rgba(255,255,255,0.6)"
                fontSize="10"
                dominantBaseline="middle"
              >
                0 nT
              </text>
            </svg>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-2">
              Current
            </h4>
            <div
              className="text-3xl font-mono font-bold"
              style={{ color: getBzColor(currentBz) }}
            >
              {currentBz > 0 ? "+" : ""}
              {currentBz.toFixed(1)} nT
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {getBzCondition(currentBz)}
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-2">
              1hr Minimum
            </h4>
            <div
              className="text-3xl font-mono font-bold"
              style={{ color: getBzColor(chartData.stats?.min || 0) }}
            >
              {(chartData.stats?.min || 0).toFixed(1)} nT
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-2">
              1hr Maximum
            </h4>
            <div
              className="text-3xl font-mono font-bold"
              style={{ color: getBzColor(chartData.stats?.max || 0) }}
            >
              {(chartData.stats?.max || 0) > 0 ? "+" : ""}
              {(chartData.stats?.max || 0).toFixed(1)} nT
            </div>
          </div>

          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-2">
              1hr Average
            </h4>
            <div
              className="text-3xl font-mono font-bold"
              style={{ color: getBzColor(chartData.stats?.avg || 0) }}
            >
              {(chartData.stats?.avg || 0) > 0 ? "+" : ""}
              {(chartData.stats?.avg || 0).toFixed(1)} nT
            </div>
          </div>
        </div>

        {/* Bz Scale Reference */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            IMF Bz Scale & HF Impact
          </h4>
          <div className="space-y-3">
            {BZ_SCALE.map((level) => {
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
                    className="w-24 h-10 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0"
                    style={{
                      backgroundColor: `${level.color}20`,
                      color: level.color,
                      border: `1px solid ${level.color}40`,
                    }}
                  >
                    {level.range.split(" ")[0]}
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
            Understanding IMF Bz
          </h4>
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              The{" "}
              <strong className="text-white">
                Interplanetary Magnetic Field (IMF)
              </strong>{" "}
              is the Sun's magnetic field carried outward by the solar wind. The{" "}
              <strong className="text-white">Bz component</strong> (measured in
              nanoteslas, nT) indicates the north-south orientation of this
              field.
            </p>
            <p>
              <strong className="text-white">Why Bz matters:</strong> Earth's
              magnetic field points northward. When the IMF's Bz component is
              also northward (positive), the two fields repel, and Earth is
              shielded from solar wind energy. When Bz is southward (negative),
              the fields can "reconnect," allowing energy to pour into Earth's
              magnetosphere—triggering geomagnetic storms.
            </p>
            <p>
              <strong className="text-white">Storm prediction:</strong> A
              sustained period of strongly negative Bz (below -10 nT) for an
              hour or more almost always results in a geomagnetic storm. Bz is
              the single best real-time predictor of storm onset.
            </p>
            <div className="bg-white/5 rounded p-3 mt-3">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                Key Thresholds
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-signal-green">Bz &gt; 0:</span>
                  <span className="text-gray-300 ml-2">Quiet conditions</span>
                </div>
                <div>
                  <span className="text-caution-amber">Bz -5 to 0:</span>
                  <span className="text-gray-300 ml-2">Watch closely</span>
                </div>
                <div>
                  <span className="text-alert-red">Bz -10 to -5:</span>
                  <span className="text-gray-300 ml-2">Storm likely</span>
                </div>
                <div>
                  <span className="text-[#ff0088]">Bz &lt; -10:</span>
                  <span className="text-gray-300 ml-2">Severe storm</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

BzChartModal.displayName = "BzChartModal";

export default BzChartModal;
