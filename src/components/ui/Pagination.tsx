/**
 * Pagination -- Generic, reusable pagination controls.
 *
 * Shows "Showing X-Y of Z [entity]", Previous/Next buttons with chevron
 * icons, "Page X of Y" text, and a per-page size dropdown.
 * Dark-theme styling consistent with the QSO log pagination pattern.
 */

interface PaginationProps {
  /** Current page (0-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when the page changes */
  onPageChange: (page: number) => void;
  /** Current page size */
  pageSize: number;
  /** Callback when the page size changes */
  onPageSizeChange: (size: number) => void;
  /** Total number of results across all pages */
  totalCount: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Entity name used in the "Showing X-Y of Z ___" text */
  entityName?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalCount,
  pageSizeOptions = [24, 48, 96],
  entityName = "results",
}: PaginationProps) {
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage >= totalPages - 1;

  // Compute the range of items shown on the current page
  const rangeStart = currentPage * pageSize + 1;
  const rangeEnd = Math.min((currentPage + 1) * pageSize, totalCount);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 bg-su-line/10 border border-su-line/40 rounded-xl px-4 py-3"
    >
      {/* Showing X-Y of Z */}
      <span className="text-xs text-su-muted whitespace-nowrap">
        Showing <span className="text-su-text font-medium">{rangeStart}</span>
        {"-"}
        <span className="text-su-text font-medium">{rangeEnd}</span>
        {" of "}
        <span className="text-su-text font-medium">
          {totalCount.toLocaleString()}
        </span>{" "}
        {entityName}
      </span>

      {/* Previous / Page X of Y / Next */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isFirstPage}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
          className="flex items-center gap-1 bg-su-line/10 hover:bg-su-line/20 border border-su-line/40 rounded-lg px-3 py-1.5 text-xs text-su-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Previous
        </button>

        <span className="text-xs text-su-muted whitespace-nowrap">
          Page <span className="text-su-text font-medium">{currentPage + 1}</span>
          {" of "}
          <span className="text-su-text font-medium">{totalPages}</span>
        </span>

        <button
          type="button"
          disabled={isLastPage}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
          className="flex items-center gap-1 bg-su-line/10 hover:bg-su-line/20 border border-su-line/40 rounded-lg px-3 py-1.5 text-xs text-su-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Per-page dropdown */}
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="bg-su-line/10 border border-su-line/40 rounded-lg text-xs text-su-muted px-2 py-1.5 focus:border-plasma-orange/50 focus:outline-none appearance-none cursor-pointer"
        aria-label="Results per page"
      >
        {pageSizeOptions.map((size) => (
          <option key={size} value={size} className="bg-deep-space text-su-text">
            {size} / page
          </option>
        ))}
      </select>
    </nav>
  );
}
