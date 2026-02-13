/**
 * RoundsPhase -- Speaking rounds phase of the NCS Live Dashboard.
 *
 * Two-column layout (desktop): SpeakerStage center-stage on the left,
 * fixed-width sidebar on the right with a compact CallsignInput for
 * late check-ins and a compact CheckinList. On mobile, stacks vertically.
 *
 * Derives the speaking queue from checkins, manages Done / Skip / No Show
 * transitions, and auto-advances the TurnTimer between speakers.
 *
 * ARIA: region labels, live announcements delegated to SpeakerStage.
 */

import { useMemo, useCallback } from "react";
import type { NetCheckin, CheckinStatus } from "@/types/net";
import type { TurnTimerHandle } from "@/components/nets/TurnTimer";
import { SpeakerStage } from "@/components/nets/SpeakerStage";
import { CallsignInput } from "@/components/nets/CallsignInput";
import { CheckinList } from "@/components/nets/CheckinList";
import { useIsMobile } from "@/hooks/useIsMobile";

// ── Props ────────────────────────────────────────────────────────────────────

interface RoundsPhaseProps {
  checkins: NetCheckin[];
  timerRef: React.RefObject<TurnTimerHandle>;
  onUpdateStatus: (id: string, status: CheckinStatus) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newPosition: number) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onToggleRelay: (id: string, isRelay: boolean, relayVia?: string) => void;
  onSubmitCallsign: (callsign: string) => void;
  onAdvance: () => void;
  netId?: string;
  defaultTimerMinutes?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RoundsPhase({
  checkins,
  timerRef,
  onUpdateStatus,
  onRemove,
  onReorder,
  onUpdateNotes,
  onToggleRelay,
  onSubmitCallsign,
  onAdvance,
  netId,
  defaultTimerMinutes = 3,
}: RoundsPhaseProps) {
  const isMobile = useIsMobile();

  // ── Derive Queue ──────────────────────────────────────────────────────────

  const queue = useMemo(
    () =>
      [...checkins]
        .filter((c) => c.status === "checked_in" || c.status === "had_turn")
        .sort((a, b) => a.queuePosition - b.queuePosition),
    [checkins],
  );

  const currentSpeaker = queue[0] ?? null;
  const nextSpeaker = queue[1] ?? null;
  const queueEmpty = queue.length === 0;

  // ── Speaker Actions ───────────────────────────────────────────────────────

  const handleDone = useCallback(() => {
    if (!currentSpeaker) return;

    // Mark station as completed — single-click advance
    onUpdateStatus(currentSpeaker.id, "completed");

    // Auto-reset and start timer for next speaker
    timerRef.current?.resetAndStart();
  }, [currentSpeaker, onUpdateStatus, timerRef]);

  const handleSkip = useCallback(() => {
    if (!currentSpeaker) return;
    onUpdateStatus(currentSpeaker.id, "skipped");
    timerRef.current?.resetAndStart();
  }, [currentSpeaker, onUpdateStatus, timerRef]);

  const handleNoShow = useCallback(() => {
    if (!currentSpeaker) return;
    onUpdateStatus(currentSpeaker.id, "skipped");
    timerRef.current?.resetAndStart();
  }, [currentSpeaker, onUpdateStatus, timerRef]);

  // ── Sidebar Content ───────────────────────────────────────────────────────

  const sidebar = (
    <div className="bg-white/[0.02] backdrop-blur-sm border border-white/10 rounded-2xl p-3 flex flex-col min-h-0 h-full">
      {/* Late check-in input */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
          Late Check-In
        </p>
        <CallsignInput
          onSubmit={onSubmitCallsign}
          disabled={false}
          netId={netId}
        />
      </div>

      {/* Roster header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
          Roster
        </span>
        <span className="text-[10px] tabular-nums text-gray-600">
          {checkins.length} station{checkins.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Checkin list — fills remaining height */}
      <div className="overflow-y-auto flex-1 min-h-0">
        <CheckinList
          checkins={checkins}
          onUpdateStatus={onUpdateStatus}
          onRemove={onRemove}
          onReorder={onReorder}
          onUpdateNotes={onUpdateNotes}
          onToggleRelay={onToggleRelay}
          compact
        />
      </div>
    </div>
  );

  // ── Main Column: SpeakerStage + Closeout CTA ─────────────────────────────

  const mainColumn = (
    <div className="flex flex-col items-center min-h-0 pt-4">
      <SpeakerStage
        currentSpeaker={currentSpeaker}
        nextSpeaker={nextSpeaker}
        timerRef={timerRef}
        onDone={handleDone}
        onSkip={handleSkip}
        onNoShow={handleNoShow}
        defaultTimerMinutes={defaultTimerMinutes}
      />

      {/* Closeout CTA when queue is empty */}
      {queueEmpty && (
        <div className="mt-6">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
            All stations served
          </p>
          <button
            onClick={onAdvance}
            className="group px-6 py-3 text-sm font-semibold rounded-xl bg-plasma-orange text-white shadow-lg shadow-plasma-orange/20 hover:bg-plasma-orange/90 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
            aria-label="Begin closeout phase"
          >
            Begin Closeout
            <svg
              className="w-4 h-4 inline-block ml-1 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  // ── Layout ────────────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div
        className="flex flex-col gap-4 animate-in fade-in"
        role="region"
        aria-label="Speaking rounds"
      >
        {mainColumn}
        {sidebar}
      </div>
    );
  }

  return (
    <div
      className="flex flex-row gap-4 h-full animate-in fade-in"
      role="region"
      aria-label="Speaking rounds"
    >
      {/* Main column — speaker stage anchored to top */}
      <div className="flex-[3] flex flex-col min-h-0">{mainColumn}</div>

      {/* Sidebar — fixed width roster */}
      <div className="w-80 shrink-0 flex flex-col min-h-0">{sidebar}</div>
    </div>
  );
}
