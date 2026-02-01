import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";

export interface PropagationIndexProps {
  /** Current Solar Flux Index (typically 70-300) */
  solarFlux: number;
  /** Current K-index (0-9) */
  kIndex: number;
  /** Current IMF Bz in nT (positive = northward, negative = southward) */
  bz: number | null;
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand/details button is clicked */
  onExpand?: () => void;
}

/**
 * Calculate the composite Propagation Index (0-100)
 * Combines Solar Flux, K-index, and IMF Bz into a single score
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
  let bzScore = 10; // Default middle value if Bz unknown
  if (bz !== null) {
    if (bz >= 5) bzScore = 20;
    else if (bz >= 0) bzScore = 15;
    else if (bz >= -5) bzScore = 10;
    else if (bz >= -10) bzScore = 5;
    else bzScore = 0;
  }

  // Total score
  const score = Math.round(sfiScore + kpScore + bzScore);

  // Categorize
  let category: "excellent" | "good" | "fair" | "poor" | "very-poor";
  let description: string;

  if (score >= 80) {
    category = "excellent";
    description = "Outstanding conditions for all HF bands";
  } else if (score >= 60) {
    category = "good";
    description = "Good conditions for most HF operations";
  } else if (score >= 40) {
    category = "fair";
    description = "Moderate conditions, some bands may be affected";
  } else if (score >= 20) {
    category = "poor";
    description = "Degraded conditions, use lower bands";
  } else {
    category = "very-poor";
    description = "Poor conditions, limited propagation expected";
  }

  return { score, sfiScore, kpScore, bzScore, category, description };
}

/**
 * Get color for score value
 */
function getScoreColor(score: number): string {
  if (score >= 80) return "#00ff88"; // Excellent - green
  if (score >= 60) return "#44dd66"; // Good - light green
  if (score >= 40) return "#ffaa00"; // Fair - amber
  if (score >= 20) return "#ff7700"; // Poor - orange
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
      return "Excellent";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    case "very-poor":
      return "Very Poor";
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
}) => {
  const result = useMemo(
    () => calculatePropagationIndex(solarFlux, kIndex, bz),
    [solarFlux, kIndex, bz],
  );

  const scoreColor = getScoreColor(result.score);

  // SVG gauge parameters
  const gaugeRadius = 90;
  const gaugeStrokeWidth = 14;
  const gaugeCenter = 100;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  // Arc from -135deg to +135deg (270deg total)
  const gaugeArcLength = gaugeCircumference * (270 / 360);
  const scoreArcLength = (result.score / 100) * gaugeArcLength;

  // Tick marks for the gauge (0, 25, 50, 75, 100)
  const ticks = [0, 25, 50, 75, 100].map((value) => {
    const angle = -135 + (value / 100) * 270;
    const rad = (angle * Math.PI) / 180;
    const tickOuter = gaugeRadius + gaugeStrokeWidth / 2 + 8;
    const tickInner = gaugeRadius + gaugeStrokeWidth / 2 + 2;
    return {
      value,
      x1: gaugeCenter + tickInner * Math.cos(rad),
      y1: gaugeCenter + tickInner * Math.sin(rad),
      x2: gaugeCenter + tickOuter * Math.cos(rad),
      y2: gaugeCenter + tickOuter * Math.sin(rad),
      labelX: gaugeCenter + (tickOuter + 12) * Math.cos(rad),
      labelY: gaugeCenter + (tickOuter + 12) * Math.sin(rad),
    };
  });

  // Calculate the needle position
  const needleAngle = -135 + (result.score / 100) * 270;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLength = gaugeRadius - 15;
  const needleX = gaugeCenter + needleLength * Math.cos(needleRad);
  const needleY = gaugeCenter + needleLength * Math.sin(needleRad);

  return (
    <Card className="relative overflow-hidden">
      {/* Background gradient glow */}
      <div
        className="absolute inset-0 opacity-20 blur-3xl"
        style={{
          background: `radial-gradient(circle at center, ${scoreColor}40 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-sans text-xl font-bold text-white tracking-wide">
              Propagation Index
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Composite HF propagation quality score
            </p>
          </div>
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              aria-label="View details"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[240px]">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Gauge */}
            <div className="relative flex-shrink-0">
              <svg
                width="200"
                height="160"
                viewBox="0 0 200 160"
                className="overflow-visible"
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
                <circle
                  cx={gaugeCenter}
                  cy={gaugeCenter}
                  r={gaugeRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={gaugeStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${gaugeArcLength} ${gaugeCircumference}`}
                  strokeDashoffset={-gaugeCircumference * (135 / 360)}
                  transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                />

                {/* Colored track */}
                <circle
                  cx={gaugeCenter}
                  cy={gaugeCenter}
                  r={gaugeRadius}
                  fill="none"
                  stroke="url(#gaugeGradient)"
                  strokeWidth={gaugeStrokeWidth - 4}
                  strokeLinecap="round"
                  strokeDasharray={`${gaugeArcLength} ${gaugeCircumference}`}
                  strokeDashoffset={-gaugeCircumference * (135 / 360)}
                  transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                  opacity="0.3"
                />

                {/* Active score arc */}
                <circle
                  cx={gaugeCenter}
                  cy={gaugeCenter}
                  r={gaugeRadius}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth={gaugeStrokeWidth - 4}
                  strokeLinecap="round"
                  strokeDasharray={`${scoreArcLength} ${gaugeCircumference}`}
                  strokeDashoffset={-gaugeCircumference * (135 / 360)}
                  transform={`rotate(-90 ${gaugeCenter} ${gaugeCenter})`}
                  filter="url(#gaugeGlow)"
                  className="transition-all duration-1000 ease-out"
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

                {/* Needle */}
                <line
                  x1={gaugeCenter}
                  y1={gaugeCenter}
                  x2={needleX}
                  y2={needleY}
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  style={{
                    filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))",
                  }}
                />
                <circle
                  cx={gaugeCenter}
                  cy={gaugeCenter}
                  r="8"
                  fill="#1a1a2e"
                  stroke="white"
                  strokeWidth="2"
                />

                {/* Center score display */}
                <text
                  x={gaugeCenter}
                  y={gaugeCenter + 45}
                  fill="white"
                  fontSize="36"
                  fontFamily="monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {result.score}
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
                  Score Breakdown
                </div>

                {/* SFI contribution */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16">SFI</span>
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
                  <span className="text-xs text-gray-400 w-16">K-index</span>
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
                  <span className="text-xs text-gray-400 w-16">IMF Bz</span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(result.bzScore / 20) * 100}%`,
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
                    {Math.round(result.bzScore)}/20
                  </span>
                </div>
              </div>

              {/* Current values */}
              <div className="flex gap-4 pt-2 border-t border-white/10">
                <div className="text-center">
                  <div className="text-xs text-gray-400">SFI</div>
                  <div className="font-mono text-sm text-plasma-orange">
                    {solarFlux}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">Kp</div>
                  <div className="font-mono text-sm text-signal-green">
                    {kIndex}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-400">Bz</div>
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
      </div>
    </Card>
  );
};

PropagationIndex.displayName = "PropagationIndex";

export default PropagationIndex;
