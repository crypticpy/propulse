/**
 * ContestQSOTable - QSO log table with edit/undo support
 * Displays recent QSOs with clickable rows for editing
 */

import { useMemo, useCallback, useState } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";

/**
 * Format time for QSO table display (HHMM)
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().slice(11, 16).replace(":", "");
}

export interface ContestQSOTableProps {
  /** Maximum number of QSOs to show (default: 20) */
  maxRows?: number;
  /** Optional class name for styling */
  className?: string;
  /** Callback when a QSO is selected for editing */
  onEditQSO?: (qso: ContestQSO) => void;
}

/**
 * ContestQSOTable component
 * Uses narrow Zustand selectors for minimal re-renders
 */
export function ContestQSOTable({
  maxRows = 20,
  className,
  onEditQSO,
}: ContestQSOTableProps) {
  // Narrow selectors
  const qsos = useContestStore((s) => s.activeSession?.qsos ?? []);
  const totalQsos = qsos.length;
  const undoLastQSO = useContestStore((s) => s.undoLastQSO);

  // State for undo confirmation
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  // Get recent QSOs (newest first)
  const recentQSOs = useMemo(() => {
    return [...qsos].reverse().slice(0, maxRows);
  }, [qsos, maxRows]);

  // Handle undo last QSO
  const handleUndo = useCallback(() => {
    undoLastQSO();
    setShowUndoConfirm(false);
  }, [undoLastQSO]);

  // Handle row click for editing
  const handleRowClick = useCallback(
    (qso: ContestQSO) => {
      if (onEditQSO) {
        onEditQSO(qso);
      }
    },
    [onEditQSO],
  );

  // Handle keyboard shortcuts on table
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Z for undo
      if (e.ctrlKey && e.key === "z" && totalQsos > 0) {
        e.preventDefault();
        setShowUndoConfirm(true);
      }
    },
    [totalQsos],
  );

  if (totalQsos === 0) {
    return (
      <Card className={`p-4 ${className ?? ""}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-orbitron text-sm font-bold text-white">
            Recent QSOs
          </h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          No QSOs logged yet. Start making contacts!
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`p-4 ${className ?? ""}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header with undo button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-orbitron text-sm font-bold text-white">
          Recent QSOs
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Showing last {Math.min(maxRows, totalQsos)} of {totalQsos}
          </span>
          <button
            onClick={() => setShowUndoConfirm(true)}
            className="px-2 py-1 text-xs bg-nebula-blue border border-white/10 rounded
                       text-gray-400 hover:text-white hover:border-white/20
                       transition-colors flex items-center gap-1"
            title="Undo last QSO (Ctrl+Z)"
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
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
            Undo
          </button>
        </div>
      </div>

      {/* QSO Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-white/10">
              <th className="pb-2 pr-4 font-medium">#</th>
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">Call</th>
              <th className="pb-2 pr-4 font-medium">Exch</th>
              <th className="pb-2 pr-4 font-medium">Band</th>
              <th className="pb-2 pr-4 font-medium">Mode</th>
              <th className="pb-2 pr-4 font-medium text-right">Pts</th>
              <th className="pb-2 font-medium">Mult</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {recentQSOs.map((qso, idx) => {
              const qsoNumber = totalQsos - idx;
              const isLastQso = idx === 0;

              return (
                <tr
                  key={qso.id}
                  onClick={() => handleRowClick(qso)}
                  className={`
                    border-b border-white/5 cursor-pointer transition-colors
                    ${qso.isDupe ? "opacity-50" : ""}
                    ${isLastQso ? "bg-white/5" : "hover:bg-white/5"}
                  `}
                >
                  <td className="py-2 pr-4 text-gray-500 text-xs">
                    {qsoNumber}
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {formatTime(qso.timestamp)}
                  </td>
                  <td
                    className={`py-2 pr-4 font-bold ${
                      qso.isDupe ? "text-alert-red line-through" : "text-white"
                    }`}
                  >
                    {qso.callsign}
                    {qso.isDupe && (
                      <span className="ml-2 text-[10px] text-alert-red">
                        DUPE
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-gray-300">
                    {qso.exchangeReceived}
                  </td>
                  <td className="py-2 pr-4 text-cosmic-cyan">{qso.band}</td>
                  <td className="py-2 pr-4 text-gray-400">{qso.mode}</td>
                  <td
                    className={`py-2 pr-4 text-right ${
                      qso.isDupe ? "text-gray-500" : "text-plasma-orange"
                    }`}
                  >
                    {qso.points}
                  </td>
                  <td className="py-2">
                    {qso.isMultiplier && qso.multipliers?.[0] && (
                      <span className="inline-flex items-center gap-1 text-signal-green">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {qso.multipliers[0]}
                      </span>
                    )}
                    {qso.flags?.edited && (
                      <span className="ml-1 text-[10px] text-yellow-500">
                        ✎
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Keyboard hint */}
      <div className="mt-3 text-xs text-gray-500 flex items-center gap-4">
        <span>
          <kbd className="px-1 py-0.5 bg-white/10 rounded">Ctrl+Z</kbd> Undo
        </span>
        <span>Click row to edit</span>
      </div>

      {/* Undo Confirmation Modal */}
      {showUndoConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowUndoConfirm(false)}
          />
          <Card className="relative z-10 w-full max-w-sm p-5" animate>
            <div className="space-y-4">
              <h3 className="text-lg font-orbitron font-bold text-white">
                Undo Last QSO?
              </h3>
              <p className="text-gray-400 text-sm">
                This will remove the last logged QSO:
              </p>
              {recentQSOs[0] && (
                <div className="bg-nebula-blue/50 p-3 rounded-lg font-mono text-sm">
                  <span className="text-white font-bold">
                    {recentQSOs[0].callsign}
                  </span>{" "}
                  <span className="text-gray-400">
                    {recentQSOs[0].exchangeReceived}
                  </span>{" "}
                  <span className="text-cosmic-cyan">{recentQSOs[0].band}</span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowUndoConfirm(false)}
                  className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg
                             text-gray-300 hover:text-white hover:border-white/20
                             transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUndo}
                  className="flex-1 px-4 py-2 bg-alert-red/20 border border-alert-red/50 rounded-lg
                             text-alert-red hover:bg-alert-red/30
                             transition-colors font-bold"
                >
                  Undo
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}

export default ContestQSOTable;
