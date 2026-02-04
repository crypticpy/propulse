/**
 * SpotRow Component
 *
 * Individual spot row with worked status and alert indicators.
 * Memoized to prevent re-renders when other rows in the list change.
 */

import { memo, useMemo, useCallback, useState, useEffect, useRef } from "react";
import { getBandColor } from "@/lib/api/dxcluster";
import {
  getSpotAgeInfo,
  formatSpotAge,
  getShortAgeLabel,
  getAgeBadgeColors,
} from "@/components/map/LiveSpotArcs";
import {
  parseSplitFromComment,
  formatSplitInfo,
  getSplitTooltip,
} from "@/lib/utils/spotParser";
import { SpotBadge } from "../SpotBadge";
import type { SpotRowProps } from "./types";
import {
  formatTime,
  formatFrequency,
  getMinutesAgo,
  formatDistance,
  spotRowPropsAreEqual,
} from "./utils";
import { GRID_PREFIX_LENGTH, COPY_FEEDBACK_TIMEOUT_MS } from "./constants";

/**
 * Individual spot row component with worked status and alert indicators
 * Memoized to prevent re-renders when other rows in the list change
 */
export const SpotRow = memo(function SpotRow({
  spot,
  index,
  isSelected,
  isHovered,
  workedStatus,
  isAlertMatch,
  isNeeded,
  distanceKm,
  onSelect,
  onHover,
  onContextMenu,
  onGridClick,
  onBandClick,
  onFrequencyCopied,
  showAgeColumn = true,
  ageVisualizationEnabled = true,
  activeBandFilter = null,
  isHighlighted = false,
}: SpotRowProps) {
  const bandColor = getBandColor(spot.band || "");
  const minutesAgo = getMinutesAgo(spot.time);
  const [frequencyCopied, setFrequencyCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate age info for styling
  const ageInfo = useMemo(() => getSpotAgeInfo(spot.time), [spot.time]);
  const ageBadgeColors = useMemo(
    () => getAgeBadgeColors(ageInfo.ageCategory),
    [ageInfo.ageCategory],
  );

  // Handle frequency copy to clipboard
  const handleFrequencyCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row selection
      try {
        const freqKhz = spot.frequency.toFixed(1);
        await navigator.clipboard.writeText(freqKhz);
        setFrequencyCopied(true);
        onFrequencyCopied?.(spot.frequency);

        // Clear the copied state after a short delay
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => {
          setFrequencyCopied(false);
        }, COPY_FEEDBACK_TIMEOUT_MS);
      } catch (err) {
        console.error("Failed to copy frequency:", err);
      }
    },
    [spot.frequency, onFrequencyCopied],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Handle grid click (filter by this grid)
  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row selection
      if (spot.dxGrid && onGridClick) {
        // Use prefix for broader match (e.g., "EM73" from "EM73vk")
        const gridPrefix = spot.dxGrid.slice(0, GRID_PREFIX_LENGTH);
        onGridClick(gridPrefix);
      }
    },
    [spot.dxGrid, onGridClick],
  );

  // Handle band badge click (Q15: filter by this band)
  const handleBandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger row selection
      if (spot.band && onBandClick) {
        onBandClick(spot.band);
      }
    },
    [spot.band, onBandClick],
  );

  // Check if this band is the active filter
  const isBandActive = activeBandFilter === spot.band;

  const handleClick = useCallback(() => {
    onSelect(spot);
  }, [spot, onSelect]);

  const handleMouseEnter = useCallback(() => {
    onHover(spot);
  }, [spot, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(spot, { x: e.clientX, y: e.clientY });
    },
    [spot, onContextMenu],
  );

  // Build row classes with alert highlight, needed highlight, zebra striping, and age-based opacity
  const rowClasses = useMemo(() => {
    // Grid columns: Time, Age (optional), Band, Freq, DX, Dist, Spotter, Info
    const gridCols = showAgeColumn
      ? "grid-cols-[50px_40px_60px_70px_1fr_55px_70px_1fr]"
      : "grid-cols-[50px_60px_70px_1fr_55px_70px_1fr]";
    const base = `grid ${gridCols} gap-2 px-3 py-2 cursor-pointer transition-all duration-150`;

    // Q6: Zebra striping for alternating rows (only applies when no other highlight)
    const zebraStripe = index % 2 === 0 ? "bg-white/[0.02]" : "";

    // Q8: Highlight animation for scroll-to-selected (brief cyan glow)
    const highlightClass = isHighlighted
      ? "ring-2 ring-cyan-400/60 ring-inset animate-pulse"
      : "";

    if (isSelected) {
      return `${base} bg-plasma-orange/20 border-l-2 border-plasma-orange ${highlightClass}`;
    }

    if (isAlertMatch) {
      return `${base} bg-alert-red/10 border-l-2 border-alert-red animate-pulse`;
    }

    // Highlight needed spots with a subtle gold/yellow left border
    if (isNeeded) {
      if (isHovered) {
        return `${base} bg-yellow-500/10 border-l-2 border-yellow-500/70 ${highlightClass}`;
      }
      return `${base} bg-yellow-500/5 border-l-2 border-yellow-500/50 hover:bg-yellow-500/10 ${highlightClass}`;
    }

    if (isHovered) {
      return `${base} bg-white/5 ${highlightClass}`;
    }

    // Apply zebra stripe for default state
    return `${base} ${zebraStripe} hover:bg-white/5 ${highlightClass}`;
  }, [
    isSelected,
    isHovered,
    isAlertMatch,
    isNeeded,
    showAgeColumn,
    index,
    isHighlighted,
  ]);

  // Calculate row opacity based on age (only when age visualization is enabled)
  const rowStyle = useMemo(() => {
    if (!ageVisualizationEnabled) return {};
    return { opacity: ageInfo.opacity };
  }, [ageVisualizationEnabled, ageInfo.opacity]);

  // Determine which badge to show for worked status
  const workedBadge = useMemo(() => {
    if (!workedStatus.isWorked) {
      // Never worked - show NEW badge (this is a needed spot)
      return (
        <SpotBadge type="new" title="New callsign - never worked before" />
      );
    }
    if (!workedStatus.workedOnBand) {
      // Worked but not on this band - show BAND badge (this is also needed)
      const workedBandsList = workedStatus.workedBands.join(", ");
      return (
        <SpotBadge
          type="band-new"
          title={`New on ${spot.band} - worked on: ${workedBandsList}`}
        />
      );
    }
    // Worked on this band - show checkmark
    return <SpotBadge type="worked" title={`Already worked on ${spot.band}`} />;
  }, [workedStatus, spot.band]);

  // Show the "NEED" star badge for needed spots
  const neededBadge = useMemo(() => {
    if (!isNeeded) return null;
    return (
      <SpotBadge
        type="needed"
        title={
          !workedStatus.isWorked
            ? "Needed - never worked"
            : `Needed on ${spot.band}`
        }
      />
    );
  }, [isNeeded, workedStatus.isWorked, spot.band]);

  // Parse split info from comment (Q10: Working Split Indicator)
  const splitInfo = useMemo(
    () => parseSplitFromComment(spot.comment || ""),
    [spot.comment],
  );

  return (
    <div
      className={rowClasses}
      style={rowStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      role="row"
      data-spot-id={spot.id}
    >
      {/* Time */}
      <div
        className="text-gray-400 text-xs font-mono"
        title={`${minutesAgo}m ago`}
      >
        {formatTime(spot.time)}
      </div>

      {/* Age column - shows relative age with color coding */}
      {showAgeColumn && (
        <div
          className={`text-[10px] font-mono tabular-nums px-1 py-0.5 rounded border ${ageBadgeColors.bg} ${ageBadgeColors.text} ${ageBadgeColors.border}`}
          title={`Age: ${formatSpotAge(spot.time)}`}
        >
          {getShortAgeLabel(spot.time)}
        </div>
      )}

      {/* Band - Q15: Clickable to filter */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleBandClick}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
            isBandActive
              ? "ring-2 ring-white/50 ring-offset-1 ring-offset-nebula-blue scale-105"
              : "hover:scale-105 hover:ring-1 hover:ring-white/30"
          }`}
          style={{
            backgroundColor: bandColor.bgColor,
            color: bandColor.color,
          }}
          title={
            isBandActive
              ? `Click to clear ${spot.band} filter`
              : `Click to filter by ${spot.band}`
          }
        >
          {spot.band}
        </button>
      </div>

      {/* Frequency - clickable to copy */}
      <button
        onClick={handleFrequencyCopy}
        className={`text-xs font-mono tabular-nums text-left transition-all duration-150 rounded px-1 -mx-1 ${
          frequencyCopied
            ? "text-green-400 bg-green-500/20"
            : "text-cyan-400/80 hover:text-cyan-400 hover:bg-cyan-500/10"
        }`}
        title={`Click to copy ${spot.frequency.toFixed(1)} kHz`}
      >
        {frequencyCopied ? "Copied!" : formatFrequency(spot.frequency)}
      </button>

      {/* DX Callsign with grid and badges */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-white font-mono font-medium truncate">
          {spot.dx}
        </span>
        {/* Grid locator - clickable to filter */}
        {spot.dxGrid && (
          <button
            onClick={handleGridClick}
            className="text-[10px] text-cyan-400/70 hover:text-cyan-400 font-mono px-1 py-0.5 rounded hover:bg-cyan-500/10 transition-colors flex-shrink-0"
            title={`Filter by grid ${spot.dxGrid.slice(0, GRID_PREFIX_LENGTH)}`}
          >
            {spot.dxGrid.slice(0, GRID_PREFIX_LENGTH)}
          </button>
        )}
        {/* Status badges */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAlertMatch && (
            <SpotBadge type="alert" title="Matches alert rule" />
          )}
          {neededBadge}
          {workedBadge}
        </div>
      </div>

      {/* Distance */}
      <div
        className="text-gray-400 text-xs font-mono text-right tabular-nums"
        title={distanceKm !== null ? `${Math.round(distanceKm)} km` : "Unknown"}
      >
        {formatDistance(distanceKm)}
      </div>

      {/* Spotter */}
      <div
        className="text-gray-400 text-xs font-mono truncate"
        title={spot.spotterGrid}
      >
        {spot.spotter}
      </div>

      {/* Comment/Mode */}
      <div className="flex items-center gap-2 text-xs text-gray-500 truncate">
        {spot.mode && (
          <span className="px-1 py-0.5 rounded bg-white/5 text-gray-400">
            {spot.mode}
          </span>
        )}
        {/* Q10: Split indicator badge */}
        {splitInfo.isSplit && (
          <span
            className="px-1 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/40 whitespace-nowrap flex-shrink-0"
            title={getSplitTooltip(splitInfo)}
          >
            {formatSplitInfo(splitInfo)}
          </span>
        )}
        <span className="truncate" title={spot.comment}>
          {spot.comment}
        </span>
      </div>
    </div>
  );
}, spotRowPropsAreEqual);

SpotRow.displayName = "SpotRow";
