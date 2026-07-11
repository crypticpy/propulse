/**
 * QSOFilters Component
 *
 * Filter controls for the QSO table with search, band/mode filtering,
 * and date range selection.
 */

import { useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui";

/** Available amateur bands for filtering */
const BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
] as const;

/** Available operating modes for filtering */
const MODES = ["SSB", "CW", "FT8", "FT4", "RTTY", "PSK31", "AM", "FM"] as const;

export interface QSOFilters {
  /** Callsign search text (partial match) */
  searchText: string;
  /** Selected bands (empty = all) */
  bands: string[];
  /** Selected modes (empty = all) */
  modes: string[];
  /** Start date filter */
  dateFrom: string;
  /** End date filter */
  dateTo: string;
}

export interface QSOFiltersProps {
  /** Current filter values */
  filters: QSOFilters;
  /** Callback when filters change */
  onFiltersChange: (filters: QSOFilters) => void;
}

/**
 * QSOFilters - Filter controls for the QSO table
 */
export function QSOFiltersPanel({ filters, onFiltersChange }: QSOFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchText !== "" ||
      filters.bands.length > 0 ||
      filters.modes.length > 0 ||
      filters.dateFrom !== "" ||
      filters.dateTo !== ""
    );
  }, [filters]);

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, searchText: e.target.value });
    },
    [filters, onFiltersChange],
  );

  // Handle band toggle
  const handleBandToggle = useCallback(
    (band: string) => {
      const newBands = filters.bands.includes(band)
        ? filters.bands.filter((b) => b !== band)
        : [...filters.bands, band];
      onFiltersChange({ ...filters, bands: newBands });
    },
    [filters, onFiltersChange],
  );

  // Handle mode toggle
  const handleModeToggle = useCallback(
    (mode: string) => {
      const newModes = filters.modes.includes(mode)
        ? filters.modes.filter((m) => m !== mode)
        : [...filters.modes, mode];
      onFiltersChange({ ...filters, modes: newModes });
    },
    [filters, onFiltersChange],
  );

  // Handle date change
  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, dateFrom: e.target.value });
    },
    [filters, onFiltersChange],
  );

  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, dateTo: e.target.value });
    },
    [filters, onFiltersChange],
  );

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    onFiltersChange({
      searchText: "",
      bands: [],
      modes: [],
      dateFrom: "",
      dateTo: "",
    });
  }, [onFiltersChange]);

  return (
    <Card className="p-4">
      {/* Search and expand toggle row */}
      <div className="flex items-center gap-4">
        {/* Search input */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search callsigns..."
            value={filters.searchText}
            onChange={handleSearchChange}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-9 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {filters.searchText && (
            <button
              onClick={() => onFiltersChange({ ...filters, searchText: "" })}
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

        {/* Expand/collapse button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            expanded || hasActiveFilters
              ? "bg-plasma-orange/20 text-plasma-orange"
              : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
          }`}
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
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-plasma-orange text-white text-[10px]">
              {filters.bands.length +
                filters.modes.length +
                (filters.dateFrom ? 1 : 0) +
                (filters.dateTo ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          {/* Band filters */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Bands
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BANDS.map((band) => {
                const isActive =
                  filters.bands.length === 0 || filters.bands.includes(band);
                return (
                  <button
                    key={band}
                    onClick={() => handleBandToggle(band)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                      filters.bands.includes(band)
                        ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30"
                        : isActive
                          ? "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                          : "bg-transparent text-gray-500 border-white/5 hover:text-gray-300"
                    }`}
                  >
                    {band}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode filters */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Modes
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MODES.map((mode) => {
                const isActive =
                  filters.modes.length === 0 || filters.modes.includes(mode);
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeToggle(mode)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                      filters.modes.includes(mode)
                        ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30"
                        : isActive
                          ? "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                          : "bg-transparent text-gray-500 border-white/5 hover:text-gray-300"
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="dateFrom"
                className="block text-xs font-medium text-gray-400 mb-1"
              >
                From Date
              </label>
              <input
                type="date"
                id="dateFrom"
                value={filters.dateFrom}
                onChange={handleDateFromChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-plasma-orange/50"
              />
            </div>
            <div>
              <label
                htmlFor="dateTo"
                className="block text-xs font-medium text-gray-400 mb-1"
              >
                To Date
              </label>
              <input
                type="date"
                id="dateTo"
                value={filters.dateTo}
                onChange={handleDateToChange}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-plasma-orange/50"
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

QSOFiltersPanel.displayName = "QSOFiltersPanel";

export default QSOFiltersPanel;
