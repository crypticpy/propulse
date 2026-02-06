/**
 * DataFreshnessIndicator Component
 *
 * Shows "Updated X ago" text with an optional refresh button.
 * Auto-updates every 30 seconds to keep the relative time fresh.
 */

import { useState, useEffect } from "react";
import { getTimeAgo } from "@/lib/utils/time";

export interface DataFreshnessIndicatorProps {
  /** Unix ms timestamp from TanStack Query's dataUpdatedAt */
  dataUpdatedAt: number | undefined;
  /** Optional callback to trigger manual refresh */
  onRefresh?: () => void;
  /** Whether a refetch is currently in progress */
  isRefetching?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function DataFreshnessIndicator({
  dataUpdatedAt,
  onRefresh,
  isRefetching = false,
  className = "",
}: DataFreshnessIndicatorProps) {
  // Tick counter to keep relative time fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const label =
    dataUpdatedAt != null
      ? `Updated ${getTimeAgo(new Date(dataUpdatedAt))}`
      : "Loading\u2026";

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-[10px] text-gray-500 font-mono">{label}</span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefetching}
          className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          aria-label="Refresh data"
        >
          <svg
            className={`w-3 h-3 text-gray-400 ${isRefetching ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
