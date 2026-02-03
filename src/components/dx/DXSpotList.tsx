/**
 * DXSpotList Component
 *
 * Displays a scrollable list of DX cluster spots with filtering controls.
 * Features glassmorphism styling consistent with the rest of the app.
 * Includes worked status indicators and alert highlighting.
 */

import { useMemo, useCallback, useState, useEffect } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { useDXCluster, useDXSpotStats } from "@/hooks/useDXCluster";
import { useLogbook } from "@/hooks/useLogbook";
import {
  useDXStore,
  selectAvailableBands,
  selectAvailableModes,
  AVAILABLE_SOURCES,
} from "@/stores/dxStore";
import { getBandColor } from "@/lib/api/dxcluster";
import { getAllAlertRules } from "@/lib/db/alertStore";
import { matchesRule } from "@/lib/utils/alertMatcher";
import type { DXSpot, SpotSourceType } from "@/types/dxcluster";
import type { AlertRule } from "@/lib/db/types";
import {
  SPOT_SOURCE_COLORS,
  type SpotSource,
  type LiveSpot,
} from "@/types/livespot";
import { SpotBadge } from "./SpotBadge";
import { useUserStore } from "@/stores/userStore";
import { calculateGreatCircleDistance } from "@/lib/utils/bands";

/**
 * Format time for display (HH:MM UTC)
 */
function formatTime(date: Date): string {
  return date.toISOString().substring(11, 16);
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
  distanceKm: number | null;
  onSelect: (spot: DXSpot) => void;
  onHover: (spot: DXSpot | null) => void;
  onGridClick?: (grid: string) => void;
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
  distanceKm,
  onSelect,
  onHover,
  onGridClick,
}: SpotRowProps) {
  const bandColor = getBandColor(spot.band || "");
  const minutesAgo = getMinutesAgo(spot.time);

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

  // Build row classes with alert highlight
  const rowClasses = useMemo(() => {
    const base =
      "grid grid-cols-[50px_60px_1fr_55px_70px_1fr] gap-2 px-3 py-2 cursor-pointer transition-all duration-150";

    if (isSelected) {
      return `${base} bg-plasma-orange/20 border-l-2 border-plasma-orange`;
    }

    if (isAlertMatch) {
      return `${base} bg-alert-red/10 border-l-2 border-alert-red animate-pulse`;
    }

    if (isHovered) {
      return `${base} bg-white/5`;
    }

    return `${base} hover:bg-white/5`;
  }, [isSelected, isHovered, isAlertMatch]);

  // Determine which badge to show for worked status
  const workedBadge = useMemo(() => {
    if (!workedStatus.isWorked) {
      // Never worked - show NEW badge
      return (
        <SpotBadge type="new" title="New callsign - never worked before" />
      );
    }
    if (!workedStatus.workedOnBand) {
      // Worked but not on this band - show BAND badge
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

  return (
    <div
      className={rowClasses}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="row"
    >
      {/* Time */}
      <div
        className="text-gray-400 text-xs font-mono"
        title={`${minutesAgo}m ago`}
      >
        {formatTime(spot.time)}
      </div>

      {/* Frequency & Band */}
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
}: FilterControlsProps) {
  return (
    <div className="space-y-3 mb-4">
      {/* Search row - callsign search and grid filter */}
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
      </div>

      {/* Time range selector */}
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
          const bandColor = getBandColor(band);
          return (
            <button
              key={band}
              onClick={() => onBandToggle(band)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`}
              style={{
                backgroundColor: isActive ? bandColor.bgColor : "transparent",
                color: bandColor.color,
                border: `1px solid ${bandColor.color}40`,
              }}
            >
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
}: DXSpotListProps) {
  const { spots, isLoading, isFetching, refetch, lastUpdated } = useDXCluster();
  const {
    selectedSpot,
    setSelectedSpot,
    hoveredSpot,
    setHoveredSpot,
    filters,
    updateFilter,
  } = useDXStore();
  const stats = useDXSpotStats();

  // Get user's station location for distance calculation
  const { station } = useUserStore();

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
      setSelectedSpot(selectedSpot?.id === spot.id ? null : spot);
    },
    [selectedSpot, setSelectedSpot],
  );

  // Count alert matches for display
  const alertMatchCount = alertMatchSet.size;

  return (
    <Card className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              DX CLUSTER
            </h2>
            <span className="text-xs text-gray-500">{spots.length} spots</span>
            {alertMatchCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-alert-red/20 text-alert-red border border-alert-red/30 animate-pulse">
                {alertMatchCount} alert{alertMatchCount !== 1 ? "s" : ""}
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
        />
      )}

      {/* Column Headers */}
      <div
        className="grid grid-cols-[50px_60px_1fr_55px_70px_1fr] gap-2 px-3 py-2 border-b border-white/10 text-xs font-semibold text-gray-400 uppercase tracking-wider"
        role="row"
      >
        <div>Time</div>
        <div>Band</div>
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
        {isLoading && spots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : spots.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            No spots match your filters
          </div>
        ) : (
          spots.map((spot) => (
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
              distanceKm={distanceMap.get(spot.id) ?? null}
              onSelect={handleSelectSpot}
              onHover={setHoveredSpot}
              onGridClick={handleGridFilterChange}
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
    </Card>
  );
}

DXSpotList.displayName = "DXSpotList";

export default DXSpotList;
