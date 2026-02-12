/**
 * QSOLogPagination — Page controls for the QSO log viewer
 *
 * Previous/Next buttons, page indicator, and entries-per-page selector.
 * Drives useQSOStore.loadEntries(offset, limit).
 */

import { useState, useCallback, useEffect } from "react";
import { useQSOStore } from "@/stores/qsoStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function QSOLogPagination() {
  const totalCount = useQSOStore((s) => s.totalCount);
  const loadEntries = useQSOStore((s) => s.loadEntries);

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState(0);

  // Reset to first page when total count changes (e.g. filter change)
  useEffect(() => {
    setCurrentPage(0);
  }, [totalCount]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clamped);
      loadEntries(clamped * pageSize, pageSize);
    },
    [pageSize, totalPages, loadEntries],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      setCurrentPage(0);
      loadEntries(0, newSize);
    },
    [loadEntries],
  );

  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2 bg-white/[0.02] rounded-xl border border-white/5">
      {/* Previous */}
      <button
        type="button"
        disabled={currentPage === 0}
        onClick={() => goToPage(currentPage - 1)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
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
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Previous
      </button>

      {/* Page indicator */}
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <span>
          Page <span className="text-white font-medium">{currentPage + 1}</span>{" "}
          of <span className="text-white font-medium">{totalPages}</span>
        </span>
        <span className="text-gray-600">|</span>
        <span>{totalCount.toLocaleString()} total</span>
      </div>

      {/* Page size selector + Next */}
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 px-2 py-1.5 focus:border-plasma-orange/50 focus:outline-none appearance-none cursor-pointer"
          aria-label="Entries per page"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option
              key={size}
              value={size}
              className="bg-deep-space text-white"
            >
              {size} / page
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={currentPage >= totalPages - 1}
          onClick={() => goToPage(currentPage + 1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
