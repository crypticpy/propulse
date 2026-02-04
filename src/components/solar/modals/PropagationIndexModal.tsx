import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { calculatePropagationIndex } from "../PropagationIndex";

export interface PropagationIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  solarFlux: number;
  kIndex: number;
  bz: number | null;
}

/**
 * Get color for score value
 */
function getScoreColor(score: number): string {
  if (score >= 80) {
    return "#00ff88";
  }
  if (score >= 60) {
    return "#44dd66";
  }
  if (score >= 40) {
    return "#ffaa00";
  }
  if (score >= 20) {
    return "#ff7700";
  }
  return "#ff4455";
}

/**
 * Score category definitions
 */
const SCORE_CATEGORIES = [
  {
    range: "80-100",
    level: "Excellent",
    color: "#00ff88",
    bands: "All HF bands (10m-80m) performing well",
    tips: "Outstanding DX opportunities. Work higher bands (10m-17m) for long-haul contacts. Low bands excellent for regional.",
  },
  {
    range: "60-79",
    level: "Good",
    color: "#44dd66",
    bands: "Most bands open (15m-40m reliable)",
    tips: "Good conditions for DX. 20m likely the workhorse band. Some opportunity on higher bands depending on path.",
  },
  {
    range: "40-59",
    level: "Fair",
    color: "#ffaa00",
    bands: "Lower bands favored (20m-80m)",
    tips: "Moderate conditions. Focus on 20m and 40m for best results. Higher bands may be marginal or closed.",
  },
  {
    range: "20-39",
    level: "Poor",
    color: "#ff7700",
    bands: "Only low bands viable (40m-160m)",
    tips: "Degraded conditions. Stick to lower frequencies. Digital modes (FT8/FT4) recommended for marginal paths.",
  },
  {
    range: "0-19",
    level: "Very Poor",
    color: "#ff4455",
    bands: "Limited to 80m-160m, possibly closed",
    tips: "Severe degradation. Consider NVIS on 80m/40m for regional contacts. DX unlikely except on lowest bands.",
  },
];

/**
 * PropagationIndexModal Component
 *
 * Detailed explanation of the Propagation Index calculation,
 * score breakdown, and operating recommendations.
 */
export const PropagationIndexModal: React.FC<PropagationIndexModalProps> = ({
  isOpen,
  onClose,
  solarFlux,
  kIndex,
  bz,
}) => {
  const result = useMemo(
    () => calculatePropagationIndex(solarFlux, kIndex, bz),
    [solarFlux, kIndex, bz],
  );

  const scoreColor = getScoreColor(result.score);

  // Find current category
  const currentCategory = SCORE_CATEGORIES.find((c) => {
    const [min, max] = c.range.split("-").map(Number);
    return result.score >= min && result.score <= max;
  });

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Propagation Index Details"
      subtitle="Understanding your current HF propagation conditions"
      size="xl"
    >
      <div className="space-y-6">
        {/* Current Score Hero */}
        <div className="bg-void-black/50 rounded-lg p-6 border border-white/5 text-center">
          <div
            className="text-6xl font-mono font-bold"
            style={{ color: scoreColor }}
          >
            {result.score}
          </div>
          <div
            className="inline-block mt-2 px-4 py-1 rounded-lg font-semibold"
            style={{
              backgroundColor: `${scoreColor}20`,
              color: scoreColor,
              border: `1px solid ${scoreColor}40`,
            }}
          >
            {currentCategory?.level}
          </div>
          <p className="text-gray-300 mt-3">{result.description}</p>
        </div>

        {/* Score Breakdown */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Score Breakdown
          </h4>

          <div className="space-y-4">
            {/* SFI Component */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-plasma-orange font-semibold">
                    Solar Flux Index
                  </span>
                  <span className="text-xs text-gray-400">40 points max</span>
                </div>
                <div className="font-mono text-white">
                  {Math.round(result.sfiScore)} / 40
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-plasma-orange rounded-full transition-all"
                    style={{ width: `${(result.sfiScore / 40) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-plasma-orange text-sm w-16 text-right">
                  {solarFlux} sfu
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Higher SFI = More ionization = Better propagation on higher
                bands. SFI of 70 is baseline, 200+ is excellent.
              </p>
            </div>

            {/* Kp Component */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-signal-green font-semibold">
                    K-Index
                  </span>
                  <span className="text-xs text-gray-400">40 points max</span>
                </div>
                <div className="font-mono text-white">
                  {Math.round(result.kpScore)} / 40
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-signal-green rounded-full transition-all"
                    style={{ width: `${(result.kpScore / 40) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-signal-green text-sm w-16 text-right">
                  Kp = {kIndex}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Lower Kp = Quieter geomagnetic field = More stable propagation.
                Kp of 0-2 is ideal, 5+ indicates storm conditions.
              </p>
            </div>

            {/* Bz Component */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="font-semibold"
                    style={{
                      color:
                        bz === null ? "#888" : bz >= 0 ? "#44dd66" : "#ff7700",
                    }}
                  >
                    IMF Bz
                  </span>
                  <span className="text-xs text-gray-400">20 points max</span>
                </div>
                <div className="font-mono text-white">
                  {Math.round(result.bzScore)} / 20
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(result.bzScore / 20) * 100}%`,
                      backgroundColor:
                        bz === null ? "#888" : bz >= 0 ? "#44dd66" : "#ff7700",
                    }}
                  />
                </div>
                <span
                  className="font-mono text-sm w-16 text-right"
                  style={{
                    color:
                      bz === null ? "#888" : bz >= 0 ? "#44dd66" : "#ff7700",
                  }}
                >
                  {bz !== null
                    ? `${bz > 0 ? "+" : ""}${bz.toFixed(1)} nT`
                    : "N/A"}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Positive Bz (northward IMF) shields Earth from solar wind.
                Negative Bz allows energy transfer, potentially triggering
                storms.
              </p>
            </div>
          </div>
        </div>

        {/* Current Recommendations */}
        {currentCategory && (
          <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
            <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
              Current Operating Recommendations
            </h4>
            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: `${currentCategory.color}10`,
                borderLeft: `3px solid ${currentCategory.color}`,
              }}
            >
              <div className="font-semibold text-white mb-2">
                {currentCategory.bands}
              </div>
              <p className="text-sm text-gray-300">{currentCategory.tips}</p>
            </div>
          </div>
        )}

        {/* Score Scale Reference */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-4">
            Score Scale Reference
          </h4>
          <div className="space-y-3">
            {SCORE_CATEGORIES.map((category) => {
              const isCurrentLevel = currentCategory?.level === category.level;
              return (
                <div
                  key={category.level}
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    isCurrentLevel
                      ? "bg-white/5 border border-white/10"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="w-16 h-10 rounded flex items-center justify-center font-mono font-bold text-sm shrink-0"
                    style={{
                      backgroundColor: `${category.color}20`,
                      color: category.color,
                      border: `1px solid ${category.color}40`,
                    }}
                  >
                    {category.range}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">
                        {category.level}
                      </span>
                      {isCurrentLevel && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {category.bands}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Formula Explanation */}
        <div className="bg-void-black/50 rounded-lg p-4 border border-white/5">
          <h4 className="text-sm font-mono uppercase tracking-wider text-gray-400 mb-3">
            How the Score is Calculated
          </h4>
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              The Propagation Index combines three key space weather parameters
              into a single 0-100 score:
            </p>
            <div className="bg-white/5 rounded p-3 font-mono text-xs">
              <div className="text-plasma-orange">
                SFI Score = ((SFI - 70) / 130) × 40
              </div>
              <div className="text-signal-green mt-1">
                Kp Score = ((9 - Kp) / 9) × 40
              </div>
              <div className="text-caution-amber mt-1">
                Bz Score = 0-20 based on IMF direction
              </div>
              <div className="text-white mt-2 border-t border-white/10 pt-2">
                Total = SFI Score + Kp Score + Bz Score
              </div>
            </div>
            <p>
              The weighting reflects the relative importance of each factor: SFI
              and Kp are equally weighted at 40% each as they have the largest
              impact on HF propagation, while Bz contributes 20% as a storm
              predictor.
            </p>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

PropagationIndexModal.displayName = "PropagationIndexModal";

export default PropagationIndexModal;
