/**
 * DXSpotList Component
 *
 * Displays a scrollable list of DX cluster spots with filtering controls.
 * Features glassmorphism styling consistent with the rest of the app.
 * Includes worked status indicators and alert highlighting.
 *
 * This is the main orchestrator component that composes the modular pieces.
 */

import { Card, LoadingSpinner } from "@/components/ui";
import { SpotContextMenu } from "@/components/map/SpotContextMenu";
import { SpotRow } from "./SpotRow";
import { FilterControls } from "./FilterControls";
import { useDXSpotListState } from "./useDXSpotListState";
import { formatTime } from "./utils";
import type { DXSpotListProps } from "./types";

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
              {filters.neededOnly && displaySpots.length !== totalSpots
                ? ` / ${totalSpots}`
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
          bandPresets={bandPresets}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
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
        ref={listContainerRef}
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
          displaySpots.map((spot, index) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              index={index}
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
              onBandClick={handleBandBadgeClick}
              showAgeColumn={spotAgePrefs.showAgeColumn}
              ageVisualizationEnabled={spotAgePrefs.enabled}
              activeBandFilter={activeBandFilter}
              isHighlighted={highlightedSpotId === spot.id}
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
