import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  getOverallCondition,
  calculateBandConditions,
} from "@/lib/utils/bands";
import type { BandCondition } from "@/types/solar";

export interface SolarSummaryProps {
  /** Current K-index value (0-9), null if unavailable */
  kIndex: number | null;
  /** Solar Flux Index (typically 70-300 sfu), null if unavailable */
  solarFlux: number | null;
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/**
 * Map condition to badge status
 */
function conditionToBadgeStatus(condition: BandCondition): BadgeStatus {
  switch (condition) {
    case "Excellent":
      return "excellent";
    case "Good":
      return "good";
    case "Fair":
      return "fair";
    case "Poor":
      return "poor";
    default:
      return "fair";
  }
}

/**
 * Generate detailed plain-language summary based on conditions
 */
function getDetailedSummary(kIndex: number, solarFlux: number): string {
  const parts: string[] = [];

  // Solar activity level
  if (solarFlux >= 150) {
    parts.push(
      "The sun is very active today with excellent HF propagation expected.",
    );
  } else if (solarFlux >= 100) {
    parts.push(
      "Solar activity is moderate with good propagation on most HF bands.",
    );
  } else if (solarFlux >= 80) {
    parts.push(
      "Solar activity is low. Focus on lower frequency bands for best results.",
    );
  } else {
    parts.push(
      "Solar activity is very low. HF propagation may be challenging.",
    );
  }

  // Band recommendations based on SFI and time
  if (solarFlux >= 120) {
    parts.push("Higher bands (15m-10m) should be open during daylight hours.");
  } else if (solarFlux >= 90) {
    parts.push("Mid-range bands (17m-20m) are your best bet for DX.");
  } else {
    parts.push("Lower bands (30m-40m) will provide the most reliable paths.");
  }

  // Geomagnetic warnings
  if (kIndex >= 5) {
    parts.push(
      "Warning: A geomagnetic storm is in progress. Expect signal degradation and polar path disruption.",
    );
  } else if (kIndex >= 4) {
    parts.push("Note: Elevated geomagnetic activity may affect polar paths.");
  } else if (kIndex <= 1) {
    parts.push("Geomagnetic conditions are very quiet - ideal for DX.");
  }

  return parts.join(" ");
}

/**
 * Get best bands based on current conditions
 */
function getBestBands(kIndex: number, solarFlux: number): string[] {
  const bands = calculateBandConditions(kIndex, solarFlux);
  const now = new Date();
  const hour = now.getHours();
  const isDaytime = hour >= 6 && hour < 18;

  // Filter bands with Good or Excellent conditions for current time
  const goodBands = bands.filter((band) => {
    const condition = isDaytime ? band.dayCondition : band.nightCondition;
    return condition === "Excellent" || condition === "Good";
  });

  // Return band names, prioritizing by frequency
  return goodBands.map((band) => band.name).slice(0, 4);
}

/**
 * SolarSummary Component
 *
 * Displays a plain-language summary of current solar/propagation conditions.
 * Shows overall condition rating, detailed summary text, and recommended bands.
 *
 * @example
 * ```tsx
 * <SolarSummary kIndex={2} solarFlux={145} />
 * ```
 */
export const SolarSummary: React.FC<SolarSummaryProps> = ({
  kIndex,
  solarFlux,
  loading = false,
  onExpand,
}) => {
  if (loading) {
    return (
      <Card animate className="min-h-[180px]">
        <div className="flex items-center justify-center h-full min-h-[140px]">
          <LoadingSpinner size="md" text="Analyzing conditions..." />
        </div>
      </Card>
    );
  }

  if (kIndex === null || solarFlux === null) {
    return (
      <Card animate>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              Propagation Summary
            </h2>
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-1 text-gray-500 hover:text-white transition-colors"
                aria-label="Expand summary"
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
          <p className="text-base font-sans text-gray-400 leading-relaxed">
            Solar data unavailable — cannot generate propagation summary.
          </p>
        </div>
      </Card>
    );
  }

  const overall = getOverallCondition(kIndex, solarFlux);
  const detailedSummary = getDetailedSummary(kIndex, solarFlux);
  const bestBands = getBestBands(kIndex, solarFlux);
  const badgeStatus = conditionToBadgeStatus(overall.hf);

  return (
    <Card animate>
      <div className="flex flex-col gap-4">
        {/* Header with title and condition badge */}
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
            Propagation Summary
          </h2>
          <div className="flex items-center gap-2">
            <Badge status={badgeStatus}>{overall.hf.toUpperCase()}</Badge>
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-1 text-gray-500 hover:text-white transition-colors"
                aria-label="Expand summary"
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

        {/* Summary text */}
        <p className="text-base font-sans text-gray-200 leading-relaxed">
          {detailedSummary}
        </p>

        {/* Best bands section */}
        {bestBands.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">
              Best bands now
            </span>
            <div className="flex flex-wrap gap-2">
              {bestBands.map((band) => (
                <span
                  key={band}
                  className="px-3 py-1 text-sm font-mono text-signal-green bg-signal-green/10 border border-signal-green/20 rounded-lg"
                >
                  {band}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* VHF note if aurora possible */}
        {overall.vhf === "Aurora" && (
          <div className="mt-2 px-3 py-2 bg-aurora-purple/10 border border-aurora-purple/20 rounded-lg">
            <span className="text-sm font-sans text-aurora-purple">
              Aurora propagation possible on 6m - check for flutter signals!
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};

SolarSummary.displayName = "SolarSummary";

export default SolarSummary;
