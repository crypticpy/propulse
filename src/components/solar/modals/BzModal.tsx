import React, { useCallback, useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";

export interface BzDataPoint {
  time_tag: string;
  bz_gsm: number | null;
}

export interface BzModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: number | null;
  data: BzDataPoint[];
}

/**
 * Bz condition levels based on IMF Bz values
 * Negative Bz (southward) is geomagnetically active
 */
const BZ_LEVELS = [
  {
    level: "Northward",
    range: "> 0 nT",
    minBz: 0,
    maxBz: Infinity,
    color: "#00ff88",
    description:
      "IMF is directed northward, so strong solar-wind coupling is less favored. This is global geomagnetic context, not a prediction for a particular HF path.",
  },
  {
    level: "Weakly Southward",
    range: "-5 to 0 nT",
    minBz: -5,
    maxBz: 0,
    color: "#ffaa00",
    description:
      "IMF is slightly southward. Some coupling with the magnetosphere is possible; watch the duration and subsequent Kp response before drawing an HF conclusion.",
  },
  {
    level: "Moderately Southward",
    range: "-10 to -5 nT",
    minBz: -10,
    maxBz: -5,
    color: "#ff7700",
    description:
      "Moderate southward IMF favors stronger magnetospheric coupling. If sustained, geomagnetic disturbance risk increases, especially for high-latitude paths.",
  },
  {
    level: "Strongly Southward",
    range: "< -10 nT",
    minBz: -Infinity,
    maxBz: -10,
    color: "#ff4455",
    description:
      "Strong southward IMF favors significant energy transfer into the magnetosphere. Watch duration and subsequent official Kp and G-scale products for confirmed storm conditions.",
  },
];

/**
 * Get color for Bz value
 * Northward (positive) is quiet, southward (negative) is active
 */
export function getBzColor(bz: number | null): string {
  if (bz === null) {
    return "#888899";
  }
  if (bz > 0) {
    return "#00ff88";
  } // Northward - quiet
  if (bz > -5) {
    return "#ffaa00";
  } // Weakly south - caution
  if (bz > -10) {
    return "#ff7700";
  } // Moderately south - active
  return "#ff4455"; // Strongly south - storm
}

/**
 * Get description for Bz value
 */
export function getBzDescription(bz: number | null): string {
  if (bz === null) {
    return "No Data";
  }
  if (bz > 0) {
    return "Northward";
  }
  if (bz > -5) {
    return "Weakly South";
  }
  if (bz > -10) {
    return "Moderately South";
  }
  return "Strongly South";
}

/**
 * Get current Bz level info
 */
function getCurrentBzLevel(bz: number | null) {
  if (bz === null) {
    return null;
  }
  return BZ_LEVELS.find((level) => bz > level.minBz && bz <= level.maxBz);
}

/**
 * Calculate Bz trend from recent data
 */
function calculateBzTrend(data: BzDataPoint[]): {
  trend: "improving" | "worsening" | "stable";
  avgRecent: number | null;
  avgOlder: number | null;
} {
  if (!data || data.length < 10) {
    return { trend: "stable", avgRecent: null, avgOlder: null };
  }

  // Filter out null values
  const validData = data.filter((d) => d.bz_gsm !== null);
  if (validData.length < 10) {
    return { trend: "stable", avgRecent: null, avgOlder: null };
  }

  const recent = validData.slice(-10);
  const older = validData.slice(-20, -10);

  const avgRecent =
    recent.reduce((sum, d) => sum + (d.bz_gsm ?? 0), 0) / recent.length;
  const avgOlder =
    older.length > 0
      ? older.reduce((sum, d) => sum + (d.bz_gsm ?? 0), 0) / older.length
      : avgRecent;

  let trend: "improving" | "worsening" | "stable" = "stable";
  const diff = avgRecent - avgOlder;

  // Bz going more positive = improving (less coupling)
  // Bz going more negative = worsening (more coupling)
  if (diff > 2) {
    trend = "improving";
  } else if (diff < -2) trend = "worsening";

  return { trend, avgRecent, avgOlder };
}

/**
 * BzModal Component
 *
 * Expanded view of IMF Bz data with chart, explanation, and operational tips.
 * Bz is critical for predicting geomagnetic storms - negative (southward) Bz
 * allows solar wind energy to couple with Earth's magnetosphere.
 */
export const BzModal: React.FC<BzModalProps> = ({
  isOpen,
  onClose,
  currentValue,
  data,
}) => {
  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 280;
  const padding = { top: 20, right: 40, bottom: 40, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Take last 60 data points (1 hour of 1-minute data)
    const recentData = data.slice(-60);

    return recentData.map((point, index) => {
      const date = new Date(point.time_tag);
      const minutes = date.getUTCMinutes();
      const hours = date.getUTCHours();
      return {
        ...point,
        label: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
        index,
      };
    });
  }, [data]);

  const trendInfo = calculateBzTrend(data);
  const currentLevel = getCurrentBzLevel(currentValue);

  // Y-axis scale (-20 to +20 nT typical range)
  const yMin = -20;
  const yMax = 20;
  const yRange = yMax - yMin;

  const yScale = useCallback(
    (value: number) =>
      padding.top + innerHeight - ((value - yMin) / yRange) * innerHeight,
    [innerHeight, padding.top, yMin, yRange],
  );

  const xScale = useCallback(
    (index: number) =>
      padding.left + (index / Math.max(chartData.length - 1, 1)) * innerWidth,
    [chartData.length, innerWidth, padding.left],
  );

  // Build SVG path for line chart
  const linePath = useMemo(() => {
    if (chartData.length === 0) {
      return "";
    }

    const validPoints = chartData.filter((d) => d.bz_gsm !== null);
    if (validPoints.length === 0) {
      return "";
    }

    return validPoints
      .map((point, i) => {
        const x = xScale(point.index);
        const y = yScale(point.bz_gsm ?? 0);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [chartData, xScale, yScale]);

  // Build area path for fill
  const areaPath = useMemo(() => {
    if (chartData.length === 0) {
      return "";
    }

    const validPoints = chartData.filter((d) => d.bz_gsm !== null);
    if (validPoints.length === 0) {
      return "";
    }

    const baseline = yScale(0);
    const pathStart = validPoints
      .map((point, i) => {
        const x = xScale(point.index);
        const y = yScale(point.bz_gsm ?? 0);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

    const lastX = xScale(validPoints[validPoints.length - 1].index);
    const firstX = xScale(validPoints[0].index);

    return `${pathStart} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
  }, [chartData, xScale, yScale]);

  const yTicks = [-20, -10, -5, 0, 5, 10, 20];

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="IMF Bz Component"
      subtitle="Interplanetary Magnetic Field Z-component"
      size="xl"
    >
      <div className="space-y-6">
        {/* Chart */}
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
              aria-label="IMF Bz line chart showing last hour of magnetometer data"
            >
              {/* Background regions */}
              {/* Storm region (Bz < -10) */}
              <rect
                x={padding.left}
                y={yScale(yMax)}
                width={innerWidth}
                height={yScale(-10) - yScale(yMax)}
                fill="#ff445510"
              />
              {/* Active region (-10 to -5) */}
              <rect
                x={padding.left}
                y={yScale(-10)}
                width={innerWidth}
                height={yScale(-5) - yScale(-10)}
                fill="#ff770010"
              />
              {/* Caution region (-5 to 0) */}
              <rect
                x={padding.left}
                y={yScale(-5)}
                width={innerWidth}
                height={yScale(0) - yScale(-5)}
                fill="#ffaa0010"
              />
              {/* Quiet region (> 0) */}
              <rect
                x={padding.left}
                y={yScale(0)}
                width={innerWidth}
                height={yScale(yMin) - yScale(0)}
                fill="#00ff8810"
              />

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
                    stroke={
                      tick === 0
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(255,255,255,0.05)"
                    }
                    strokeWidth={tick === 0 ? 2 : 1}
                  />
                </g>
              ))}

              {/* Threshold lines */}
              <line
                x1={padding.left}
                y1={yScale(-5)}
                x2={padding.left + innerWidth}
                y2={yScale(-5)}
                stroke="#ffaa00"
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity="0.5"
              />
              <line
                x1={padding.left}
                y1={yScale(-10)}
                x2={padding.left + innerWidth}
                y2={yScale(-10)}
                stroke="#ff4455"
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity="0.5"
              />

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
                <path d={areaPath} fill="url(#bzGradient)" opacity="0.3" />
              )}

              {/* Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={getBzColor(currentValue)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Current value marker */}
              {chartData.length > 0 && currentValue !== null && (
                <circle
                  cx={xScale(chartData.length - 1)}
                  cy={yScale(currentValue)}
                  r="6"
                  fill={getBzColor(currentValue)}
                  stroke="white"
                  strokeWidth="2"
                />
              )}

              {/* X-axis labels (every 10 minutes) */}
              {chartData
                .filter((_, i) => i % 10 === 0 || i === chartData.length - 1)
                .map((point) => (
                  <text
                    key={point.index}
                    x={xScale(point.index)}
                    y={padding.top + innerHeight + 20}
                    fill="rgba(255,255,255,0.5)"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {point.label}
                  </text>
                ))}

              {/* Gradient definition */}
              <defs>
                <linearGradient id="bzGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#ffaa00" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ff4455" stopOpacity="0.5" />
                </linearGradient>
              </defs>

              {/* Y-axis label */}
              <text
                x={15}
                y={padding.top + innerHeight / 2}
                fill="rgba(255,255,255,0.4)"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
                transform={`rotate(-90, 15, ${padding.top + innerHeight / 2})`}
              >
                Bz (nT)
              </text>

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

        {/* Current Status and Trend */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Current Status */}
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Current Status
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="text-4xl font-mono font-bold"
                style={{ color: getBzColor(currentValue) }}
              >
                {currentValue !== null ? `${currentValue.toFixed(1)}` : "N/A"}
              </div>
              <div>
                <div className="text-white font-medium">
                  {currentValue !== null
                    ? `${getBzDescription(currentValue)}`
                    : "No Data"}
                </div>
                <div className="text-sm text-gray-400">
                  {currentLevel?.level ?? "Unknown"} IMF
                </div>
              </div>
            </div>
          </div>

          {/* Trend */}
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Recent Trend
            </h4>
            <div className="flex items-center gap-4">
              <div
                className={`text-4xl font-mono font-bold ${
                  trendInfo.trend === "improving"
                    ? "text-signal-green"
                    : trendInfo.trend === "worsening"
                      ? "text-alert-red"
                      : "text-caution-amber"
                }`}
              >
                {trendInfo.trend === "improving"
                  ? "+"
                  : trendInfo.trend === "worsening"
                    ? "-"
                    : "~"}
              </div>
              <div>
                <div className="text-white font-medium">
                  {trendInfo.trend === "improving"
                    ? "Improving"
                    : trendInfo.trend === "worsening"
                      ? "Worsening"
                      : "Stable"}
                </div>
                <div className="text-sm text-gray-400">
                  {trendInfo.trend === "improving"
                    ? "Bz trending northward"
                    : trendInfo.trend === "worsening"
                      ? "Bz trending southward"
                      : "Conditions steady"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bz Level Legend */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            IMF Bz Conditions Scale
          </h4>
          <div className="space-y-3">
            {BZ_LEVELS.map((level) => (
              <div
                key={level.level}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  currentLevel?.level === level.level
                    ? "bg-white/5 border border-white/10"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <div
                  className="w-16 h-8 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0"
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
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    {level.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Educational Content */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Understanding IMF Bz
          </h4>
          <div className="space-y-4 text-sm text-gray-300">
            <p>
              <strong className="text-white">What is Bz?</strong> Bz is the
              north-south component of the Interplanetary Magnetic Field (IMF)
              in GSM (Geocentric Solar Magnetospheric) coordinates. It measures
              the direction of the magnetic field carried by the solar wind.
            </p>
            <p>
              <strong className="text-white">Why does direction matter?</strong>{" "}
              Earth's magnetic field points northward at the dayside
              magnetopause. When the IMF Bz is southward (negative), it can
              reconnect with Earth's field, allowing solar wind energy and
              particles to enter the magnetosphere - like opening a valve.
            </p>
            <p>
              <strong className="text-white">Impacts on HF radio:</strong>{" "}
              Strong southward Bz often precedes geomagnetic storms that can
              disrupt HF propagation, especially on polar and trans-polar paths.
              However, it can also enhance auroral activity, creating
              opportunities for VHF aurora scatter contacts.
            </p>
            <p>
              <strong className="text-white">Timing:</strong> Solar wind
              measured at the L1 Lagrange point (where DSCOVR/ACE satellites
              orbit) is about 30-60 minutes ahead of reaching Earth (up to
              ~80 minutes in slow solar wind), depending on solar wind speed.
              Bz can serve as an early warning for
              geomagnetic activity.
            </p>
          </div>
        </div>

        {/* Operating Tips */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Operating Tips for Southward Bz
          </h4>
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">1.</span>
              <span>
                <strong>Monitor K-index</strong> - Sustained southward Bz will
                eventually raise the K-index. Watch for the delayed effect
                (30-60 minutes).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">2.</span>
              <span>
                <strong>Avoid high-latitude paths</strong> - Trans-polar routes
                (NA to EU/Asia over the pole) are most vulnerable to geomagnetic
                disturbances.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">3.</span>
              <span>
                <strong>Consider lower frequencies</strong> - 40m and 80m often
                remain more stable during geomagnetic activity than higher
                bands.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">4.</span>
              <span>
                <strong>Aurora opportunities</strong> - Strong southward Bz can
                create aurora scatter opportunities on 6m and 2m. Listen for the
                characteristic flutter signal.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-plasma-orange">5.</span>
              <span>
                <strong>Watch for rapid changes</strong> - Bz can flip quickly
                from south to north. When it does, expect conditions to improve
                within an hour.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </DetailModal>
  );
};

BzModal.displayName = "BzModal";

export default BzModal;
