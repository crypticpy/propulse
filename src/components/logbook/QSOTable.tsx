/**
 * QSOTable Component
 *
 * Paginated table for displaying QSO log entries with sorting.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/components/ui";
import type { LogEntry } from "@/lib/db/types";
import type { QSOFilters } from "./QSOFilters";

/** Number of entries per page */
const PAGE_SIZE = 15;

/** Sort direction */
type SortDirection = "asc" | "desc";

/** Sortable columns */
type SortColumn = "date" | "callsign" | "band" | "mode";

export interface QSOTableProps {
  /** Log entries to display */
  entries: LogEntry[];
  /** Current filter settings */
  filters: QSOFilters;
  /** Callback when a row is clicked */
  onRowClick: (entry: LogEntry) => void;
  /** Loading state */
  loading?: boolean;
}

/**
 * Compare function for sorting
 */
function compareEntries(
  a: LogEntry,
  b: LogEntry,
  column: SortColumn,
  direction: SortDirection,
): number {
  let comparison = 0;

  switch (column) {
    case "date":
      // Compare by date then time
      comparison = a.date.localeCompare(b.date);
      if (comparison === 0) {
        comparison = a.timeOn.localeCompare(b.timeOn);
      }
      break;
    case "callsign":
      comparison = a.callsign.localeCompare(b.callsign);
      break;
    case "band": {
      // Sort by frequency order (160m first, 70cm last)
      const bandOrder = [
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
      ];
      comparison = bandOrder.indexOf(a.band) - bandOrder.indexOf(b.band);
      break;
    }
    case "mode":
      comparison = a.mode.localeCompare(b.mode);
      break;
  }

  return direction === "asc" ? comparison : -comparison;
}

/**
 * Filter entries based on filter settings
 */
function filterEntries(entries: LogEntry[], filters: QSOFilters): LogEntry[] {
  return entries.filter((entry) => {
    // Search text filter
    if (filters.searchText) {
      const search = filters.searchText.toUpperCase();
      if (!entry.callsign.toUpperCase().includes(search)) {
        return false;
      }
    }

    // Band filter
    if (filters.bands.length > 0) {
      if (!filters.bands.includes(entry.band)) {
        return false;
      }
    }

    // Mode filter
    if (filters.modes.length > 0) {
      if (!filters.modes.includes(entry.mode)) {
        return false;
      }
    }

    // Date from filter
    if (filters.dateFrom) {
      if (entry.date < filters.dateFrom) {
        return false;
      }
    }

    // Date to filter
    if (filters.dateTo) {
      if (entry.date > filters.dateTo) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * QSOTable - Paginated table of QSO entries
 */
export function QSOTable({
  entries,
  filters,
  onRowClick,
  loading = false,
}: QSOTableProps) {
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Filter and sort entries
  const processedEntries = useMemo(() => {
    const filtered = filterEntries(entries, filters);
    return [...filtered].sort((a, b) =>
      compareEntries(a, b, sortColumn, sortDirection),
    );
  }, [entries, filters, sortColumn, sortDirection]);

  // Calculate pagination
  const totalPages = Math.ceil(processedEntries.length / PAGE_SIZE);
  const startIndex = page * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pageEntries = processedEntries.slice(startIndex, endIndex);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [
    filters.searchText,
    filters.bands,
    filters.modes,
    filters.dateFrom,
    filters.dateTo,
  ]);

  // Handle column header click for sorting
  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        // Toggle direction
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        // New column, default to descending for date, ascending for others
        setSortColumn(column);
        setSortDirection(column === "date" ? "desc" : "asc");
      }
    },
    [sortColumn],
  );

  // Sort indicator component
  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return (
        <svg
          className="w-3 h-3 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }
    return (
      <svg
        className="w-3 h-3 text-plasma-orange"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {sortDirection === "asc" ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 15l7-7 7 7"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        )}
      </svg>
    );
  };

  return (
    <Card className="p-0 overflow-hidden">
      {/* Table container */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header */}
          <thead className="border-b border-white/10">
            <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 transition-colors"
                onClick={() => handleSort("date")}
              >
                <div className="flex items-center gap-1.5">
                  Date/Time
                  <SortIndicator column="date" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 transition-colors"
                onClick={() => handleSort("callsign")}
              >
                <div className="flex items-center gap-1.5">
                  Callsign
                  <SortIndicator column="callsign" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 transition-colors"
                onClick={() => handleSort("band")}
              >
                <div className="flex items-center gap-1.5">
                  Band
                  <SortIndicator column="band" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 transition-colors"
                onClick={() => handleSort("mode")}
              >
                <div className="flex items-center gap-1.5">
                  Mode
                  <SortIndicator column="mode" />
                </div>
              </th>
              <th className="px-4 py-3 text-left">RST S/R</th>
              <th className="px-4 py-3 text-left">Grid</th>
              <th className="px-4 py-3 text-left">Notes</th>
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-nebula-blue border-t-plasma-orange rounded-full animate-spin" />
                    <span className="text-gray-500 text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : pageEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      className="w-12 h-12 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <p className="text-gray-500">No QSOs found</p>
                    {filters.searchText ||
                    filters.bands.length > 0 ||
                    filters.modes.length > 0 ? (
                      <p className="text-gray-600 text-sm">
                        Try adjusting your filters
                      </p>
                    ) : (
                      <p className="text-gray-600 text-sm">
                        Log your first contact above
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              pageEntries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => onRowClick(entry)}
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-white">
                      {entry.date}
                    </div>
                    <div className="font-mono text-xs text-gray-500">
                      {entry.timeOn} UTC
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-medium text-white">
                      {entry.callsign}
                    </span>
                    {entry.name && (
                      <div className="text-xs text-gray-500">{entry.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-plasma-orange/20 text-plasma-orange">
                      {entry.band}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-300">{entry.mode}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-400">
                      {entry.rstSent || "-"} / {entry.rstRcvd || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-400">
                      {entry.grid || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500" title={entry.notes}>
                      {truncate(entry.notes, 30)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <div className="text-xs text-gray-500">
            Showing {startIndex + 1}-
            {Math.min(endIndex, processedEntries.length)} of{" "}
            {processedEntries.length} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === 0
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Calculate which page numbers to show
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i;
                } else if (page < 2) {
                  pageNum = i;
                } else if (page > totalPages - 3) {
                  pageNum = totalPages - 5 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      page === pageNum
                        ? "bg-plasma-orange text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page >= totalPages - 1
                  ? "text-gray-600 cursor-not-allowed"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Summary footer when no pagination needed */}
      {totalPages <= 1 && processedEntries.length > 0 && (
        <div className="px-4 py-3 border-t border-white/10 text-xs text-gray-500">
          {processedEntries.length} entr
          {processedEntries.length === 1 ? "y" : "ies"}{" "}
          {filters.searchText ||
          filters.bands.length > 0 ||
          filters.modes.length > 0
            ? "(filtered)"
            : "total"}
        </div>
      )}
    </Card>
  );
}

QSOTable.displayName = "QSOTable";

export default QSOTable;
