/**
 * RecommendationsPanel Component
 *
 * Compact card displaying intelligent band recommendations with:
 * - Optimal band prominently displayed with status coloring
 * - Mode selector (SSB/CW/FT8/RTTY pill buttons)
 * - Alternative bands list
 * - Time window countdown or "Now" indicator
 * - Collapsible detail section with time windows
 */

import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  getRecommendations,
  formatTimeUntil,
  getStatusColorClass,
  getStatusBgColorClass,
} from "@/lib/utils/recommendations";
import type {
  OperatingMode,
  PropagationRecommendations,
  BandRecommendation,
  TimeWindow,
} from "@/types/recommendations";

interface RecommendationsPanelProps {
  homeLat: number;
  homeLon: number;
  targetLat: number;
  targetLon: number;
  displayTime: Date;
  className?: string;
}

/**
 * Mode button options
 */
const MODES: OperatingMode[] = ["SSB", "CW", "FT8", "RTTY"];

/**
 * Format UTC hour for display
 */
function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}z`;
}

export function RecommendationsPanel({
  homeLat,
  homeLon,
  targetLat,
  targetLon,
  displayTime,
  className = "",
}: RecommendationsPanelProps) {
  const [selectedMode, setSelectedMode] = useState<OperatingMode>("FT8");
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Fetch current solar data
  const { data: kIndexData, isLoading: kLoading } = useKIndex();
  const { data: solarFluxData, isLoading: sfiLoading } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Generate recommendations
  const recommendations = useMemo<PropagationRecommendations | null>(() => {
    if (
      homeLat === undefined ||
      homeLon === undefined ||
      targetLat === undefined ||
      targetLon === undefined
    ) {
      return null;
    }
    return getRecommendations(
      homeLat,
      homeLon,
      targetLat,
      targetLon,
      currentKp,
      currentSfi,
      displayTime,
      selectedMode,
    );
  }, [
    homeLat,
    homeLon,
    targetLat,
    targetLon,
    currentKp,
    currentSfi,
    displayTime,
    selectedMode,
  ]);

  // Find the next best window if not currently optimal
  const nextBestWindow = useMemo(() => {
    if (!recommendations) return null;
    const activeWindow = recommendations.timeWindows.find(
      (w) => w.hoursUntilStart === -1,
    );
    if (activeWindow && activeWindow.peakStatus === "excellent") {
      return null; // Already in the best window
    }
    return recommendations.timeWindows.find(
      (w) =>
        w.hoursUntilStart > 0 &&
        (w.peakStatus === "excellent" || w.peakStatus === "good"),
    );
  }, [recommendations]);

  // Handle mode selection
  const handleModeChange = useCallback((mode: OperatingMode) => {
    setSelectedMode(mode);
  }, []);

  // Loading state
  if (kLoading || sfiLoading) {
    return (
      <Card className={`${className} p-2 !rounded-lg`}>
        <div className="text-center py-6 text-gray-500">
          <div className="animate-pulse">Analyzing propagation...</div>
        </div>
      </Card>
    );
  }

  // No recommendations available
  if (!recommendations) {
    return (
      <Card className={`${className} p-2 !rounded-lg`}>
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm">Select a target for recommendations</p>
        </div>
      </Card>
    );
  }

  const { optimal, alternatives, timeWindows, summary } = recommendations;
  const isOptimalClosed = optimal.status === "closed";

  return (
    <Card className={`${className} p-2 !rounded-lg`}>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
              Recommendations
            </h3>
            <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
              Kp={currentKp}
            </span>
            <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
              SFI={currentSfi}
            </span>
          </div>
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>

        {/* Mode Selector - Pill Buttons */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
          {MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`
                flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all
                ${
                  selectedMode === mode
                    ? "bg-plasma-orange text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }
              `}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Optimal Band - Prominent Display */}
        <div className="text-center py-3">
          {isOptimalClosed ? (
            <div className="space-y-2">
              <div className="text-2xl font-mono text-gray-500">
                No Bands Open
              </div>
              <p className="text-xs text-gray-500">
                Try FT8 mode for better sensitivity
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div
                className={`text-4xl font-bold font-mono ${getStatusColorClass(optimal.status)}`}
              >
                {optimal.band}
              </div>
              <div className="flex items-center justify-center gap-2">
                <span
                  className={`
                    px-2 py-0.5 rounded-full text-xs font-medium
                    ${getStatusColorClass(optimal.status)}
                    ${getStatusBgColorClass(optimal.status)}
                  `}
                >
                  {optimal.status.charAt(0).toUpperCase() +
                    optimal.status.slice(1)}
                </span>
                <span className="text-sm text-gray-400 font-mono">
                  {optimal.snr} dB / {optimal.sUnit}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Score: {optimal.score}/100
              </div>
            </div>
          )}
        </div>

        {/* Time Until / Now Indicator */}
        {!isOptimalClosed && (
          <div className="flex items-center justify-center">
            {nextBestWindow ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full">
                <span className="text-xs text-gray-400">Better on</span>
                <span className="text-xs font-medium text-plasma-orange">
                  {nextBestWindow.band}
                </span>
                <span className="text-xs text-gray-400">
                  {formatTimeUntil(nextBestWindow.hoursUntilStart)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-signal-green/10 rounded-full">
                <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
                <span className="text-xs font-medium text-signal-green">
                  Optimal window now
                </span>
              </div>
            )}
          </div>
        )}

        {/* Alternative Bands */}
        {alternatives.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              Alternatives
            </div>
            <div className="flex gap-2">
              {alternatives.slice(0, 3).map((alt) => (
                <AlternativeBandPill key={alt.band} recommendation={alt} />
              ))}
            </div>
          </div>
        )}

        {/* Expandable Details */}
        <div className="border-t border-white/5 pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white transition-colors"
          >
            <span>Time Windows</span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-2">
              {timeWindows.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">
                  No favorable windows in next 24h
                </p>
              ) : (
                timeWindows
                  .slice(0, 5)
                  .map((window) => (
                    <TimeWindowRow
                      key={`${window.band}-${window.startHour}`}
                      window={window}
                    />
                  ))
              )}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="text-xs text-gray-500 leading-relaxed">{summary}</div>
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.recommendations?.title || "Band Recommendations"}
        sections={
          HELP_CONTENT.recommendations?.sections || [
            {
              title: "Overview",
              content:
                "Optimal band recommendations based on current conditions.",
            },
          ]
        }
      />
    </Card>
  );
}

/**
 * Alternative band pill component
 */
function AlternativeBandPill({
  recommendation,
}: {
  recommendation: BandRecommendation;
}) {
  return (
    <div
      className={`
        flex-1 px-2 py-1.5 rounded-lg border transition-colors
        ${getStatusBgColorClass(recommendation.status)}
        border-white/10 hover:border-white/20
      `}
      title={recommendation.reason}
    >
      <div className="text-center">
        <div
          className={`text-sm font-mono font-medium ${getStatusColorClass(recommendation.status)}`}
        >
          {recommendation.band}
        </div>
        <div className="text-[10px] text-gray-500">{recommendation.snr} dB</div>
      </div>
    </div>
  );
}

/**
 * Time window row component
 */
function TimeWindowRow({ window }: { window: TimeWindow }) {
  const isActive = window.hoursUntilStart === -1;

  return (
    <div
      className={`
        flex items-center justify-between px-3 py-2 rounded-lg
        ${isActive ? "bg-signal-green/10 border border-signal-green/20" : "bg-white/5"}
      `}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-white">{window.band}</span>
        <span className="text-xs text-gray-500">
          {formatHour(window.startHour)} - {formatHour(window.endHour)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          Peak: {formatHour(window.peakHour)}
        </span>
        {isActive ? (
          <span className="px-2 py-0.5 text-[10px] font-medium text-signal-green bg-signal-green/20 rounded-full">
            NOW
          </span>
        ) : (
          <span className="text-xs text-gray-500">
            {formatTimeUntil(window.hoursUntilStart)}
          </span>
        )}
      </div>
    </div>
  );
}

export default RecommendationsPanel;
