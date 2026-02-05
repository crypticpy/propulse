/**
 * DXSpotList Component
 *
 * Displays a scrollable list of DX cluster spots with filtering controls.
 * Features glassmorphism styling consistent with the rest of the app.
 * Includes worked status indicators and alert highlighting.
 *
 * This is the main orchestrator component that composes the modular pieces.
 */

import { useCallback, useState, useRef } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import { SpotContextMenu } from "@/components/map/SpotContextMenu";
import { SpotDetailPanel } from "../SpotDetailPanel";
import { SpotRow } from "./SpotRow";
import { FilterControls } from "./FilterControls";
import { useDXSpotListState } from "./useDXSpotListState";
import { formatTime } from "./utils";
import type { DXSpotListProps } from "./types";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpotSource } from "@/stores/dxStore";

/** Source badge styling map */
const SOURCE_BADGE_STYLES: Record<
  DXSpotSource,
  { label: string; bg: string; text: string; border: string; pulse: boolean }
> = {
  bridge: {
    label: "LIVE",
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    pulse: true,
  },
  rest: {
    label: "REST",
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
    pulse: false,
  },
  demo: {
    label: "DEMO",
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    border: "border-amber-500/30",
    pulse: false,
  },
};

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
  const spotSource = useDXStore((s) => s.spotSource);
  const state = useDXSpotListState(onResearchGrid);

  const {
    displaySpots,
    isLoading,
    isFetching,
    lastUpdated,
    stats,
    selectedSpot,
    hoveredSpot,
    contextMenu,
    highlightedSpotId,
    workedStatusMap,
    neededStatusMap,
    distanceMap,
    alertMatchSet,
    filters,
    availableBands,
    availableModes,
    syncMode,
    syncedBand,
    activeBandFilter,
    alertMatchCount,
    neededCount,
    totalSpots,
    spotAgePrefs,
    bandPresets,
    listContainerRef,
    handleSearchChange,
    handleBandToggle,
    handleBandBadgeClick,
    handleModeToggle,
    handleSourceToggle,
    handleGridFilterChange,
    handleMaxAgeChange,
    handleSelectSpot,
    handleNeededOnlyToggle,
    handleSortByNeededToggle,
    handleSavePreset,
    handleApplyPreset,
    handleDeletePreset,
    handleContextMenu,
    handleContextMenuClose,
    handleContextAction,
    toggleSyncMode,
    setHoveredSpot,
    refetch,
  } = state;

  // Quick action: set map target from row button
  const handleSetTarget = useCallback(
    (spot: DXSpot) => {
      handleContextAction("setTarget", spot);
    },
    [handleContextAction],
  );

  // Quick action: watch callsign from row button
  const handleWatchCallsign = useCallback(
    (spot: DXSpot) => {
      handleContextAction("watchCallsign", spot);
    },
    [handleContextAction],
  );

  // Quick action: hide spot from row button
  const handleHideSpot = useCallback(
    (spot: DXSpot) => {
      handleContextAction("hideSpot", spot);
    },
    [handleContextAction],
  );

  // --- QoL1: Keyboard-first DX spot navigation ---
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const spotListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const len = displaySpots.length;
      if (len === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, len - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        }
        case "PageDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 10, len - 1));
          break;
        }
        case "PageUp": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 10, 0));
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setFocusedIndex(len - 1);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < len) {
            const spot = displaySpots[focusedIndex];
            handleSelectSpot(spot);
            handleSetTarget(spot);
          }
          break;
        }
        case "w":
        case "W": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            handleWatchCallsign(displaySpots[focusedIndex]);
          }
          break;
        }
        case "b":
        case "B": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            handleSetTarget(displaySpots[focusedIndex]);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setFocusedIndex(-1);
          handleSelectSpot(null);
          break;
        }
      }
    },
    [
      displaySpots,
      focusedIndex,
      handleSelectSpot,
      handleSetTarget,
      handleWatchCallsign,
    ],
  );

  // Scroll focused row into view
  const scrollFocusedIntoView = useCallback((index: number) => {
    if (index < 0 || !spotListRef.current) return;
    const rows = spotListRef.current.querySelectorAll(
      '[role="row"]:not(:first-child)',
    );
    rows[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  // Effect: scroll when focused index changes
  const prevFocusedRef = useRef(focusedIndex);
  if (prevFocusedRef.current !== focusedIndex) {
    prevFocusedRef.current = focusedIndex;
    scrollFocusedIntoView(focusedIndex);
  }

  return (
    <Card
      className={`h-full flex flex-col ${className} ${
        syncMode ? "ring-2 ring-cyan-500/50 ring-inset" : ""
      }`}
    >
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
              DX CLUSTER
            </h2>
            <span className="text-xs text-gray-400">
              {displaySpots.length}
              {filters.neededOnly && displaySpots.length !== totalSpots
                ? ` / ${totalSpots}`
                : ""}{" "}
              spots
            </span>
            {/* Data source indicator badge */}
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border flex items-center gap-1 ${SOURCE_BADGE_STYLES[spotSource].bg} ${SOURCE_BADGE_STYLES[spotSource].text} ${SOURCE_BADGE_STYLES[spotSource].border}`}
            >
              {SOURCE_BADGE_STYLES[spotSource].pulse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
              )}
              {SOURCE_BADGE_STYLES[spotSource].label}
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
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/5"
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
                className="p-1.5 text-gray-400 hover:text-white transition-colors rounded hover:bg-white/5"
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
          bandPresets={bandPresets}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
        />
      )}

      {/* Spot List with sticky header — QoL1: keyboard navigable */}
      <div
        ref={(el) => {
          // Combine both refs
          (
            listContainerRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = el;
          (
            spotListRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = el;
        }}
        className="flex-1 overflow-y-auto divide-y divide-white/5 focus:outline-none"
        style={{ maxHeight }}
        role="table"
        aria-label="DX Spots"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-activedescendant={
          focusedIndex >= 0
            ? `spot-row-${displaySpots[focusedIndex]?.id}`
            : undefined
        }
      >
        {/* Column Headers - sticky at top of scroll container */}
        <div
          className={`sticky top-0 z-10 bg-nebula-blue grid ${spotAgePrefs.showAgeColumn ? "grid-cols-[46px_40px_52px_66px_1fr_50px_62px_1fr_56px]" : "grid-cols-[46px_52px_66px_1fr_50px_62px_1fr_56px]"} gap-1.5 px-2 py-1.5 border-b border-white/10 text-[10px] font-semibold text-gray-300 uppercase tracking-wider`}
          role="row"
          style={{ borderLeft: "3px solid transparent" }}
        >
          <div>Time</div>
          {spotAgePrefs.showAgeColumn && <div>Age</div>}
          <div>Band</div>
          <div>Freq</div>
          <div>DX</div>
          <div className="text-right">Dist-km</div>
          <div>Spotter</div>
          <div>Info</div>
          <div></div>
        </div>
        {isLoading && displaySpots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : displaySpots.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            No spots match your filters
          </div>
        ) : (
          displaySpots.map((spot, index) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              index={index}
              isSelected={selectedSpot?.id === spot.id}
              isHovered={hoveredSpot?.id === spot.id}
              isFocused={focusedIndex === index}
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
              onBandClick={handleBandBadgeClick}
              onSetTarget={handleSetTarget}
              onWatchCallsign={handleWatchCallsign}
              onHideSpot={handleHideSpot}
              showAgeColumn={spotAgePrefs.showAgeColumn}
              ageVisualizationEnabled={spotAgePrefs.enabled}
              activeBandFilter={activeBandFilter}
              isHighlighted={highlightedSpotId === spot.id}
            />
          ))
        )}
      </div>

      {/* Spot Detail Panel - shows when a spot is selected */}
      <SpotDetailPanel spot={selectedSpot} />

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
        <div>
          {lastUpdated && <span>Updated {formatTime(lastUpdated)} UTC</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>{stats.total} total</span>
          {Object.keys(stats.byMode).length > 0 && (
            <span className="text-gray-400">
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
