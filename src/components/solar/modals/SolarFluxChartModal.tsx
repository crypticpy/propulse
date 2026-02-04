import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";

export interface SolarFluxDataPoint {
  time_tag: string;
  flux: number;
}

export interface SolarFluxChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SolarFluxDataPoint[];
}

/** Chart dimensions */
const CHART_WIDTH = 600;
const CHART_HEIGHT = 280;
const PADDING = { top: 20, right: 20, bottom: 45, left: 50 };
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

/**
 * Format date for axis label
 */
function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Get propagation quality based on SFI
 */
function getFluxInterpretation(sfi: number): {
  level: string;
  color: string;
  description: string;
} {
  if (sfi >= 200) {
    return {
      level: "Exceptional",
      color: "#00ff88",
      description:
        "All HF bands can be open, including 10m worldwide. Excellent F2 propagation. Peak solar cycle conditions.",
    };
  }
  if (sfi >= 150) {
    return {
      level: "Excellent",
      color: "#44dd66",
      description:
        "Very good conditions for higher bands (10-15m). Long-path DX possible. Great time for working rare DX.",
    };
  }
  if (sfi >= 120) {
    return {
      level: "Good",
      color: "#88cc44",
      description:
        "Higher bands (12-17m) reliably open during daylight. 10m may open for shorter periods or to closer distances.",
    };
  }
  if (sfi >= 90) {
    return {
      level: "Fair",
      color: "#ffaa00",
      description:
        "Mid-bands (15-20m) provide best DX opportunities. Higher bands may open briefly around solar noon.",
    };
  }
  if (sfi >= 70) {
    return {
      level: "Poor",
      color: "#ff7700",
      description:
        "Focus on 20m and lower bands for DX. Higher bands closed or limited to short-skip.",
    };
  }
  return {
    level: "Very Poor",
    color: "#ff4455",
    description:
      "Solar minimum conditions. Only lower bands (30-80m) provide reliable propagation.",
  };
}

/**
 * Band opening predictions based on SFI
 */
function getBandPredictions(sfi: number): Array<{
  band: string;
  status: string;
  color: string;
}> {
  const predictions = [];

  // 10m
  if (sfi >= 150) {
    predictions.push({
      band: "10m",
      status: "Open - Worldwide DX",
      color: "#00ff88",
    });
  } else if (sfi >= 120)
      predictions.push({
        band: "10m",
        status: "Limited openings",
        color: "#ffaa00",
      });
    else predictions.push({ band: "10m", status: "Closed", color: "#ff4455" });

  // 12m
  if (sfi >= 130) {
    predictions.push({
      band: "12m",
      status: "Open - Good DX",
      color: "#00ff88",
    });
  } else if (sfi >= 100)
      predictions.push({
        band: "12m",
        status: "Limited openings",
        color: "#ffaa00",
      });
    else predictions.push({ band: "12m", status: "Closed", color: "#ff4455" });

  // 15m
  if (sfi >= 100) {
    predictions.push({
      band: "15m",
      status: "Open - Strong DX",
      color: "#00ff88",
    });
  } else if (sfi >= 80)
      predictions.push({ band: "15m", status: "Marginal", color: "#ffaa00" });
    else
      predictions.push({
        band: "15m",
        status: "Mostly closed",
        color: "#ff4455",
      });

  // 17m
  if (sfi >= 90) {
    predictions.push({
      band: "17m",
      status: "Open - Reliable DX",
      color: "#00ff88",
    });
  } else if (sfi >= 75)
      predictions.push({
        band: "17m",
        status: "Fair openings",
        color: "#ffaa00",
      });
    else predictions.push({ band: "17m", status: "Limited", color: "#ff7700" });

  // 20m
  if (sfi >= 80) {
    predictions.push({ band: "20m", status: "Excellent", color: "#00ff88" });
  } else if (sfi >= 70)
      predictions.push({
        band: "20m",
        status: "Good - Primary DX band",
        color: "#44dd66",
      });
    else predictions.push({ band: "20m", status: "Fair", color: "#ffaa00" });

  // 40m
  predictions.push({
    band: "40m",
    status: "Always reliable",
    color: "#00ff88",
  });

  return predictions;
}

/**
 * SolarFluxChartModal Component
 *
 * Expanded view of solar flux chart with statistics, interpretation,
 * and band opening predictions.
 */
export const SolarFluxChartModal: React.FC<SolarFluxChartModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        path: "",
        areaPath: "",
        yMin: 60,
        yMax: 200,
        xLabels: [],
        yLabels: [],
        stats: {
          current: 0,
          min: 0,
          max: 0,
          average: 0,
          trend: "stable" as const,
        },
      };
    }

    const fluxValues = data.map((d) => d.flux);
    const dataMin = Math.min(...fluxValues);
    const dataMax = Math.max(...fluxValues);
    const yPadding = (dataMax - dataMin) * 0.15 || 10;
    const yMin = Math.max(60, Math.floor((dataMin - yPadding) / 10) * 10);
    const yMax = Math.min(280, Math.ceil((dataMax + yPadding) / 10) * 10);

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
    const yStep = Math.ceil((yMax - yMin) / 5 / 10) * 10;
    const yLabels: { label: string; y: number }[] = [];
    for (let v = yMin; v <= yMax; v += yStep) {
      yLabels.push({ label: String(v), y: yScale(v) });
    }

    // Calculate statistics
    const current = data[data.length - 1]?.flux || 0;
    const average = Math.round(
      fluxValues.reduce((a, b) => a + b, 0) / fluxValues.length,
    );

    // Calculate trend
    const recentAvg =
      data.slice(-5).reduce((sum, d) => sum + d.flux, 0) /
      Math.min(5, data.length);
    const olderAvg =
      data.length > 5
        ? data.slice(-10, -5).reduce((sum, d) => sum + d.flux, 0) /
          Math.min(5, data.slice(-10, -5).length || 1)
        : recentAvg;

    let trend: "rising" | "falling" | "stable" = "stable";
    if (recentAvg - olderAvg > 5) {
      trend = "rising";
    } else if (olderAvg - recentAvg > 5) trend = "falling";

    return {
      points,
      path,
      areaPath,
      yMin,
      yMax,
      xLabels,
      yLabels,
      stats: { current, min: dataMin, max: dataMax, average, trend },
    };
  }, [data]);

  const interpretation = getFluxInterpretation(chartData.stats.current);
  const bandPredictions = getBandPredictions(chartData.stats.current);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Solar Flux Index"
      subtitle="30-day trend and propagation analysis"
      size="xl"
    >
      <div className="space-y-6">
        {/* Larger Chart */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
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
                  <stop offset="100%" stopColor="#ff6b35" stopOpacity="0.05" />
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

              {/* Reference lines for propagation thresholds */}
              {[90, 120, 150].map((threshold) => {
                const y =
                  PADDING.top +
                  INNER_HEIGHT -
                  ((threshold - chartData.yMin) /
                    (chartData.yMax - chartData.yMin)) *
                    INNER_HEIGHT;
                if (y < PADDING.top || y > PADDING.top + INNER_HEIGHT) {
                  return null;
                }
                return (
                  <g key={threshold}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={PADDING.left + INNER_WIDTH}
                      y2={y}
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="1"
                      strokeDasharray="4,4"
                    />
                    <text
                      x={PADDING.left + INNER_WIDTH + 5}
                      y={y + 4}
                      fill="rgba(255,255,255,0.4)"
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {threshold}
                    </text>
                  </g>
                );
              })}

              {/* Area fill */}
              <path
                d={chartData.areaPath}
                fill="url(#modalFluxAreaGradient)"
                className="transition-all duration-500"
              />

              {/* Line */}
              <path
                d={chartData.path}
                fill="none"
                stroke="url(#modalFluxLineGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-500"
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
                    strokeWidth="1.5"
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
                  y={CHART_HEIGHT - 15}
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

              {/* Axis labels */}
              <text
                x={PADDING.left - 35}
                y={PADDING.top + INNER_HEIGHT / 2}
                fill="rgba(255,255,255,0.4)"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
                transform={`rotate(-90, ${PADDING.left - 35}, ${PADDING.top + INNER_HEIGHT / 2})`}
              >
                SFU
              </text>
            </svg>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5 text-center">
            <div className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1">
              Current
            </div>
            <div className="text-2xl font-mono font-bold text-plasma-orange">
              {chartData.stats.current}
            </div>
            <div className="text-xs text-gray-500">sfu</div>
          </div>
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5 text-center">
            <div className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1">
              30-Day Avg
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {chartData.stats.average}
            </div>
            <div className="text-xs text-gray-500">sfu</div>
          </div>
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5 text-center">
            <div className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1">
              Range
            </div>
            <div className="text-lg font-mono font-bold text-white">
              {chartData.stats.min} - {chartData.stats.max}
            </div>
            <div className="text-xs text-gray-500">min / max</div>
          </div>
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5 text-center">
            <div className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-1">
              Trend
            </div>
            <div
              className={`text-xl font-mono font-bold ${
                chartData.stats.trend === "rising"
                  ? "text-signal-green"
                  : chartData.stats.trend === "falling"
                    ? "text-alert-red"
                    : "text-caution-amber"
              }`}
            >
              {chartData.stats.trend === "rising"
                ? "Rising"
                : chartData.stats.trend === "falling"
                  ? "Falling"
                  : "Stable"}
            </div>
            <div className="text-xs text-gray-500">5-day trend</div>
          </div>
        </div>

        {/* Propagation Interpretation */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Propagation Assessment
          </h4>
          <div className="flex items-start gap-4">
            <div
              className="px-4 py-2 rounded-lg font-mono font-bold text-lg shrink-0"
              style={{
                backgroundColor: `${interpretation.color}20`,
                color: interpretation.color,
                border: `1px solid ${interpretation.color}40`,
              }}
            >
              {interpretation.level}
            </div>
            <p className="text-gray-300 leading-relaxed">
              {interpretation.description}
            </p>
          </div>
        </div>

        {/* Band Opening Predictions */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Band Opening Predictions (Daytime)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {bandPredictions.map((pred) => (
              <div
                key={pred.band}
                className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/5"
              >
                <span className="font-mono font-bold text-white">
                  {pred.band}
                </span>
                <span className="text-sm" style={{ color: pred.color }}>
                  {pred.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Understanding SFI */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            Understanding Solar Flux Index
          </h4>
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              The Solar Flux Index (SFI) measures radio emissions from the sun
              at 2800 MHz (10.7 cm wavelength). It is measured in Solar Flux
              Units (sfu) and is the best indicator of ionospheric ionization
              levels affecting HF propagation.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <h5 className="font-medium text-white mb-2">SFI Ranges:</h5>
                <ul className="space-y-1 text-gray-400">
                  <li>
                    <span className="text-signal-green">200+</span> -
                    Exceptional (solar max)
                  </li>
                  <li>
                    <span className="text-good">150-199</span> - Excellent
                  </li>
                  <li>
                    <span className="text-caution-amber">120-149</span> - Good
                  </li>
                  <li>
                    <span className="text-caution-amber">90-119</span> - Fair
                  </li>
                  <li>
                    <span className="text-alert-red">70-89</span> - Poor
                  </li>
                  <li>
                    <span className="text-alert-red">&lt;70</span> - Very Poor
                    (solar min)
                  </li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium text-white mb-2">Key Points:</h5>
                <ul className="space-y-1 text-gray-400">
                  <li>Higher SFI = better high-band propagation</li>
                  <li>SFI varies with 27-day solar rotation</li>
                  <li>Follows ~11-year solar cycle</li>
                  <li>Does not predict geomagnetic storms</li>
                  <li>Updated daily by NOAA</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

SolarFluxChartModal.displayName = "SolarFluxChartModal";

export default SolarFluxChartModal;
