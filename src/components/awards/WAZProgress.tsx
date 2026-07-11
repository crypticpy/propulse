/**
 * WAZ Progress Component
 *
 * Displays progress toward the WAZ (Worked All Zones) award.
 * Shows worked/confirmed count, progress bar, and visual zone grid.
 */

import { useState } from "react";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { CQ_ZONES } from "../../lib/data/zones";
import type { WAZProgress as WAZProgressData } from "../../hooks/useAwards";

export interface WAZProgressProps {
  /** WAZ progress data from useAwards hook */
  progress: WAZProgressData;
  /** Loading state */
  isLoading?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * WAZ Progress Component
 * Shows CQ zones worked with a visual grid display
 */
export function WAZProgress({
  progress,
  isLoading = false,
  className = "",
}: WAZProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const workedPercent = (progress.worked / progress.total) * 100;
  const confirmedPercent = (progress.confirmed / progress.total) * 100;

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
          <span className="text-xl font-bold text-white">WAZ</span>
          <span className="text-sm text-gray-400">(Worked All Zones)</span>
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
        <span className="text-sm text-gray-500 ml-2">zones worked</span>
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

      {/* Zone Grid (compact 8x5 grid) */}
      <div className="grid grid-cols-8 gap-1">
        {CQ_ZONES.map((zone) => {
          const status = progress.zoneStatus[zone.zone];
          const isWorked = status?.worked;
          const isConfirmed = status?.confirmed;

          return (
            <div
              key={zone.zone}
              className={`
                relative text-center rounded py-1 text-xs font-mono
                ${
                  isConfirmed
                    ? "bg-signal-green/30 text-signal-green"
                    : isWorked
                      ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                      : "bg-white/5 text-gray-500"
                }
              `}
              title={zone.description}
            >
              {zone.zone}
            </div>
          );
        })}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-signal-green/30" />
              <span className="text-gray-400">Confirmed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cosmic-cyan/20" />
              <span className="text-gray-400">Worked</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-white/5" />
              <span className="text-gray-400">Needed</span>
            </div>
          </div>

          {/* Zone Details */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              Zone Details
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
              {CQ_ZONES.map((zone) => {
                const status = progress.zoneStatus[zone.zone];
                const isWorked = status?.worked;
                const isConfirmed = status?.confirmed;

                return (
                  <div
                    key={zone.zone}
                    className={`
                      flex items-center gap-2 px-2 py-1 rounded text-xs
                      ${
                        isConfirmed
                          ? "bg-signal-green/10 border-l-2 border-signal-green"
                          : isWorked
                            ? "bg-cosmic-cyan/10 border-l-2 border-cosmic-cyan"
                            : "bg-white/5 border-l-2 border-gray-600"
                      }
                    `}
                  >
                    <span
                      className={`
                        font-mono w-6 text-center
                        ${isConfirmed ? "text-signal-green" : isWorked ? "text-cosmic-cyan" : "text-gray-500"}
                      `}
                    >
                      {zone.zone}
                    </span>
                    <span
                      className={isWorked ? "text-gray-300" : "text-gray-500"}
                    >
                      {zone.description}
                    </span>
                    {isConfirmed && (
                      <svg
                        className="w-3 h-3 text-signal-green ml-auto flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Needed Zones List */}
          {progress.needed.length > 0 && (
            <div className="bg-white/5 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                Zones Needed ({progress.needed.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {progress.needed.map((zoneNum) => {
                  const zone = CQ_ZONES.find((z) => z.zone === zoneNum);
                  return (
                    <span
                      key={zoneNum}
                      className="px-2 py-1 bg-plasma-orange/20 border border-plasma-orange/30 rounded text-xs text-plasma-orange font-mono"
                      title={zone?.description}
                    >
                      {zoneNum}
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

export default WAZProgress;
