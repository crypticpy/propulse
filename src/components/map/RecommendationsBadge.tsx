/**
 * RecommendationsBadge Component
 *
 * Compact recommendation summary for top bar placement.
 * Shows best band, mode, and score.
 */

import { useMemo } from "react";
import { useForecastStationParams } from "@/hooks/useActiveStationGain";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getRecommendations,
  getStatusColorClass,
} from "@/lib/utils/recommendations";
import type { PropagationRecommendations } from "@/types/recommendations";
import { MODE_COLORS_TAILWIND } from "@/lib/utils/spotColors";

interface RecommendationsBadgeProps {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  displayTime: Date;
  className?: string;
}

export function RecommendationsBadge({
  homeLat,
  homeLon,
  targetLat,
  targetLon,
  displayTime,
  className = "",
}: RecommendationsBadgeProps) {
  const station = useForecastStationParams(
    homeLat,
    homeLon,
    targetLat,
    targetLon,
  );
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
      undefined,
      0,
      undefined,
      station,
    );
  }, [
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    currentKp,
    currentSfi,
    displayTime,
    station,
  ]);

  const optimal = recommendations?.optimal ?? null;
  const mode = recommendations?.mode ?? null;

  return (
    <div className={`${className} h-full flex items-center gap-3`}>
      {optimal && mode ? (
        <>
          {/* Best badge */}
          <div className="flex-shrink-0">
            <div className="text-xs text-su-muted uppercase tracking-wide">
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
                  MODE_COLORS_TAILWIND[mode] || "text-su-text"
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
              <div className="flex-1 h-1.5 bg-su-line/20 rounded-full overflow-hidden">
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
              <span className="text-xs font-mono text-su-muted">
                {optimal.score}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span
                className={`text-xs capitalize ${getStatusColorClass(optimal.status)}`}
              >
                {optimal.status}
              </span>
              <span className="text-xs text-su-muted">
                {optimal.snr > 0 ? "+" : ""}
                {optimal.snr} dB
              </span>
            </div>
          </div>

          {/* S-Unit */}
          <div className="flex-shrink-0 text-center">
            <div className="text-xs text-su-muted">Signal</div>
            <div className="text-xs font-mono text-su-text">{optimal.sUnit}</div>
          </div>
        </>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="text-xs text-su-muted leading-snug">
            Select a target to see the best band right now.
          </div>
        </div>
      )}
    </div>
  );
}

export default RecommendationsBadge;
