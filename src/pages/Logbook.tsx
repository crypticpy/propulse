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
  LotwSyncButton,
  BandMap,
  BandMapControls,
  QslSyncPanel,
} from "@/components/qso";
import type { ContestFilterMode } from "@/components/qso/BandMapControls";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { QuietBandNav } from "@/components/contest/QuietBandNav";
import { useQSOStore } from "@/stores/qsoStore";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useConflicts } from "@/hooks/useConflicts";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { LogEntry } from "@/lib/db/types";

export function Logbook() {
  const totalCount = useQSOStore((s) => s.totalCount);
  const loadEntries = useQSOStore((s) => s.loadEntries);
  const setFromSpot = useQSOStore((s) => s.setFromSpot);

  const { conflicts, conflictCount } = useConflicts();
  const isMobile = useIsMobile(1024); // lg breakpoint

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showQslSync, setShowQslSync] = useState(false);

  // Detail modal state
  const [detailEntry, setDetailEntry] = useState<LogEntry | null>(null);

  // Inline editing state for table
  const [editingCell, setEditingCell] = useState<{
    entryId: string;
    field: string;
  } | null>(null);

  // Band map state — initialize from active operating band
  const activeBand = useActiveBand();
  const [bandMapBand, setBandMapBand] = useState<string>(activeBand);
  const [bandMapTimeRange, setBandMapTimeRange] = useState(15);
  const [bandMapCollapsed, setBandMapCollapsed] = useState(true); // mobile only
  const [contestFilter, setContestFilter] = useState<ContestFilterMode>("all");
  const [showSubBands, setShowSubBands] = useState(false);

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Band map spot click → auto-fill QSO entry form
  const handleSpotClick = useCallback(
    (spot: { callsign: string; frequency: number; mode: string }) => {
      setFromSpot(spot);
    },
    [setFromSpot],
  );

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
            <LotwSyncButton />
            <button
              type="button"
              onClick={() => setShowQslSync(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
            >
              QSL Sync
            </button>
            <ConflictBadge
              count={conflictCount}
              onClick={() => setShowConflictModal(true)}
            />
            <OfflineIndicator className="text-xs text-alert-red font-medium px-2 py-0.5 rounded bg-alert-red/10" />
          </div>
        </div>

        {/* Two-Column Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left Column: Entry Form + Band Map (sticky) */}
          <div className="w-[420px] shrink-0 border-r border-white/10 overflow-y-auto p-4">
            <div className="sticky top-0 space-y-3">
              <QuietBandNav />
              <QSOEntryForm onQSOLogged={handleQSOLogged} />

              {/* Band Map */}
              <div className="space-y-1.5">
                <BandMapControls
                  band={bandMapBand}
                  onBandChange={setBandMapBand}
                  timeRange={bandMapTimeRange}
                  onTimeRangeChange={setBandMapTimeRange}
                  source="none"
                  contestFilter={contestFilter}
                  onContestFilterChange={setContestFilter}
                  showSubBands={showSubBands}
                  onShowSubBandsChange={setShowSubBands}
                />
                <BandMap
                  band={bandMapBand}
                  timeRange={bandMapTimeRange}
                  onSpotClick={handleSpotClick}
                  contestFilter={contestFilter}
                  showSubBands={showSubBands}
                />
              </div>
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
        {showQslSync && (
          <QslSyncPanel isOpen onClose={() => setShowQslSync(false)} />
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
          <LotwSyncButton />
          <button
            type="button"
            onClick={() => setShowQslSync(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="QSL Sync"
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <ConflictBadge
            count={conflictCount}
            onClick={() => setShowConflictModal(true)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Quiet Band Navigator (contest weekends only) */}
        <QuietBandNav />

        {/* Entry Form */}
        <QSOEntryForm onQSOLogged={handleQSOLogged} />

        {/* Band Map (collapsible on mobile) */}
        <div className="border border-white/10 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setBandMapCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
          >
            <span className="text-xs font-mono font-medium text-gray-400 uppercase tracking-wider">
              Band Map
            </span>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                bandMapCollapsed ? "" : "rotate-180"
              }`}
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
          {!bandMapCollapsed && (
            <div className="p-2 space-y-1.5">
              <BandMapControls
                band={bandMapBand}
                onBandChange={setBandMapBand}
                timeRange={bandMapTimeRange}
                onTimeRangeChange={setBandMapTimeRange}
                source="none"
                contestFilter={contestFilter}
                onContestFilterChange={setContestFilter}
                showSubBands={showSubBands}
                onShowSubBandsChange={setShowSubBands}
              />
              <BandMap
                band={bandMapBand}
                timeRange={bandMapTimeRange}
                onSpotClick={handleSpotClick}
                contestFilter={contestFilter}
                showSubBands={showSubBands}
              />
            </div>
          )}
        </div>

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
      {showQslSync && (
        <QslSyncPanel isOpen onClose={() => setShowQslSync(false)} />
      )}
    </div>
  );
}

export default Logbook;
