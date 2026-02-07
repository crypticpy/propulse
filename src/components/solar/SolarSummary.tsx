import React from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { getOverallCondition } from "@/lib/utils/bands";
import {
  getDetailedSummary,
  getBestBands,
  conditionToBadgeStatus,
} from "@/lib/utils/propagationSummary";

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
