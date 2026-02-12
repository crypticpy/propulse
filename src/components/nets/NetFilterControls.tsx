/**
 * NetFilterControls -- Filter UI for the Net Registry page.
 *
 * Always-visible search input at top, with a collapsible filter section
 * containing type, band, mode, day-of-week filters and sort controls.
 * Follows the DXSpotList FilterControls expand/collapse pattern.
 */

import { useState } from "react";
import type { NetFilters, NetType } from "@/types/net";
import { NET_TYPE_LABELS, FORMALITY_LABELS } from "@/types/net";

interface NetFilterControlsProps {
  filters: NetFilters;
  onChange: <K extends keyof NetFilters>(key: K, value: NetFilters[K]) => void;
  onReset: () => void;
  activeCount: number;
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

export function NetFilterControls({
  filters,
  onChange,
  onReset,
  activeCount,
}: NetFilterControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

        {/* Expand/collapse toggle */}
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
          Filters
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

      {/* Collapsible filter panel */}
      {isExpanded && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
          {/* Net Type */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Type
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {NET_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    onChange(
                      "type",
                      filters.type === opt.value ? null : opt.value,
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Band
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {BAND_OPTIONS.map((band) => (
                <button
                  key={band}
                  onClick={() =>
                    onChange("band", filters.band === band ? null : band)
                  }
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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

          {/* Mode */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Mode
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    onChange("mode", filters.mode === mode ? null : mode)
                  }
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Day
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((day) => (
                <button
                  key={day.value}
                  onClick={() =>
                    onChange(
                      "dayOfWeek",
                      filters.dayOfWeek === day.value ? null : day.value,
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Formality
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4, 5] as const).map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    onChange(
                      "formalityLevel",
                      filters.formalityLevel === level ? null : level,
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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
            <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Newcomer Friendly
            </h4>
            <button
              onClick={() =>
                onChange(
                  "newcomerFriendly",
                  filters.newcomerFriendly === true ? null : true,
                )
              }
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                filters.newcomerFriendly === true
                  ? "bg-signal-green/20 text-signal-green border-signal-green/40"
                  : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:text-white"
              }`}
            >
              Newcomer Friendly
            </button>
          </div>

          {/* Sort + Reset row */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            {/* Sort buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">
                Sort
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange("sortBy", opt.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
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
                className="text-[11px] text-gray-400 hover:text-white transition-colors"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
