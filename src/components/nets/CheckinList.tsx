/**
 * CheckinList -- Scrollable, reorderable list of check-in rows for a net session.
 *
 * Sorted by queuePosition. Each row shows callsign, status badge, relative time,
 * relay info, traffic notes, and action buttons. Supports HTML5 drag-and-drop reorder.
 * Supports a `compact` mode for sidebar use during rounds (reduced padding, hidden
 * drag handles/queue numbers/notes/time, smaller text and icons).
 *
 * ARIA: role="list" container, role="listitem" rows with descriptive labels,
 * aria-labels on all action buttons, aria-pressed on relay toggle.
 */

import { useState, useCallback, useMemo } from "react";
import type { NetCheckin, CheckinStatus } from "@/types/net";

// -- Props --------------------------------------------------------------------

interface CheckinListProps {
  checkins: NetCheckin[];
  onUpdateStatus: (id: string, status: CheckinStatus) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newPosition: number) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onToggleRelay: (id: string, isRelay: boolean, relayVia?: string) => void;
  compact?: boolean; // Reduced UI for sidebar use during rounds
}

// -- Status Badge Colors ------------------------------------------------------

const STATUS_BADGE: Record<
  CheckinStatus,
  { label: string; className: string }
> = {
  checked_in: {
    label: "Checked In",
    className: "bg-signal-green/15 text-signal-green border-signal-green/50",
  },
  had_turn: {
    label: "Had Turn",
    className: "bg-blue-500/20 text-blue-300 border-blue-400/50",
  },
  completed: {
    label: "Complete",
    className: "bg-gray-500/20 text-gray-300 border-gray-400/50",
  },
  skipped: {
    label: "Skipped",
    className: "bg-amber-500/15 text-amber-400 border-amber-400/50",
  },
};

// -- Status label for screen readers ------------------------------------------

const STATUS_SPOKEN: Record<CheckinStatus, string> = {
  checked_in: "checked in",
  had_turn: "had turn",
  completed: "complete",
  skipped: "skipped",
};

// -- Callsign Validation ------------------------------------------------------

const CALLSIGN_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}(\/[A-Z0-9]+)?$/i;

// -- Relative Time Helper -----------------------------------------------------

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// -- Component ----------------------------------------------------------------

export function CheckinList({
  checkins,
  onUpdateStatus,
  onRemove,
  onReorder,
  onUpdateNotes,
  onToggleRelay,
  compact = false,
}: CheckinListProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [relayCellEditId, setRelayCellEditId] = useState<string | null>(null);
  const [relayViaValue, setRelayViaValue] = useState("");

  const sorted = useMemo(
    () => [...checkins].sort((a, b) => a.queuePosition - b.queuePosition),
    [checkins],
  );

  // -- Compact mode class helpers -------------------------------------------

  const rowPadding = compact ? "px-3 py-2" : "px-4 py-3";
  const callsignSize = compact ? "text-xs" : "text-base font-bold";
  const iconSize = compact ? "w-3 h-3" : "w-4 h-4";
  const btnPadding = compact ? "p-1.5" : "p-2.5";
  const btnMinSize = compact
    ? "min-h-[28px] min-w-[28px]"
    : "min-h-[36px] min-w-[36px]";
  const focusRing =
    "focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none";

  // -- Drag & Drop ----------------------------------------------------------

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("application/x-checkin-id", id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetCheckin: NetCheckin) => {
      e.preventDefault();
      setDragOverId(null);
      const draggedId = e.dataTransfer.getData("application/x-checkin-id");
      if (!draggedId || draggedId === targetCheckin.id) return;
      onReorder(draggedId, targetCheckin.queuePosition);
    },
    [onReorder],
  );

  // -- Notes Editing --------------------------------------------------------

  const startEditNotes = useCallback((checkin: NetCheckin) => {
    setEditingNotesId(checkin.id);
    setNotesValue(checkin.trafficNotes ?? "");
  }, []);

  const saveNotes = useCallback(
    (id: string) => {
      onUpdateNotes(id, notesValue);
      setEditingNotesId(null);
      setNotesValue("");
    },
    [notesValue, onUpdateNotes],
  );

  // -- Relay Inline Editor --------------------------------------------------

  const submitRelayVia = useCallback(
    (id: string) => {
      const trimmed = relayViaValue.trim().toUpperCase();
      if (trimmed && CALLSIGN_RE.test(trimmed)) {
        onToggleRelay(id, true, trimmed);
      }
      setRelayCellEditId(null);
      setRelayViaValue("");
    },
    [relayViaValue, onToggleRelay],
  );

  const cancelRelayEdit = useCallback(() => {
    setRelayCellEditId(null);
    setRelayViaValue("");
  }, []);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <svg
          className="w-12 h-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
          />
        </svg>
        <p className="text-base text-gray-400">No check-ins yet</p>
        <p className="text-sm text-gray-400">Type a callsign above to begin</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto space-y-1.5 max-w-4xl mx-auto w-full"
      role="list"
      aria-label="Check-in list"
    >
      {sorted.map((checkin, index) => {
        const badge = STATUS_BADGE[checkin.status];
        const isEditing = editingNotesId === checkin.id;
        const spokenStatus = STATUS_SPOKEN[checkin.status];

        return (
          <div
            key={checkin.id}
            role="listitem"
            aria-label={`${checkin.callsign} - ${spokenStatus}, position ${index + 1}`}
            draggable={!compact}
            onDragStart={
              compact ? undefined : (e) => handleDragStart(e, checkin.id)
            }
            onDragOver={(e) => handleDragOver(e, checkin.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, checkin)}
            className={`
              group flex items-center gap-3 ${rowPadding} rounded-lg transition-colors select-none
              bg-white/[0.05] hover:bg-white/[0.12] border border-white/15
              border-l-2 border-l-transparent hover:border-l-plasma-orange/40
              animate-ncs-checkin-entrance
              ${checkin.status === "completed" ? "bg-white/[0.02]" : ""}
              ${checkin.status === "skipped" ? "bg-white/[0.02]" : ""}
              ${dragOverId === checkin.id ? "border-plasma-orange/60 bg-plasma-orange/10" : ""}
            `}
            style={{
              animationDelay: `${Math.min(index * 30, 300)}ms`,
              animationFillMode: "backwards",
            }}
          >
            {/* Drag handle -- hidden in compact mode */}
            {!compact && (
              <span
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-200 text-sm shrink-0 transition-colors"
                title="Drag to reorder"
                aria-hidden="true"
              >
                &#10495;
              </span>
            )}

            {/* Queue position -- hidden in compact mode */}
            {!compact && (
              <span className="text-xs font-mono text-gray-400 w-5 text-center shrink-0">
                {checkin.queuePosition}
              </span>
            )}

            {/* Callsign */}
            <span
              className={`font-mono ${callsignSize} min-w-[80px] group-hover:text-plasma-orange/90 transition-colors ${
                checkin.status === "completed"
                  ? "text-gray-400"
                  : checkin.status === "skipped"
                    ? "text-gray-500 line-through"
                    : "text-white"
              }`}
            >
              {checkin.callsign}
            </span>

            {/* Status badge */}
            <span
              className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full border ${badge.className}`}
              aria-label={`Status: ${spokenStatus}`}
            >
              {badge.label}
            </span>

            {/* Relay indicator */}
            {checkin.isRelay && checkin.relayVia && (
              <span className="text-xs text-purple-400 shrink-0">
                via {checkin.relayVia}
              </span>
            )}

            {/* Traffic notes -- hidden in compact mode (tooltip only) */}
            {checkin.trafficNotes && !isEditing && !compact && (
              <span
                className="text-xs text-gray-400 truncate max-w-[120px]"
                title={checkin.trafficNotes}
              >
                {checkin.trafficNotes}
              </span>
            )}

            {/* Notes inline editor */}
            {isEditing && (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  type="text"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNotes(checkin.id);
                    if (e.key === "Escape") setEditingNotesId(null);
                  }}
                  autoFocus
                  aria-label={`Traffic notes for ${checkin.callsign}`}
                  className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded px-2 py-0.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-plasma-orange/70"
                  placeholder="Traffic notes..."
                />
                <button
                  onClick={() => saveNotes(checkin.id)}
                  className="text-xs text-green-400 hover:text-green-300"
                  aria-label={`Save notes for ${checkin.callsign}`}
                >
                  &#10003;
                </button>
              </div>
            )}

            {/* Relative time -- hidden in compact mode */}
            {!compact && (
              <span className="text-xs text-gray-400 shrink-0 ml-auto">
                {relativeTime(checkin.checkedInAt)}
              </span>
            )}

            {/* Action buttons -- always visible */}
            <div
              className={`shrink-0 flex items-center gap-1 ${compact ? "ml-auto" : ""}`}
            >
              {/* Mark had_turn */}
              {checkin.status === "checked_in" && (
                <button
                  onClick={() => onUpdateStatus(checkin.id, "had_turn")}
                  className={`${btnPadding} ${btnMinSize} rounded-lg text-blue-400 hover:bg-blue-400/10 transition-colors ${focusRing}`}
                  aria-label={`Mark ${checkin.callsign} had turn`}
                  title="Had turn"
                >
                  <svg
                    className={iconSize}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}

              {/* Mark completed */}
              {(checkin.status === "checked_in" ||
                checkin.status === "had_turn") && (
                <button
                  onClick={() => onUpdateStatus(checkin.id, "completed")}
                  className={`${btnPadding} ${btnMinSize} rounded-lg text-green-400 hover:bg-green-400/10 transition-colors ${focusRing}`}
                  aria-label={`Mark ${checkin.callsign} complete`}
                  title="Complete"
                >
                  <svg
                    className={iconSize}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              )}

              {/* Skip */}
              {checkin.status === "checked_in" && (
                <button
                  onClick={() => onUpdateStatus(checkin.id, "skipped")}
                  className={`${btnPadding} ${btnMinSize} rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors ${focusRing}`}
                  aria-label={`Skip ${checkin.callsign}`}
                  title="Skip"
                >
                  <svg
                    className={iconSize}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 5l7 7-7 7M5 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}

              {/* Toggle relay */}
              <button
                onClick={() => {
                  if (checkin.isRelay) {
                    onToggleRelay(checkin.id, false);
                    if (relayCellEditId === checkin.id) cancelRelayEdit();
                  } else {
                    setRelayCellEditId(checkin.id);
                    setRelayViaValue("");
                  }
                }}
                className={`${btnPadding} ${btnMinSize} rounded-lg transition-colors ${focusRing} ${checkin.isRelay ? "text-purple-400 hover:bg-purple-400/10" : "text-gray-400 hover:bg-white/10"}`}
                aria-label={
                  checkin.isRelay
                    ? `Remove relay for ${checkin.callsign}`
                    : `Mark ${checkin.callsign} as relay`
                }
                aria-pressed={checkin.isRelay}
                title={checkin.isRelay ? "Remove relay" : "Mark as relay"}
              >
                <svg
                  className={iconSize}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </button>

              {/* Relay via inline input */}
              {relayCellEditId === checkin.id && (
                <input
                  type="text"
                  value={relayViaValue}
                  onChange={(e) =>
                    setRelayViaValue(e.target.value.toUpperCase())
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRelayVia(checkin.id);
                    if (e.key === "Escape") cancelRelayEdit();
                  }}
                  onBlur={() => cancelRelayEdit()}
                  autoFocus
                  placeholder="Via callsign"
                  aria-label={`Relay via callsign for ${checkin.callsign}`}
                  className="w-24 bg-white/5 border border-purple-500/30 rounded px-2 py-0.5 text-xs font-mono text-purple-300 uppercase focus:outline-none focus:ring-1 focus:ring-purple-400/50"
                />
              )}

              {/* Edit notes */}
              <button
                onClick={() => startEditNotes(checkin)}
                className={`${btnPadding} ${btnMinSize} rounded-lg text-gray-400 hover:bg-white/10 hover:text-white transition-colors ${focusRing}`}
                aria-label={`Edit notes for ${checkin.callsign}`}
                title={
                  compact && checkin.trafficNotes
                    ? checkin.trafficNotes
                    : undefined
                }
              >
                <svg
                  className={iconSize}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>

              {/* Remove */}
              <button
                onClick={() => onRemove(checkin.id)}
                className={`${btnPadding} ${btnMinSize} rounded-lg text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:shadow-[0_0_8px_rgba(248,113,113,0.3)] transition-all ${focusRing}`}
                aria-label={`Remove ${checkin.callsign}`}
              >
                <svg
                  className={iconSize}
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
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
