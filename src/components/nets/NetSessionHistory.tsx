/**
 * NetSessionHistory -- List of past net sessions with date, NCS, duration, and check-in count.
 *
 * Renders a chronological list of completed (and cancelled) sessions.
 * Each row shows a formatted date, the NCS operator callsign, computed
 * duration, and the total check-in count. Sessions with summaries can
 * be expanded inline to reveal a SessionSummaryCard.
 */

import { useState } from "react";
import type { NetSession } from "@/types/net";
import { SessionSummaryCard } from "@/components/nets/SessionSummaryCard";

interface NetSessionHistoryProps {
  sessions: NetSession[];
  /** When provided, renders an export button on each session row. */
  onExportSession?: (sessionId: string) => void;
}

/** Compute duration in minutes between two ISO timestamps. */
function computeDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return "In progress";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const minutes = Math.round((end - start) / 60_000);

  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

/** Format an ISO date string to a short, readable format. */
function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export function NetSessionHistory({
  sessions,
  onExportSession,
}: NetSessionHistoryProps) {
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(
    null,
  );

  // Filter to only completed/cancelled sessions (not live ones)
  const pastSessions = sessions.filter(
    (s) => s.status === "completed" || s.status === "cancelled",
  );

  if (pastSessions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-su-muted text-sm">No past sessions recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {pastSessions.map((session) => {
        const hasSummary = !!session.summary;
        const isExpanded = expandedSummaryId === session.id;

        return (
          <div key={session.id} className="space-y-0">
            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl bg-su-line/10 hover:bg-su-line/20 transition-colors">
              {/* Date */}
              <div className="min-w-[90px]">
                <span className="text-xs text-su-muted">
                  {formatDate(session.startedAt)}
                </span>
              </div>

              {/* NCS callsign */}
              <div className="min-w-[80px]">
                <span className="text-xs font-mono text-plasma-orange font-medium">
                  {session.ncsCallsign}
                </span>
              </div>

              {/* Duration */}
              <div className="flex-1">
                <span className="text-xs text-su-muted">
                  {computeDuration(session.startedAt, session.endedAt)}
                </span>
              </div>

              {/* Check-in count */}
              <div className="flex items-center gap-1 text-xs text-su-muted">
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span>{session.checkinCount}</span>
              </div>

              {/* Export ADIF button */}
              {onExportSession && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExportSession(session.id);
                  }}
                  title="Export ADIF"
                  className="p-1 text-su-muted hover:text-plasma-orange transition-colors rounded"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>
              )}

              {/* Status indicator for cancelled sessions */}
              {session.status === "cancelled" && (
                <span className="text-xs text-red-400/70 font-medium uppercase">
                  Cancelled
                </span>
              )}

              {/* Summary toggle button */}
              {hasSummary && (
                <button
                  onClick={() =>
                    setExpandedSummaryId(isExpanded ? null : session.id)
                  }
                  aria-expanded={isExpanded}
                  aria-controls={`session-details-${session.id}`}
                  className={`px-2 py-0.5 text-xs font-medium rounded-md border transition-colors ${
                    isExpanded
                      ? "bg-nebula-blue/20 text-su-text border-nebula-blue/30"
                      : "bg-su-line/10 text-su-muted border-su-line/40 hover:bg-su-line/20 hover:text-su-text"
                  }`}
                >
                  Summary
                </button>
              )}
            </div>

            {/* Expandable session summary card */}
            {hasSummary && isExpanded && session.summary && (
              <div
                id={`session-details-${session.id}`}
                className="ml-3 mr-3 mt-1 mb-2"
              >
                <SessionSummaryCard
                  summary={session.summary}
                  session={session}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
