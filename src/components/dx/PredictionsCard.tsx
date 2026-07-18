/**
 * PredictionsCard Component
 *
 * Shows predicted band openings based on current solar data.
 * Uses calculateBandConditions from bands.ts with time-based logic
 * for day vs night predictions.
 *
 * Compact glass-morphism card with icon + text layout.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui";
import { useSolarFlux, useKIndex } from "@/hooks/useSolarData";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import {
  getRankedBandPredictions,
  isDaytime,
} from "@/lib/propagation/bandRanking";
import { getConditionColor } from "@/lib/utils/bands";

/**
 * Icon component for predictions/forecast
 */
function ForecastIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/**
 * Signal strength indicator icon
 */
function SignalIcon({
  className,
  strength,
  style,
}: {
  className?: string;
  strength: "high" | "medium" | "low";
  style?: React.CSSProperties;
}) {
  const bars = strength === "high" ? 4 : strength === "medium" ? 3 : 2;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
    >
      <rect
        x="2"
        y="16"
        width="4"
        height="6"
        rx="1"
        opacity={bars >= 1 ? 1 : 0.3}
      />
      <rect
        x="8"
        y="12"
        width="4"
        height="10"
        rx="1"
        opacity={bars >= 2 ? 1 : 0.3}
      />
      <rect
        x="14"
        y="8"
        width="4"
        height="14"
        rx="1"
        opacity={bars >= 3 ? 1 : 0.3}
      />
      <rect
        x="20"
        y="4"
        width="4"
        height="18"
        rx="1"
        opacity={bars >= 4 ? 1 : 0.3}
      />
    </svg>
  );
}

export interface PredictionsCardProps {
  /** Custom class name */
  className?: string;
  /** Maximum predictions to display */
  maxPredictions?: number;
  /** Click handler — makes the card interactive */
  onClick?: () => void;
}

/**
 * PredictionsCard Component
 *
 * Displays predicted band openings based on current solar conditions.
 * Shows top 2-3 bands with the best predicted conditions.
 *
 * @example
 * ```tsx
 * <PredictionsCard maxPredictions={3} />
 * // Shows: "20m - Strong opening"
 * //        "17m - Open for DX"
 * ```
 */
export function PredictionsCard({
  className = "",
  maxPredictions = 3,
  onClick,
}: PredictionsCardProps) {
  // Get current solar data
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();
  const { data: kIndexData, isLoading: kpLoading } = useKIndex();
  const stationCast = useStationCastContext();
  const isDay = isDaytime(stationCast.location?.lon);
  const predictionLimit = Math.max(1, maxPredictions);

  // Calculate current conditions
  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return null;
    }
    const latest = solarFluxData[solarFluxData.length - 1];
    return latest.flux;
  }, [solarFluxData]);

  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return null;
    }
    const latest = kIndexData[kIndexData.length - 1];
    return latest.kp_index;
  }, [kIndexData]);

  // Calculate band predictions
  const predictions = useMemo(() => {
    if (currentSfi === null || currentKp === null) {
      return [];
    }

    return getRankedBandPredictions(
      currentKp,
      currentSfi,
      isDay,
      predictionLimit,
    );
  }, [currentSfi, currentKp, isDay, predictionLimit]);

  const isLoading = sfiLoading || kpLoading;

  return (
    <Card
      className={`relative overflow-hidden ${onClick ? "cursor-pointer hover:border-white/30 hover:bg-white/[0.05] group" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {onClick && (
        <div className="absolute top-3 right-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg
            className="w-3.5 h-3.5"
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
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ForecastIcon className="w-4 h-4 text-signal-green" />
          <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
            Best Bands Now
          </span>
        </div>
        <span className="text-[10px] text-gray-300 px-1.5 py-0.5 rounded bg-white/5 flex items-center gap-1">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${isDay ? "bg-caution-amber" : "bg-cosmic-cyan"}`}
          />
          {isDay ? "Daytime" : "Nighttime"}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-signal-green/30 border-t-signal-green rounded-full animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="text-sm text-gray-400 py-2">
          <div className="flex items-center gap-2">
            <span className="text-alert-red">Solar data unavailable</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Current SFI and Kp are required for band estimates
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {predictions.map((prediction, index) => (
            <div
              key={prediction.band}
              className={`flex items-center justify-between py-1.5 ${
                index > 0 ? "border-t border-white/5" : ""
              }`}
            >
              {/* Band info */}
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: `${getConditionColor(prediction.condition)}20`,
                    color: getConditionColor(prediction.condition),
                  }}
                >
                  {prediction.band}
                </span>
                <span className="text-sm text-gray-300">
                  {prediction.description}
                </span>
              </div>

              {/* Signal strength indicator */}
              <div className="flex items-center gap-1">
                <SignalIcon
                  className="w-4 h-4"
                  strength={prediction.signalStrength}
                  style={{
                    color: getConditionColor(prediction.condition),
                  }}
                />
              </div>
            </div>
          ))}

          {/* Context footer */}
          <div className="pt-2 border-t border-white/10 mt-2">
            <div className="text-[10px] text-gray-500">
              {isDay
                ? "Higher bands favored during daylight"
                : "Lower bands favored at night"}
              {currentSfi !== null && currentKp !== null && (
                <span className="ml-1.5 text-gray-600">
                  SFI {currentSfi} / Kp {currentKp}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

PredictionsCard.displayName = "PredictionsCard";

export default PredictionsCard;
