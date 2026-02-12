/**
 * SessionControls -- Net session lifecycle toolbar.
 *
 * Pre-session: prominent "Start Net Session" button with preamble management.
 * Active session: preamble toggle, close net button (with ConfirmDialog),
 * session notes textarea, and elapsed time display.
 * Non-managers see read-only session info.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Net, NetSession } from "@/types/net";
import { useNetStore } from "@/stores/netStore";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PreambleEditor } from "@/components/nets/PreambleEditor";

/** Debounce delay for auto-saving notes (ms) */
const NOTES_SAVE_DEBOUNCE_MS = 2_000;

interface SessionControlsProps {
  net: Net;
  session: NetSession | null;
  onStartSession: () => void;
  onEndSession: (notes?: string) => void;
  isManager: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SessionControls({
  net,
  session,
  onStartSession,
  onEndSession,
  isManager,
}: SessionControlsProps) {
  const [showPreamble, setShowPreamble] = useState(false);
  const [showPreambleEditor, setShowPreambleEditor] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [sessionNotes, setSessionNotes] = useState(session?.notes ?? "");
  const elapsed = useElapsedTime(session?.startedAt);

  const updateSession = useNetStore((s) => s.updateSession);
  const updateNet = useNetStore((s) => s.updateNet);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync notes from session (only when session changes, not from local edits)
  useEffect(() => {
    setSessionNotes(session?.notes ?? "");
  }, [session?.notes]);

  /** Persist notes to Supabase via the lightweight updateSession action */
  const saveNotes = useCallback(
    (notes: string) => {
      if (!session?.id) return;
      updateSession(session.id, { notes: notes || undefined });
    },
    [session?.id, updateSession],
  );

  /** Clear any pending debounce timer on unmount */
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasPreamble = useMemo(
    () => !!net.preambleTemplate?.trim(),
    [net.preambleTemplate],
  );

  /** Save preamble template to the net listing */
  const handleSavePreamble = useCallback(
    (template: string) => {
      updateNet(net.id, { preambleTemplate: template });
    },
    [net.id, updateNet],
  );

  // ── Non-manager read-only view ───────────────────────────────────────────

  if (!isManager) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
        <span className="text-sm text-gray-400">
          Session managed by{" "}
          <span className="font-mono font-medium text-white">
            {session?.ncsCallsign ?? "NCS"}
          </span>
        </span>
        {session && (
          <span className="text-xs font-mono text-gray-500 ml-auto">
            {elapsed}
          </span>
        )}
      </div>
    );
  }

  // ── Pre-session: Start button + preamble management ────────────────────

  if (!session) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center py-4">
          <button
            onClick={onStartSession}
            className="px-6 py-3 text-sm font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 transition-colors"
          >
            Start Net Session
          </button>
        </div>

        {/* Preamble management */}
        {hasPreamble ? (
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-500">
                Preamble Template
              </p>
              <button
                onClick={() => setShowPreambleEditor(true)}
                className="px-2 py-1 text-[11px] font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-3">
              {net.preambleTemplate}
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={() => setShowPreambleEditor(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
            >
              Add Preamble
            </button>
          </div>
        )}

        {/* Preamble editor modal */}
        {showPreambleEditor && (
          <PreambleEditor
            net={net}
            onClose={() => setShowPreambleEditor(false)}
            onSave={handleSavePreamble}
          />
        )}
      </div>
    );
  }

  // ── Active session toolbar ───────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Preamble toggle */}
        {hasPreamble && (
          <button
            onClick={() => setShowPreamble((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showPreamble
                ? "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30"
                : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10"
            }`}
          >
            Preamble
          </button>
        )}

        {/* Edit preamble (during active session) */}
        <button
          onClick={() => setShowPreambleEditor(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
        >
          {hasPreamble ? "Edit Preamble" : "Add Preamble"}
        </button>

        {/* Elapsed time */}
        <span className="text-xs font-mono text-gray-500">
          Elapsed: {elapsed}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Close Net */}
        <button
          onClick={() => setShowConfirmEnd(true)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
        >
          Close Net
        </button>
      </div>

      {/* Preamble collapsible panel */}
      {showPreamble && net.preambleTemplate && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
            Preamble
          </p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {net.preambleTemplate}
          </p>
        </div>
      )}

      {/* Session notes textarea (debounced auto-save + save on blur) */}
      <textarea
        value={sessionNotes}
        onChange={(e) => {
          const value = e.target.value;
          setSessionNotes(value);
          // Debounced save — clear previous timer, set new 2s timer
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(
            () => saveNotes(value),
            NOTES_SAVE_DEBOUNCE_MS,
          );
        }}
        onBlur={() => {
          // Immediate save on blur
          if (debounceRef.current) clearTimeout(debounceRef.current);
          saveNotes(sessionNotes);
        }}
        placeholder="Session notes..."
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-plasma-orange/50 resize-none"
      />

      {/* Preamble editor modal */}
      {showPreambleEditor && (
        <PreambleEditor
          net={net}
          onClose={() => setShowPreambleEditor(false)}
          onSave={handleSavePreamble}
        />
      )}

      {/* Confirm end dialog */}
      <ConfirmDialog
        open={showConfirmEnd}
        onConfirm={() => {
          setShowConfirmEnd(false);
          onEndSession(sessionNotes || undefined);
        }}
        onCancel={() => setShowConfirmEnd(false)}
        title="Close Net Session"
        message="Are you sure you want to close this net session? All check-ins will be finalized."
        confirmLabel="Close Net"
        variant="warning"
      />
    </div>
  );
}
