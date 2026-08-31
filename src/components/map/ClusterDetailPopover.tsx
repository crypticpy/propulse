/**
 * ClusterDetailPopover Component
 *
 * Portal-based popover that shows detailed spot information when a user clicks
 * on a spot cluster on the globe. Displays all spots in the cluster sorted by
 * recency with mode-colored callsigns, frequency, band, age badges, and source.
 *
 * Features:
 * - Portal rendering for correct z-index stacking
 * - Auto-repositioning to stay within viewport
 * - Click-outside and Escape key dismissal
 * - Scrollable spot list for large clusters
 * - Location bar with grid locator and coordinates
 * - Mode distribution summary in footer
 * - Unique bands count and newest spot age in footer
 */

import { useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import { getModeColor } from "@/lib/utils/spotColors";
import {
  getSpotAgeInfo,
  formatSpotAge,
  getAgeBadgeColors,
} from "./LiveSpotArcs";
import { SPOT_SOURCE_COLORS, type LiveSpot } from "@/types/livespot";
import { latLonToGrid } from "@/lib/utils/grid";

export interface ClusterDetailPopoverProps {
  /** Whether the popover is visible */
  visible: boolean;
  /** Screen coordinates for positioning */
  position: { x: number; y: number };
  /** Cluster data to display */
  cluster: SpotCluster | null;
  /** Callback to close the popover */
  onClose: () => void;
  /** Opens full details for a spot in the cluster */
  onSpotSelect: (spot: LiveSpot) => void;
}

/** Popover dimensions for positioning */
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 400;
const EDGE_PADDING = 10;
const CURSOR_OFFSET = 12;

/**
 * Format coordinate for display with N/S E/W suffix
 */
function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
  return `${Math.abs(val).toFixed(1)}\u00B0${dir}`;
}

/**
 * Format frequency in kHz to MHz display string
 */
function formatFrequency(freqKHz: number): string {
  if (freqKHz >= 1000) {
    return `${(freqKHz / 1000).toFixed(3)} MHz`;
  }
  return `${freqKHz.toFixed(1)} kHz`;
}

/**
 * Compute the dominant (most common) mode in a cluster
 */
function getDominantMode(cluster: SpotCluster): string {
  const counts = new Map<string, number>();
  for (const spot of cluster.spots) {
    const mode = spot.mode?.toUpperCase() || "UNKNOWN";
    counts.set(mode, (counts.get(mode) || 0) + 1);
  }

  let dominant = "UNKNOWN";
  let maxCount = 0;
  for (const [mode, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = mode;
    }
  }
  return dominant;
}

/**
 * ClusterDetailPopover Component
 *
 * Renders a portal-based popover with a scrollable list of all spots in a
 * cluster, positioned near the click point with automatic viewport adjustment.
 */
export function ClusterDetailPopover({
  visible,
  position,
  cluster,
  onClose,
  onSpotSelect,
}: ClusterDetailPopoverProps) {
  // Dismiss on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (visible) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible, handleKeyDown]);

  // Calculate adjusted position to keep popover on screen
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

    if (spaceOnRight >= POPOVER_WIDTH + CURSOR_OFFSET) {
      adjustedX = x + CURSOR_OFFSET;
    } else if (spaceOnLeft >= POPOVER_WIDTH + CURSOR_OFFSET) {
      adjustedX = x - POPOVER_WIDTH - CURSOR_OFFSET;
    } else {
      adjustedX = Math.max(
        EDGE_PADDING,
        Math.min(
          x - POPOVER_WIDTH / 2,
          viewportWidth - POPOVER_WIDTH - EDGE_PADDING,
        ),
      );
    }

    // Y position: default to above cursor
    const spaceAbove = y - EDGE_PADDING;
    const spaceBelow = viewportHeight - y - EDGE_PADDING;

    if (spaceAbove >= POPOVER_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y - POPOVER_HEIGHT - CURSOR_OFFSET;
    } else if (spaceBelow >= POPOVER_HEIGHT + CURSOR_OFFSET) {
      adjustedY = y + CURSOR_OFFSET;
    } else {
      adjustedY = Math.max(
        EDGE_PADDING,
        Math.min(
          y - POPOVER_HEIGHT / 2,
          viewportHeight - POPOVER_HEIGHT - EDGE_PADDING,
        ),
      );
    }

    return { x: adjustedX, y: adjustedY };
  }, [position]);

  // Sort spots by recency (newest first) and compute grid locator
  const { sortedSpots, gridLocator, dominantMode } = useMemo(() => {
    if (!cluster) {
      return { sortedSpots: [], gridLocator: "", dominantMode: "" };
    }

    const sorted = [...cluster.spots].sort((a, b) => {
      const timeA =
        a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
      const timeB =
        b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
      return timeB - timeA;
    });

    let grid = "";
    try {
      grid = latLonToGrid(cluster.center.lat, cluster.center.lon, 4);
    } catch {
      grid = "??";
    }

    return {
      sortedSpots: sorted,
      gridLocator: grid,
      dominantMode: getDominantMode(cluster),
    };
  }, [cluster]);

  // Mode distribution for footer
  const modeDistribution = useMemo(() => {
    if (!cluster) return [];
    const counts = new Map<string, number>();
    for (const spot of cluster.spots) {
      const mode = spot.mode?.toUpperCase() || "UNKNOWN";
      counts.set(mode, (counts.get(mode) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([mode, count]) => ({ mode, count }));
  }, [cluster]);

  // Unique bands for footer
  const uniqueBands = useMemo(() => {
    if (!cluster) return new Set<string>();
    const bands = new Set<string>();
    for (const spot of cluster.spots) {
      if (spot.band) bands.add(spot.band);
    }
    return bands;
  }, [cluster]);

  // Newest spot age for footer
  const newestSpotAge =
    sortedSpots.length > 0
      ? formatSpotAge(
          sortedSpots[0].time instanceof Date
            ? sortedSpots[0].time
            : new Date(sortedSpots[0].time),
        )
      : "";

  // Don't render if not visible or no cluster
  if (!visible || !cluster) {
    return null;
  }

  const dominantModeColor = getModeColor(dominantMode);

  const popoverContent = (
    <>
      {/* Transparent backdrop for click-outside dismissal */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popover panel */}
      <div
        className="fixed z-50 rounded-lg bg-deep-space/95 backdrop-blur-sm border border-white/10 shadow-xl overflow-hidden"
        style={{
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          width: POPOVER_WIDTH,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Cluster of ${cluster.count} spots`}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-white">
              {cluster.count} Active Spot{cluster.count !== 1 ? "s" : ""}
            </span>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-white self-start"
              style={{ backgroundColor: dominantModeColor }}
            >
              {dominantMode}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Location bar */}
        <div className="bg-white/5 px-3 py-2 border-b border-white/10">
          <div className="text-sm font-mono font-bold text-white">
            {gridLocator}
          </div>
          <div className="text-[10px] text-gray-400 font-mono">
            {formatCoord(cluster.center.lat, true)},{" "}
            {formatCoord(cluster.center.lon, false)}
          </div>
        </div>

        {/* Scrollable spot list */}
        <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
          {sortedSpots.map((spot, index) => {
            const spotTime =
              spot.time instanceof Date ? spot.time : new Date(spot.time);
            const modeColor = getModeColor(spot.mode);
            const ageInfo = getSpotAgeInfo(spotTime);
            const ageBadgeColors = getAgeBadgeColors(ageInfo.ageCategory);
            const sourceColors = SPOT_SOURCE_COLORS[spot.source];

            return (
              <button
                type="button"
                key={spot.id || index}
                onClick={() => onSpotSelect(spot)}
                className={`group w-full px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400/60 ${
                  index < sortedSpots.length - 1
                    ? "border-b border-white/5"
                    : ""
                }`}
                aria-label={`View details for ${spot.dx}`}
              >
                {/* Line 1: Callsign + Frequency + Band pill */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-mono font-bold text-xs truncate flex-shrink-0"
                    style={{ color: modeColor }}
                    title={spot.dx}
                  >
                    {spot.dx}
                  </span>
                  <span className="text-xs font-mono text-white flex-shrink-0">
                    {formatFrequency(spot.frequency)}
                  </span>
                  {spot.band && (
                    <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-white/10 text-gray-300 flex-shrink-0">
                      {spot.band}
                    </span>
                  )}
                </div>

                {/* Line 2: Mode pill + Source badge + Age badge + SNR */}
                <div className="flex items-center gap-1.5 mt-1">
                  {spot.mode && (
                    <span
                      className="px-1 py-0.5 rounded text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: modeColor }}
                    >
                      {spot.mode}
                    </span>
                  )}
                  {sourceColors && (
                    <span
                      className="px-1 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                      style={{
                        backgroundColor: sourceColors.bgColor,
                        color: sourceColors.color,
                      }}
                    >
                      {spot.source}
                    </span>
                  )}
                  <span
                    className={`px-1 py-0.5 rounded text-[9px] font-medium flex-shrink-0 border ${ageBadgeColors.bg} ${ageBadgeColors.text} ${ageBadgeColors.border}`}
                  >
                    {formatSpotAge(spotTime)}
                  </span>
                  {spot.snr !== undefined && (
                    <span className="text-[10px] text-cyan-400 flex-shrink-0">
                      {spot.snr} dB
                    </span>
                  )}
                  <span className="ml-auto text-[9px] font-medium text-gray-600 transition-colors group-hover:text-cyan-400">
                    Details →
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            {modeDistribution.map((m, i) => (
              <span key={m.mode}>
                {i > 0 ? ", " : ""}
                {m.mode}: {m.count}
              </span>
            ))}
          </span>
          <span className="text-[10px] text-gray-500">
            {uniqueBands.size} band{uniqueBands.size !== 1 ? "s" : ""}
            {newestSpotAge ? ` \u2022 Latest: ${newestSpotAge}` : ""}
          </span>
        </div>
      </div>
    </>
  );

  return createPortal(popoverContent, document.body);
}

ClusterDetailPopover.displayName = "ClusterDetailPopover";

export default ClusterDetailPopover;
