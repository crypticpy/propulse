/**
 * FilterChips -- Active filter chip bar for the QSO log table
 *
 * Shows active filters as dismissible pill chips.
 * Horizontal flex-wrap layout with compact pills.
 * Includes "Clear All" button when 2+ filters are active.
 */

import { useCallback, useMemo } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { DEFAULT_QSO_FILTERS } from "@/types/qso";

// -- Types ------------------------------------------------------------------

interface FilterChip {
  /** Unique key for the chip */
  key: string;
  /** Display label */
  label: string;
  /** Function to remove this filter */
  onRemove: () => void;
}

// -- Helpers ----------------------------------------------------------------

function formatDateRange(
  from: string | null,
  to: string | null,
): string | null {
  if (!from && !to) return null;

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00Z");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  if (from && to) {
    return `${formatDate(from)} - ${formatDate(to)}`;
  }
  if (from) {
    return `After ${formatDate(from)}`;
  }
  return `Before ${formatDate(to!)}`;
}

// -- Component --------------------------------------------------------------

export function FilterChips() {
  const filters = useQSOStore((s) => s.filters);
  const setFilters = useQSOStore((s) => s.setFilters);

  const chips = useMemo((): FilterChip[] => {
    const result: FilterChip[] = [];

    if (filters.band) {
      result.push({
        key: "band",
        label: filters.band,
        onRemove: () => setFilters({ band: null }),
      });
    }

    if (filters.mode) {
      result.push({
        key: "mode",
        label: filters.mode,
        onRemove: () => setFilters({ mode: null }),
      });
    }

    const dateLabel = formatDateRange(filters.dateFrom, filters.dateTo);
    if (dateLabel) {
      result.push({
        key: "date",
        label: dateLabel,
        onRemove: () => setFilters({ dateFrom: null, dateTo: null }),
      });
    }

    if (filters.search) {
      result.push({
        key: "search",
        label: `"${filters.search}"`,
        onRemove: () => setFilters({ search: "" }),
      });
    }

    if (filters.confirmed === true) {
      result.push({
        key: "confirmed",
        label: "Confirmed",
        onRemove: () => setFilters({ confirmed: null }),
      });
    } else if (filters.confirmed === false) {
      result.push({
        key: "confirmed",
        label: "Unconfirmed",
        onRemove: () => setFilters({ confirmed: null }),
      });
    }

    if (filters.mySig) {
      result.push({
        key: "mySig",
        label: filters.mySig,
        onRemove: () => setFilters({ mySig: null }),
      });
    }

    if (filters.contestId) {
      result.push({
        key: "contestId",
        label: `Contest: ${filters.contestId}`,
        onRemove: () => setFilters({ contestId: null }),
      });
    }

    if (filters.dupe === true) {
      result.push({
        key: "dupe",
        label: "Dupes Only",
        onRemove: () => setFilters({ dupe: null }),
      });
    } else if (filters.dupe === false) {
      result.push({
        key: "dupe",
        label: "No Dupes",
        onRemove: () => setFilters({ dupe: null }),
      });
    }

    return result;
  }, [filters, setFilters]);

  const handleClearAll = useCallback(() => {
    setFilters({ ...DEFAULT_QSO_FILTERS });
  }, [setFilters]);

  // Don't render if no active filters
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 text-xs font-medium rounded-full bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/25"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 p-0.5 rounded-full hover:bg-plasma-orange/20 transition-colors"
            aria-label={`Remove ${chip.label} filter`}
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
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </span>
      ))}

      {chips.length >= 2 && (
        <button
          type="button"
          onClick={handleClearAll}
          className="px-2 py-0.5 text-xs text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
        >
          Clear All
        </button>
      )}
    </div>
  );
}
