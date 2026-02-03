/**
 * DXSpotList Component
 *
 * Displays a scrollable list of DX cluster spots with filtering controls.
 * Features glassmorphism styling consistent with the rest of the app.
 * Includes worked status indicators and alert highlighting.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { useDXCluster, useDXSpotStats } from "@/hooks/useDXCluster";
import { useLogbook } from "@/hooks/useLogbook";
import {
  useDXStore,
  selectAvailableBands,
  selectAvailableModes,
  AVAILABLE_SOURCES,
} from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useWatchStore } from "@/stores/watchStore";
import { getBandColor } from "@/lib/api/dxcluster";
import { getAllAlertRules } from "@/lib/db/alertStore";
import { matchesRule } from "@/lib/utils/alertMatcher";
import { gridToLatLon } from "@/lib/utils/grid";
import type { DXSpot, SpotSourceType } from "@/types/dxcluster";
import type { AlertRule } from "@/lib/db/types";
import {
  SPOT_SOURCE_COLORS,
  type SpotSource,
  type LiveSpot,
} from "@/types/livespot";
import { SpotBadge } from "./SpotBadge";
import {
  SpotContextMenu,
  type SpotContextAction,
} from "@/components/map/SpotContextMenu";
import { useUserStore, useSpotAgePrefs } from "@/stores/userStore";
import { calculateGreatCircleDistance } from "@/lib/utils/bands";
import {
  getSpotAgeInfo,
  formatSpotAge,
  getShortAgeLabel,
  getAgeBadgeColors,
} from "@/components/map/LiveSpotArcs";

/**
 * Format time for display (HH:MM UTC)
 */
function formatTime(date: Date): string {
  return date.toISOString().substring(11, 16);
}

/**
 * Format frequency for display
 * @param freqKHz - Frequency in kHz
 * @param format - Display format ('mhz' or 'khz')
 * @returns Formatted frequency string
 */
function formatFrequency(
  freqKHz: number,
  format: "mhz" | "khz" = "mhz",
): string {
  if (format === "mhz") {
    return (freqKHz / 1000).toFixed(3); // "14.195"
  }
  return freqKHz.toFixed(1); // "14195.0"
}

/**
 * Calculate minutes ago from now
 */
function getMinutesAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 60000);
}

/**
 * Worked status information for a callsign
 */
interface WorkedStatus {
  /** Whether the callsign has ever been worked */
  isWorked: boolean;
  /** Whether worked on the current spot's band */
  workedOnBand: boolean;
  /** List of bands the callsign has been worked on */
  workedBands: string[];
}

interface SpotRowProps {
  spot: DXSpot;
  isSelected: boolean;
  isHovered: boolean;
  workedStatus: WorkedStatus;
  isAlertMatch: boolean;
  isNeeded: boolean;
  distanceKm: number | null;
  onSelect: (spot: DXSpot) => void;
  onHover: (spot: DXSpot | null) => void;
  onContextMenu?: (spot: DXSpot, position: { x: number; y: number }) => void;
  onGridClick?: (grid: string) => void;
  onFrequencyCopied?: (frequency: number) => void;
  /** Whether to show the age column */
  showAgeColumn?: boolean;
  /** Whether age-based row opacity is enabled */
  ageVisualizationEnabled?: boolean;
}

/**
 * Individual spot row component with worked status and alert indicators
 */
/**
 * Format distance for display (e.g., "1,234 km" or "12,345 km")
 */
function formatDistance(km: number | null): string {
  if (km === null) return "—";
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km / 100) / 10}k km`;
}

function SpotRow({
  spot,
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
  onFrequencyCopied,
  showAgeColumn = true,
  ageVisualizationEnabled = true,
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
        }, 1500);
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
        // Use 4-char prefix for broader match
        const gridPrefix = spot.dxGrid.slice(0, 4);
        onGridClick(gridPrefix);
      }
    },
    [spot.dxGrid, onGridClick],
  );

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

  // Build row classes with alert highlight, needed highlight, and age-based opacity
  const rowClasses = useMemo(() => {
    // Grid columns: Time, Age (optional), Band, Freq, DX, Dist, Spotter, Info
    const gridCols = showAgeColumn
      ? "grid-cols-[50px_40px_60px_70px_1fr_55px_70px_1fr]"
      : "grid-cols-[50px_60px_70px_1fr_55px_70px_1fr]";
    const base = `grid ${gridCols} gap-2 px-3 py-2 cursor-pointer transition-all duration-150`;

    if (isSelected) {
      return `${base} bg-plasma-orange/20 border-l-2 border-plasma-orange`;
    }

    if (isAlertMatch) {
      return `${base} bg-alert-red/10 border-l-2 border-alert-red animate-pulse`;
    }

    // Highlight needed spots with a subtle gold/yellow left border
    if (isNeeded) {
      if (isHovered) {
        return `${base} bg-yellow-500/10 border-l-2 border-yellow-500/70`;
      }
      return `${base} bg-yellow-500/5 border-l-2 border-yellow-500/50 hover:bg-yellow-500/10`;
    }

    if (isHovered) {
      return `${base} bg-white/5`;
    }

    return `${base} hover:bg-white/5`;
  }, [isSelected, isHovered, isAlertMatch, isNeeded, showAgeColumn]);

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

  return (
    <div
      className={rowClasses}
      style={rowStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      role="row"
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

      {/* Band */}
      <div className="flex items-center gap-1.5">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
          style={{
            backgroundColor: bandColor.bgColor,
            color: bandColor.color,
          }}
        >
          {spot.band}
        </span>
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
            title={`Filter by grid ${spot.dxGrid.slice(0, 4)}`}
          >
            {spot.dxGrid.slice(0, 4)}
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
        <span className="truncate" title={spot.comment}>
          {spot.comment}
        </span>
      </div>
    </div>
  );
}

interface FilterControlsProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  gridFilter: string;
  onGridFilterChange: (grid: string) => void;
  maxAge: number;
  onMaxAgeChange: (age: number) => void;
  selectedBands: string[];
  onBandToggle: (band: string) => void;
  selectedModes: string[];
  onModeToggle: (mode: string) => void;
  selectedSources: SpotSourceType[];
  onSourceToggle: (source: SpotSourceType) => void;
  availableBands: string[];
  availableModes: string[];
  // Band Sync Mode (Feature 2.3)
  syncMode: boolean;
  syncedBand: string | null;
  onSyncToggle: () => void;
  // Needed filter (Feature 2.1)
  neededOnly: boolean;
  onNeededOnlyToggle: () => void;
  sortByNeeded: boolean;
  onSortByNeededToggle: () => void;
  neededCount: number;
}

/** Time range options in minutes */
const TIME_RANGE_OPTIONS = [
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
];

/**
 * Filter controls component
 */
function FilterControls({
  searchText,
  onSearchChange,
  gridFilter,
  onGridFilterChange,
  maxAge,
  onMaxAgeChange,
  selectedBands,
  onBandToggle,
  selectedModes,
  onModeToggle,
  selectedSources,
  onSourceToggle,
  availableBands,
  availableModes,
  syncMode,
  syncedBand,
  onSyncToggle,
  neededOnly,
  onNeededOnlyToggle,
  sortByNeeded,
  onSortByNeededToggle,
  neededCount,
}: FilterControlsProps) {
  return (
    <div className="space-y-3 mb-4">
      {/* Search row - callsign search, grid filter, and sync toggle */}
      <div className="flex gap-2">
        {/* Callsign search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search callsigns..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
          />
          {searchText && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Grid locator filter */}
        <div className="relative w-28">
          <input
            type="text"
            placeholder="Grid..."
            value={gridFilter}
            onChange={(e) => onGridFilterChange(e.target.value.toUpperCase())}
            maxLength={6}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 font-mono uppercase"
            title="Filter by Maidenhead grid locator (e.g., CN87, FN31)"
          />
          {gridFilter && (
            <button
              onClick={() => onGridFilterChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
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
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Band Sync Toggle (Feature 2.3) */}
        <button
          onClick={onSyncToggle}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            syncMode
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={
            syncMode
              ? `Sync Mode ON${syncedBand ? ` - Synced to ${syncedBand}` : " - Click a spot to sync"}`
              : "Enable Band Sync - links filtering across all views"
          }
        >
          {/* Chain/Link icon */}
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <span>Sync</span>
          {syncMode && syncedBand && (
            <span className="text-xs bg-cyan-500/30 px-1.5 py-0.5 rounded">
              {syncedBand}
            </span>
          )}
        </button>

        {/* Needed Only Toggle (Feature 2.1) */}
        <button
          onClick={onNeededOnlyToggle}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            neededOnly
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={
            neededOnly
              ? "Showing needed spots only - Click to show all"
              : "Show only needed spots (not yet worked)"
          }
        >
          {/* Star icon */}
          <svg
            className="w-4 h-4"
            fill={neededOnly ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
          <span>Needed</span>
          {neededCount > 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                neededOnly
                  ? "bg-yellow-500/30"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {neededCount}
            </span>
          )}
        </button>
      </div>

      {/* Time range selector and sort options */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            Time:
          </span>
          <div className="flex gap-1">
            {TIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onMaxAgeChange(option.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                  maxAge === option.value
                    ? "bg-cyan-500/30 text-cyan-400 border border-cyan-500/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort by Needed toggle (Feature 2.1) */}
        <button
          onClick={onSortByNeededToggle}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
            sortByNeeded
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
              : "bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300"
          }`}
          title={
            sortByNeeded
              ? "Needed spots sorted to top"
              : "Click to sort needed spots to top"
          }
        >
          <svg
            className="w-3 h-3"
            fill={sortByNeeded ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
            />
          </svg>
          <span>Sort Needed</span>
        </button>
      </div>

      {/* Source filters */}
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_SOURCES.map((source) => {
          const isActive =
            selectedSources.length === 0 || selectedSources.includes(source);
          const sourceColor = SPOT_SOURCE_COLORS[source as SpotSource];
          return (
            <button
              key={source}
              onClick={() => onSourceToggle(source)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`}
              style={{
                backgroundColor: isActive ? sourceColor.bgColor : "transparent",
                color: sourceColor.color,
                border: `1px solid ${sourceColor.color}40`,
              }}
            >
              {source}
            </button>
          );
        })}
      </div>

      {/* Band filters */}
      <div className="flex flex-wrap gap-1.5">
        {availableBands.map((band) => {
          const isActive =
            selectedBands.length === 0 || selectedBands.includes(band);
          const isSynced = syncMode && syncedBand === band;
          const bandColor = getBandColor(band);
          return (
            <button
              key={band}
              onClick={() => onBandToggle(band)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
              } ${isSynced ? "ring-2 ring-cyan-400 ring-offset-1 ring-offset-nebula-blue" : ""}`}
              style={{
                backgroundColor: isActive ? bandColor.bgColor : "transparent",
                color: bandColor.color,
                border: `1px solid ${isSynced ? "#22d3ee" : `${bandColor.color}40`}`,
              }}
              title={isSynced ? `Synced to ${band}` : band}
            >
              {isSynced && (
                <span className="mr-0.5" aria-hidden="true">
                  *
                </span>
              )}
              {band}
            </button>
          );
        })}
      </div>

      {/* Mode filters */}
      <div className="flex flex-wrap gap-1.5">
        {availableModes.map((mode) => {
          const isActive =
            selectedModes.length === 0 || selectedModes.includes(mode);
          return (
            <button
              key={mode}
              onClick={() => onModeToggle(mode)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all border border-white/20 ${
                isActive
                  ? "bg-white/10 text-white"
                  : "bg-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface DXSpotListProps {
  /** Maximum height of the list container */
  maxHeight?: string;
  /** Show filter controls */
  showFilters?: boolean;
  /** Show header */
  showHeader?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when expand button is clicked */
  onExpand?: () => void;
  /** Callback when research grid action is triggered from context menu */
  onResearchGrid?: (grid: string) => void;
}

/**
 * DXSpotList Component
 *
 * Displays a scrollable, filterable list of DX cluster spots.
 * Includes worked status indicators from logbook and alert highlighting.
 */
export function DXSpotList({
  maxHeight = "400px",
  showFilters = true,
  showHeader = true,
  className = "",
  onExpand,
  onResearchGrid,
}: DXSpotListProps) {
  const { spots, isLoading, isFetching, refetch, lastUpdated } = useDXCluster();
  const {
    selectedSpot,
    setSelectedSpot,
    hoveredSpot,
    setHoveredSpot,
    filters,
    updateFilter,
    syncMode,
    syncedBand,
    toggleSyncMode,
    setSyncedBand,
    hideSpot,
  } = useDXStore();
  const stats = useDXSpotStats();

  // Context menu state (Feature 2.6)
  const [contextMenu, setContextMenu] = useState<{
    spot: DXSpot;
    position: { x: number; y: number };
  } | null>(null);

  // Get map store for setting targets
  const { setTarget } = useMapStore();

  // Get watch store for watch actions
  const watchStore = useWatchStore();

  // Handle context menu open
  const handleContextMenu = useCallback(
    (spot: DXSpot, position: { x: number; y: number }) => {
      setContextMenu({ spot, position });
    },
    [],
  );

  // Handle context menu close
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle context menu action (Feature 2.6)
  const handleContextAction = useCallback(
    (action: SpotContextAction, spot: DXSpot) => {
      switch (action) {
        case "setTarget": {
          // Set the spot's location as the map target
          if (spot.dxLat != null && spot.dxLon != null) {
            setTarget({
              lat: spot.dxLat,
              lon: spot.dxLon,
              grid: spot.dxGrid || undefined,
              name: spot.dx,
            });
          } else if (spot.dxGrid) {
            // Fall back to grid conversion
            const coords = gridToLatLon(spot.dxGrid);
            if (coords) {
              setTarget({
                lat: coords.lat,
                lon: coords.lon,
                grid: spot.dxGrid,
                name: spot.dx,
              });
            }
          }
          break;
        }
        case "researchGrid": {
          // Open grid research panel for this grid
          if (spot.dxGrid && onResearchGrid) {
            onResearchGrid(spot.dxGrid);
          }
          break;
        }
        case "watchCallsign": {
          // Add a watch for this callsign
          watchStore.addWatch("callsign", spot.dx, `Callsign: ${spot.dx}`);
          break;
        }
        case "watchGrid": {
          // Add a watch for the 4-char grid prefix
          if (spot.dxGrid) {
            const gridPrefix = spot.dxGrid.slice(0, 4);
            watchStore.addWatch("grid", gridPrefix, `Grid: ${gridPrefix}`);
          }
          break;
        }
        case "copyFrequency": {
          // Copy frequency to clipboard
          const freqKhz = spot.frequency.toFixed(1);
          navigator.clipboard.writeText(freqKhz).catch(console.error);
          break;
        }
        case "copyCallsign": {
          // Copy callsign to clipboard
          navigator.clipboard.writeText(spot.dx).catch(console.error);
          break;
        }
        case "openQRZ": {
          // Open QRZ page for this callsign
          window.open(`https://www.qrz.com/db/${spot.dx}`, "_blank");
          break;
        }
        case "openClubLog": {
          // Open ClubLog search for this callsign
          window.open(`https://clublog.org/logsearch/${spot.dx}`, "_blank");
          break;
        }
        case "hideSpot": {
          // Hide this spot from the list
          hideSpot(spot.id);
          break;
        }
      }
    },
    [setTarget, watchStore, hideSpot, onResearchGrid],
  );

  // Get user's station location for distance calculation
  const { station } = useUserStore();

  // Get spot age visualization preferences
  const spotAgePrefs = useSpotAgePrefs();

  // Get logbook data for worked status
  const { isWorked, getWorkedBands } = useLogbook();

  // Load alert rules for alert matching
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadRules() {
      try {
        const rules = await getAllAlertRules();
        if (mounted) {
          setAlertRules(rules);
        }
      } catch (err) {
        console.error("Failed to load alert rules:", err);
      }
    }

    loadRules();

    // Reload rules periodically (every 30 seconds)
    const interval = setInterval(loadRules, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Get available bands and modes from store
  const store = useDXStore();
  const availableBands = useMemo(() => selectAvailableBands(store), [store]);
  const availableModes = useMemo(() => selectAvailableModes(store), [store]);

  // Pre-compute worked status for all spots
  const workedStatusMap = useMemo(() => {
    const map = new Map<string, WorkedStatus>();

    for (const spot of spots) {
      const worked = isWorked(spot.dx);
      const workedBands = getWorkedBands(spot.dx);
      const workedOnBand = spot.band ? workedBands.includes(spot.band) : false;

      map.set(spot.id, {
        isWorked: worked,
        workedOnBand,
        workedBands,
      });
    }

    return map;
  }, [spots, isWorked, getWorkedBands]);

  // Pre-compute distance for all spots (from user's QTH to DX station)
  const distanceMap = useMemo(() => {
    const map = new Map<string, number | null>();

    if (!station?.lat || !station?.lon) {
      // No station location - all distances unknown
      for (const spot of spots) {
        map.set(spot.id, null);
      }
      return map;
    }

    for (const spot of spots) {
      if (spot.dxLat != null && spot.dxLon != null) {
        const distance = calculateGreatCircleDistance(
          station.lat,
          station.lon,
          spot.dxLat,
          spot.dxLon,
        );
        map.set(spot.id, distance);
      } else {
        map.set(spot.id, null);
      }
    }

    return map;
  }, [spots, station]);

  // Pre-compute alert matches for all spots
  const alertMatchSet = useMemo(() => {
    const matchSet = new Set<string>();

    // Only process if we have enabled rules
    const enabledRules = alertRules.filter((r) => r.enabled);
    if (enabledRules.length === 0) {
      return matchSet;
    }

    for (const spot of spots) {
      // Convert DXSpot to LiveSpot format for matching
      // LiveSpot extends DXSpot, so we can cast with a source
      const liveSpot: LiveSpot = {
        ...spot,
        source: "Cluster" as const,
      };

      // Check if any enabled rule matches this spot
      for (const rule of enabledRules) {
        if (matchesRule(liveSpot, rule)) {
          matchSet.add(spot.id);
          break; // One match is enough
        }
      }
    }

    return matchSet;
  }, [spots, alertRules]);

  const handleSearchChange = useCallback(
    (text: string) => {
      updateFilter("searchText", text);
    },
    [updateFilter],
  );

  const handleBandToggle = useCallback(
    (band: string) => {
      const currentBands = filters.bands || [];
      const newBands = currentBands.includes(band)
        ? currentBands.filter((b) => b !== band)
        : [...currentBands, band];
      updateFilter("bands", newBands);
    },
    [filters.bands, updateFilter],
  );

  const handleModeToggle = useCallback(
    (mode: string) => {
      const currentModes = filters.modes || [];
      const newModes = currentModes.includes(mode)
        ? currentModes.filter((m) => m !== mode)
        : [...currentModes, mode];
      updateFilter("modes", newModes);
    },
    [filters.modes, updateFilter],
  );

  const handleSourceToggle = useCallback(
    (source: SpotSourceType) => {
      const currentSources = filters.sources || [];
      const newSources = currentSources.includes(source)
        ? currentSources.filter((s) => s !== source)
        : [...currentSources, source];
      updateFilter("sources", newSources);
    },
    [filters.sources, updateFilter],
  );

  const handleGridFilterChange = useCallback(
    (grid: string) => {
      updateFilter("gridFilter", grid);
    },
    [updateFilter],
  );

  const handleMaxAgeChange = useCallback(
    (age: number) => {
      updateFilter("maxAge", age);
    },
    [updateFilter],
  );

  const handleSelectSpot = useCallback(
    (spot: DXSpot) => {
      const isDeselecting = selectedSpot?.id === spot.id;
      setSelectedSpot(isDeselecting ? null : spot);

      // When sync mode is enabled, set the synced band to the spot's band
      if (syncMode && !isDeselecting && spot.band) {
        setSyncedBand(spot.band);
      }
    },
    [selectedSpot, setSelectedSpot, syncMode, setSyncedBand],
  );

  // Count alert matches for display
  const alertMatchCount = alertMatchSet.size;

  // Pre-compute needed status for all spots (Feature 2.1)
  // A spot is "needed" if it's not worked at all OR not worked on this band
  const neededStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const spot of spots) {
      const workedStatus = workedStatusMap.get(spot.id);
      // Spot is needed if never worked OR not worked on this band
      const isNeeded = workedStatus
        ? !workedStatus.isWorked || !workedStatus.workedOnBand
        : true;
      map.set(spot.id, isNeeded);
    }

    return map;
  }, [spots, workedStatusMap]);

  // Count needed spots for display
  const neededCount = useMemo(() => {
    let count = 0;
    for (const isNeeded of neededStatusMap.values()) {
      if (isNeeded) count++;
    }
    return count;
  }, [neededStatusMap]);

  // Handler for neededOnly filter toggle (Feature 2.1)
  const handleNeededOnlyToggle = useCallback(() => {
    updateFilter("neededOnly", !filters.neededOnly);
  }, [filters.neededOnly, updateFilter]);

  // Handler for sortByNeeded toggle (Feature 2.1)
  const handleSortByNeededToggle = useCallback(() => {
    updateFilter("sortByNeeded", !filters.sortByNeeded);
  }, [filters.sortByNeeded, updateFilter]);

  // Apply needed filtering and sorting (Feature 2.1)
  // This is done at component level because it requires logbook data
  const displaySpots = useMemo(() => {
    let result = [...spots];

    // Filter to needed only if enabled
    if (filters.neededOnly) {
      result = result.filter((spot) => neededStatusMap.get(spot.id) === true);
    }

    // Sort needed spots to top if enabled
    if (filters.sortByNeeded) {
      result.sort((a, b) => {
        const aNeeded = neededStatusMap.get(a.id) ? 1 : 0;
        const bNeeded = neededStatusMap.get(b.id) ? 1 : 0;
        // Sort needed spots first (descending), then by time (newest first)
        if (bNeeded !== aNeeded) return bNeeded - aNeeded;
        return b.time.getTime() - a.time.getTime();
      });
    }

    return result;
  }, [spots, filters.neededOnly, filters.sortByNeeded, neededStatusMap]);

  return (
    <Card
      className={`h-full flex flex-col ${className} ${
        syncMode ? "ring-2 ring-cyan-500/50 ring-inset" : ""
      }`}
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              DX CLUSTER
            </h2>
            <span className="text-xs text-gray-500">
              {displaySpots.length}
              {filters.neededOnly && displaySpots.length !== spots.length
                ? ` / ${spots.length}`
                : ""}{" "}
              spots
            </span>
            {syncMode && syncedBand && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                {syncedBand}
              </span>
            )}
            {alertMatchCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-alert-red/20 text-alert-red border border-alert-red/30 animate-pulse">
                {alertMatchCount} alert{alertMatchCount !== 1 ? "s" : ""}
              </span>
            )}
            {neededCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  stroke="none"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
                </svg>
                {neededCount} needed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(isLoading || isFetching) && <LoadingSpinner size="sm" />}
            <button
              onClick={refetch}
              className="p-1.5 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/5"
              title="Refresh spots"
            >
              <svg
                className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-1.5 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/5"
                title="Expand"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Controls */}
      {showFilters && (
        <FilterControls
          searchText={filters.searchText || ""}
          onSearchChange={handleSearchChange}
          gridFilter={filters.gridFilter || ""}
          onGridFilterChange={handleGridFilterChange}
          maxAge={filters.maxAge || 30}
          onMaxAgeChange={handleMaxAgeChange}
          selectedBands={filters.bands || []}
          onBandToggle={handleBandToggle}
          selectedModes={filters.modes || []}
          onModeToggle={handleModeToggle}
          selectedSources={filters.sources || []}
          onSourceToggle={handleSourceToggle}
          availableBands={availableBands}
          availableModes={availableModes}
          syncMode={syncMode}
          syncedBand={syncedBand}
          onSyncToggle={toggleSyncMode}
          neededOnly={filters.neededOnly || false}
          onNeededOnlyToggle={handleNeededOnlyToggle}
          sortByNeeded={filters.sortByNeeded || false}
          onSortByNeededToggle={handleSortByNeededToggle}
          neededCount={neededCount}
        />
      )}

      {/* Column Headers */}
      <div
        className={`grid ${spotAgePrefs.showAgeColumn ? "grid-cols-[50px_40px_60px_70px_1fr_55px_70px_1fr]" : "grid-cols-[50px_60px_70px_1fr_55px_70px_1fr]"} gap-2 px-3 py-2 border-b border-white/10 text-xs font-semibold text-gray-400 uppercase tracking-wider`}
        role="row"
      >
        <div>Time</div>
        {spotAgePrefs.showAgeColumn && <div>Age</div>}
        <div>Band</div>
        <div>Freq</div>
        <div>DX</div>
        <div className="text-right">Dist</div>
        <div>Spotter</div>
        <div>Info</div>
      </div>

      {/* Spot List */}
      <div
        className="flex-1 overflow-y-auto divide-y divide-white/5"
        style={{ maxHeight }}
        role="table"
        aria-label="DX Spots"
      >
        {isLoading && displaySpots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : displaySpots.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            No spots match your filters
          </div>
        ) : (
          displaySpots.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              isSelected={selectedSpot?.id === spot.id}
              isHovered={hoveredSpot?.id === spot.id}
              workedStatus={
                workedStatusMap.get(spot.id) || {
                  isWorked: false,
                  workedOnBand: false,
                  workedBands: [],
                }
              }
              isAlertMatch={alertMatchSet.has(spot.id)}
              isNeeded={neededStatusMap.get(spot.id) ?? true}
              distanceKm={distanceMap.get(spot.id) ?? null}
              onSelect={handleSelectSpot}
              onHover={setHoveredSpot}
              onContextMenu={handleContextMenu}
              onGridClick={handleGridFilterChange}
              showAgeColumn={spotAgePrefs.showAgeColumn}
              ageVisualizationEnabled={spotAgePrefs.enabled}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
        <div>
          {lastUpdated && <span>Updated {formatTime(lastUpdated)} UTC</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>{stats.total} total</span>
          {Object.keys(stats.byMode).length > 0 && (
            <span className="text-gray-600">
              Top:{" "}
              {Object.entries(stats.byMode).sort((a, b) => b[1] - a[1])[0]?.[0]}
            </span>
          )}
        </div>
      </div>

      {/* Context Menu (Feature 2.6) */}
      {contextMenu && (
        <SpotContextMenu
          spot={contextMenu.spot}
          position={contextMenu.position}
          onClose={handleContextMenuClose}
          onAction={handleContextAction}
        />
      )}
    </Card>
  );
}

DXSpotList.displayName = "DXSpotList";

export default DXSpotList;
