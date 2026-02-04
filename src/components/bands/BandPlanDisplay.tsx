/**
 * BandPlanDisplay Component
 *
 * Visual band plan component showing frequency allocations
 * Color-coded by mode and license class permissions
 */

import React, { useMemo, useCallback } from "react";
import type { ITURegion, LicenseClass, BandSegment } from "@/types/bandplan";
import { getBandPlan } from "@/lib/data/bandplans";
import {
  getSegmentCategory,
  formatModeList,
  isSpecialFrequency,
  type SegmentCategory,
} from "@/lib/utils/regulatory";
import { useUserStore } from "@/stores/userStore";
import { Tooltip } from "@/components/ui/Tooltip";

// =============================================================================
// Types
// =============================================================================

export interface BandPlanDisplayProps {
  /** Band designator (e.g., '20m', '40m') */
  band: string;
  /** ITU region - defaults to user preference */
  region?: ITURegion;
  /** License class - defaults to user preference */
  licenseClass?: LicenseClass;
  /** Frequency in kHz to highlight with vertical indicator */
  highlightFrequency?: number;
  /** Callback when user clicks on a segment */
  onFrequencySelect?: (frequencyKHz: number) => void;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface SegmentDisplayInfo {
  segment: BandSegment;
  category: SegmentCategory;
  isAllowed: boolean;
  widthPercent: number;
  leftPercent: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Color mapping for segment categories
 */
const SEGMENT_COLORS: Record<SegmentCategory, { bg: string; border: string }> =
  {
    cw_only: {
      bg: "bg-blue-500/60",
      border: "border-blue-400/80",
    },
    cw_data: {
      bg: "bg-cyan-500/60",
      border: "border-cyan-400/80",
    },
    phone: {
      bg: "bg-green-500/60",
      border: "border-green-400/80",
    },
    all_modes: {
      bg: "bg-yellow-500/60",
      border: "border-yellow-400/80",
    },
    fm: {
      bg: "bg-purple-500/60",
      border: "border-purple-400/80",
    },
    not_allowed: {
      bg: "bg-gray-600/40",
      border: "border-gray-500/50",
    },
  };

/**
 * Legend labels for segment categories
 */
const CATEGORY_LABELS: Record<SegmentCategory, string> = {
  cw_only: "CW Only",
  cw_data: "CW + Digital",
  phone: "Phone",
  all_modes: "All Modes",
  fm: "FM",
  not_allowed: "Not Authorized",
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format frequency for display
 */
function formatFrequency(kHz: number): string {
  if (kHz >= 1000) {
    const mhz = kHz / 1000;
    return mhz >= 100 ? `${mhz.toFixed(1)}` : `${mhz.toFixed(3)}`;
  }
  return `${kHz}`;
}

// =============================================================================
// Component
// =============================================================================

export function BandPlanDisplay({
  band,
  region,
  licenseClass,
  highlightFrequency,
  onFrequencySelect,
  compact = false,
  className = "",
}: BandPlanDisplayProps): React.ReactElement | null {
  // Get user preferences for defaults
  const userPrefs = useUserStore((state) => state.preferences);
  const effectiveRegion = region ?? userPrefs.ituRegion ?? "ITU2";
  const effectiveLicense = licenseClass ?? userPrefs.licenseClass ?? "GENERAL";

  // Get the band plan
  const bandPlan = useMemo(
    () => getBandPlan(band, effectiveRegion),
    [band, effectiveRegion],
  );

  // Calculate segment display info
  const segmentInfo = useMemo((): SegmentDisplayInfo[] => {
    if (!bandPlan) {
      return [];
    }

    const bandStartKHz = bandPlan.startMHz * 1000;
    const bandEndKHz = bandPlan.endMHz * 1000;
    const bandWidthKHz = bandEndKHz - bandStartKHz;

    return bandPlan.segments.map((segment) => {
      const isAllowed = segment.licenseClasses.includes(effectiveLicense);
      const category = isAllowed ? getSegmentCategory(segment) : "not_allowed";

      // Calculate position and width as percentages
      const segmentWidth = segment.endKHz - segment.startKHz;
      const widthPercent = (segmentWidth / bandWidthKHz) * 100;
      const leftPercent =
        ((segment.startKHz - bandStartKHz) / bandWidthKHz) * 100;

      return {
        segment,
        category,
        isAllowed,
        widthPercent: Math.max(widthPercent, 0.5), // Minimum width for visibility
        leftPercent,
      };
    });
  }, [bandPlan, effectiveLicense]);

  // Calculate highlight position
  const highlightPosition = useMemo(() => {
    if (!bandPlan || highlightFrequency === undefined) {
      return null;
    }

    const bandStartKHz = bandPlan.startMHz * 1000;
    const bandEndKHz = bandPlan.endMHz * 1000;
    const bandWidthKHz = bandEndKHz - bandStartKHz;

    if (highlightFrequency < bandStartKHz || highlightFrequency > bandEndKHz) {
      return null;
    }

    return ((highlightFrequency - bandStartKHz) / bandWidthKHz) * 100;
  }, [bandPlan, highlightFrequency]);

  // Handle segment click
  const handleSegmentClick = useCallback(
    (segment: BandSegment) => {
      if (!onFrequencySelect) {
        return;
      }

      // Select the middle of the segment
      const midFreq = (segment.startKHz + segment.endKHz) / 2;
      onFrequencySelect(midFreq);
    },
    [onFrequencySelect],
  );

  if (!bandPlan) {
    return null;
  }

  const bandStartKHz = bandPlan.startMHz * 1000;
  const bandEndKHz = bandPlan.endMHz * 1000;

  // Compact mode - minimal display
  if (compact) {
    return (
      <div
        className={`relative h-4 rounded overflow-hidden bg-space-900/50 ${className}`}
      >
        {/* Segments */}
        {segmentInfo.map((info, index) => {
          const colors = SEGMENT_COLORS[info.category];
          return (
            <div
              key={index}
              className={`absolute top-0 h-full ${colors.bg} border-r ${colors.border} cursor-pointer hover:brightness-125 transition-all`}
              style={{
                left: `${info.leftPercent}%`,
                width: `${info.widthPercent}%`,
              }}
              onClick={() => handleSegmentClick(info.segment)}
              title={`${formatFrequency(info.segment.startKHz)}-${formatFrequency(info.segment.endKHz)} MHz: ${formatModeList(info.segment.modes)}`}
            />
          );
        })}

        {/* Highlight indicator */}
        {highlightPosition !== null && (
          <div
            className="absolute top-0 w-0.5 h-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
            style={{ left: `${highlightPosition}%` }}
          />
        )}
      </div>
    );
  }

  // Full mode - with labels and legend
  return (
    <div className={`space-y-2 ${className}`}>
      {/* Band header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">{bandPlan.name}</h3>
        <span className="text-xs text-gray-400">
          {effectiveLicense} - {effectiveRegion}
        </span>
      </div>

      {/* Band visualization */}
      <div className="relative">
        {/* Frequency labels above */}
        <div className="flex justify-between mb-1 text-[10px] text-gray-400">
          <span>{formatFrequency(bandStartKHz)} MHz</span>
          <span>{formatFrequency(bandEndKHz)} MHz</span>
        </div>

        {/* Main band display */}
        <div className="relative h-8 rounded-lg overflow-hidden bg-space-900/50 border border-white/10">
          {/* Segments */}
          {segmentInfo.map((info, index) => {
            const colors = SEGMENT_COLORS[info.category];
            const specialInfo = isSpecialFrequency(
              (info.segment.startKHz + info.segment.endKHz) / 2,
            );

            return (
              <Tooltip
                key={index}
                content={`${formatFrequency(info.segment.startKHz)}-${formatFrequency(info.segment.endKHz)} MHz\n${CATEGORY_LABELS[info.category]}: ${formatModeList(info.segment.modes)}${info.segment.notes ? `\n${info.segment.notes}` : ""}${specialInfo.isSpecial ? `\n${specialInfo.description}` : ""}`}
              >
                <div
                  className={`absolute top-0 h-full ${colors.bg} border-r ${colors.border} ${
                    onFrequencySelect && info.isAllowed
                      ? "cursor-pointer hover:brightness-125"
                      : info.isAllowed
                        ? ""
                        : "opacity-50 cursor-not-allowed"
                  } transition-all`}
                  style={{
                    left: `${info.leftPercent}%`,
                    width: `${info.widthPercent}%`,
                  }}
                  onClick={() => {
                    if (onFrequencySelect && info.isAllowed) {
                      handleSegmentClick(info.segment);
                    }
                  }}
                >
                  {/* Add striped pattern for not allowed segments */}
                  {!info.isAllowed && (
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 8px)",
                      }}
                    />
                  )}
                </div>
              </Tooltip>
            );
          })}

          {/* Highlight indicator */}
          {highlightPosition !== null && (
            <div
              className="absolute top-0 w-1 h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] z-10"
              style={{ left: `calc(${highlightPosition}% - 2px)` }}
            >
              {/* Frequency label */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-white font-mono whitespace-nowrap">
                {formatFrequency(highlightFrequency!)}
              </div>
            </div>
          )}
        </div>

        {/* Segment boundary labels */}
        <div className="relative h-4 mt-1">
          {segmentInfo.map((info, index) => {
            // Only show labels for major boundaries
            if (
              index === 0 ||
              info.segment.startKHz !== segmentInfo[index - 1]?.segment.endKHz
            ) {
              return (
                <span
                  key={`start-${index}`}
                  className="absolute text-[9px] text-gray-500 -translate-x-1/2"
                  style={{ left: `${info.leftPercent}%` }}
                >
                  {formatFrequency(info.segment.startKHz)}
                </span>
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
        {(
          Object.entries(SEGMENT_COLORS) as [
            SegmentCategory,
            { bg: string; border: string },
          ][]
        )
          .filter(([category]) => category !== "not_allowed")
          .map(([category, colors]) => (
            <div key={category} className="flex items-center gap-1">
              <div
                className={`w-3 h-3 rounded-sm ${colors.bg} border ${colors.border}`}
              />
              <span className="text-gray-400">{CATEGORY_LABELS[category]}</span>
            </div>
          ))}
        <div className="flex items-center gap-1">
          <div
            className="w-3 h-3 rounded-sm bg-gray-600/40 border border-gray-500/50"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
            }}
          />
          <span className="text-gray-400">Not Authorized</span>
        </div>
      </div>
    </div>
  );
}

BandPlanDisplay.displayName = "BandPlanDisplay";

export default BandPlanDisplay;
