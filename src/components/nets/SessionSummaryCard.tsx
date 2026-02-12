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
      <div className="bg-panel/30 border border-white/5 rounded-xl p-4">
        <p className="text-sm text-gray-500">No summary available.</p>
      </div>
    );
  }

  const completed = data.statusBreakdown?.completed ?? 0;
  const skipped = data.statusBreakdown?.skipped ?? 0;
  const totalBreakdown = completed + skipped;
  const completedPct =
    totalBreakdown > 0 ? (completed / totalBreakdown) * 100 : 0;

  return (
    <div className="bg-panel/30 border border-white/5 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-white">Session Summary</h4>
        <div className="flex items-center gap-2">
          {onExportADIF && (
            <button
              onClick={onExportADIF}
              className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Export ADIF
            </button>
          )}
          <span className="text-[10px] text-gray-500">
            {formatDate(session.startedAt)}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Total check-ins */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">
            Total Check-ins
          </p>
          <p className="text-lg font-bold text-white">
            {data.totalCheckins ?? "--"}
          </p>
        </div>

        {/* Unique callsigns */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">
            Unique Callsigns
          </p>
          <p className="text-lg font-bold text-white">
            {data.uniqueCallsigns ?? "--"}
          </p>
        </div>

        {/* Duration */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">
            Duration
          </p>
          <p className="text-lg font-bold text-white">
            {formatDuration(data.durationMinutes)}
          </p>
        </div>

        {/* Relay count */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">
            Relay Count
          </p>
          <p className="text-lg font-bold text-white">
            {data.relayCount ?? "--"}
          </p>
        </div>

        {/* Peak queue depth */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500">
            Peak Queue Depth
          </p>
          <p className="text-lg font-bold text-white">
            {data.peakQueueDepth ?? "--"}
          </p>
        </div>

        {/* Status breakdown */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Status Breakdown
          </p>
          {totalBreakdown > 0 ? (
            <div>
              <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                <div
                  className="bg-signal-green transition-all"
                  style={{ width: `${completedPct}%` }}
                />
                <div
                  className="bg-gray-500 transition-all"
                  style={{ width: `${100 - completedPct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-signal-green">
                  {completed} completed
                </span>
                <span className="text-[10px] text-gray-500">
                  {skipped} skipped
                </span>
              </div>
            </div>
          ) : (
            <p className="text-lg font-bold text-white">--</p>
          )}
        </div>
      </div>
    </div>
  );
}
