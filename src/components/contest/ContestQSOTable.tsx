/**
 * ContestQSOTable - QSO log table with edit/undo support
 * Displays recent QSOs with clickable rows for editing
 *
 * Phase 8.1 - Performance optimized for elite contest rates (5000+ QSOs)
 * Phase 8.2 - Accessibility: color-blind safe indicators, high-contrast support
 */

import { useMemo, useCallback, useState, memo } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";

/**
 * Format time for QSO table display (HHMM)
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().slice(11, 16).replace(":", "");
}

/** Default number of rows to show initially */
const DEFAULT_VISIBLE_ROWS = 50;
/** Number of rows to add when loading more */
const LOAD_MORE_INCREMENT = 50;

export interface ContestQSOTableProps {
  /** Maximum number of QSOs to show initially (default: 50) */
  maxRows?: number;
  /** Optional class name for styling */
  className?: string;
  /** Callback when a QSO is selected for editing */
  onEditQSO?: (qso: ContestQSO) => void;
}

/** Props for the memoized QSO row component */
interface QSORowProps {
  qso: ContestQSO;
  qsoNumber: number;
  isLastQso: boolean;
  onRowClick: (qso: ContestQSO) => void;
}

/**
 * Memoized QSO row component for performance optimization
 * Prevents re-renders of individual rows when other QSOs change
 */
const QSORow = memo(function QSORow({
  qso,
  qsoNumber,
  isLastQso,
  onRowClick,
}: QSORowProps) {
  return (
    <tr
      onClick={() => onRowClick(qso)}
      className={`
        border-b border-white/5 cursor-pointer transition-colors
        ${qso.isDupe ? "opacity-50" : ""}
        ${isLastQso ? "bg-white/5" : "hover:bg-white/5"}
      `}
    >
      <td className="py-2 pr-4 text-gray-500 text-xs">{qsoNumber}</td>
      <td className="py-2 pr-4 text-gray-400">{formatTime(qso.timestamp)}</td>
      <td
        className={`py-2 pr-4 font-bold ${
          qso.isDupe ? "text-alert-red line-through" : "text-white"
        }`}
      >
        {qso.callsign}
        {qso.isDupe && (
          <span
            className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-alert-red"
            role="status"
            aria-label="Duplicate contact"
          >
            {/* X icon for color-blind accessibility */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            DUPE
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-gray-300">{qso.exchangeReceived}</td>
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
          <span
            className="inline-flex items-center gap-1 text-signal-green"
            role="status"
            aria-label={`New multiplier: ${qso.multipliers[0]}`}
          >
            {/* Star icon for color-blind accessibility */}
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {qso.multipliers[0]}
          </span>
        )}
        {qso.flags?.edited && (
          <span
            className="ml-1 text-[10px] text-yellow-500"
            title="Edited"
            aria-label="This QSO has been edited"
          >
            <svg
              className="w-3 h-3 inline"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </span>
        )}
      </td>
    </tr>
  );
});

/**
 * ContestQSOTable component
 * Uses narrow Zustand selectors for minimal re-renders
 * Performance optimized with memoized rows and pagination for 5000+ QSOs
 */
export function ContestQSOTable({
  maxRows = DEFAULT_VISIBLE_ROWS,
  className,
  onEditQSO,
}: ContestQSOTableProps) {
  // Narrow selectors - only subscribe to what we need
  const qsos = useContestStore((s) => s.activeSession?.qsos ?? []);
  const totalQsos = qsos.length;
  const undoLastQSO = useContestStore((s) => s.undoLastQSO);

  // State for undo confirmation
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);

  // State for pagination - how many rows to currently show
  const [visibleRows, setVisibleRows] = useState(maxRows);

  // Get recent QSOs (newest first) with pagination
  const recentQSOs = useMemo(() => {
    return [...qsos].reverse().slice(0, visibleRows);
  }, [qsos, visibleRows]);

  // Calculate if there are more rows to load
  const hasMoreRows = visibleRows < totalQsos;
  const remainingRows = Math.max(0, totalQsos - visibleRows);

  // Handle loading more rows
  const handleLoadMore = useCallback(() => {
    setVisibleRows((prev) => Math.min(prev + LOAD_MORE_INCREMENT, totalQsos));
  }, [totalQsos]);

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
        <table className="w-full text-sm" role="grid" aria-label="Recent QSOs">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-white/10">
              <th className="pb-2 pr-4 font-medium" scope="col">
                #
              </th>
              <th className="pb-2 pr-4 font-medium" scope="col">
                Time
              </th>
              <th className="pb-2 pr-4 font-medium" scope="col">
                Call
              </th>
              <th className="pb-2 pr-4 font-medium" scope="col">
                Exch
              </th>
              <th className="pb-2 pr-4 font-medium" scope="col">
                Band
              </th>
              <th className="pb-2 pr-4 font-medium" scope="col">
                Mode
              </th>
              <th className="pb-2 pr-4 font-medium text-right" scope="col">
                Pts
              </th>
              <th className="pb-2 font-medium" scope="col">
                Mult
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {recentQSOs.map((qso, idx) => (
              <QSORow
                key={qso.id}
                qso={qso}
                qsoNumber={totalQsos - idx}
                isLastQso={idx === 0}
                onRowClick={handleRowClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Load More button for large logs */}
      {hasMoreRows && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 text-sm bg-nebula-blue border border-white/10 rounded-lg
                       text-gray-300 hover:text-white hover:border-white/20
                       transition-colors flex items-center gap-2"
            aria-label={`Load ${Math.min(LOAD_MORE_INCREMENT, remainingRows)} more QSOs`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
            Load more ({remainingRows} remaining)
          </button>
        </div>
      )}

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
