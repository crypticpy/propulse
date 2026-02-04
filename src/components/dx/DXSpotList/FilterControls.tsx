/**
 * FilterControls Component
 *
 * Filter UI for the DXSpotList including search, time range, bands, modes, and sources.
 */

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { getBandColor } from "@/lib/api/dxcluster";
import { AVAILABLE_SOURCES } from "@/stores/dxStore";
import { SPOT_SOURCE_COLORS, type SpotSource } from "@/types/livespot";
import type { FilterControlsProps } from "./types";
import {
  TIME_RANGE_OPTIONS,
  MAX_BAND_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  MAX_GRID_INPUT_LENGTH,
} from "./constants";

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
  const saveInputRef = useRef<HTMLInputElement>(null);

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
              aria-label="Clear search"
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
            maxLength={MAX_GRID_INPUT_LENGTH}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 font-mono uppercase"
            title="Filter by Maidenhead grid locator (e.g., CN87, FN31)"
          />
          {gridFilter && (
            <button
              onClick={() => onGridFilterChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              aria-label="Clear grid filter"
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
          aria-pressed={syncMode}
          aria-label={`Band sync${syncMode ? ` - synced to ${syncedBand || "none"}` : ""}`}
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
          aria-pressed={neededOnly}
          aria-label={`Show needed spots only${neededCount > 0 ? ` (${neededCount} available)` : ""}`}
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
                aria-pressed={maxAge === option.value}
                aria-label={`Show spots from last ${option.label}`}
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
              aria-pressed={isActive}
              aria-label={`Filter by ${source} source`}
            >
              {source}
            </button>
          );
        })}
      </div>

      {/* Band Presets (Q11) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {bandPresets.map((preset) => (
          <div key={preset.id} className="group relative">
            <button
              onClick={() => onApplyPreset(preset.bands)}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 hover:border-purple-500/60 transition-all"
              title={`Apply preset: ${preset.bands.join(", ")}`}
            >
              {preset.name}
            </button>
            {/* Delete button - appears on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeletePreset(preset.id);
              }}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500/80 text-white text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500"
              title="Delete preset"
              aria-label={`Delete preset ${preset.name}`}
            >
              x
            </button>
          </div>
        ))}
        {/* Save current selection as preset */}
        {selectedBands.length > 0 && bandPresets.length < MAX_BAND_PRESETS && (
          <>
            {showSaveInput ? (
              <div className="flex items-center gap-1">
                <input
                  ref={saveInputRef}
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={handleSaveKeyDown}
                  placeholder="Preset name..."
                  maxLength={MAX_PRESET_NAME_LENGTH}
                  className="w-24 px-1.5 py-0.5 rounded text-[10px] bg-white/10 border border-white/20 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  onClick={handleSavePreset}
                  disabled={!presetName.trim()}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/30 text-purple-300 border border-purple-500/50 hover:bg-purple-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveInput(false);
                    setPresetName("");
                  }}
                  className="px-1 py-0.5 rounded text-[10px] text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="px-2 py-0.5 rounded text-[10px] font-medium text-purple-400/70 border border-dashed border-purple-500/40 hover:text-purple-300 hover:border-purple-500/60 transition-all"
                title={`Save current selection (${selectedBands.join(", ")}) as preset`}
              >
                + Save preset
              </button>
            )}
          </>
        )}
        {/* Show hint if at max presets */}
        {selectedBands.length > 0 && bandPresets.length >= MAX_BAND_PRESETS && (
          <span
            className="text-[9px] text-gray-500"
            title={`Maximum ${MAX_BAND_PRESETS} presets`}
          >
            (max presets)
          </span>
        )}
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
              aria-pressed={isActive}
              aria-label={`Filter by ${mode} mode`}
            >
              {mode}
            </button>
          );
        })}
      </div>
    </div>
  );
});

FilterControls.displayName = "FilterControls";
