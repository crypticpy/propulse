/**
 * SessionControls -- Net session lifecycle toolbar.
 *
 * Pre-session: prominent "Start Net Session" button.
 * Active session: elapsed time display and close net button (with ConfirmDialog).
 * Non-managers see read-only session info.
 */

import { useState } from "react";
import type { Net, NetSession } from "@/types/net";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface SessionControlsProps {
  net: Net;
  session: NetSession | null;
  onStartSession: () => void;
  onEndSession: (notes?: string) => void;
  isManager: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SessionControls({
  net: _net,
  session,
  onStartSession,
  onEndSession,
  isManager,
}: SessionControlsProps) {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const elapsed = useElapsedTime(session?.startedAt);

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

  // ── Pre-session: Start button ────────────────────────────────────────────

  if (!session) {
    return (
      <div className="flex items-center justify-center py-4">
        <button
          onClick={onStartSession}
          className="px-6 py-3 text-sm font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 transition-colors"
        >
          Start Net Session
        </button>
      </div>
    );
  }

  // ── Active session toolbar ───────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
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

      {/* Confirm end dialog */}
      <ConfirmDialog
        open={showConfirmEnd}
        onConfirm={() => {
          setShowConfirmEnd(false);
          onEndSession();
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
