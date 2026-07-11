/**
 * DXCC Progress Component
 *
 * Displays progress toward the DXCC (DX Century Club) award.
 * Shows worked/confirmed count, progress bar, and continent breakdown.
 */

import { useState } from "react";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import type { DXCCProgress as DXCCProgressData } from "../../hooks/useAwards";

export interface DXCCProgressProps {
  /** DXCC progress data from useAwards hook */
  progress: DXCCProgressData;
  /** Loading state */
  isLoading?: boolean;
  /** Optional className for styling */
  className?: string;
}

/** Continent display names */
const CONTINENT_NAMES: Record<string, string> = {
  NA: "North America",
  SA: "South America",
  EU: "Europe",
  AF: "Africa",
  AS: "Asia",
  OC: "Oceania",
  AN: "Antarctica",
};

/** Continent abbreviations for compact display */
const CONTINENT_SHORT: Record<string, string> = {
  NA: "NA",
  SA: "SA",
  EU: "EU",
  AF: "AF",
  AS: "AS",
  OC: "OC",
  AN: "AN",
};

/**
 * DXCC Progress Component
 * Shows overall DXCC progress with continent breakdown
 */
export function DXCCProgress({
  progress,
  isLoading = false,
  className = "",
}: DXCCProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const workedPercent =
    progress.total > 0 ? (progress.worked / progress.total) * 100 : 0;
  const confirmedPercent =
    progress.total > 0 ? (progress.confirmed / progress.total) * 100 : 0;

  // Sort continents by worked count descending
  const continentEntries = Object.entries(progress.byContinent).sort(
    (a, b) => b[1].worked - a[1].worked,
  );

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
          <span className="text-xl font-bold text-white">DXCC</span>
          <span className="text-sm text-gray-400">(DX Century Club)</span>
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
        <span className="text-sm text-gray-500 ml-2">entities worked</span>
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

      {/* Continent Breakdown (always visible) */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {continentEntries.slice(0, 4).map(([code, data]) => (
          <div key={code} className="bg-white/5 rounded-lg p-2">
            <div className="text-xs text-gray-500">{CONTINENT_SHORT[code]}</div>
            <div className="text-sm font-medium text-white">
              {data.worked}
              <span className="text-gray-500">/{data.total}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-6 space-y-4 border-t border-white/10 pt-4">
          {/* Full Continent Breakdown */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">
              By Continent
            </h4>
            <div className="space-y-2">
              {continentEntries.map(([code, data]) => {
                const percent =
                  data.total > 0 ? (data.worked / data.total) * 100 : 0;
                return (
                  <div key={code} className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 w-24 truncate">
                      {CONTINENT_NAMES[code]}
                    </span>
                    <div className="flex-1">
                      <ProgressBar value={percent} color="cyan" />
                    </div>
                    <span className="text-sm text-gray-300 w-16 text-right">
                      {data.worked}/{data.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent New Entities */}
          {progress.recentNew.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-3">
                Recently Worked New Entities
              </h4>
              <div className="space-y-2">
                {progress.recentNew.slice(0, 5).map((item, index) => (
                  <div
                    key={`${item.entity.id}-${index}`}
                    className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-plasma-orange font-mono text-sm">
                        {item.callsign}
                      </span>
                      <span className="text-white text-sm">
                        {item.entity.name}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Needed Entities (just count) */}
          <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
            <span className="text-gray-400 text-sm">Entities still needed</span>
            <span className="text-plasma-orange font-bold">
              {progress.needed.length}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default DXCCProgress;
