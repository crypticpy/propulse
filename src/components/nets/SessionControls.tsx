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
      <div className="flex flex-col items-center justify-center py-8 gap-6 animate-in fade-in">
        {/* Radio wave icon */}
        <svg
          className="w-16 h-16 text-plasma-orange/20"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4M12 12h.01M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4M19.1 4.9C23 8.8 23 15.2 19.1 19.1"
          />
        </svg>

        {/* Context text */}
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-400">Ready to begin</p>
          <p className="text-xs text-gray-500">
            Start a live net control session
          </p>
        </div>

        {/* Launch button */}
        <button
          onClick={onStartSession}
          className="animate-ncs-launch-pulse px-8 py-4 text-base font-bold rounded-2xl bg-plasma-orange text-white hover:bg-plasma-orange/90 hover:scale-[1.02] active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-space inline-flex items-center gap-2"
        >
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
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
