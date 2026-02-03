/**
 * LogStatsCard Component
 *
 * A compact card displaying logbook statistics including
 * QSOs today, this week, and total entries in the log.
 * Features an auto-refresh toggle for live updates.
 */

import { useMemo, useEffect, useRef } from "react";
import { useLogbook } from "@/hooks/useLogbook";

export interface LogStatsCardProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether auto-refresh is enabled */
  autoRefresh?: boolean;
  /** Callback when auto-refresh is toggled */
  onToggleAutoRefresh?: (enabled: boolean) => void;
}

/**
 * Radio/log icon for the card header
 */
function LogIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="14" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  );
}

/**
 * Refresh icon for the auto-refresh toggle
 */
function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/**
 * Get the start of today in YYYY-MM-DD format (UTC)
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Get the date 7 days ago in YYYY-MM-DD format (UTC)
 */
function getWeekAgoDateString(): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 7);
  return now.toISOString().split("T")[0];
}

/**
 * LogStatsCard Component
 *
 * Displays logbook statistics in a compact format:
 * - QSOs made today
 * - QSOs made this week
 * - Total QSOs in the logbook
 *
 * @example
 * ```tsx
 * <LogStatsCard
 *   autoRefresh={true}
 *   onToggleAutoRefresh={(enabled) => console.log('Auto-refresh:', enabled)}
 * />
 * ```
 */
export function LogStatsCard({
  className = "",
  autoRefresh = false,
  onToggleAutoRefresh,
}: LogStatsCardProps) {
  const { entries, loading, refresh, count } = useLogbook();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set up auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      // Refresh every 30 seconds when auto-refresh is enabled
      refreshIntervalRef.current = setInterval(() => {
        refresh();
      }, 30000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, refresh]);

  // Calculate statistics
  const stats = useMemo(() => {
    const today = getTodayDateString();
    const weekAgo = getWeekAgoDateString();

    let todayCount = 0;
    let weekCount = 0;

    for (const entry of entries) {
      if (entry.date === today) {
        todayCount++;
      }
      if (entry.date >= weekAgo) {
        weekCount++;
      }
    }

    return {
      today: todayCount,
      week: weekCount,
      total: count,
    };
  }, [entries, count]);

  const handleToggleAutoRefresh = () => {
    onToggleAutoRefresh?.(!autoRefresh);
  };

  return (
    <div
      className={`
        bg-white/[0.03] backdrop-blur-md border border-white/10
        rounded-xl p-3 min-w-[140px]
        transition-all duration-200 hover:border-white/20
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <LogIcon className="w-3.5 h-3.5 text-plasma-orange" />
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            Log Stats
          </span>
        </div>

        {/* Auto-refresh toggle */}
        {onToggleAutoRefresh && (
          <button
            onClick={handleToggleAutoRefresh}
            className={`
              p-1 rounded transition-colors
              ${
                autoRefresh
                  ? "text-signal-green bg-signal-green/20"
                  : "text-gray-500 hover:text-gray-400 hover:bg-white/5"
              }
            `}
            title={autoRefresh ? "Auto-refresh enabled" : "Enable auto-refresh"}
            aria-label={
              autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"
            }
          >
            <RefreshIcon
              className={`w-3 h-3 ${autoRefresh ? "animate-spin-slow" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Stats content */}
      {loading ? (
        <div className="flex items-center justify-center py-2">
          <div className="animate-pulse text-xs text-gray-500">Loading...</div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {/* Today */}
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold font-mono text-white leading-none">
              {stats.today}
            </span>
            <span className="text-[9px] text-gray-500 uppercase">Today</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10" />

          {/* This Week */}
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold font-mono text-white leading-none">
              {stats.week}
            </span>
            <span className="text-[9px] text-gray-500 uppercase">Week</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/10" />

          {/* Total */}
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold font-mono text-plasma-orange leading-none">
              {stats.total.toLocaleString()}
            </span>
            <span className="text-[9px] text-gray-500 uppercase">Total</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default LogStatsCard;
