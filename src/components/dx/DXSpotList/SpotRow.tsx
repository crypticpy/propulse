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
import { getBandColor as getBandHexColor, withAlpha } from "@/lib/utils/spotColors";
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
      className="w-[40px] h-[3px] rounded-full bg-su-line/20 overflow-hidden flex-shrink-0"
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
  const catEnabled = useRigStore((state) => state.catEnabled);
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
    const zebraStripe = index % 2 === 0 ? "bg-su-line/10" : "";

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
      return `${base} bg-su-line/10 ${highlightClass}`;
    }

    // Apply zebra stripe for default state
    return `${base} ${zebraStripe} hover:bg-su-line/10 ${highlightClass} ${focusClass}`;
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

  // Border-only variant of rowStyle for the non-compact row: age fades the
  // band-colour stripe by folding the age opacity into the border's own
  // alpha channel instead of the row wrapper's opacity. Opacity on the row
  // wrapper would cascade to the trailing toolbar — a descendant of the row
  // — and CSS opacity on an ancestor cannot be undone by a descendant's own
  // opacity (nested opacity multiplies), so that would leave the toolbar's
  // status text unreadable regardless of its own opacity. Alpha on a single
  // color property has no such inheritance problem.
  const rowBorderStyle = useMemo<React.CSSProperties>(() => {
    const alpha = ageVisualizationEnabled ? ageInfo.opacity : 1;
    return { borderLeft: `3px solid ${withAlpha(bandHexColor, alpha)}` };
  }, [ageVisualizationEnabled, ageInfo.opacity, bandHexColor]);
  // Per-cell age opacity (see rowBorderStyle above for why this isn't on the
  // row wrapper). The transition lives here — rather than relying on the
  // wrapper's `transition-all` class, which doesn't reach these descendant
  // elements' own inline styles — so the fade animates smoothly across an
  // age-category threshold instead of snapping in one frame.
  const cellFadeStyle = useMemo<React.CSSProperties>(
    () => ({
      transition: "opacity 500ms ease",
      ...(ageVisualizationEnabled ? { opacity: ageInfo.opacity } : {}),
    }),
    [ageVisualizationEnabled, ageInfo.opacity],
  );

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
          <span className="font-mono text-sm font-semibold text-su-text">
            {spot.dx}
          </span>
          {workedBadge}
          {atnoBadge}
          <span
            className="ml-auto font-mono text-xs text-su-muted"
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
          <span className="text-su-muted">{spot.mode}</span>
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
            <span className="ml-auto text-su-muted">{spot.dxGrid}</span>
          )}
        </div>
      </div>
    );

  return (
    <div
      className={rowClasses}
      style={rowBorderStyle}
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
        className="text-su-muted text-[11px] font-mono tabular-nums leading-tight flex items-center"
        title={`${minutesAgo}m ago`}
        style={cellFadeStyle}
      >
        {formatTime(spot.time)}
      </div>

      {/* Age column - visual progress bar or text badge */}
      {showAgeColumn && (
        <div
          className="flex items-center"
          title={`Age: ${formatSpotAge(spot.time)}`}
          style={cellFadeStyle}
        >
          <AgeProgressBar minutesAgo={minutesAgo} />
        </div>
      )}

      {/* Band - Q15: Clickable to filter */}
      <div className="flex items-center" style={cellFadeStyle}>
        <button
          onClick={handleBandClick}
          className={`px-1 py-0.5 rounded text-[10px] font-bold transition-all leading-none ${
            isBandActive
              ? "ring-2 ring-su-line/60 ring-offset-1 ring-offset-nebula-blue scale-105"
              : "hover:scale-105 hover:ring-1 hover:ring-su-line/60"
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
        style={cellFadeStyle}
      >
        {frequencyCopied ? "Copied!" : formatFrequency(spot.frequency)}
      </button>

      {/* DX Callsign with grid and badges */}
      <div className="flex items-center gap-1 min-w-0" style={cellFadeStyle}>
        <span className="text-su-text font-mono font-medium text-[11px] truncate leading-tight">
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
        className="text-su-muted text-[11px] font-mono text-right tabular-nums leading-tight flex items-center justify-end"
        title={distanceKm !== null ? `${Math.round(distanceKm)} km` : "Unknown"}
        style={cellFadeStyle}
      >
        {formatDistance(distanceKm)}
      </div>

      {/* Spotter */}
      <div
        className="text-su-muted text-[11px] font-mono truncate leading-tight flex items-center"
        title={spot.spotterGrid}
        style={cellFadeStyle}
      >
        {spot.spotter}
      </div>

      {/* Comment/Mode */}
      <div
        className="flex items-center gap-1.5 text-[11px] text-su-muted truncate"
        style={cellFadeStyle}
      >
        {spot.mode && (
          <span className="px-1 py-0.5 rounded bg-su-line/20 text-su-muted text-[10px] leading-none font-medium">
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

      {/* Trailing toolbar: tune chip + outlined quick actions */}
      <div className="relative flex min-h-8 items-center justify-end">
        <div
          className={`absolute right-0 z-10 flex items-center gap-1.5 rounded-md border border-su-line/40 bg-su-panel/95 px-1 py-0.5 shadow-sm backdrop-blur-sm transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto ${isFocused ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        >
          {catEnabled && (
            <TuneButton
              variant="chip"
              frequencyKHz={spot.frequency}
              mode={spot.mode}
            />
          )}
          <button
            type="button"
            onClick={handleSetTarget}
            className="inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-su-line/50 bg-su-input text-su-muted transition-colors hover:border-su-info hover:text-su-info focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-su-info"
            title="Set as map target"
            aria-label="Set as map target"
          >
            <svg
              className="h-3.5 w-3.5"
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
          {onWork && (
            <button
              type="button"
              onClick={handleWork}
              className="inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-su-line/50 bg-su-input text-su-muted transition-colors hover:border-su-success hover:text-su-success focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-su-info"
              title="Work this station (L)"
              aria-label={`Work ${spot.dx}`}
            >
              <span className="text-[9px] font-bold leading-none">L</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleWatchCallsign}
            className="inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-su-line/50 bg-su-input text-su-muted transition-colors hover:border-su-warning hover:text-su-warning focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-su-info"
            title="Watch this callsign"
            aria-label="Watch this callsign"
          >
            <svg
              className="h-3.5 w-3.5"
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
          <button
            type="button"
            onClick={handleHideSpot}
            className="inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-su-line/50 bg-su-input text-su-muted transition-colors hover:border-su-danger hover:text-su-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-su-info"
            title="Hide this spot"
            aria-label="Hide this spot"
          >
            <svg
              className="h-3.5 w-3.5"
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
      </div>
    </div>
  );
}, spotRowPropsAreEqual);

SpotRow.displayName = "SpotRow";
