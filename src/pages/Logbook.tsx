/**
 * Logbook Page — Offline-first QSO logging interface.
 *
 * Composes QSOEntryForm, QSOLogViewer, QSOLogStats, ConflictBadge,
 * ConflictResolutionModal, and OfflineIndicator into a single-page
 * logbook experience.
 */

import { useState, useCallback } from "react";
import {
  QSOEntryForm,
  QSOLogViewer,
  QSOLogStats,
  ConflictBadge,
  ConflictResolutionModal,
} from "@/components/qso";
import { useConflicts } from "@/hooks/useConflicts";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useQSOStore } from "@/stores/qsoStore";

export function Logbook() {
  const totalCount = useQSOStore((s) => s.totalCount);
  const loadEntries = useQSOStore((s) => s.loadEntries);
  const { conflicts, conflictCount } = useConflicts();

  const [showStats, setShowStats] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const handleQSOLogged = useCallback(
    (_id: string) => {
      loadEntries();
    },
    [loadEntries],
  );

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
              Logbook
            </h1>
            <p className="text-gray-400 text-sm">
              {totalCount} {totalCount === 1 ? "QSO" : "QSOs"} logged
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats toggle */}
            <button
              onClick={() => setShowStats((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                showStats
                  ? "bg-signal-green/20 border-signal-green/50 text-signal-green"
                  : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-1.5">
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
              </span>
            </button>
            <ConflictBadge
              count={conflictCount}
              onClick={() => setShowConflictModal(true)}
            />
            <OfflineIndicator />
          </div>
        </div>

        {/* QSO Entry Form */}
        <QSOEntryForm onQSOLogged={handleQSOLogged} />

        {/* Stats (collapsible) */}
        {showStats && <QSOLogStats />}

        {/* Log Viewer */}
        <QSOLogViewer />
      </div>

      {/* Conflict resolution modal — shows first unresolved conflict */}
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
