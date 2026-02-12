/**
 * QueuePanel -- Shows the speaking queue derived from session check-ins.
 *
 * Displays NOW SPEAKING, NEXT, and THEN slots with large callsign text.
 * Provides Done and Skip buttons for the NCS operator to advance the queue.
 *
 * ARIA: aria-live="polite" on Now Speaking slot so screen readers announce
 * speaker changes, role="list" on queue, descriptive button labels.
 */

import type { NetCheckin } from "@/types/net";

interface QueuePanelProps {
  checkins: NetCheckin[];
  onAdvance: () => void;
  onSkip: () => void;
}

// ── Queue Slot ───────────────────────────────────────────────────────────────

function QueueSlot({
  label,
  callsign,
  highlight,
  live,
}: {
  label: string;
  callsign: string | null;
  highlight?: boolean;
  /** aria-live politeness level for this slot */
  live?: "polite" | "off";
}) {
  return (
    <div
      className={`
        rounded-xl px-4 py-3 transition-colors
        ${highlight ? "bg-plasma-orange/10 border border-plasma-orange/30" : "bg-white/[0.03] border border-white/5"}
      `}
      aria-live={live}
      aria-atomic={live ? true : undefined}
    >
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {label}
      </p>
      {callsign ? (
        <p
          className={`font-mono font-bold text-lg ${highlight ? "text-plasma-orange" : "text-white"}`}
        >
          {callsign}
        </p>
      ) : (
        <p className="text-sm text-gray-600 italic">---</p>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function QueuePanel({ checkins, onAdvance, onSkip }: QueuePanelProps) {
  // Build the speaking queue: only checked_in or had_turn, sorted by position
  const queue = [...checkins]
    .filter((c) => c.status === "checked_in" || c.status === "had_turn")
    .sort((a, b) => a.queuePosition - b.queuePosition);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const then = queue[2] ?? null;
  const isEmpty = queue.length === 0;

  return (
    <div className="space-y-3" aria-label="Speaking queue" role="region">
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
        Speaking Queue
      </h3>

      {isEmpty ? (
        <div
          className="flex items-center justify-center py-6 text-sm text-gray-500"
          aria-live="polite"
        >
          No stations in queue
        </div>
      ) : (
        <div className="space-y-2" role="list" aria-label="Operator queue">
          <div role="listitem">
            <QueueSlot
              label="Now Speaking"
              callsign={current?.callsign ?? null}
              highlight
              live="polite"
            />
          </div>
          <div role="listitem">
            <QueueSlot label="Next" callsign={next?.callsign ?? null} />
          </div>
          <div role="listitem">
            <QueueSlot label="Then" callsign={then?.callsign ?? null} />
          </div>
        </div>
      )}

      {/* Controls */}
      {!isEmpty && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onAdvance}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
            aria-label={
              current
                ? `Mark ${current.callsign} done and advance queue`
                : "Advance queue"
            }
          >
            Done
          </button>
          <button
            onClick={onSkip}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            aria-label={
              current
                ? `Skip ${current.callsign} and advance queue`
                : "Skip current station"
            }
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
