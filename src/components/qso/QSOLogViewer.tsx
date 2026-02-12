/**
 * QSOLogViewer — Main viewer container for the QSO log
 *
 * Composes all viewer sub-components: filters, table/cards,
 * pagination, stats panel, export menu, and bulk actions.
 * Responsive: table on desktop, cards on mobile.
 */

import { useState, useEffect, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { LogEntry } from "@/lib/db/types";
import { QSOLogFilters } from "./QSOLogFilters";
import { QSOLogTable } from "./QSOLogTable";
import { QSOLogCards } from "./QSOLogCards";
import { QSOLogPagination } from "./QSOLogPagination";
import { QSOLogStats } from "./QSOLogStats";
import { QSOExportMenu } from "./QSOExportMenu";
import { QSOBulkActions } from "./QSOBulkActions";
import { QSODetailModal } from "./QSODetailModal";

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOLogViewer() {
  const loadEntries = useQSOStore((s) => s.loadEntries);
  const viewerLoading = useQSOStore((s) => s.viewerLoading);
  const totalCount = useQSOStore((s) => s.totalCount);
  const isMobile = useIsMobile();

  const [showStats, setShowStats] = useState(false);
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);
  const [editingCell, setEditingCell] = useState<{
    entryId: string;
    field: string;
  } | null>(null);

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleRowClick = useCallback((entry: LogEntry) => {
    setDetailEntry(entry);
  }, []);

  const handleStartEdit = useCallback((entryId: string, field: string) => {
    setEditingCell({ entryId, field });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailEntry(null);
  }, []);

  return (
    <div className="space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">QSO Log</h2>
          {totalCount > 0 && (
            <p className="text-xs text-gray-500">
              {totalCount.toLocaleString()} entries
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Stats Toggle */}
          <button
            type="button"
            onClick={() => setShowStats(!showStats)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors border ${
              showStats
                ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30"
                : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
            }`}
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            Stats
          </button>

          {/* Export Menu */}
          <QSOExportMenu />
        </div>
      </div>

      {/* Filter Bar */}
      <QSOLogFilters />

      {/* Stats Panel (toggleable) */}
      {showStats && <QSOLogStats />}

      {/* Loading Indicator */}
      {viewerLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-gray-400">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm">Loading entries...</span>
          </div>
        </div>
      )}

      {/* Log Entries (table or cards) */}
      {!viewerLoading && (
        <>
          {isMobile ? (
            <QSOLogCards onCardTap={handleRowClick} />
          ) : (
            <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
              <QSOLogTable
                onRowClick={handleRowClick}
                editingCell={editingCell}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
              />
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      <QSOLogPagination />

      {/* Bulk Actions (floating bar) */}
      <QSOBulkActions />

      {/* Detail Modal */}
      <QSODetailModal entry={detailEntry} onClose={handleCloseDetail} />
    </div>
  );
}
