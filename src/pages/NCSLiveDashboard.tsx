/**
 * NCSLiveDashboard -- Full NCS (Net Control Station) live session management.
 *
 * Fetches net details and session state on mount. Provides a split-panel layout
 * with callsign input + check-in list on the left, and queue + turn timer on
 * the right. Session controls at the bottom. Responsive (stacked on mobile).
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useNetStore } from "@/stores/netStore";
import { useNetRealtimeCheckins } from "@/hooks/useNetRealtimeCheckins";
import { useNetSession } from "@/hooks/useNetSession";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { CallsignInput } from "@/components/nets/CallsignInput";
import { CheckinList } from "@/components/nets/CheckinList";
import { QueuePanel } from "@/components/nets/QueuePanel";
import { TurnTimer } from "@/components/nets/TurnTimer";
import { SessionControls } from "@/components/nets/SessionControls";
import { NCSKeyboardHints } from "@/components/nets/NCSKeyboardHints";
import TuneToNetButton from "@/components/nets/TuneToNetButton";
import type { CheckinStatus } from "@/types/net";

// ── Component ────────────────────────────────────────────────────────────────

export function NCSLiveDashboard() {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  // Store selectors
  const currentNet = useNetStore((s) => s.currentNet);
  const currentSession = useNetStore((s) => s.currentSession);
  const checkins = useNetStore((s) => s.checkins);
  const managers = useNetStore((s) => s.managers);
  const isLoading = useNetStore((s) => s.isLoading);
  const isLoadingSession = useNetStore((s) => s.isLoadingSession);

  // Store actions
  const fetchNet = useNetStore((s) => s.fetchNet);
  const fetchManagers = useNetStore((s) => s.fetchManagers);
  const fetchSessions = useNetStore((s) => s.fetchSessions);
  const fetchCheckins = useNetStore((s) => s.fetchCheckins);
  const startSession = useNetStore((s) => s.startSession);
  const endSession = useNetStore((s) => s.endSession);
  const addCheckin = useNetStore((s) => s.addCheckin);
  const updateCheckin = useNetStore((s) => s.updateCheckin);
  const removeCheckin = useNetStore((s) => s.removeCheckin);
  const reorderQueue = useNetStore((s) => s.reorderQueue);
  const isManagerCheck = useNetStore((s) => s.isManager);

  // Real-time updates for check-ins and session state
  useNetRealtimeCheckins(currentSession?.id ?? null, !!currentSession);
  useNetSession(currentSession?.id ?? null, !!currentSession);

  const [initialized, setInitialized] = useState(false);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const callsignWrapperRef = useRef<HTMLDivElement>(null);

  // ── Initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!netId) return;

    const init = async () => {
      await Promise.all([
        fetchNet(netId),
        fetchManagers(netId),
        fetchSessions(netId),
      ]);
      setInitialized(true);
    };

    init();
  }, [netId, fetchNet, fetchManagers, fetchSessions]);

  // Fetch checkins when session becomes available
  useEffect(() => {
    if (currentSession?.id) {
      fetchCheckins(currentSession.id);
    }
  }, [currentSession?.id, fetchCheckins]);

  // ── Derived state ──────────────────────────────────────────────────────

  const isManager = useMemo(
    () => (netId ? isManagerCheck(netId) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [netId, isManagerCheck, managers],
  );

  const elapsed = useElapsedTime(currentSession?.startedAt);

  const activeCheckins = useMemo(
    () =>
      currentSession
        ? checkins.filter((c) => c.sessionId === currentSession.id)
        : [],
    [checkins, currentSession],
  );

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCallsignSubmit = useCallback(
    (callsign: string) => {
      if (!currentSession?.id) return;
      addCheckin(currentSession.id, callsign);
    },
    [currentSession?.id, addCheckin],
  );

  const handleUpdateStatus = useCallback(
    (id: string, status: CheckinStatus) => {
      updateCheckin(id, { status });
    },
    [updateCheckin],
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeCheckin(id);
    },
    [removeCheckin],
  );

  const handleReorder = useCallback(
    (id: string, newPosition: number) => {
      if (!currentSession?.id) return;
      reorderQueue(currentSession.id, id, newPosition);
    },
    [currentSession?.id, reorderQueue],
  );

  const handleUpdateNotes = useCallback(
    (id: string, notes: string) => {
      updateCheckin(id, { trafficNotes: notes });
    },
    [updateCheckin],
  );

  const handleToggleRelay = useCallback(
    (id: string, isRelay: boolean, relayVia?: string) => {
      updateCheckin(id, { isRelay, relayVia: relayVia ?? "" });
    },
    [updateCheckin],
  );

  const handleAdvance = useCallback(() => {
    // Find the first station in the active queue
    const queue = [...activeCheckins]
      .filter((c) => c.status === "checked_in" || c.status === "had_turn")
      .sort((a, b) => a.queuePosition - b.queuePosition);

    if (queue.length === 0) return;

    const current = queue[0];
    // If current had_turn, mark completed. If checked_in, mark had_turn.
    if (current.status === "had_turn") {
      updateCheckin(current.id, { status: "completed" });
    } else {
      updateCheckin(current.id, { status: "had_turn" });
    }
  }, [activeCheckins, updateCheckin]);

  const handleSkip = useCallback(() => {
    const queue = [...activeCheckins]
      .filter((c) => c.status === "checked_in" || c.status === "had_turn")
      .sort((a, b) => a.queuePosition - b.queuePosition);

    if (queue.length === 0) return;
    updateCheckin(queue[0].id, { status: "skipped" });
  }, [activeCheckins, updateCheckin]);

  const handleStartSession = useCallback(async () => {
    if (!netId) return;
    await startSession(netId);
  }, [netId, startSession]);

  const handleEndSession = useCallback(
    async (notes?: string) => {
      if (!currentSession?.id) return;
      await endSession(currentSession.id, notes);
      navigate(`/nets/${netId}`);
    },
    [currentSession?.id, endSession, navigate, netId],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") {
          (document.activeElement as HTMLElement)?.blur();
          e.preventDefault();
        }
        return;
      }

      // No shortcuts without a live session
      if (!currentSession) return;

      switch (e.key) {
        case "n":
        case "/":
          e.preventDefault();
          callsignWrapperRef.current?.querySelector("input")?.focus();
          break;
        case " ":
        case "ArrowRight":
          e.preventDefault();
          handleAdvance();
          break;
        case "s":
          e.preventDefault();
          handleSkip();
          break;
        case "t": {
          e.preventDefault();
          // Toggle turn timer start/pause — first button inside the timer region
          const timerRegion = document.querySelector(
            '[role="region"][aria-label="Turn timer"]',
          );
          const timerBtn = timerRegion?.querySelector("button") as HTMLElement;
          timerBtn?.click();
          break;
        }
        case "p": {
          e.preventDefault();
          // Toggle preamble panel — best-effort via data attribute, falls back to
          // searching session controls for the Preamble button by text.
          // NOTE: For full reliability, add data-preamble-toggle to the
          // preamble button in SessionControls.tsx.
          const preambleBtn =
            (document.querySelector("[data-preamble-toggle]") as HTMLElement) ??
            (Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent?.trim() === "Preamble",
            ) as HTMLElement | undefined);
          preambleBtn?.click();
          break;
        }
        case "?":
          e.preventDefault();
          setShowKeyboardHints((prev) => !prev);
          break;
        case "Escape":
          if (showKeyboardHints) {
            setShowKeyboardHints(false);
            e.preventDefault();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentSession, handleAdvance, handleSkip, showKeyboardHints]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (!initialized || isLoading || isLoadingSession) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" text="Loading net session..." />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────

  if (!currentNet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <p className="text-lg font-medium text-white mb-2">Net not found</p>
        <p className="text-sm text-gray-400">
          The net you are looking for does not exist or has been removed.
        </p>
      </div>
    );
  }

  // ── Not authorized ─────────────────────────────────────────────────────

  if (!isAuthenticated || !isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <svg
          className="w-10 h-10 text-gray-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <p className="text-lg font-medium text-white mb-2">Not Authorized</p>
        <p className="text-sm text-gray-400 max-w-xs">
          You are not authorized to manage this net. Contact the net owner if
          you believe this is an error.
        </p>
      </div>
    );
  }

  // ── Main Dashboard Layout ──────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header Bar (sticky) ────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-deep-space/95 backdrop-blur-sm border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Net name */}
          <h1 className="text-lg font-bold text-white truncate">
            {currentNet.name}
          </h1>

          {/* LIVE indicator */}
          {currentSession && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                Live
              </span>
            </div>
          )}

          {/* Elapsed time */}
          {currentSession && (
            <span className="text-xs font-mono text-gray-500 shrink-0">
              {elapsed}
            </span>
          )}

          {/* Check-in count */}
          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-white/10 text-gray-300 border border-white/5 shrink-0">
            {activeCheckins.length} check-in
            {activeCheckins.length !== 1 ? "s" : ""}
          </span>

          {/* NCS callsign */}
          {currentSession && (
            <span className="text-xs text-gray-500 ml-auto shrink-0">
              NCS:{" "}
              <span className="font-mono font-medium text-gray-300">
                {currentSession.ncsCallsign}
              </span>
            </span>
          )}

          {/* Tune to net frequency */}
          {currentNet && (
            <TuneToNetButton
              frequency={currentNet.frequency}
              mode={currentNet.mode}
              compact
            />
          )}

          {/* Keyboard shortcuts hint */}
          {currentSession && (
            <button
              type="button"
              onClick={() => setShowKeyboardHints((prev) => !prev)}
              className="shrink-0 px-2 py-0.5 text-[10px] font-mono rounded-md bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
              title="Keyboard shortcuts"
            >
              <span className="hidden sm:inline">Keyboard </span>
              <kbd className="font-mono">?</kbd>
            </button>
          )}
        </div>
      </div>

      {/* ── Split Panels ───────────────────────────────────────────────── */}
      <div
        className={`flex-1 min-h-0 flex ${isMobile ? "flex-col" : "flex-row"} gap-4 p-4`}
      >
        {/* Left Panel: CallsignInput + CheckinList */}
        <div
          className={`flex flex-col gap-3 min-h-0 ${isMobile ? "" : "flex-1"}`}
        >
          <div ref={callsignWrapperRef}>
            <CallsignInput
              onSubmit={handleCallsignSubmit}
              disabled={!currentSession}
              netId={netId}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto bg-panel/30 border border-white/5 rounded-2xl p-3">
            <CheckinList
              checkins={activeCheckins}
              onUpdateStatus={handleUpdateStatus}
              onRemove={handleRemove}
              onReorder={handleReorder}
              onUpdateNotes={handleUpdateNotes}
              onToggleRelay={handleToggleRelay}
            />
          </div>
        </div>

        {/* Right Panel: QueuePanel + TurnTimer */}
        <div
          className={`flex flex-col gap-4 ${isMobile ? "" : "w-80 shrink-0"}`}
        >
          <div className="bg-panel/30 border border-white/5 rounded-2xl p-4">
            <QueuePanel
              checkins={activeCheckins}
              onAdvance={handleAdvance}
              onSkip={handleSkip}
            />
          </div>

          <div className="bg-panel/30 border border-white/5 rounded-2xl p-4">
            <TurnTimer defaultMinutes={3} />
          </div>
        </div>
      </div>

      {/* ── Bottom Bar: Session Controls ───────────────────────────────── */}
      <div className="border-t border-white/5 px-4 py-3 bg-deep-space/95 backdrop-blur-sm">
        <SessionControls
          net={currentNet}
          session={currentSession}
          onStartSession={handleStartSession}
          onEndSession={handleEndSession}
          isManager={isManager}
        />
      </div>

      {/* ── Keyboard Shortcuts Overlay ──────────────────────────────────── */}
      {showKeyboardHints && (
        <NCSKeyboardHints onClose={() => setShowKeyboardHints(false)} />
      )}
    </div>
  );
}
