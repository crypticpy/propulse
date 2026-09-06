/**
 * SpotRow Component
 *
 * Individual spot row with worked status and alert indicators.
 * Memoized to prevent re-renders when other rows in the list change.
 *
 * Redesigned for density: 3px band color strip, compact padding,
 * age progress bar, and hover-revealed quick action buttons.
 */

import { memo, useMemo, useCallback, useState, useEffect, useRef } from "react";
import { getBandColor } from "@/lib/api/dxcluster";
import { getBandColor as getBandHexColor } from "@/lib/utils/spotColors";
import { getSpotAgeInfo, formatSpotAge } from "@/components/map/LiveSpotArcs";
import {
  parseSplitFromComment,
  formatSplitInfo,
  getSplitTooltip,
} from "@/lib/utils/spotParser";
import { SpotBadge } from "../SpotBadge";
import { TuneButton } from "@/components/radio/TuneButton";
import { useRigStore } from "@/stores/rigStore";
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
 * Tiny horizontal progress bar indicating spot freshness.
 * Full width + green = fresh, depleting toward red = stale.
 * Max age is 30 minutes for the bar visualization.
 */
function AgeProgressBar({ minutesAgo }: { minutesAgo: number }) {
  const maxAge = 30;
  const pct = Math.max(
    0,
    Math.min(100, ((maxAge - minutesAgo) / maxAge) * 100),
  );

  // Green -> yellow -> red gradient based on age
  let barColor: string;
  if (minutesAgo <= 5) {
    barColor = "#22c55e"; // green-500
  } else if (minutesAgo <= 15) {
    barColor = "#eab308"; // yellow-500
  } else {
    barColor = "#ef4444"; // red-500
  }

  return (
    <div
      className="w-[40px] h-[3px] rounded-full bg-white/10 overflow-hidden flex-shrink-0"
      title={`${minutesAgo}m ago`}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          backgroundColor: barColor,
        }}
      />
    </div>
  );
}



/**
 * Individual spot row component with worked status and alert indicators
 * Memoized to prevent re-renders when other rows in the list change
 */
export const SpotRow = memo(function SpotRow({
  spot,
  compact = false,
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
  onSetTarget,
  onWork,
  onWatchCallsign,
  onHideSpot,
  showAgeColumn = true,
  ageVisualizationEnabled = true,
  activeBandFilter = null,
  isHighlighted = false,
  isFocused = false,
}: SpotRowProps) {
  const bandColor = getBandColor(spot.band || "");
  const bandHexColor = getBandHexColor(spot.band || "");
  const minutesAgo = getMinutesAgo(spot.time);
  const [frequencyCopied, setFrequencyCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate age info for styling
  const ageInfo = useMemo(() => getSpotAgeInfo(spot.time), [spot.time]);

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

  // Quick action handlers
  const handleSetTarget = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSetTarget?.(spot);
    },
    [spot, onSetTarget],
  );

  const handleWork = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onWork?.(spot);
    },
    [spot, onWork],
  );

  const handleWatchCallsign = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onWatchCallsign?.(spot);
    },
    [spot, onWatchCallsign],
  );

  const handleHideSpot = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onHideSpot?.(spot);
    },
    [spot, onHideSpot],
  );

  // Rig store for tune action
  const catEnabled = useRigStore((s) => s.catEnabled);
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
    // Grid columns: Time, Age (optional), Band, Freq, DX, Dist, Spotter, Info, Actions
    const gridCols = showAgeColumn
      ? "grid-cols-[46px_40px_52px_66px_1fr_50px_62px_1fr_72px]"
      : "grid-cols-[46px_52px_66px_1fr_50px_62px_1fr_72px]";
    const base = `group ${compact ? "flex flex-col" : `grid ${gridCols}`} gap-1.5 px-2 py-1 cursor-pointer transition-all duration-150`;

    // Q6: Zebra striping for alternating rows (only applies when no other highlight)
    const zebraStripe = index % 2 === 0 ? "bg-white/[0.02]" : "";

    // Q8: Highlight animation for scroll-to-selected (brief cyan glow)
    const highlightClass = isHighlighted
      ? "ring-2 ring-cyan-400/60 ring-inset animate-pulse"
      : "";

    // QoL1: Keyboard focus ring
    const focusClass = isFocused
      ? "ring-2 ring-cosmic-cyan/70 ring-inset bg-cosmic-cyan/10"
      : "";

    if (isSelected) {
      return `${base} bg-plasma-orange/20 ${highlightClass} ${focusClass}`;
    }

    if (isAlertMatch) {
      return `${base} bg-alert-red/10 animate-pulse`;
    }

    // Highlight needed spots with a subtle gold/yellow left border
    if (isNeeded) {
      if (isHovered) {
        return `${base} bg-yellow-500/10 ${highlightClass}`;
      }
      return `${base} bg-yellow-500/5 hover:bg-yellow-500/10 ${highlightClass}`;
    }

    if (isHovered) {
      return `${base} bg-white/5 ${highlightClass}`;
    }

    // Apply zebra stripe for default state
    return `${base} ${zebraStripe} hover:bg-white/5 ${highlightClass} ${focusClass}`;
  }, [
    isSelected,
    isHovered,
    isAlertMatch,
    isNeeded,
    showAgeColumn,
    compact,
    index,
    isHighlighted,
    isFocused,
  ]);

  // Calculate row opacity based on age (only when age visualization is enabled)
  const rowStyle = useMemo(() => {
    const style: React.CSSProperties = {
      borderLeft: `3px solid ${bandHexColor}`,
    };
    if (ageVisualizationEnabled) {
      style.opacity = ageInfo.opacity;
    }
    return style;
  }, [ageVisualizationEnabled, ageInfo.opacity, bandHexColor]);

  // Determine ATNO badge (All-Time New One - DXCC entity never worked)
  const atnoBadge = useMemo(() => {
    if (!workedStatus.isATNO) return null;
    const entityLabel = workedStatus.entityName || "Unknown entity";
    return (
      <SpotBadge
        type="atno"
        title={`All-Time New One! ${entityLabel} - never worked`}
      />
    );
  }, [workedStatus.isATNO, workedStatus.entityName]);

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
    if (!isNeeded) {
      return null;
    }
    return (
      <SpotBadge
        type="needed"
        title={
          workedStatus.isWorked
            ? `Needed on ${spot.band}`
            : "Needed - never worked"
        }
      />
    );
  }, [isNeeded, workedStatus.isWorked, spot.band]);

  // Parse split info from comment (Q10: Working Split Indicator)
  const splitInfo = useMemo(
    () => parseSplitFromComment(spot.comment || ""),
    [spot.comment],
  );

  if (compact)
    return (
      <div
        className={rowClasses}
        style={rowStyle}
        role="row"
        id={`spot-row-${spot.id}`}
        data-spot-id={spot.id}
        aria-selected={isSelected || isFocused}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      >
        <div role="cell" className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-sm font-semibold text-white">
            {spot.dx}
          </span>
          {workedBadge}
          {atnoBadge}
          <span
            className="ml-auto font-mono text-xs text-gray-400"
            title={`${formatTime(spot.time)} UTC`}
          >
            {formatSpotAge(spot.time)}
          </span>
        </div>
        <div
          role="cell"
          className="flex flex-wrap items-center gap-2 text-xs font-mono"
        >
          <span style={{ color: bandHexColor }}>{spot.band}</span>
          <span className="text-gray-300">{spot.mode}</span>
          <button
            onClick={handleFrequencyCopy}
            className="text-cosmic-cyan"
            title={`Copy ${spot.frequency.toFixed(1)} kHz`}
          >
            {frequencyCopied
              ? "Copied!"
              : `${formatFrequency(spot.frequency)} MHz`}
          </button>
          {spot.dxGrid && (
            <span className="ml-auto text-gray-400">{spot.dxGrid}</span>
          )}
        </div>
      </div>
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
      id={`spot-row-${spot.id}`}
      data-spot-id={spot.id}
      aria-selected={isSelected || isFocused}
    >
      {/* Time */}
      <div
        className="text-gray-400 text-[11px] font-mono tabular-nums leading-tight flex items-center"
        title={`${minutesAgo}m ago`}
      >
        {formatTime(spot.time)}
      </div>

      {/* Age column - visual progress bar or text badge */}
      {showAgeColumn && (
        <div
          className="flex items-center"
          title={`Age: ${formatSpotAge(spot.time)}`}
        >
          <AgeProgressBar minutesAgo={minutesAgo} />
        </div>
      )}

      {/* Band - Q15: Clickable to filter */}
      <div className="flex items-center">
        <button
          onClick={handleBandClick}
          className={`px-1 py-0.5 rounded text-[10px] font-bold transition-all leading-none ${
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
        className={`text-[11px] font-mono tabular-nums text-left transition-all duration-150 rounded px-0.5 leading-tight flex items-center ${
          frequencyCopied
            ? "text-green-400 bg-green-500/20"
            : "text-cyan-400/80 hover:text-cyan-400 hover:bg-cyan-500/10"
        }`}
        title={`Click to copy ${spot.frequency.toFixed(1)} kHz`}
      >
        {frequencyCopied ? "Copied!" : formatFrequency(spot.frequency)}
      </button>

      {/* DX Callsign with grid and badges */}
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-white font-mono font-medium text-[11px] truncate leading-tight">
          {spot.dx}
        </span>
        {/* Grid locator - clickable to filter */}
        {spot.dxGrid && (
          <button
            onClick={handleGridClick}
            className="text-[9px] text-cyan-400/70 hover:text-cyan-400 font-mono px-0.5 rounded hover:bg-cyan-500/10 transition-colors flex-shrink-0 leading-none"
            title={`Filter by grid ${spot.dxGrid.slice(0, GRID_PREFIX_LENGTH)}`}
          >
            {spot.dxGrid.slice(0, GRID_PREFIX_LENGTH)}
          </button>
        )}
        {/* Status badges */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {atnoBadge}
          {isAlertMatch && (
            <SpotBadge type="alert" title="Matches alert rule" />
          )}
          {neededBadge}
          {workedBadge}
        </div>
      </div>

      {/* Distance */}
      <div
        className="text-gray-400 text-[11px] font-mono text-right tabular-nums leading-tight flex items-center justify-end"
        title={distanceKm !== null ? `${Math.round(distanceKm)} km` : "Unknown"}
      >
        {formatDistance(distanceKm)}
      </div>

      {/* Spotter */}
      <div
        className="text-gray-400 text-[11px] font-mono truncate leading-tight flex items-center"
        title={spot.spotterGrid}
      >
        {spot.spotter}
      </div>

      {/* Comment/Mode */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-300 truncate">
        {spot.mode && (
          <span className="px-1 py-0.5 rounded bg-white/8 text-gray-300 text-[10px] leading-none font-medium">
            {spot.mode}
          </span>
        )}
        {/* Q10: Split indicator badge */}
        {splitInfo.isSplit && (
          <span
            className="px-0.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/40 whitespace-nowrap flex-shrink-0 leading-none"
            title={getSplitTooltip(splitInfo)}
          >
            {formatSplitInfo(splitInfo)}
          </span>
        )}
        <span className="truncate leading-tight" title={spot.comment}>
          {spot.comment}
        </span>
      </div>

      {/* Quick action buttons - visible on hover */}
      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {onWork && (
          <button
            onClick={handleWork}
            className="p-0.5 rounded text-gray-400 hover:text-signal-green hover:bg-signal-green/10 transition-colors"
            title="Work this station (L)"
            aria-label={`Work ${spot.dx}`}
          >
            <span className="px-0.5 text-[9px] font-bold leading-none">L</span>
          </button>
        )}
        {/* Target (crosshair) */}
        <button
          onClick={handleSetTarget}
          className="p-0.5 rounded text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
          title="Set as map target"
          aria-label="Set as map target"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
            <path
              strokeLinecap="round"
              strokeWidth={1.5}
              d="M12 2v4m0 12v4M2 12h4m12 0h4"
            />
          </svg>
        </button>
        {/* Watch (eye) */}
        <button
          onClick={handleWatchCallsign}
          className="p-0.5 rounded text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
          title="Watch this callsign"
          aria-label="Watch this callsign"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </button>
        {/* Hide (x) */}
        <button
          onClick={handleHideSpot}
          className="p-0.5 rounded text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Hide this spot"
          aria-label="Hide this spot"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      {catEnabled && (
        <div className="col-span-full flex justify-end">
          <TuneButton frequencyKHz={spot.frequency} mode={spot.mode} />
        </div>
      )}
    </div>
  );
}, spotRowPropsAreEqual);

SpotRow.displayName = "SpotRow";
