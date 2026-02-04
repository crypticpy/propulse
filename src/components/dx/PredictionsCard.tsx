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
import { calculateBandConditions, getConditionColor } from "@/lib/utils/bands";
import type { BandStatus, BandCondition, VHFCondition } from "@/types/solar";

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

/**
 * Band prediction with opening status
 */
interface BandPrediction {
  band: string;
  freq: string;
  condition: BandCondition | VHFCondition;
  isOpening: boolean;
  description: string;
  signalStrength: "high" | "medium" | "low";
}

/**
 * Determine if it's currently daytime (UTC based, simplified)
 */
function isDaytime(): boolean {
  const hour = new Date().getUTCHours();
  // Rough approximation: 6-18 UTC is "daytime" for most paths
  return hour >= 6 && hour < 18;
}

/**
 * Get signal strength from condition
 */
function getSignalStrength(
  condition: BandCondition | VHFCondition,
): "high" | "medium" | "low" {
  if (condition === "Excellent" || condition === "Aurora") {
    return "high";
  }
  if (condition === "Good") {
    return "medium";
  }
  return "low";
}

/**
 * Get description for band opening
 */
function getOpeningDescription(
  band: string,
  condition: BandCondition | VHFCondition,
  isDay: boolean,
): string {
  const bandNum = parseInt(band);

  if (condition === "Aurora") {
    return "Aurora possible";
  }

  if (condition === "Excellent") {
    return isDay ? "Strong opening" : "Excellent conditions";
  }

  if (condition === "Good") {
    if (bandNum <= 30) {
      return isDay ? "Good DX" : "Good night path";
    }
    return "Open for DX";
  }

  if (condition === "Fair") {
    return "Marginal opening";
  }

  return "Weak signals";
}

export interface PredictionsCardProps {
  /** Custom class name */
  className?: string;
  /** Maximum predictions to display */
  maxPredictions?: number;
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
}: PredictionsCardProps) {
  // Get current solar data
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();
  const { data: kIndexData, isLoading: kpLoading } = useKIndex();

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

    const isDay = isDaytime();
    const bandConditions = calculateBandConditions(currentKp, currentSfi);

    // Map to predictions with current time period
    const allPredictions: BandPrediction[] = bandConditions.map(
      (band: BandStatus) => {
        const condition = isDay ? band.dayCondition : band.nightCondition;
        const isOpening =
          condition === "Excellent" ||
          condition === "Good" ||
          condition === "Aurora";

        return {
          band: band.name,
          freq: band.freq,
          condition,
          isOpening,
          description: getOpeningDescription(band.name, condition, isDay),
          signalStrength: getSignalStrength(condition),
        };
      },
    );

    // Filter to only opening bands and sort by condition quality
    const openingBands = allPredictions.filter((p) => p.isOpening);

    // Sort by condition (Excellent/Aurora > Good)
    openingBands.sort((a, b) => {
      const order: Record<string, number> = {
        Excellent: 0,
        Aurora: 1,
        Good: 2,
        Fair: 3,
        Poor: 4,
      };
      return (order[a.condition] ?? 5) - (order[b.condition] ?? 5);
    });

    return openingBands.slice(0, maxPredictions);
  }, [currentSfi, currentKp, maxPredictions]);

  const isLoading = sfiLoading || kpLoading;
  const isDay = isDaytime();

  return (
    <Card className={`relative overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ForecastIcon className="w-4 h-4 text-signal-green" />
          <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
            Band Openings
          </span>
        </div>
        <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-white/5">
          {isDay ? "Day" : "Night"}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-signal-green/30 border-t-signal-green rounded-full animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="text-sm text-gray-500 py-2">
          <div className="flex items-center gap-2">
            <span className="text-alert-red">No openings predicted</span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {currentKp !== null && currentKp >= 5
              ? "High geomagnetic activity"
              : "Conditions unfavorable"}
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

          {/* Time hint */}
          <div className="pt-2 border-t border-white/10 mt-2">
            <div className="text-xs text-gray-500">
              {isDay
                ? "Higher bands favored during daylight"
                : "Lower bands favored at night"}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

PredictionsCard.displayName = "PredictionsCard";

export default PredictionsCard;
