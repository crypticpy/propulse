/**
 * RecommendationsBadge Component
 *
 * Compact recommendation summary for top bar placement.
 * Shows best band, mode, and score.
 */

import { useMemo } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getRecommendations,
  getStatusColorClass,
} from "@/lib/utils/recommendations";
import type { PropagationRecommendations } from "@/types/recommendations";

interface RecommendationsBadgeProps {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  displayTime: Date;
  className?: string;
}

// Mode colors for visual distinction
const MODE_COLORS: Record<string, string> = {
  FT8: "text-cyan-400",
  CW: "text-yellow-400",
  SSB: "text-green-400",
  RTTY: "text-purple-400",
};

export function RecommendationsBadge({
  homeLat,
  homeLon,
  targetLat,
  targetLon,
  displayTime,
  className = "",
}: RecommendationsBadgeProps) {
  // Fetch solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return 3;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return 100;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Generate recommendations using FT8 as default (most popular weak-signal mode)
  const recommendations = useMemo<PropagationRecommendations | null>(() => {
    return getRecommendations(
      homeLat,
      homeLon,
      targetLat,
      targetLon,
      currentKp,
      currentSfi,
      displayTime,
      "FT8",
    );
  }, [
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    currentKp,
    currentSfi,
    displayTime,
  ]);

  const optimal = recommendations?.optimal ?? null;
  const mode = recommendations?.mode ?? null;

  return (
    <div className={`${className} h-full flex items-center gap-3`}>
        {optimal && mode ? (
          <>
            {/* Best badge */}
            <div className="flex-shrink-0">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">
                Best
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-lg font-bold font-mono ${getStatusColorClass(optimal.status)}`}
                >
                  {optimal.band}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    MODE_COLORS[mode] || "text-white"
                  }`}
                >
                  {mode}
                </span>
              </div>
            </div>

            {/* Score indicator */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {/* Score bar */}
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      optimal.score >= 80
                        ? "bg-signal-green"
                        : optimal.score >= 60
                          ? "bg-good"
                          : optimal.score >= 40
                            ? "bg-caution-amber"
                            : "bg-alert-red"
                    }`}
                    style={{ width: `${optimal.score}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-400">
                  {optimal.score}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span
                  className={`text-[10px] capitalize ${getStatusColorClass(optimal.status)}`}
                >
                  {optimal.status}
                </span>
                <span className="text-[10px] text-gray-500">
                  {optimal.snr > 0 ? "+" : ""}
                  {optimal.snr} dB
                </span>
              </div>
            </div>

            {/* S-Unit */}
            <div className="flex-shrink-0 text-center">
              <div className="text-[10px] text-gray-400">Signal</div>
              <div className="text-xs font-mono text-white">{optimal.sUnit}</div>
            </div>
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 leading-snug">
              Select a target to see the best band right now.
            </div>
          </div>
        )}
      </div>
  );
}

export default RecommendationsBadge;
