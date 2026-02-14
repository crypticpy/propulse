/**
 * NetFilterControls -- Filter UI for the Net Registry page.
 *
 * Layout:
 *   Always visible: Search input, Quick Filters (Type pills, Band pills), Sort row
 *   Collapsible "More Filters": Mode, Day, Formality, Newcomer, Country, State
 *
 * All pill buttons include aria-pressed. Pill sizing is responsive
 * (44px touch targets on mobile, 36px on desktop).
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { NetFilters, NetType } from "@/types/net";
import { NET_TYPE_LABELS, FORMALITY_LABELS } from "@/types/net";
import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";

interface NetFilterControlsProps {
  filters: NetFilters;
  onChange: <K extends keyof NetFilters>(key: K, value: NetFilters[K]) => void;
  onReset: () => void;
  activeCount: number;
  onPageReset?: () => void;
}

const NET_TYPE_OPTIONS: { value: NetType; label: string }[] = (
  Object.entries(NET_TYPE_LABELS) as [NetType, string][]
).map(([value, label]) => ({ value, label }));

const BAND_OPTIONS = [
  "160m",
  "80m",
  "60m",
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
];

const MODE_OPTIONS = ["SSB", "FM", "CW", "DIGITAL", "AM"];

const DAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const SORT_OPTIONS: { value: NetFilters["sortBy"]; label: string }[] = [
  { value: "popularity", label: "Popular" },
  { value: "upcoming", label: "Upcoming" },
  { value: "recent", label: "Recent" },
];

/** Lightweight country list for the combobox — only name + iso, no heavy border data */
const COUNTRY_LIST = WORLD_COUNTRIES.filter(
  (c) => c.iso && c.iso !== "undefined",
).map((c) => ({
  name: c.name,
  iso: c.iso,
}));

export function NetFilterControls({
  filters,
  onChange,
  onReset,
  activeCount,
  onPageReset,
}: NetFilterControlsProps) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // Country combobox state
  const [countrySearch, setCountrySearch] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        countryRef.current &&
        !countryRef.current.contains(e.target as Node)
      ) {
        setCountryDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered country list for the combobox dropdown
  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRY_LIST;
    const lower = countrySearch.toLowerCase();
    return COUNTRY_LIST.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.iso.toLowerCase().includes(lower),
    );
  }, [countrySearch]);

  // Resolve selected country name from ISO code
  const selectedCountryName = useMemo(() => {
    if (!filters.country) return null;
    return COUNTRY_LIST.find((c) => c.iso === filters.country)?.name ?? null;
  }, [filters.country]);

  // When country changes to non-US, clear stateOrProvince
  useEffect(() => {
    if (filters.country !== "US" && filters.stateOrProvince) {
      onChange("stateOrProvince", null);
      onPageReset?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.country]);

  // Wrapper that also calls onPageReset when any filter changes
  function handleChange<K extends keyof NetFilters>(
    key: K,
    value: NetFilters[K],
  ) {
    onChange(key, value);
    onPageReset?.();
  }

  // Pill button base classes — responsive sizing
  const pillBase = `rounded-lg font-medium transition-all border ${
    isMobile
      ? "px-3 py-2 text-xs min-h-[44px]"
      : "px-3 py-2 text-xs min-h-[36px]"
  }`;

  return (
    <div className="space-y-3">
      {/* Always-visible search row */}
      <div className="flex items-center gap-2">
        {/* Search input */}
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
            placeholder="Search nets by name..."
            value={filters.search}
            onChange={(e) => handleChange("search", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
          />
          {filters.search && (
            <button
              onClick={() => handleChange("search", "")}
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

        {/* "More Filters" expand/collapse toggle */}
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

      {/* Quick Filters — always visible */}
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
        {/* Net Type */}
        <div>
          <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Type
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {NET_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  handleChange(
                    "type",
                    filters.type === opt.value ? null : opt.value,
                  )
                }
                aria-pressed={filters.type === opt.value}
                className={`${pillBase} ${
                  filters.type === opt.value
                    ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40"
                    : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Band */}
        <div>
          <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
            Band
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {BAND_OPTIONS.map((band) => (
              <button
                key={band}
                onClick={() =>
                  handleChange("band", filters.band === band ? null : band)
                }
                aria-pressed={filters.band === band}
                className={`${pillBase} ${
                  filters.band === band
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                    : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                }`}
              >
                {band}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sort row — always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-widest text-gray-400 mr-1">
            Sort
          </span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleChange("sortBy", opt.value)}
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
            onClick={() => {
              onReset();
              onPageReset?.();
            }}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Collapsible "More Filters" panel */}
      {isExpanded && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
          {/* Mode */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Mode
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    handleChange("mode", filters.mode === mode ? null : mode)
                  }
                  aria-pressed={filters.mode === mode}
                  className={`${pillBase} ${
                    filters.mode === mode
                      ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                      : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Day of Week */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Day
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((day) => (
                <button
                  key={day.value}
                  onClick={() =>
                    handleChange(
                      "dayOfWeek",
                      filters.dayOfWeek === day.value ? null : day.value,
                    )
                  }
                  aria-pressed={filters.dayOfWeek === day.value}
                  className={`${pillBase} ${
                    filters.dayOfWeek === day.value
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          {/* Formality */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Formality
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    handleChange(
                      "formalityLevel",
                      filters.formalityLevel === level ? null : level,
                    )
                  }
                  aria-pressed={filters.formalityLevel === level}
                  className={`${pillBase} ${
                    filters.formalityLevel === level
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                      : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {FORMALITY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Newcomer Friendly */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Newcomer Friendly
            </h4>
            <button
              onClick={() =>
                handleChange(
                  "newcomerFriendly",
                  filters.newcomerFriendly === true ? null : true,
                )
              }
              aria-pressed={filters.newcomerFriendly === true}
              className={`${pillBase} ${
                filters.newcomerFriendly === true
                  ? "bg-signal-green/20 text-signal-green border-signal-green/40"
                  : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              Newcomer Friendly
            </button>
          </div>

          {/* Country filter — searchable combobox */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Country
            </h4>
            {filters.country && selectedCountryName ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-200">
                  {selectedCountryName}
                </span>
                <button
                  onClick={() => {
                    handleChange("country", null);
                    setCountrySearch("");
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                  aria-label="Clear country filter"
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
              </div>
            ) : (
              <div className="relative" ref={countryRef}>
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={countrySearch}
                  onChange={(e) => {
                    setCountrySearch(e.target.value);
                    setCountryDropdownOpen(true);
                  }}
                  onFocus={() => setCountryDropdownOpen(true)}
                  className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
                />
                {countryDropdownOpen && filteredCountries.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-w-xs max-h-[240px] overflow-y-auto bg-deep-space border border-white/10 rounded-lg shadow-lg">
                    {filteredCountries.slice(0, 50).map((c) => (
                      <li key={c.iso}>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange("country", c.iso);
                            setCountrySearch("");
                            setCountryDropdownOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                        >
                          {c.name}{" "}
                          <span className="text-gray-500 text-xs">
                            ({c.iso})
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* State filter — only visible when country is US */}
          {filters.country === "US" && (
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                State
              </h4>
              <select
                value={filters.stateOrProvince ?? ""}
                onChange={(e) =>
                  handleChange("stateOrProvince", e.target.value || null)
                }
                className="bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 px-3 py-2 focus:border-plasma-orange/50 focus:outline-none appearance-none cursor-pointer max-w-xs w-full"
                aria-label="Filter by state"
              >
                <option value="" className="bg-deep-space text-white">
                  All states
                </option>
                {US_STATES.map((state) => (
                  <option
                    key={state.fips}
                    value={state.name}
                    className="bg-deep-space text-white"
                  >
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
