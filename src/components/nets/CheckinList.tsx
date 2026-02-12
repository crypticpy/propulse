/**
 * CheckinList -- Scrollable, reorderable list of check-in rows for a net session.
 *
 * Sorted by queuePosition. Each row shows callsign, status badge, relative time,
 * relay info, traffic notes, and action buttons. Supports HTML5 drag-and-drop reorder.
 *
 * ARIA: role="list" container, role="listitem" rows with descriptive labels,
 * aria-labels on all action buttons, aria-pressed on relay toggle.
 */

import { useState, useCallback, useMemo } from "react";
import type { NetCheckin, CheckinStatus } from "@/types/net";

// ── Props ────────────────────────────────────────────────────────────────────

interface CheckinListProps {
  checkins: NetCheckin[];
  onUpdateStatus: (id: string, status: CheckinStatus) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newPosition: number) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onToggleRelay: (id: string, isRelay: boolean, relayVia?: string) => void;
}

// ── Status Badge Colors ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<
  CheckinStatus,
  { label: string; className: string }
> = {
  checked_in: {
    label: "Checked In",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  had_turn: {
    label: "Had Turn",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  completed: {
    label: "Complete",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  },
  skipped: {
    label: "Skipped",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
};

// ── Status label for screen readers ─────────────────────────────────────────

const STATUS_SPOKEN: Record<CheckinStatus, string> = {
  checked_in: "checked in",
  had_turn: "had turn",
  completed: "complete",
  skipped: "skipped",
};

// ── Callsign Validation ──────────────────────────────────────────────────────

const CALLSIGN_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}(\/[A-Z0-9]+)?$/i;

// ── Relative Time Helper ─────────────────────────────────────────────────────

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CheckinList({
  checkins,
  onUpdateStatus,
  onRemove,
  onReorder,
  onUpdateNotes,
  onToggleRelay,
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

  // ── Drag & Drop ──────────────────────────────────────────────────────────

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

  // ── Notes Editing ──────────────────────────────────────────────────────────

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

  // ── Relay Inline Editor ──────────────────────────────────────────────────

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
      <div className="flex items-center justify-center py-8 text-sm text-gray-500">
        No check-ins yet. Type a callsign above to begin.
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto space-y-px"
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
            draggable
            onDragStart={(e) => handleDragStart(e, checkin.id)}
            onDragOver={(e) => handleDragOver(e, checkin.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, checkin)}
            className={`
              group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors select-none
              bg-white/[0.02] hover:bg-white/[0.05] border border-transparent
              ${dragOverId === checkin.id ? "border-plasma-orange/40 bg-plasma-orange/5" : ""}
            `}
          >
            {/* Drag handle */}
            <span
              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 text-sm shrink-0"
              title="Drag to reorder"
              aria-hidden="true"
            >
              &#10495;
            </span>

            {/* Queue position */}
            <span className="text-[10px] font-mono text-gray-600 w-5 text-center shrink-0">
              {checkin.queuePosition}
            </span>

            {/* Callsign */}
            <span className="font-mono font-bold text-sm text-white min-w-[80px]">
              {checkin.callsign}
            </span>

            {/* Status badge */}
            <span
              className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${badge.className}`}
              aria-label={`Status: ${spokenStatus}`}
            >
              {badge.label}
            </span>

            {/* Relay indicator */}
            {checkin.isRelay && checkin.relayVia && (
              <span className="text-[10px] text-purple-400 shrink-0">
                via {checkin.relayVia}
              </span>
            )}

            {/* Traffic notes */}
            {checkin.trafficNotes && !isEditing && (
              <span
                className="text-[10px] text-gray-500 truncate max-w-[120px]"
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
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-plasma-orange/50"
                  placeholder="Traffic notes..."
                />
                <button
                  onClick={() => saveNotes(checkin.id)}
                  className="text-[10px] text-green-400 hover:text-green-300"
                  aria-label={`Save notes for ${checkin.callsign}`}
                >
                  &#10003;
                </button>
              </div>
            )}

            {/* Relative time */}
            <span className="text-[10px] text-gray-600 shrink-0 ml-auto">
              {relativeTime(checkin.checkedInAt)}
            </span>

            {/* Action buttons (visible on hover) */}
            <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Mark had_turn */}
              {checkin.status === "checked_in" && (
                <button
                  onClick={() => onUpdateStatus(checkin.id, "had_turn")}
                  className="p-1 rounded text-blue-400 hover:bg-blue-400/10 transition-colors"
                  aria-label={`Mark ${checkin.callsign} had turn`}
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  className="p-1 rounded text-green-400 hover:bg-green-400/10 transition-colors"
                  aria-label={`Mark ${checkin.callsign} complete`}
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                  className="p-1 rounded text-amber-400 hover:bg-amber-400/10 transition-colors"
                  aria-label={`Skip ${checkin.callsign}`}
                >
                  <svg
                    className="w-3.5 h-3.5"
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
                className={`p-1 rounded transition-colors ${checkin.isRelay ? "text-purple-400 hover:bg-purple-400/10" : "text-gray-500 hover:bg-white/5"}`}
                aria-label={
                  checkin.isRelay
                    ? `Remove relay for ${checkin.callsign}`
                    : `Mark ${checkin.callsign} as relay`
                }
                aria-pressed={checkin.isRelay}
              >
                <svg
                  className="w-3.5 h-3.5"
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
                  className="w-24 bg-white/5 border border-purple-500/30 rounded px-2 py-0.5 text-[11px] font-mono text-purple-300 uppercase focus:outline-none focus:ring-1 focus:ring-purple-400/50"
                />
              )}

              {/* Edit notes */}
              <button
                onClick={() => startEditNotes(checkin)}
                className="p-1 rounded text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
                aria-label={`Edit notes for ${checkin.callsign}`}
              >
                <svg
                  className="w-3.5 h-3.5"
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
                className="p-1 rounded text-red-400/60 hover:bg-red-400/10 hover:text-red-400 transition-colors"
                aria-label={`Remove ${checkin.callsign}`}
              >
                <svg
                  className="w-3.5 h-3.5"
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
