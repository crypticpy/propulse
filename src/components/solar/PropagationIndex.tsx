import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { Badge } from "@/components/ui/Badge";
import { InfoTip } from "@/components/ui/Tooltip";
import { SOLAR_TOOLTIPS, PROPAGATION_TOOLTIPS } from "@/constants/tooltips";
import {
  getDetailedSummary,
  getBestBands,
  getConditionBadge,
} from "@/lib/utils/propagationSummary";

export interface PropagationIndexProps {
  /** Current Solar Flux Index (typically 70-300), null if unavailable */
  solarFlux: number | null;
  /** Current K-index (0-9), null if unavailable */
  kIndex: number | null;
  /** Current IMF Bz in nT (positive = northward, negative = southward) */
  bz: number | null;
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand/details button is clicked */
  onExpand?: () => void;
  /** Callback when summary expand button is clicked */
  onExpandSummary?: () => void;
}

/**
 * Calculate a transparent global-conditions heuristic (0-100).
 * It is not path-specific and is not a calibrated probability.
 *
 * Formula breakdown:
 * - SFI component (40 points max): Higher SFI = better ionization = better propagation
 * - Kp component (40 points max): Lower Kp = quieter geomagnetic = better propagation
 * - Bz component (20 points max): Positive Bz = shield from solar wind = better propagation
 */
export function calculatePropagationIndex(
  solarFlux: number,
  kIndex: number,
  bz: number | null,
): {
  score: number;
  sfiScore: number;
  kpScore: number;
  bzScore: number;
  bzAvailable: boolean;
  evidenceCoverage: "2 of 3 inputs" | "3 of 3 inputs";
  category: "excellent" | "good" | "fair" | "poor" | "very-poor";
  description: string;
} {
  // SFI component: 0-40 points
  // SFI of 70 = 0 points (minimum useful), SFI of 200 = 40 points (excellent)
  const normalizedSfi = Math.max(0, Math.min(1, (solarFlux - 70) / 130));
  const sfiScore = normalizedSfi * 40;

  // Kp component: 0-40 points
  // Kp of 0 = 40 points (perfect quiet), Kp of 9 = 0 points (severe storm)
  const kpScore = ((9 - kIndex) / 9) * 40;

  // Bz component: 0-20 points
  // Bz >= 5 = 20 points (strong shield), Bz < -10 = 0 points (storm conditions)
  let bzScore = 0;
  if (bz !== null) {
    if (bz >= 5) {
      bzScore = 20;
    } else if (bz >= 0) {
      bzScore = 15;
    } else if (bz >= -5) bzScore = 10;
    else if (bz >= -10) bzScore = 5;
    else bzScore = 0;
  }

  // Normalize only across observed inputs. Missing Bz contributes no hidden
  // neutral points; evidence coverage is returned and shown beside the score.
  const availableMaximum = bz === null ? 80 : 100;
  const score = Math.round(((sfiScore + kpScore + bzScore) / availableMaximum) * 100);

  // Categorize
  let category: "excellent" | "good" | "fair" | "poor" | "very-poor";
  let description: string;

  if (score >= 80) {
    category = "excellent";
    description = "Global indices are strongly supportive; path results may differ";
  } else if (score >= 60) {
    category = "good";
    description = "Global indices are supportive; check the specific path and time";
  } else if (score >= 40) {
    category = "fair";
    description = "Global inputs are mixed; use path-aware analysis";
  } else if (score >= 20) {
    category = "poor";
    description = "Global inputs indicate disruption risk";
  } else {
    category = "very-poor";
    description = "Global inputs indicate substantial disruption risk";
  }

  return {
    score,
    sfiScore,
    kpScore,
    bzScore,
    bzAvailable: bz !== null,
    evidenceCoverage: bz === null ? "2 of 3 inputs" : "3 of 3 inputs",
    category,
    description,
  };
}

/**
 * Get color for score value
 */
function getScoreColor(score: number): string {
  if (score >= 80) {
    return "#00ff88";
  } // Excellent - green
  if (score >= 60) {
    return "#44dd66";
  } // Good - light green
  if (score >= 40) {
    return "#ffaa00";
  } // Fair - amber
  if (score >= 20) {
    return "#ff7700";
  } // Poor - orange
  return "#ff4455"; // Very Poor - red
}

/**
 * Get category label
 */
function getCategoryLabel(
  category: "excellent" | "good" | "fair" | "poor" | "very-poor",
): string {
  switch (category) {
    case "excellent":
      return "Strongly supportive";
    case "good":
      return "Supportive";
    case "fair":
      return "Mixed";
    case "poor":
      return "Disrupted";
    case "very-poor":
      return "Severely disrupted";
  }
}

/**
 * PropagationIndex Component
 *
 * A hero gauge showing overall HF propagation conditions as a single
 * composite score from 0-100, derived from SFI, Kp, and Bz.
 *
 * This is designed to be the central visual element on the Solar Pulse
 * dashboard, giving operators an at-a-glance assessment of conditions.
 *
 * @example
 * ```tsx
 * <PropagationIndex
 *   solarFlux={150}
 *   kIndex={3}
 *   bz={2}
 *   loading={false}
 * />
 * ```
 */
export const PropagationIndex: React.FC<PropagationIndexProps> = ({
  solarFlux,
  kIndex,
  bz,
  loading = false,
  onExpand,
  onExpandSummary,
}) => {
  const hasData = solarFlux !== null && kIndex !== null;
  const result = useMemo(
    () => (hasData ? calculatePropagationIndex(solarFlux, kIndex, bz) : null),
    [solarFlux, kIndex, bz, hasData],
  );

  const scoreColor = result ? getScoreColor(result.score) : "#888899";

  // Propagation summary data (merged from SolarSummary)
  const detailedSummary = useMemo(
    () => (hasData ? getDetailedSummary(kIndex!, solarFlux!) : ""),
    [kIndex, solarFlux, hasData],
  );
  const bestBands = useMemo(
    () => (hasData ? getBestBands(kIndex!, solarFlux!) : []),
    [kIndex, solarFlux, hasData],
  );
  const conditionBadge = useMemo(
    () => (hasData ? getConditionBadge(kIndex!, solarFlux!) : null),
    [kIndex, solarFlux, hasData],
  );

  function polarToCartesian(
    cx: number,
    cy: number,
    radius: number,
    angleInDegrees: number,
  ) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  }

  function describeArc(
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ) {
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    const sweepAngle = (((endAngle - startAngle) % 360) + 360) % 360;
    const largeArcFlag = sweepAngle > 180 ? 1 : 0;
    const sweepFlag = 1; // clockwise
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
  }

  // SVG gauge parameters
  const gaugeRadius = 90;
  const gaugeStrokeWidth = 14;
  const gaugeCenter = 100;
  const gaugeStartAngle = 135;
  const gaugeSweepAngle = 270;
  const gaugeEndAngle = gaugeStartAngle + gaugeSweepAngle;

  const gaugePath = describeArc(
    gaugeCenter,
    gaugeCenter,
    gaugeRadius,
    gaugeStartAngle,
    gaugeEndAngle,
  );

  // Tick marks for the gauge (0, 25, 50, 75, 100)
  const ticks = [0, 25, 50, 75, 100].map((value) => {
    const angle = gaugeStartAngle + (value / 100) * gaugeSweepAngle;
    const rad = (angle * Math.PI) / 180;
    const tickOuter = gaugeRadius + gaugeStrokeWidth / 2 + 8;
    const tickInner = gaugeRadius + gaugeStrokeWidth / 2 + 2;
    const labelRadius = gaugeRadius + gaugeStrokeWidth / 2 + 14;
    return {
      value,
      x1: gaugeCenter + tickInner * Math.cos(rad),
      y1: gaugeCenter + tickInner * Math.sin(rad),
      x2: gaugeCenter + tickOuter * Math.cos(rad),
      y2: gaugeCenter + tickOuter * Math.sin(rad),
      labelX: gaugeCenter + labelRadius * Math.cos(rad),
      labelY: gaugeCenter + labelRadius * Math.sin(rad),
    };
  });

  // Score marker position (a small indicator on the arc rather than a center needle)
  const markerAngle =
    gaugeStartAngle + ((result?.score ?? 0) / 100) * gaugeSweepAngle;
  const markerRad = (markerAngle * Math.PI) / 180;
  const markerInnerRadius = gaugeRadius - (gaugeStrokeWidth - 4) / 2 - 2;
  const markerOuterRadius = gaugeRadius + (gaugeStrokeWidth - 4) / 2 + 4;
  const markerX1 = gaugeCenter + markerInnerRadius * Math.cos(markerRad);
  const markerY1 = gaugeCenter + markerInnerRadius * Math.sin(markerRad);
  const markerX2 = gaugeCenter + markerOuterRadius * Math.cos(markerRad);
  const markerY2 = gaugeCenter + markerOuterRadius * Math.sin(markerRad);

  return (
    <Card className="relative overflow-hidden group hover:border-white/20">
      {/* Background gradient glow */}
      <div
        className="absolute inset-0 opacity-20 blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${scoreColor}40 0%, transparent 70%)`,
        }}
      />

      {/* Expand icon - hover only */}
      {onExpand && (
        <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onExpand}
            className="flex min-h-11 min-w-11 items-center justify-center text-gray-500 transition-colors hover:text-white motion-reduce:transition-none"
            aria-label="Expand global conditions score"
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
        </div>
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide flex items-center gap-2">
              Global Conditions Score
              <InfoTip content={PROPAGATION_TOOLTIPS.propagationIndex} />
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Uncalibrated global heuristic · not path-specific
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[240px]">
            <LoadingSpinner size="lg" />
          </div>
        ) : !result ? (
          <div className="flex items-center justify-center min-h-[240px] text-gray-500 text-sm">
            Solar data unavailable
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Gauge */}
            <div className="relative flex-shrink-0 w-full md:w-auto max-w-[200px] mx-auto md:mx-0">
              <svg
                viewBox="0 0 200 160"
                className="w-full h-auto overflow-visible"
              >
                <defs>
                  {/* Gradient for gauge background */}
                  <linearGradient
                    id="gaugeGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#ff4455" />
                    <stop offset="25%" stopColor="#ff7700" />
                    <stop offset="50%" stopColor="#ffaa00" />
                    <stop offset="75%" stopColor="#44dd66" />
                    <stop offset="100%" stopColor="#00ff88" />
                  </linearGradient>

                  {/* Glow filter */}
                  <filter
                    id="gaugeGlow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Background track */}
                <path
                  d={gaugePath}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={gaugeStrokeWidth}
                  strokeLinecap="round"
                />

                {/* Colored track */}
                <path
                  d={gaugePath}
                  fill="none"
                  stroke="url(#gaugeGradient)"
                  strokeWidth={gaugeStrokeWidth - 4}
                  strokeLinecap="round"
                  opacity="0.3"
                />

                {/* Active score arc */}
                <path
                  d={gaugePath}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth={gaugeStrokeWidth - 4}
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${result.score} 100`}
                  filter="url(#gaugeGlow)"
                  className="transition-all duration-1000 ease-out motion-reduce:transition-none"
                />

                {/* Tick marks */}
                {ticks.map((tick) => (
                  <g key={tick.value}>
                    <line
                      x1={tick.x1}
                      y1={tick.y1}
                      x2={tick.x2}
                      y2={tick.y2}
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="2"
                    />
                    <text
                      x={tick.labelX}
                      y={tick.labelY}
                      fill="rgba(255,255,255,0.5)"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {tick.value}
                    </text>
                  </g>
                ))}

                {/* Score marker */}
                <line
                  x1={markerX1}
                  y1={markerY1}
                  x2={markerX2}
                  y2={markerY2}
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out motion-reduce:transition-none"
                  style={{
                    filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))",
                  }}
                />
                <circle
                  cx={markerX2}
                  cy={markerY2}
                  r="4"
                  fill="white"
                  className="transition-all duration-1000 ease-out motion-reduce:transition-none"
                  style={{
                    filter: `drop-shadow(0 0 8px ${scoreColor})`,
                  }}
                />

                {/* Center score display */}
                <text
                  x={gaugeCenter}
                  y={gaugeCenter - 5}
                  fill="white"
                  fontSize="52"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {result.score}
                </text>
                {/* Category label below score */}
                <text
                  x={gaugeCenter}
                  y={gaugeCenter + 25}
                  fill={scoreColor}
                  fontSize="11"
                  fontFamily="sans-serif"
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  letterSpacing="0.1em"
                >
                  {getCategoryLabel(result.category).toUpperCase()}
                </text>
              </svg>
            </div>

            {/* Status and breakdown */}
            <div className="flex-1 space-y-4">
              {/* Category badge */}
              <div className="flex items-center gap-3">
                <div
                  className="px-4 py-2 rounded-lg font-bold text-lg"
                  style={{
                    backgroundColor: `${scoreColor}20`,
                    color: scoreColor,
                    border: `1px solid ${scoreColor}40`,
                  }}
                >
                  {getCategoryLabel(result.category)}
                </div>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-300">{result.description}</p>

              {/* Score breakdown */}
              <div className="space-y-2">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                  Heuristic inputs · {result.evidenceCoverage}
                </div>

                {/* SFI contribution */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 flex items-center gap-1">
                    SFI <InfoTip content={SOLAR_TOOLTIPS.sfi} />
                  </span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-plasma-orange rounded-full transition-all duration-500"
                      style={{ width: `${(result.sfiScore / 40) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-12 text-right">
                    {Math.round(result.sfiScore)}/40
                  </span>
                </div>

                {/* Kp contribution */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 flex items-center gap-1">
                    K-index <InfoTip content={SOLAR_TOOLTIPS.kIndex} />
                  </span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-signal-green rounded-full transition-all duration-500"
                      style={{ width: `${(result.kpScore / 40) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-12 text-right">
                    {Math.round(result.kpScore)}/40
                  </span>
                </div>

                {/* Bz contribution */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16 flex items-center gap-1">
                    IMF Bz <InfoTip content={SOLAR_TOOLTIPS.bz} />
                  </span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${result.bzAvailable ? (result.bzScore / 20) * 100 : 0}%`,
                        backgroundColor:
                          bz === null
                            ? "#888"
                            : bz >= 0
                              ? "#44dd66"
                              : "#ff7700",
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-12 text-right">
                    {result.bzAvailable ? `${Math.round(result.bzScore)}/20` : "N/A"}
                  </span>
                </div>
              </div>

              {/* Current values */}
              <div className="flex gap-4 pt-2 border-t border-white/10">
                <div className="text-center">
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    SFI <InfoTip content={SOLAR_TOOLTIPS.sfi} />
                  </div>
                  <div className="font-mono text-sm text-plasma-orange">
                    {solarFlux ?? "—"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    Kp <InfoTip content={SOLAR_TOOLTIPS.kIndex} />
                  </div>
                  <div className="font-mono text-sm text-signal-green">
                    {kIndex ?? "—"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    Bz <InfoTip content={SOLAR_TOOLTIPS.bz} />
                  </div>
                  <div
                    className="font-mono text-sm"
                    style={{
                      color:
                        bz === null ? "#888" : bz >= 0 ? "#44dd66" : "#ff7700",
                    }}
                  >
                    {bz !== null
                      ? `${bz > 0 ? "+" : ""}${bz.toFixed(1)}`
                      : "N/A"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Propagation Summary (merged from SolarSummary) */}
        {result && conditionBadge && (
          <div className="border-t border-white/10 mt-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                General HF context
              </h3>
              <div className="flex items-center gap-2">
                <Badge status={conditionBadge.status}>
                  {conditionBadge.label}
                </Badge>
                {onExpandSummary && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpandSummary();
                    }}
                    className="flex min-h-11 min-w-11 items-center justify-center text-gray-500 opacity-100 transition-colors hover:text-white motion-reduce:transition-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    aria-label="Expand general HF context"
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
            <p className="text-sm text-gray-300 leading-relaxed mb-3">
              {detailedSummary}
            </p>
            {bestBands.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-mono uppercase tracking-wider text-gray-500">
                  Bands supported by global indices
                </span>
                <div className="flex flex-wrap gap-2">
                  {bestBands.map((band) => (
                    <span
                      key={band}
                      className="px-2.5 py-0.5 text-xs font-mono text-signal-green bg-signal-green/10 border border-signal-green/20 rounded-lg"
                    >
                      {band}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {conditionBadge.vhf === "Aurora" && (
              <div className="mt-2 px-3 py-2 bg-aurora-purple/10 border border-aurora-purple/20 rounded-lg">
                <span className="text-sm text-aurora-purple">
                  Aurora propagation possible on 6m - check for flutter signals!
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

PropagationIndex.displayName = "PropagationIndex";

export default PropagationIndex;
