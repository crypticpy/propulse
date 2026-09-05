/**
 * NCSLiveDashboard -- Full NCS (Net Control Station) live session management.
 *
 * Phase-based workflow: preamble -> checkin -> rounds -> closeout.
 * Each phase renders a dedicated component in the body while a sticky header
 * shows the net name, LIVE indicator, elapsed time, check-in count, NCS
 * callsign, TuneToNetButton, and a PhaseIndicator progress bar.
 *
 * SessionControls appear at the bottom (pre-session: start button; active
 * session: simplified controls). Keyboard shortcuts are phase-aware.
 */

// Route-local animations (keyframes + .animate-ncs-* utilities).
import "@/styles/ncs-animations.css";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useNetStore } from "@/stores/netStore";
import { useNetRealtimeCheckins } from "@/hooks/useNetRealtimeCheckins";
import { useNetSession } from "@/hooks/useNetSession";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SessionControls } from "@/components/nets/SessionControls";
import { NCSKeyboardHints } from "@/components/nets/NCSKeyboardHints";
import { PreambleEditor } from "@/components/nets/PreambleEditor";
import { NetLiveIndicator } from "@/components/nets/NetLiveIndicator";
import TuneToNetButton from "@/components/nets/TuneToNetButton";
import { PhaseIndicator } from "@/components/nets/PhaseIndicator";
import { PreamblePhase } from "@/components/nets/PreamblePhase";
import { CheckinPhase } from "@/components/nets/CheckinPhase";
import { RoundsPhase } from "@/components/nets/RoundsPhase";
import { CloseoutPhase } from "@/components/nets/CloseoutPhase";
import type { SessionPhase } from "@/components/nets/PhaseIndicator";
import type { TurnTimerHandle } from "@/components/nets/TurnTimer";
import type { CheckinStatus } from "@/types/net";

// ── Component ────────────────────────────────────────────────────────────────

export function NCSLiveDashboard() {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();

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
  const updateNet = useNetStore((s) => s.updateNet);
  const updateSession = useNetStore((s) => s.updateSession);
  const isManagerCheck = useNetStore((s) => s.isManager);

  // Real-time updates for check-ins and session state
  useNetRealtimeCheckins(currentSession?.id ?? null, !!currentSession);
  useNetSession(currentSession?.id ?? null, !!currentSession);

  const [initialized, setInitialized] = useState(false);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  const [showPreambleEditor, setShowPreambleEditor] = useState(false);

  // ── Phase state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<SessionPhase>("preamble");
  const [completedPhases, setCompletedPhases] = useState<SessionPhase[]>([]);

  // Timer ref for RoundsPhase -> SpeakerStage -> TurnTimer
  const timerRef = useRef<TurnTimerHandle>(null);

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

  // ── Determine initial phase when session appears/changes ──────────────

  useEffect(() => {
    if (!currentSession) {
      // Reset phase state when no session is active
      setPhase("preamble");
      setCompletedPhases([]);
      return;
    }

    // Determine starting phase based on context
    const sessionCheckins = checkins.filter(
      (c) => c.sessionId === currentSession.id,
    );
    const hasCheckins = sessionCheckins.length > 0;
    const hasPreamble = !!currentNet?.preambleTemplate?.trim();

    if (hasCheckins) {
      // Resuming mid-session with existing checkins
      const hasCompletedOrHadTurn = sessionCheckins.some(
        (c) => c.status === "completed" || c.status === "had_turn",
      );

      if (hasCompletedOrHadTurn) {
        // Some stations have already had turns -> rounds phase
        setPhase("rounds");
        setCompletedPhases(hasPreamble ? ["preamble", "checkin"] : ["checkin"]);
      } else {
        // Checkins exist but no turns taken yet -> still in checkin phase
        setPhase("checkin");
        setCompletedPhases(hasPreamble ? ["preamble"] : []);
      }
    }
    // No checkins: stay at preamble (default). PreamblePhase handles empty state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id]);

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

  // ── Phase transition logic ──────────────────────────────────────────

  const advancePhase = useCallback(() => {
    setCompletedPhases((prev) =>
      prev.includes(phase) ? prev : [...prev, phase],
    );
    const order: SessionPhase[] = ["preamble", "checkin", "rounds", "closeout"];
    const idx = order.indexOf(phase);
    if (idx < order.length - 1) {
      setPhase(order[idx + 1]);
    }
  }, [phase]);

  const selectPhase = useCallback(
    (target: SessionPhase) => {
      // Can go to any completed phase or the current phase
      if (completedPhases.includes(target) || target === phase) {
        setPhase(target);
      }
    },
    [completedPhases, phase],
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

  const handleStartSession = useCallback(async () => {
    if (!netId) return;
    await startSession(netId);
  }, [netId, startSession]);

  const handleEndSession = useCallback(
    async (notes?: string) => {
      if (!currentSession?.id) return;
      await endSession(currentSession.id, notes);
      navigate(`/ncs/${netId}`);
    },
    [currentSession?.id, endSession, navigate, netId],
  );

  const handleEditPreamble = useCallback(() => {
    setShowPreambleEditor(true);
  }, []);

  const handleSavePreamble = useCallback(
    (template: string) => {
      if (!currentNet?.id) return;
      updateNet(currentNet.id, { preambleTemplate: template });
    },
    [currentNet?.id, updateNet],
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

      const phaseOrder: SessionPhase[] = [
        "preamble",
        "checkin",
        "rounds",
        "closeout",
      ];

      switch (e.key) {
        // Phase navigation: 1-4
        case "1":
        case "2":
        case "3":
        case "4": {
          const targetIdx = parseInt(e.key, 10) - 1;
          const targetPhase = phaseOrder[targetIdx];
          if (completedPhases.includes(targetPhase) || targetPhase === phase) {
            e.preventDefault();
            setPhase(targetPhase);
          }
          break;
        }

        // Focus callsign input (only during checkin or rounds)
        case "n":
        case "/":
          if (phase === "checkin" || phase === "rounds") {
            e.preventDefault();
            // Find the callsign input in the DOM
            const input = document.querySelector(
              '[data-callsign-input] input, input[placeholder*="callsign" i]',
            ) as HTMLInputElement | null;
            input?.focus();
          }
          break;

        // Advance queue (only during rounds)
        case " ":
        case "ArrowRight":
          if (phase === "rounds") {
            e.preventDefault();
            const advanceBtn = document.querySelector(
              "[data-advance-queue]",
            ) as HTMLElement | null;
            advanceBtn?.click();
          }
          break;

        // Skip current (only during rounds)
        case "s":
          if (phase === "rounds") {
            e.preventDefault();
            const skipBtn = document.querySelector(
              "[data-skip-station]",
            ) as HTMLElement | null;
            skipBtn?.click();
          }
          break;

        // Toggle timer (only during rounds)
        case "t":
          if (phase === "rounds") {
            e.preventDefault();
            const timerRegion = document.querySelector(
              '[role="region"][aria-label="Turn timer"]',
            );
            const timerBtn = timerRegion?.querySelector(
              "button",
            ) as HTMLElement;
            timerBtn?.click();
          }
          break;

        // Toggle keyboard hints
        case "?":
          e.preventDefault();
          setShowKeyboardHints((prev) => !prev);
          break;

        // Escape: close overlays
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
  }, [currentSession, phase, completedPhases, showKeyboardHints]);

  // ── Loading state ──────────────────────────────────────────────────────

  if (!initialized || isLoading || isLoadingSession) {
    return (
      <div className="flex items-center justify-center min-h-[400px] animate-in fade-in">
        <LoadingSpinner size="lg" text="Loading net session..." />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────

  if (!currentNet) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-in fade-in">
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
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4 animate-in fade-in">
        <svg
          className="w-10 h-10 text-gray-400 mb-4"
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
      <div className="sticky top-0 z-10 bg-white/[0.05] backdrop-blur-md border-b border-white/15 px-5 py-4 shadow-card">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Net name */}
          <h1 className="text-xl font-bold font-orbitron text-white truncate">
            {currentNet.name}
          </h1>

          {/* LIVE indicator */}
          {currentSession && <NetLiveIndicator />}

          {/* Elapsed time */}
          {currentSession && (
            <span className="text-sm font-mono text-gray-300 bg-white/[0.08] px-2 py-0.5 rounded-md border border-white/15 shrink-0 tabular-nums">
              {elapsed}
            </span>
          )}

          {/* Check-in count */}
          <span
            className={`px-2 py-0.5 text-xs font-semibold rounded-full border shrink-0 tabular-nums ${
              activeCheckins.length > 0
                ? "bg-signal-green/10 text-signal-green border-signal-green/20"
                : "bg-white/10 text-gray-300 border-white/15"
            }`}
          >
            {activeCheckins.length} check-in
            {activeCheckins.length !== 1 ? "s" : ""}
          </span>

          {/* NCS callsign */}
          {currentSession && (
            <span className="text-sm text-gray-300 ml-auto shrink-0 pl-3 border-l border-white/15">
              NCS:{" "}
              <span className="font-mono font-medium text-plasma-orange">
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
              className="shrink-0 px-2 py-0.5 text-xs font-mono rounded-md bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/15 hover:brightness-110 transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-deep-space"
              title="Keyboard shortcuts"
            >
              <span className="hidden sm:inline">Keyboard </span>
              <kbd className="font-mono">?</kbd>
            </button>
          )}
        </div>

        {/* Phase indicator -- only show during active session */}
        {currentSession && (
          <div className="mt-3">
            <PhaseIndicator
              currentPhase={phase}
              onPhaseSelect={selectPhase}
              hasCheckins={activeCheckins.length > 0}
              completedPhases={completedPhases}
            />
          </div>
        )}
      </div>

      {/* ── Phase Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 py-4 overflow-y-auto flex flex-col">
        {!currentSession ? (
          /* Pre-session: centered start button */
          <div className="flex flex-col items-center justify-center min-h-[300px]">
            <SessionControls
              net={currentNet}
              session={currentSession}
              onStartSession={handleStartSession}
              onEndSession={handleEndSession}
              isManager={isManager}
            />
          </div>
        ) : phase === "preamble" ? (
          <PreamblePhase
            net={currentNet}
            session={currentSession}
            onAdvance={advancePhase}
            onEditPreamble={handleEditPreamble}
          />
        ) : phase === "checkin" ? (
          <CheckinPhase
            checkins={activeCheckins}
            onSubmitCallsign={handleCallsignSubmit}
            onAdvance={advancePhase}
            onUpdateStatus={handleUpdateStatus}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onUpdateNotes={handleUpdateNotes}
            onToggleRelay={handleToggleRelay}
            netId={netId}
            disabled={!currentSession}
          />
        ) : phase === "rounds" ? (
          <RoundsPhase
            checkins={activeCheckins}
            timerRef={timerRef}
            onUpdateStatus={handleUpdateStatus}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onUpdateNotes={handleUpdateNotes}
            onToggleRelay={handleToggleRelay}
            onSubmitCallsign={handleCallsignSubmit}
            onAdvance={advancePhase}
            netId={netId}
            defaultTimerMinutes={3}
          />
        ) : (
          <CloseoutPhase
            checkins={activeCheckins}
            session={currentSession}
            net={currentNet}
            onEndSession={handleEndSession}
            onUpdateSession={updateSession}
          />
        )}
      </div>

      {/* Bottom bar removed during active sessions -- elapsed time is in
          the header and Close Net lives in CloseoutPhase. */}

      {/* ── Preamble Editor Modal ─────────────────────────────────────── */}
      {showPreambleEditor && (
        <PreambleEditor
          net={currentNet}
          onClose={() => setShowPreambleEditor(false)}
          onSave={handleSavePreamble}
        />
      )}

      {/* ── Keyboard Shortcuts Overlay ────────────────────────────────── */}
      {showKeyboardHints && (
        <NCSKeyboardHints onClose={() => setShowKeyboardHints(false)} />
      )}
    </div>
  );
}
