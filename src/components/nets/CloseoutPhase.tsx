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
  delay = 0,
}: {
  value: number | string;
  label: string;
  colorClass?: string;
  delay?: number;
}) {
  return (
    <div
      className="bg-white/[0.03] border border-white/10 rounded-xl p-4 overflow-hidden animate-ncs-stat-shimmer"
      style={{ animationDelay: `${delay}ms`, opacity: 1 }}
    >
      <p className={`text-3xl font-mono font-bold tabular-nums ${colorClass}`}>
        {value}
      </p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
        {label}
      </p>
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
      className="max-w-2xl mx-auto space-y-6 py-6 animate-in fade-in"
      role="region"
      aria-label="Session closeout"
    >
      {/* Session Complete Header */}
      <div className="flex flex-col items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-signal-green/10 border border-signal-green/20 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-signal-green"
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
        </div>
        <h2 className="text-xs font-orbitron font-semibold uppercase tracking-[0.2em] text-signal-green">
          Session Complete
        </h2>
      </div>

      {/* Session Summary Card */}
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">
          Session Summary
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCell value={totalCheckins} label="Total Check-Ins" delay={0} />
          <StatCell
            value={uniqueCallsigns}
            label="Unique Callsigns"
            delay={75}
          />
          <StatCell value={elapsed} label="Duration" delay={150} />
          <StatCell
            value={completedCount}
            label="Completed"
            colorClass="text-signal-green"
            delay={225}
          />
          <StatCell
            value={skippedCount}
            label="Skipped"
            colorClass="text-caution-amber"
            delay={300}
          />
          <StatCell
            value={relayCount}
            label="Relays"
            colorClass="text-purple-400"
            delay={375}
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
          className="w-full bg-void border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/30 resize-none transition-colors"
          aria-label={`Session notes for ${net.name}`}
        />
      </div>

      {/* Close Net Button */}
      <div className="flex flex-col items-center pt-2">
        <button
          onClick={() => setShowConfirmEnd(true)}
          className="group px-10 py-4 text-base font-bold rounded-2xl bg-alert-red/10 text-alert-red border-2 border-alert-red/20 hover:bg-alert-red/20 hover:border-alert-red/30 hover:-translate-y-0.5 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-alert-red/50"
          aria-label="Close net session"
        >
          <span className="inline-flex items-center gap-2">
            Close Net Session
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
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </span>
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
