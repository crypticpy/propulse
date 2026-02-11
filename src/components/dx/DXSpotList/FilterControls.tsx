/**
 * FilterControls Component
 *
 * Filter UI for the DXSpotList including search, time range, bands, modes, and sources.
 * Redesigned for compactness: single-row band+mode pills, collapsible filter panel,
 * band pills colored by BAND_COLORS.
 */

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { AVAILABLE_SOURCES } from "@/stores/dxStore";
import { SPOT_SOURCE_COLORS, type SpotSource } from "@/types/livespot";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { FilterControlsProps } from "./types";
import {
  TIME_RANGE_OPTIONS,
  MAX_BAND_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  MAX_GRID_INPUT_LENGTH,
} from "./constants";

/**
 * Count the number of active filters for the collapsed badge
 */
function countActiveFilters(props: {
  searchText: string;
  gridFilter: string;
  selectedBands: string[];
  selectedModes: string[];
  selectedSources: string[];
  neededOnly: boolean;
  syncMode: boolean;
  maxAge: number;
}): number {
  let count = 0;
  if (props.searchText) count++;
  if (props.gridFilter) count++;
  if (props.selectedBands.length > 0) count++;
  if (props.selectedModes.length > 0) count++;
  if (props.selectedSources.length > 0) count++;
  if (props.neededOnly) count++;
  if (props.syncMode) count++;
  if (props.maxAge !== 30) count++; // 30 is default
  return count;
}

/**
 * Filter controls component
 */
export const FilterControls = memo(function FilterControls({
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
  bandPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: FilterControlsProps) {
  // State for "Save Preset" input
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Delete confirmation state
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Collapsible state - collapsed by default for space efficiency
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Focus input when shown
  useEffect(() => {
    if (showSaveInput && saveInputRef.current) {
      saveInputRef.current.focus();
    }
  }, [showSaveInput]);

  // Handle save preset
  const handleSavePreset = useCallback(() => {
    if (presetName.trim()) {
      onSavePreset(presetName.trim());
      setPresetName("");
      setShowSaveInput(false);
    }
  }, [presetName, onSavePreset]);

  // Handle key press in save input
  const handleSaveKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSavePreset();
      } else if (e.key === "Escape") {
        setShowSaveInput(false);
        setPresetName("");
      }
    },
    [handleSavePreset],
  );

  // Count active filters for collapsed badge
  const activeFilterCount = useMemo(
    () =>
      countActiveFilters({
        searchText,
        gridFilter,
        selectedBands,
        selectedModes,
        selectedSources,
        neededOnly,
        syncMode,
        maxAge,
      }),
    [
      searchText,
      gridFilter,
      selectedBands,
      selectedModes,
      selectedSources,
      neededOnly,
      syncMode,
      maxAge,
    ],
  );

  // Collapsed view: compact filter bar with search and key toggles
  if (isCollapsed) {
    return (
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => setIsCollapsed(false)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            activeFilterCount > 0
              ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/40 hover:bg-plasma-orange/25"
              : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={`${activeFilterCount} active filter${activeFilterCount !== 1 ? "s" : ""} — click to expand`}
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
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-plasma-orange/30 text-plasma-orange min-w-[18px] text-center">
              {activeFilterCount}
            </span>
          )}
          <svg
            className="w-3 h-3 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* Quick access: search still visible when collapsed */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search callsigns..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
          />
          {searchText && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label="Clear search"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Grid locator - quick access when collapsed */}
        <div className="relative w-20">
          <input
            type="text"
            placeholder="Grid..."
            value={gridFilter}
            onChange={(e) => onGridFilterChange(e.target.value.toUpperCase())}
            maxLength={MAX_GRID_INPUT_LENGTH}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 font-mono uppercase"
            title="Filter by Maidenhead grid locator"
          />
          {gridFilter && (
            <button
              onClick={() => onGridFilterChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label="Clear grid filter"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 mb-3">
      {/* Row 1: Search, grid filter, sync, needed, collapse toggle */}
      <div className="flex gap-1.5 items-center">
        {/* Callsign search */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search callsigns..."
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-400 focus:outline-none focus:border-plasma-orange/50"
          />
          {searchText && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label="Clear search"
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

        {/* Grid locator filter */}
        <div className="relative w-24">
          <input
            type="text"
            placeholder="Grid..."
            value={gridFilter}
            onChange={(e) => onGridFilterChange(e.target.value.toUpperCase())}
            maxLength={MAX_GRID_INPUT_LENGTH}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500/50 font-mono uppercase"
            title="Filter by Maidenhead grid locator (e.g., CN87, FN31)"
          />
          {gridFilter && (
            <button
              onClick={() => onGridFilterChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label="Clear grid filter"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Band Sync Toggle (Feature 2.3) */}
        <button
          onClick={onSyncToggle}
          className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
            syncMode
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
              : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={
            syncMode
              ? `Sync Mode ON${syncedBand ? ` - Synced to ${syncedBand}` : " - Click a spot to sync"}`
              : "Enable Band Sync - links filtering across all views"
          }
          aria-pressed={syncMode}
          aria-label={`Band sync${syncMode ? ` - synced to ${syncedBand || "none"}` : ""}`}
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
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          {syncMode && syncedBand && (
            <span className="text-[9px] bg-cyan-500/30 px-1 py-0.5 rounded">
              {syncedBand}
            </span>
          )}
        </button>

        {/* Needed Only Toggle */}
        <button
          onClick={onNeededOnlyToggle}
          className={`flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
            neededOnly
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
              : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={
            neededOnly
              ? "Showing needed spots only - Click to show all"
              : "Show only needed spots (not yet worked)"
          }
          aria-pressed={neededOnly}
          aria-label={`Show needed spots only${neededCount > 0 ? ` (${neededCount} available)` : ""}`}
        >
          <svg
            className="w-3.5 h-3.5"
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
          {neededCount > 0 && (
            <span
              className={`text-[9px] px-1 py-0.5 rounded ${
                neededOnly
                  ? "bg-yellow-500/30"
                  : "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {neededCount}
            </span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          title="Collapse filters"
          aria-label="Collapse filter panel"
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
              d="M5 15l7-7 7 7"
            />
          </svg>
        </button>
      </div>

      {/* Row 2: Time range + sort by needed */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">
            Time:
          </span>
          <div className="flex gap-0.5">
            {TIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onMaxAgeChange(option.value)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
                  maxAge === option.value
                    ? "bg-cyan-500/30 text-cyan-400 border border-cyan-500/50"
                    : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
                }`}
                aria-pressed={maxAge === option.value}
                aria-label={`Show spots from last ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort by Needed toggle */}
        <button
          onClick={onSortByNeededToggle}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
            sortByNeeded
              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
              : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={
            sortByNeeded
              ? "Needed spots sorted to top"
              : "Click to sort needed spots to top"
          }
          aria-pressed={sortByNeeded}
          aria-label="Sort needed spots to top"
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

      {/* Row 3: Source filters + Band Presets on one line */}
      <div className="flex flex-wrap items-center gap-1">
        {/* Source filters */}
        {AVAILABLE_SOURCES.map((source) => {
          const isActive =
            selectedSources.length === 0 || selectedSources.includes(source);
          const sourceColor = SPOT_SOURCE_COLORS[source as SpotSource];
          return (
            <button
              key={source}
              onClick={() => onSourceToggle(source)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
                isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`}
              style={{
                backgroundColor: isActive ? sourceColor.bgColor : "transparent",
                color: sourceColor.color,
                border: `1px solid ${sourceColor.color}40`,
              }}
              aria-pressed={isActive}
              aria-label={`Filter by ${source} source`}
            >
              {source}
            </button>
          );
        })}

        {/* Separator */}
        <span className="w-px h-3 bg-white/10 mx-0.5" />

        {/* Band Presets (Q11) */}
        {bandPresets.map((preset) => (
          <div key={preset.id} className="group relative">
            <button
              onClick={() => onApplyPreset(preset.bands)}
              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 hover:border-purple-500/60 transition-all"
              title={`Apply preset: ${preset.bands.join(", ")}`}
            >
              {preset.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeletePresetId(preset.id);
              }}
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500/80 text-white text-[7px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500"
              title="Delete preset"
              aria-label={`Delete preset ${preset.name}`}
            >
              x
            </button>
          </div>
        ))}
        {selectedBands.length > 0 && bandPresets.length < MAX_BAND_PRESETS && (
          <>
            {showSaveInput ? (
              <div className="flex items-center gap-0.5">
                <input
                  ref={saveInputRef}
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={handleSaveKeyDown}
                  placeholder="Name..."
                  maxLength={MAX_PRESET_NAME_LENGTH}
                  className="w-20 px-1 py-0.5 rounded text-[9px] bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  className="px-1 py-0.5 rounded text-[9px] font-medium bg-purple-500/30 text-purple-300 border border-purple-500/50 hover:bg-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveInput(false);
                    setPresetName("");
                  }}
                  className="px-0.5 py-0.5 rounded text-[9px] text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="px-1.5 py-0.5 rounded text-[9px] font-medium text-purple-400/70 border border-dashed border-purple-500/40 hover:text-purple-300 hover:border-purple-500/60 transition-all"
                title={`Save current selection (${selectedBands.join(", ")}) as preset`}
              >
                + Save
              </button>
            )}
          </>
        )}
        {selectedBands.length > 0 && bandPresets.length >= MAX_BAND_PRESETS && (
          <span
            className="text-[8px] text-gray-400"
            title={`Maximum ${MAX_BAND_PRESETS} presets`}
          >
            (max)
          </span>
        )}
      </div>

      {/* Row 4: Band pills + Mode pills in single wrapping row */}
      <div className="flex flex-wrap gap-1 items-center">
        {/* Band filters - colored by BAND_COLORS */}
        {availableBands.map((band) => {
          const isActive =
            selectedBands.length === 0 || selectedBands.includes(band);
          const isSynced = syncMode && syncedBand === band;
          const bandHex =
            BAND_COLORS[band.toLowerCase()] ?? BAND_COLORS.default;
          return (
            <button
              key={band}
              onClick={() => onBandToggle(band)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${
                isSynced
                  ? "ring-1 ring-cyan-400 ring-offset-1 ring-offset-nebula-blue"
                  : ""
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: `${bandHex}33`,
                      color: bandHex,
                      border: `1px solid ${bandHex}`,
                    }
                  : {
                      backgroundColor: "transparent",
                      color: `${bandHex}88`,
                      border: `1px solid ${bandHex}30`,
                      opacity: 0.5,
                    }
              }
              title={isSynced ? `Synced to ${band}` : band}
              aria-pressed={isActive}
              aria-label={`Filter by ${band} band${isSynced ? " (synced)" : ""}`}
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

        {/* Separator between bands and modes */}
        {availableModes.length > 0 && (
          <span className="w-px h-3 bg-white/10 mx-0.5" />
        )}

        {/* Mode filters */}
        {availableModes.map((mode) => {
          const isActive =
            selectedModes.length === 0 || selectedModes.includes(mode);
          return (
            <button
              key={mode}
              onClick={() => onModeToggle(mode)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all border border-white/20 ${
                isActive
                  ? "bg-white/10 text-white"
                  : "bg-transparent text-gray-400 opacity-60 hover:text-gray-200 hover:opacity-80"
              }`}
              aria-pressed={isActive}
              aria-label={`Filter by ${mode} mode`}
            >
              {mode}
            </button>
          );
        })}
      </div>

      {/* Delete preset confirmation dialog */}
      <ConfirmDialog
        open={deletePresetId !== null}
        title="Delete Band Preset"
        message="Delete this band preset? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deletePresetId) onDeletePreset(deletePresetId);
          setDeletePresetId(null);
        }}
        onCancel={() => setDeletePresetId(null)}
      />
    </div>
  );
});

FilterControls.displayName = "FilterControls";
