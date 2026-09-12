/**
 * SessionSummaryCard -- Post-session summary statistics display.
 *
 * Parses a JSON summary string from a completed NetSession and renders
 * a stats grid showing check-ins, callsigns, duration, relay count,
 * peak queue depth, and a status breakdown bar.
 */

import type { NetSession } from "@/types/net";

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionSummaryCardProps {
  summary: string;
  session: NetSession;
  /** When provided, renders an "Export ADIF" button in the header. */
  onExportADIF?: () => void;
}

interface ParsedSummary {
  totalCheckins?: number;
  uniqueCallsigns?: number;
  durationMinutes?: number;
  relayCount?: number;
  peakQueueDepth?: number;
  statusBreakdown?: {
    completed?: number;
    skipped?: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSummary(raw: string): ParsedSummary | null {
  try {
    return JSON.parse(raw) as ParsedSummary;
  } catch {
    return null;
  }
}

function formatDuration(minutes?: number): string {
  if (minutes == null || minutes < 0) return "--";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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

// ── Component ────────────────────────────────────────────────────────────────

export function SessionSummaryCard({
  summary,
  session,
  onExportADIF,
}: SessionSummaryCardProps) {
  const data = parseSummary(summary);

  if (!data) {
    return (
      <div className="bg-panel/30 border border-su-line/20 rounded-xl p-4">
        <p className="text-sm text-su-muted">No summary available.</p>
      </div>
    );
  }

  const completed = data.statusBreakdown?.completed ?? 0;
  const skipped = data.statusBreakdown?.skipped ?? 0;
  const totalBreakdown = completed + skipped;
  const completedPct =
    totalBreakdown > 0 ? (completed / totalBreakdown) * 100 : 0;

  return (
    <div className="bg-panel/30 border border-su-line/20 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-su-text">Session Summary</h4>
        <div className="flex items-center gap-2">
          {onExportADIF && (
            <button
              onClick={onExportADIF}
              className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Export ADIF
            </button>
          )}
          <span className="text-xs text-su-muted">
            {formatDate(session.startedAt)}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Total check-ins */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted">
            Total Check-ins
          </p>
          <p className="text-lg font-bold text-su-text">
            {data.totalCheckins ?? "--"}
          </p>
        </div>

        {/* Unique callsigns */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted">
            Unique Callsigns
          </p>
          <p className="text-lg font-bold text-su-text">
            {data.uniqueCallsigns ?? "--"}
          </p>
        </div>

        {/* Duration */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted">
            Duration
          </p>
          <p className="text-lg font-bold text-su-text">
            {formatDuration(data.durationMinutes)}
          </p>
        </div>

        {/* Relay count */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted">
            Relay Count
          </p>
          <p className="text-lg font-bold text-su-text">
            {data.relayCount ?? "--"}
          </p>
        </div>

        {/* Peak queue depth */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted">
            Peak Queue Depth
          </p>
          <p className="text-lg font-bold text-su-text">
            {data.peakQueueDepth ?? "--"}
          </p>
        </div>

        {/* Status breakdown */}
        <div>
          <p className="text-xs uppercase tracking-widest text-su-muted mb-1">
            Status Breakdown
          </p>
          {totalBreakdown > 0 ? (
            <div>
              <div className="flex h-2 rounded-full overflow-hidden bg-su-line/10">
                <div
                  className="bg-signal-green transition-all"
                  style={{ width: `${completedPct}%` }}
                />
                <div
                  className="bg-su-line transition-all"
                  style={{ width: `${100 - completedPct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-signal-green">
                  {completed} completed
                </span>
                <span className="text-xs text-su-muted">
                  {skipped} skipped
                </span>
              </div>
            </div>
          ) : (
            <p className="text-lg font-bold text-su-text">--</p>
          )}
        </div>
      </div>
    </div>
  );
}
