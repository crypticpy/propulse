/**
 * NetParticipationLog — table/card list of the current user's past net check-ins.
 *
 * Renders as a table on desktop and stacked cards on mobile.
 * Shows a streak badge when filtered to a single net.
 */

import React from "react";
import { useMyNetParticipation } from "@/hooks/useMyNetParticipation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StreakBadge } from "@/components/nets/StreakBadge";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format an ISO string as "Jan 15, 2026 14:30 UTC". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }) + " UTC"
  );
}

/** Status badge color classes keyed by CheckinStatus value. */
const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  skipped: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  had_turn: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  checked_in: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

/** Human-readable label for a check-in status. */
const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  skipped: "Skipped",
  had_turn: "Had Turn",
  checked_in: "Checked In",
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.checked_in;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}
    >
      {label}
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface NetParticipationLogProps {
  /** Optional filter to a single net. If omitted, shows all nets. */
  netId?: string;
}

export const NetParticipationLog: React.FC<NetParticipationLogProps> = ({
  netId,
}) => {
  const { entries, isLoading, error, streak } = useMyNetParticipation(netId);
  const isMobile = useIsMobile();

  // ── Loading state ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="md" text="Loading check-in history..." />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-panel/30 p-6 text-center text-sm text-gray-400">
        No check-ins yet. Join a net session to start building your log.
      </div>
    );
  }

  // ── Header ─────────────────────────────────────────────────────────

  const header = (
    <div className="mb-3 flex items-center gap-3">
      <h3 className="text-sm font-semibold text-gray-200">My Net Check-Ins</h3>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-400">
        {entries.length}
      </span>
      {streak && streak.current > 0 && (
        <StreakBadge streak={streak.current} size="sm" />
      )}
    </div>
  );

  // ── Mobile: card layout ────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="rounded-2xl border border-white/5 bg-panel/30 p-4">
        {header}
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={`${entry.sessionId}-${entry.checkedInAt}`}
              className="rounded-xl border border-white/5 bg-white/[0.03] p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {formatDate(entry.sessionDate)}
                </span>
                <StatusBadge status={entry.status} />
              </div>
              {!netId && (
                <p className="mb-1 text-sm font-medium text-gray-200">
                  {entry.netName}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Queue position: #{entry.queuePosition}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop: table layout ──────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-white/5 bg-panel/30 p-4">
      {header}
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-panel/80 text-xs uppercase text-gray-500 backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              {!netId && <th className="px-3 py-2 font-medium">Net Name</th>}
              <th className="px-3 py-2 font-medium">Position</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {entries.map((entry) => (
              <tr
                key={`${entry.sessionId}-${entry.checkedInAt}`}
                className="transition-colors hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-3 py-2 text-gray-300">
                  {formatDate(entry.sessionDate)}
                </td>
                {!netId && (
                  <td className="px-3 py-2 text-gray-200">{entry.netName}</td>
                )}
                <td className="px-3 py-2 text-gray-400">
                  #{entry.queuePosition}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

NetParticipationLog.displayName = "NetParticipationLog";

export default NetParticipationLog;
