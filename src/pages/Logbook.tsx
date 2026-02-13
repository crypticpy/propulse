/**
 * Logbook Page — Two-column mission control logging console.
 *
 * Desktop (lg+): Entry form sticky on the left, scrollable log table on the right.
 * Mobile: Single column — compact entry at top, then cards view below.
 *
 * Composes QSOEntryForm, QSOLogFilters, QSOLogTable, QSOLogCards,
 * QSOLogPagination, QSOBulkActions, QSODetailModal, QSOExportMenu,
 * QSOStatsPopover, ConflictBadge, ConflictResolutionModal, OfflineIndicator.
 */

import { useState, useCallback, useEffect } from "react";
import {
  QSOEntryForm,
  QSOLogFilters,
  QSOLogTable,
  QSOLogCards,
  QSOLogPagination,
  QSOBulkActions,
  QSODetailModal,
  QSOExportMenu,
  QSOStatsPopover,
  ConflictBadge,
  ConflictResolutionModal,
} from "@/components/qso";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useQSOStore } from "@/stores/qsoStore";
import { useConflicts } from "@/hooks/useConflicts";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { LogEntry } from "@/lib/db/types";

export function Logbook() {
  const totalCount = useQSOStore((s) => s.totalCount);
  const loadEntries = useQSOStore((s) => s.loadEntries);

  const { conflicts, conflictCount } = useConflicts();
  const isMobile = useIsMobile(1024); // lg breakpoint

  const [showConflictModal, setShowConflictModal] = useState(false);

  // Detail modal state
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);

  // Inline editing state for table
  const [editingCell, setEditingCell] = useState<{
    entryId: string;
    field: string;
  } | null>(null);

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleQSOLogged = useCallback(
    (_id: string) => {
      loadEntries();
    },
    [loadEntries],
  );

  const handleRowClick = useCallback((entry: LogEntry) => {
    setDetailEntry(entry);
  }, []);

  const handleStartEdit = useCallback((entryId: string, field: string) => {
    setEditingCell({ entryId, field });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // ── Desktop Layout ──────────────────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className="h-full flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-void-black/50 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="font-orbitron text-lg font-black uppercase tracking-widest text-white">
              Logbook
            </h1>
            <span className="text-sm font-mono tabular-nums text-gray-400">
              {totalCount.toLocaleString()}{" "}
              <span className="text-gray-600">
                {totalCount === 1 ? "QSO" : "QSOs"}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <QSOStatsPopover>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
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
            </QSOStatsPopover>
            <QSOExportMenu />
            <ConflictBadge
              count={conflictCount}
              onClick={() => setShowConflictModal(true)}
            />
            <OfflineIndicator className="text-xs text-alert-red font-medium px-2 py-0.5 rounded bg-alert-red/10" />
          </div>
        </div>

        {/* Two-Column Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left Column: Entry Form (sticky) */}
          <div className="w-[420px] shrink-0 border-r border-white/10 overflow-y-auto p-4">
            <div className="sticky top-0">
              <QSOEntryForm onQSOLogged={handleQSOLogged} />
            </div>
          </div>

          {/* Right Column: Log Table (scrollable) */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="p-4 pb-2 shrink-0">
              <QSOLogFilters />
            </div>
            <div className="flex-1 overflow-y-auto px-4">
              <QSOLogTable
                onRowClick={handleRowClick}
                editingCell={editingCell}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
              />
            </div>
            <div className="p-4 pt-2 shrink-0">
              <QSOLogPagination />
            </div>
          </div>
        </div>

        {/* Floating / Portal Components */}
        <QSOBulkActions />
        <QSODetailModal
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
        />
        {showConflictModal && conflicts.length > 0 && (
          <ConflictResolutionModal
            conflict={conflicts[0]}
            onClose={() => setShowConflictModal(false)}
          />
        )}
      </div>
    );
  }

  // ── Mobile Layout ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-void-black/50 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <h1 className="font-orbitron text-base font-black uppercase tracking-widest text-white">
            Logbook
          </h1>
          <span className="text-xs font-mono tabular-nums text-gray-400">
            {totalCount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <QSOStatsPopover>
            <button
              type="button"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Stats"
            >
              <svg
                className="w-5 h-5"
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
            </button>
          </QSOStatsPopover>
          <QSOExportMenu />
          <ConflictBadge
            count={conflictCount}
            onClick={() => setShowConflictModal(true)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Entry Form */}
        <QSOEntryForm onQSOLogged={handleQSOLogged} />

        {/* Filters */}
        <QSOLogFilters />

        {/* Cards */}
        <QSOLogCards onCardTap={handleRowClick} />

        {/* Pagination */}
        <QSOLogPagination />
      </div>

      {/* Floating / Portal Components */}
      <QSOBulkActions />
      <QSODetailModal
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />
      {showConflictModal && conflicts.length > 0 && (
        <ConflictResolutionModal
          conflict={conflicts[0]}
          onClose={() => setShowConflictModal(false)}
        />
      )}
    </div>
  );
}

export default Logbook;
