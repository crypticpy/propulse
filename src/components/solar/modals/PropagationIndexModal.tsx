import React, { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { calculatePropagationIndex } from "../PropagationIndex";

export interface PropagationIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  solarFlux: number | null;
  kIndex: number | null;
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
    level: "Strongly supportive",
    color: "#00ff88",
    bands: "Global indices are broadly supportive",
    tips: "Check station-to-target geometry, illumination, frequency, mode, and local noise before choosing a band.",
  },
  {
    range: "60-79",
    level: "Supportive",
    color: "#44dd66",
    bands: "Global indices are supportive",
    tips: "Some paths may benefit, but this score cannot identify which bands are open without station and target context.",
  },
  {
    range: "40-59",
    level: "Mixed",
    color: "#ffaa00",
    bands: "Global inputs are mixed",
    tips: "Use the path-aware map or observed spots to choose a band; regional and polar paths can differ materially.",
  },
  {
    range: "20-39",
    level: "Disrupted",
    color: "#ff7700",
    bands: "Global disruption risk is elevated",
    tips: "Polar and high-latitude paths may be degraded. Check the actual path before changing frequency or mode.",
  },
  {
    range: "0-19",
    level: "Severely disrupted",
    color: "#ff4455",
    bands: "Global disruption risk is high",
    tips: "Decision support is limited to global context. Path-aware results and current observations are required for operating choices.",
  },
];

/**
 * PropagationIndexModal Component
 *
 * Detailed explanation of the Global Conditions Score calculation,
 * score breakdown, and operating recommendations.
 */
export const PropagationIndexModal: React.FC<PropagationIndexModalProps> = ({
  isOpen,
  onClose,
  solarFlux,
  kIndex,
  bz,
}) => {
  const hasData = solarFlux !== null && kIndex !== null;
  const result = useMemo(
    () => (hasData ? calculatePropagationIndex(solarFlux, kIndex, bz) : null),
    [solarFlux, kIndex, bz, hasData],
  );

  if (!result) {
    return (
      <DetailModal
        isOpen={isOpen}
        onClose={onClose}
        title="Global Conditions Score Details"
        subtitle="Transparent global heuristic; not a calibrated probability or path forecast"
        size="xl"
      >
        <div className="text-center py-12 text-gray-500">
          Required solar observations are unavailable, so the heuristic is withheld.
        </div>
      </DetailModal>
    );
  }

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
      title="Global Conditions Score Details"
      subtitle={`Transparent global heuristic · ${result.evidenceCoverage}`}
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
                  {result.bzAvailable ? `${Math.round(result.bzScore)} / 20` : "Unavailable"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${result.bzAvailable ? (result.bzScore / 20) * 100 : 0}%`,
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
              The Global Conditions Score combines available space-weather inputs
              into an uncalibrated 0-100 heuristic. It does not predict a station-to-station path.
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
                Total = available points ÷ available maximum × 100
              </div>
            </div>
            <p>
              SFI and Kp each carry 40 possible points and Bz carries 20. If Bz
              is missing, it contributes no hidden neutral points; the score is
              normalized across the two available inputs and evidence coverage is
              reduced to 2 of 3. Treat the result as general context only.
            </p>
          </div>
        </div>
      </div>
    </DetailModal>
  );
};

PropagationIndexModal.displayName = "PropagationIndexModal";

export default PropagationIndexModal;
