import React, { useMemo } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { InfoTip } from "@/components/ui/Tooltip";
import { PROPAGATION_TOOLTIPS } from "@/constants/tooltips";
import { BandRow } from "./BandRow";
import { calculateBandConditions } from "@/lib/utils/bands";
import { useDXStore } from "@/stores/dxStore";

const NIGHT_ONLY_BANDS = new Set(["160m"]);

export interface BandConditionsProps {
  /** Current K-index value (0-9), null if unavailable */
  kIndex: number | null;
  /** Current Solar Flux Index, null if unavailable */
  solarFlux: number | null;
  /** Show loading state */
  loading?: boolean;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
}

/**
 * BandConditions Component
 *
 * Displays a table of HF band propagation conditions calculated
 * from current solar indices.
 *
 * @example
 * ```tsx
 * <BandConditions kIndex={3} solarFlux={150} />
 * ```
 */
export const BandConditions: React.FC<BandConditionsProps> = ({
  kIndex,
  solarFlux,
  loading = false,
  onExpand,
}) => {
  // Hooks must be called before any early returns (Rules of Hooks)
  const spots = useDXStore((state) => state.spots);
  const bandSpotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const thirtyMinAgo = Date.now() - 30 * 60_000;
    for (const spot of spots) {
      const spotMs =
        spot.time instanceof Date
          ? spot.time.getTime()
          : new Date(spot.time).getTime();
      if (spotMs >= thirtyMinAgo && spot.band) {
        counts[spot.band] = (counts[spot.band] || 0) + 1;
      }
    }
    return counts;
  }, [spots]);

  if (kIndex === null || solarFlux === null) {
    return (
      <Card className="h-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-sans text-lg font-semibold text-white tracking-wide flex items-center gap-2">
            HF BAND CONDITIONS
            <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
          </h2>
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 text-gray-500 hover:text-white transition-colors"
              aria-label="Expand band conditions"
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
        <div className="text-center py-8 text-gray-500 text-sm">
          Solar data unavailable — cannot calculate band conditions.
        </div>
      </Card>
    );
  }

  const bands = calculateBandConditions(kIndex, solarFlux);

  const nightOnlyBands = NIGHT_ONLY_BANDS;

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide flex items-center gap-2">
          HF BAND CONDITIONS
          <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
        </h2>
        <div className="flex items-center gap-2">
          {loading && <LoadingSpinner size="sm" />}
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 text-gray-500 hover:text-white transition-colors"
              aria-label="Expand band conditions"
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

      {/* Table */}
      <div className="space-y-0" role="table" aria-label="HF Band Conditions">
        {/* Column Headers */}
        <div
          className="grid grid-cols-[50px_1fr_1fr_1fr] md:grid-cols-[60px_80px_90px_90px_1fr] lg:grid-cols-[60px_80px_90px_90px_70px_1fr] gap-3 md:gap-4 pb-2 px-2 border-b border-white/10"
          role="row"
        >
          <div
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider"
            role="columnheader"
          >
            Band
          </div>
          <div
            className="hidden md:block text-xs font-semibold text-gray-400 uppercase tracking-wider"
            role="columnheader"
          >
            Freq
          </div>
          <div
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center"
            role="columnheader"
          >
            Day
          </div>
          <div
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center"
            role="columnheader"
          >
            Night
          </div>
          <div
            className="hidden lg:block text-xs font-semibold text-gray-400 uppercase tracking-wider text-center"
            role="columnheader"
          >
            Spots
          </div>
          <div
            className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right md:text-left md:pl-1"
            role="columnheader"
          >
            Best For
          </div>
        </div>

        {/* Band Rows */}
        <div className="divide-y divide-white/5">
          {bands.map((band) => (
            <BandRow
              key={band.name}
              name={band.name}
              freq={band.freq}
              dayCondition={band.dayCondition}
              nightCondition={band.nightCondition}
              bestFor={band.bestFor}
              isNightOnly={nightOnlyBands.has(band.name)}
              spotCount={bandSpotCounts[band.name]}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-signal-green"></span>
            <span>Excellent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-good"></span>
            <span>Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-caution-amber"></span>
            <span>Fair</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-alert-red"></span>
            <span>Poor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">🌙</span>
            <span>Night only</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

BandConditions.displayName = "BandConditions";

export default BandConditions;
