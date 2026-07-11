/**
 * WAS Progress Component
 *
 * Displays progress toward the WAS (Worked All States) award.
 * Shows worked/confirmed count, progress bar, and visual state grid.
 */

import { useState } from "react";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { US_STATES } from "../../lib/data/states";
import type { WASProgress as WASProgressData } from "../../hooks/useAwards";

export interface WASProgressProps {
  /** WAS progress data from useAwards hook */
  progress: WASProgressData;
  /** Loading state */
  isLoading?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * WAS Progress Component
 * Shows US states worked with a visual grid display
 */
export function WASProgress({
  progress,
  isLoading = false,
  className = "",
}: WASProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const workedPercent = (progress.worked / progress.total) * 100;
  const confirmedPercent = (progress.confirmed / progress.total) * 100;

  // Group states by call area for display
  const statesByArea: Record<number, typeof US_STATES> = {};
  for (const state of US_STATES) {
    if (!statesByArea[state.callArea]) {
      statesByArea[state.callArea] = [];
    }
    statesByArea[state.callArea].push(state);
  }

  if (isLoading) {
    return (
      <Card className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4" />
          <div className="h-4 bg-gray-700 rounded w-full mb-2" />
          <div className="h-2 bg-gray-700 rounded w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white">WAS</span>
          <span className="text-sm text-gray-400">(Worked All States)</span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-white transition-colors text-sm"
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          {isExpanded ? "Show Less" : "Show More"}
        </button>
      </div>

      {/* Main Stats */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-signal-green">
          {progress.worked}
        </span>
        <span className="text-gray-400">/</span>
        <span className="text-xl text-gray-300">{progress.total}</span>
        <span className="text-sm text-gray-500 ml-2">states worked</span>
      </div>

      {/* Confirmed count */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <svg
          className="w-4 h-4 text-signal-green"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-gray-400">
          {progress.confirmed} confirmed ({confirmedPercent.toFixed(0)}%)
        </span>
      </div>

      {/* Progress Bar */}
      <ProgressBar
        value={workedPercent}
        color="green"
        showValue
        label="Progress"
        className="mb-4"
      />

      {/* State Grid (compact view - just show worked count by call area) */}
      <div className="grid grid-cols-5 gap-1 text-center text-xs">
        {Object.entries(statesByArea)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([area, states]) => {
            const workedInArea = states.filter(
              (s) => progress.stateStatus[s.code]?.worked,
            ).length;
            return (
              <div key={area} className="bg-white/5 rounded p-1">
                <div className="text-gray-500">Area {area}</div>
                <div className="text-white font-medium">
                  {workedInArea}/{states.length}
                </div>
              </div>
            );
          })}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
          {/* Visual State Grid */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              All States
            </h4>
            <div className="grid grid-cols-10 gap-1">
              {US_STATES.map((state) => {
                const status = progress.stateStatus[state.code];
                const isWorked = status?.worked;
                const isConfirmed = status?.confirmed;

                return (
                  <div
                    key={state.code}
                    className={`
                      relative text-center rounded p-1 text-xs font-mono
                      ${
                        isConfirmed
                          ? "bg-signal-green/30 text-signal-green border border-signal-green/50"
                          : isWorked
                            ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                            : "bg-white/5 text-gray-500 border border-white/10"
                      }
                    `}
                    title={`${state.name}${isConfirmed ? " (Confirmed)" : isWorked ? " (Worked)" : " (Needed)"}`}
                  >
                    {state.code}
                    {isConfirmed && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-signal-green rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-signal-green/30 border border-signal-green/50" />
              <span className="text-gray-400">Confirmed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cosmic-cyan/20 border border-cosmic-cyan/30" />
              <span className="text-gray-400">Worked</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
              <span className="text-gray-400">Needed</span>
            </div>
          </div>

          {/* Needed States List */}
          {progress.needed.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                States Needed ({progress.needed.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {progress.needed.map((code) => {
                  const state = US_STATES.find((s) => s.code === code);
                  return (
                    <span
                      key={code}
                      className="px-2 py-1 bg-white/5 rounded text-xs text-gray-400"
                      title={state?.name}
                    >
                      {code}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default WASProgress;
