/**
 * SpotDetailsFlyout Component
 *
 * Shows detailed spot information when hovering over a spot on the globe.
 * Displays DX callsign, grid, frequency, mode, time, and propagation info.
 *
 * Features:
 * - Rich spot details in a compact flyout
 * - Feasibility badge for propagation assessment
 * - Age indicator with visual styling
 * - Auto-positioning to stay on screen
 */

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { FeasibilityBadge } from "./FeasibilityBadge";
import { useFeasibility } from "@/hooks/useFeasibility";
import { useUserStore } from "@/stores/userStore";
import {
  getSpotAgeInfo,
  formatSpotAge,
  getAgeBadgeColors,
} from "./LiveSpotArcs";
import { getModeColor } from "@/lib/utils/spotColors";
import { SPOT_SOURCE_COLORS, type SpotSource } from "@/types/livespot";

/** Data structure for spot details */
export interface SpotDetailsData {
  /** DX callsign */
  callsign: string;
  /** DX grid locator */
  dxGrid?: string;
  /** DX latitude */
  dxLat: number;
  /** DX longitude */
  dxLon: number;
  /** Spotter callsign */
  spotter?: string;
  /** Spotter grid locator */
  spotterGrid?: string;
  /** Frequency in kHz */
  frequency: number;
  /** Band designation */
  band?: string;
  /** Operating mode */
  mode?: string;
  /** Spot time */
  time: Date;
  /** Spot source */
  source: SpotSource;
  /** Signal-to-noise ratio */
  snr?: number;
  /** CW speed in WPM */
  wpm?: number;
}

export interface SpotDetailsFlyoutProps {
  /** Whether the flyout is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** Spot data to display */
  spot: SpotDetailsData | null;
  /** Callback to close the flyout */
  onClose?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Flyout dimensions for positioning */
const FLYOUT_WIDTH = 220;
const FLYOUT_HEIGHT = 180;
const EDGE_PADDING = 10;
const CURSOR_OFFSET = 12;

/**
 * Format coordinate for display
 */
function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
  return `${Math.abs(val).toFixed(1)}${dir}`;
}

/**
 * Format frequency for display (e.g., "14.074 MHz")
 */
function formatFrequency(freqKHz: number): string {
  if (freqKHz >= 1000) {
    return `${(freqKHz / 1000).toFixed(3)} MHz`;
  }
  return `${freqKHz.toFixed(1)} kHz`;
}

/**
 * SpotDetailsFlyout Component
 *
 * Renders a compact flyout with spot details for hover display.
 */
export function SpotDetailsFlyout({
  visible,
  position,
  spot,
  className = "",
}: SpotDetailsFlyoutProps) {
  const { station } = useUserStore();
  const homeGrid = station?.grid || "";

  // Calculate feasibility if we have grids
  const feasibility = useFeasibility({
    fromGrid: homeGrid,
    toGrid: spot?.dxGrid || "",
  });

  // Calculate adjusted position to keep flyout on screen
  const adjustedPosition = useMemo(() => {
    const { x, y } = position;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1920;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : 1080;

    let adjustedX: number;
    let adjustedY: number;

    // X position: default to right of cursor
    const spaceOnRight = viewportWidth - x - EDGE_PADDING;
    const spaceOnLeft = x - EDGE_PADDING;

    if (spaceOnRight >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      adjustedX = x + CURSOR_OFFSET;
    } else if (spaceOnLeft >= FLYOUT_WIDTH + CURSOR_OFFSET) {
      adjustedX = x - FLYOUT_WIDTH - CURSOR_OFFSET;
    } else {
      adjustedX = Math.max(
        EDGE_PADDING,
        Math.min(
          x - FLYOUT_WIDTH / 2,
          viewportWidth - FLYOUT_WIDTH - EDGE_PADDING,
        ),
      );
    }

    // Y position: default to above cursor
    const spaceAbove = y - EDGE_PADDING;
    const spaceBelow = viewportHeight - y - EDGE_PADDING;

    if (spaceAbove >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y - FLYOUT_HEIGHT - CURSOR_OFFSET;
    } else if (spaceBelow >= FLYOUT_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y + CURSOR_OFFSET;
    } else {
      adjustedY = Math.max(
        EDGE_PADDING,
        Math.min(
          y - FLYOUT_HEIGHT / 2,
          viewportHeight - FLYOUT_HEIGHT - EDGE_PADDING,
        ),
      );
    }

    return { x: adjustedX, y: adjustedY };
  }, [position]);

  // Get age info for styling
  const ageInfo = useMemo(() => {
    if (!spot) {
      return null;
    }
    return getSpotAgeInfo(spot.time);
  }, [spot]);

  const ageBadgeColors = useMemo(() => {
    if (!ageInfo) {
      return null;
    }
    return getAgeBadgeColors(ageInfo.ageCategory);
  }, [ageInfo]);

  // Don't render if not visible or no spot
  if (!visible || !spot) {
    return null;
  }

  const modeColor = getModeColor(spot.mode);
  const sourceColors = SPOT_SOURCE_COLORS[spot.source];

  const flyoutContent = (
    <div
      className={`
        fixed z-50 pointer-events-none
        bg-gray-900/95 backdrop-blur-md
        border border-white/10 rounded-lg
        shadow-xl
        transition-opacity duration-150
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        minWidth: FLYOUT_WIDTH,
      }}
    >
      {/* Header with callsign and feasibility */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div
            className="text-white font-mono font-bold text-base"
            style={{ textShadow: `0 0 8px ${modeColor}60` }}
          >
            {spot.callsign}
          </div>
          {homeGrid && spot.dxGrid && feasibility.level !== "unlikely" && (
            <FeasibilityBadge
              level={feasibility.level}
              isGrayline={feasibility.isGrayline}
              size="sm"
            />
          )}
        </div>
        {spot.dxGrid && (
          <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
            <span>{spot.dxGrid}</span>
            <span className="text-gray-600">•</span>
            <span>
              {formatCoord(spot.dxLat, true)}, {formatCoord(spot.dxLon, false)}
            </span>
          </div>
        )}
      </div>

      {/* Spot details */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Frequency and Mode row */}
        <div className="flex items-center gap-2">
          <span className="text-white font-mono text-sm">
            {formatFrequency(spot.frequency)}
          </span>
          {spot.band && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-300">
              {spot.band}
            </span>
          )}
          {spot.mode && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
              style={{ backgroundColor: modeColor }}
            >
              {spot.mode}
            </span>
          )}
        </div>

        {/* Time and Age row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {spot.time.toISOString().substring(11, 16)} UTC
          </span>
          {ageInfo && ageBadgeColors && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: ageBadgeColors.bg,
                color: ageBadgeColors.text,
                border: `1px solid ${ageBadgeColors.border}`,
              }}
            >
              {formatSpotAge(spot.time)}
            </span>
          )}
        </div>

        {/* Source row */}
        <div className="flex items-center justify-between">
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{
              backgroundColor: sourceColors.bgColor,
              color: sourceColors.color,
            }}
          >
            {spot.source}
          </span>
          {spot.snr !== undefined && (
            <span className="text-xs text-gray-400">
              SNR: <span className="text-cyan-400">{spot.snr}</span> dB
            </span>
          )}
          {spot.wpm !== undefined && (
            <span className="text-xs text-gray-400">
              <span className="text-amber-400">{spot.wpm}</span> WPM
            </span>
          )}
        </div>

        {/* Spotter info */}
        {spot.spotter && (
          <div className="pt-1 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span>Spotted by:</span>
              <span className="text-gray-400 font-mono">{spot.spotter}</span>
              {spot.spotterGrid && (
                <span className="text-gray-500 font-mono">
                  ({spot.spotterGrid})
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(flyoutContent, document.body);
}

SpotDetailsFlyout.displayName = "SpotDetailsFlyout";

export default SpotDetailsFlyout;
