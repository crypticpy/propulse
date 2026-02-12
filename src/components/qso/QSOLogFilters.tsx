/**
 * QSOLogFilters — Horizontal filter bar for the QSO log viewer
 *
 * Provides debounced search, band/mode dropdowns, date range pickers,
 * and a clear-all button. Reads/writes via useQSOStore.setFilters.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { BAND_OPTIONS, MODE_OPTIONS } from "@/lib/adif/types";

// ── Select Component ────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:border-plasma-orange/50 focus:outline-none appearance-none cursor-pointer min-w-[100px]"
    >
      <option value="" className="bg-deep-space text-white">
        {label}
      </option>
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-deep-space text-white">
          {opt}
        </option>
      ))}
    </select>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOLogFilters() {
  const filters = useQSOStore((s) => s.filters);
  const setFilters = useQSOStore((s) => s.setFilters);

  // Debounced search
  const [searchInput, setSearchInput] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if filters.search changes externally
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilters({ search: value });
      }, 300);
    },
    [setFilters],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.band !== null ||
    filters.mode !== null ||
    filters.dateFrom !== null ||
    filters.dateTo !== null;

  const clearAll = useCallback(() => {
    setSearchInput("");
    setFilters({
      search: "",
      band: null,
      mode: null,
      dateFrom: null,
      dateTo: null,
      mySig: null,
      contestId: null,
      confirmed: null,
      dupe: null,
    });
  }, [setFilters]);

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
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
          placeholder="Search callsign, name, QTH..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 pl-9 pr-3 py-2 focus:border-plasma-orange/50 focus:outline-none"
          aria-label="Search QSO log"
        />
      </div>

      {/* Band */}
      <FilterSelect
        label="Band"
        value={filters.band}
        options={BAND_OPTIONS}
        onChange={(v) => setFilters({ band: v })}
      />

      {/* Mode */}
      <FilterSelect
        label="Mode"
        value={filters.mode}
        options={MODE_OPTIONS}
        onChange={(v) => setFilters({ mode: v })}
      />

      {/* Date From */}
      <input
        type="date"
        value={filters.dateFrom ?? ""}
        onChange={(e) => setFilters({ dateFrom: e.target.value || null })}
        className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:border-plasma-orange/50 focus:outline-none [color-scheme:dark]"
        aria-label="Date from"
      />

      {/* Date To */}
      <input
        type="date"
        value={filters.dateTo ?? ""}
        onChange={(e) => setFilters({ dateTo: e.target.value || null })}
        className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:border-plasma-orange/50 focus:outline-none [color-scheme:dark]"
        aria-label="Date to"
      />

      {/* Clear All */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors whitespace-nowrap"
        >
          Clear All
        </button>
      )}
    </div>
  );
}
