/**
 * SatelliteFilterControls -- Filter UI for the Satellite Database page.
 *
 * Layout:
 *   Always visible: Search input, Category pills, Sort row
 *   Collapsible "More Filters": Visible Now toggle, Custom TLEs Only, TLE Age
 *
 * Follows the NetFilterControls pill/search pattern with responsive touch targets.
 */

import { useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CATEGORY_META } from "@/lib/utils/satellite";
import type { SatelliteCategory, TLEAge } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Filter State Interface
// ---------------------------------------------------------------------------

export interface SatelliteFilters {
  search: string;
  category: SatelliteCategory | "all";
  sortBy: "name" | "category" | "nextPass";
  visibleOnly: boolean;
  customOnly: boolean;
  tleAge: TLEAge | null;
}

export const DEFAULT_SATELLITE_FILTERS: SatelliteFilters = {
  search: "",
  category: "all",
  sortBy: "name",
  visibleOnly: false,
  customOnly: false,
  tleAge: null,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SatelliteFilterControlsProps {
  filters: SatelliteFilters;
  onChange: <K extends keyof SatelliteFilters>(
    key: K,
    value: SatelliteFilters[K],
  ) => void;
  onReset: () => void;
  activeCount: number;
}

// ---------------------------------------------------------------------------
// Option Constants
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{
  value: SatelliteCategory | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "iss", label: "ISS" },
  { value: "fm", label: "FM" },
  { value: "linear", label: "Linear" },
  { value: "digital", label: "Digital" },
  { value: "weather", label: "Weather" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS: Array<{
  value: SatelliteFilters["sortBy"];
  label: string;
}> = [
  { value: "name", label: "Name" },
  { value: "category", label: "Category" },
  { value: "nextPass", label: "Next Pass" },
];

const TLE_AGE_OPTIONS: Array<{ value: TLEAge | null; label: string }> = [
  { value: null, label: "Any" },
  { value: "fresh", label: "Fresh" },
  { value: "aging", label: "Aging" },
  { value: "stale", label: "Stale" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SatelliteFilterControls({
  filters,
  onChange,
  onReset,
  activeCount,
}: SatelliteFilterControlsProps) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // Pill button base classes -- responsive sizing
  const pillBase = `rounded-lg font-medium transition-all border ${
    isMobile
      ? "px-3 py-2 text-xs min-h-[44px]"
      : "px-3 py-2 text-xs min-h-[36px]"
  }`;

  return (
    <div className="space-y-3">
      {/* Search row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
          <input
            type="text"
            placeholder="Search satellites by name or NORAD ID..."
            value={filters.search}
            onChange={(e) => onChange("search", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
          />
          {filters.search && (
            <button
              onClick={() => onChange("search", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
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

        {/* More Filters toggle */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeCount > 0
              ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/40 hover:bg-plasma-orange/25"
              : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
          }`}
          title={`${activeCount} active filter${activeCount !== 1 ? "s" : ""}`}
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
          More Filters
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-plasma-orange/30 text-plasma-orange min-w-[18px] text-center">
              {activeCount}
            </span>
          )}
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
      </div>

      {/* Category pills -- always visible */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
        <div>
          <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Category
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((opt) => {
              const isActive = filters.category === opt.value;
              // Use category color for active non-"all" pills
              const catMeta =
                opt.value !== "all" ? CATEGORY_META[opt.value] : null;
              const activeClass =
                isActive && catMeta
                  ? `${catMeta.bg} ${catMeta.color} border-current/40`
                  : isActive
                    ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40"
                    : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white";

              return (
                <button
                  key={opt.value}
                  onClick={() => onChange("category", opt.value)}
                  aria-pressed={isActive}
                  className={`${pillBase} ${activeClass}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sort row -- always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-widest text-gray-400 mr-1">
            Sort
          </span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange("sortBy", opt.value)}
              aria-pressed={filters.sortBy === opt.value}
              className={`${pillBase} ${
                filters.sortBy === opt.value
                  ? "bg-white/10 text-white border-white/20"
                  : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Reset */}
        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Collapsible "More Filters" panel */}
      {isExpanded && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
          {/* Visible Now toggle */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Visibility
            </h4>
            <button
              onClick={() => onChange("visibleOnly", !filters.visibleOnly)}
              aria-pressed={filters.visibleOnly}
              className={`${pillBase} ${
                filters.visibleOnly
                  ? "bg-signal-green/20 text-signal-green border-signal-green/40"
                  : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              Visible Now
            </button>
          </div>

          {/* Custom TLEs Only toggle */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Source
            </h4>
            <button
              onClick={() => onChange("customOnly", !filters.customOnly)}
              aria-pressed={filters.customOnly}
              className={`${pillBase} ${
                filters.customOnly
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                  : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              Custom TLEs Only
            </button>
          </div>

          {/* TLE Age filter */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              TLE Age
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {TLE_AGE_OPTIONS.map((opt) => {
                const isActive = filters.tleAge === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => onChange("tleAge", opt.value)}
                    aria-pressed={isActive}
                    className={`${pillBase} ${
                      isActive
                        ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40"
                        : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
