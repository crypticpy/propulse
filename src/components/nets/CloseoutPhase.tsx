/**
 * CloseoutPhase -- Session closeout with summary stats, notes, and close net.
 *
 * Displays an auto-generated session summary card with stats (total check-ins,
 * unique callsigns, duration, completed, skipped, relays), a debounced
 * auto-save session notes textarea, and a prominent "Close Net Session" button
 * guarded by a ConfirmDialog.
 *
 * ARIA: descriptive region label, dialog patterns via ConfirmDialog.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { Net, NetSession, NetCheckin } from "@/types/net";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** Debounce delay for auto-saving notes (ms) */
const NOTES_SAVE_DEBOUNCE_MS = 2_000;

// ── Props ────────────────────────────────────────────────────────────────────

interface CloseoutPhaseProps {
  checkins: NetCheckin[];
  session: NetSession;
  net: Net;
  onEndSession: (notes?: string) => void;
  onUpdateSession: (sessionId: string, updates: { notes?: string }) => void;
}

// ── Stat Cell ────────────────────────────────────────────────────────────────

function StatCell({
  value,
  label,
  colorClass = "text-white",
}: {
  value: number | string;
  label: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 text-center">
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function CloseoutPhase({
  checkins,
  session,
  net,
  onEndSession,
  onUpdateSession,
}: CloseoutPhaseProps) {
  const [notes, setNotes] = useState(session.notes ?? "");
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsed = useElapsedTime(session.startedAt);

  // ── Sync notes from session when session changes ──────────────────────────

  useEffect(() => {
    setNotes(session.notes ?? "");
  }, [session.notes]);

  // ── Debounced Auto-Save ───────────────────────────────────────────────────

  const saveNotes = useCallback(
    (value: string) => {
      onUpdateSession(session.id, { notes: value || undefined });
    },
    [session.id, onUpdateSession],
  );

  /** Clear pending debounce on unmount */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setNotes(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => saveNotes(value),
        NOTES_SAVE_DEBOUNCE_MS,
      );
    },
    [saveNotes],
  );

  const handleNotesBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    saveNotes(notes);
  }, [notes, saveNotes]);

  // ── Computed Stats ────────────────────────────────────────────────────────

  const totalCheckins = checkins.length;
  const uniqueCallsigns = new Set(checkins.map((c) => c.callsign)).size;
  const completedCount = checkins.filter(
    (c) => c.status === "completed",
  ).length;
  const skippedCount = checkins.filter((c) => c.status === "skipped").length;
  const relayCount = checkins.filter((c) => c.isRelay).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="max-w-2xl mx-auto space-y-6 py-6"
      role="region"
      aria-label="Session closeout"
    >
      {/* Session Complete Header */}
      <div className="flex items-center justify-center gap-2.5 mb-2">
        <svg
          className="w-5 h-5 text-signal-green"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-signal-green">
          Session Complete
        </h2>
      </div>

      {/* Session Summary Card */}
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">
          Session Summary
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCell value={totalCheckins} label="Total Check-Ins" />
          <StatCell value={uniqueCallsigns} label="Unique Callsigns" />
          <StatCell value={elapsed} label="Duration" />
          <StatCell
            value={completedCount}
            label="Completed"
            colorClass="text-signal-green"
          />
          <StatCell
            value={skippedCount}
            label="Skipped"
            colorClass="text-caution-amber"
          />
          <StatCell
            value={relayCount}
            label="Relays"
            colorClass="text-purple-400"
          />
        </div>
      </div>

      {/* Session Notes */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-500">
          Session Notes
        </p>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          onBlur={handleNotesBlur}
          placeholder="Session notes, highlights, follow-ups..."
          rows={5}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-plasma-orange/50 resize-none"
          aria-label={`Session notes for ${net.name}`}
        />
      </div>

      {/* Close Net Button */}
      <div className="flex flex-col items-center pt-2">
        <button
          onClick={() => setShowConfirmEnd(true)}
          className="px-8 py-3 text-sm font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/50"
          aria-label="Close net session"
        >
          Close Net Session
        </button>
        <p className="text-[10px] text-gray-500 mt-2">
          Session data will be saved automatically
        </p>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirmEnd}
        onConfirm={() => {
          setShowConfirmEnd(false);
          onEndSession(notes || undefined);
        }}
        onCancel={() => setShowConfirmEnd(false)}
        title="Close Net Session"
        message="Are you sure you want to close this net session? All check-ins will be finalized and the session summary will be saved."
        confirmLabel="Close Net"
        variant="warning"
      />
    </div>
  );
}
