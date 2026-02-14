/**
 * SpeakerStage -- Center-stage display for the currently speaking station.
 *
 * Shows the current speaker's callsign, traffic notes, relay info,
 * an inline TurnTimer, action buttons (Done / Skip / No Show),
 * and an "On Deck" preview of the next speaker.
 *
 * When the queue is empty (currentSpeaker === null), displays a
 * "All Stations Complete" confirmation state.
 *
 * ARIA: aria-live="polite" on speaker callsign for screen-reader
 * announcements, descriptive labels on all action buttons.
 */

import { useState, useCallback } from "react";
import type { NetCheckin } from "@/types/net";
import { TurnTimer } from "@/components/nets/TurnTimer";
import type { TurnTimerHandle, TimerState } from "@/components/nets/TurnTimer";

// ── Props ────────────────────────────────────────────────────────────────────

interface SpeakerStageProps {
  currentSpeaker: NetCheckin | null;
  nextSpeaker: NetCheckin | null;
  timerRef: React.RefObject<TurnTimerHandle>;
  onDone: () => void;
  onSkip: () => void;
  onNoShow: () => void;
  defaultTimerMinutes?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpeakerStage({
  currentSpeaker,
  nextSpeaker,
  timerRef,
  onDone,
  onSkip,
  onNoShow,
  defaultTimerMinutes = 3,
}: SpeakerStageProps) {
  const [timerState, setTimerState] = useState<TimerState>("idle");

  const handleTimerStateChange = useCallback((state: TimerState) => {
    setTimerState(state);
  }, []);

  const handleStartPause = useCallback(() => {
    if (timerState === "running") {
      timerRef.current?.pause();
    } else {
      timerRef.current?.start();
    }
  }, [timerState, timerRef]);

  const handleReset = useCallback(() => {
    timerRef.current?.reset();
  }, [timerRef]);

  const handleAddTime = useCallback(
    (mins: number) => {
      timerRef.current?.addTime(mins);
    },
    [timerRef],
  );

  const hasSpeaker = currentSpeaker !== null;

  // ── Queue Complete State ──────────────────────────────────────────────────

  if (!hasSpeaker) {
    return (
      <div className="animate-in fade-in">
        <div
          className="flex flex-col items-center justify-center py-16 gap-5"
          role="region"
          aria-label="Speaker stage"
        >
          {/* Animated glowing checkmark */}
          <div className="animate-ncs-status-glow">
            <svg
              className="w-20 h-20 text-signal-green drop-shadow-[0_0_30px_rgba(34,197,94,0.5)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="font-orbitron text-2xl font-bold text-signal-green tracking-wide">
            All Stations Complete
          </p>
          <p className="text-sm text-gray-400">
            All checked-in stations have been served. Ready for closeout.
          </p>
        </div>
      </div>
    );
  }

  // ── Active Speaker State ──────────────────────────────────────────────────

  return (
    <div
      className="w-full max-w-lg mx-auto"
      role="region"
      aria-label="Speaker stage"
    >
      {/* ── Card container with subtle glow ── */}
      <div
        className="bg-white/[0.05] backdrop-blur-md border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-4"
        style={{
          boxShadow:
            "0 0 60px rgba(255,107,53,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* ── NOW SPEAKING pill badge ── */}
        <span className="inline-flex items-center gap-1.5 bg-plasma-orange/10 text-plasma-orange border border-plasma-orange/20 rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-[0.2em]">
          <span
            className="w-2 h-2 rounded-full bg-plasma-orange"
            style={{
              animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
            aria-hidden="true"
          />
          Now Speaking
        </span>

        {/* ── Callsign — THE HERO ── */}
        <div className="text-center" aria-live="polite" aria-atomic="true">
          <p
            key={currentSpeaker.callsign}
            className="text-5xl sm:text-6xl font-mono font-black text-white tracking-wider animate-ncs-speaker-entrance"
            style={{
              filter: "drop-shadow(0 0 20px rgba(255,255,255,0.2))",
              textShadow:
                "0 2px 8px rgba(0,0,0,0.5), 0 0 30px rgba(255,255,255,0.08)",
            }}
          >
            {currentSpeaker.callsign}
          </p>

          {/* Traffic notes */}
          {currentSpeaker.trafficNotes && (
            <p className="text-base text-gray-300 italic mt-2 bg-white/[0.06] rounded-lg px-3 py-1.5 inline-block">
              {currentSpeaker.trafficNotes}
            </p>
          )}

          {/* Relay info */}
          {currentSpeaker.isRelay && currentSpeaker.relayVia && (
            <p className="text-sm text-purple-400 mt-1">
              via {currentSpeaker.relayVia}
            </p>
          )}
        </div>

        {/* ── Timer Ring (display only) ── */}
        <div className="w-full bg-white/[0.06] border border-white/15 rounded-xl px-5 py-4 flex justify-center">
          <TurnTimer
            ref={timerRef}
            defaultMinutes={defaultTimerMinutes}
            hideControls
            onStateChange={handleTimerStateChange}
          />
        </div>

        {/* ── START / PAUSE — Hero Button ── */}
        <button
          onClick={handleStartPause}
          className={`w-full max-w-sm px-10 py-4 text-lg font-bold rounded-xl border-2 transition-all will-change-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none ${
            timerState === "running"
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-400/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]"
              : "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30 hover:bg-plasma-orange/25 hover:border-plasma-orange/50 hover:shadow-[0_0_24px_rgba(255,107,53,0.35)]"
          }`}
          aria-label={timerState === "running" ? "Pause timer" : "Start timer"}
        >
          {timerState === "running"
            ? "Pause"
            : timerState === "expired"
              ? "Restart"
              : "Start"}
        </button>

        {/* ── Timer Secondary Controls ── */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handleReset}
            className="px-3.5 py-2 min-h-[40px] text-xs font-medium rounded-lg bg-white/5 text-gray-300 border border-white/15 hover:bg-white/10 hover:text-white active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label="Reset timer"
          >
            Reset
          </button>
          <button
            onClick={() => handleAddTime(1)}
            className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg bg-white/5 text-gray-300 border border-white/15 hover:bg-white/10 hover:text-white active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label="Add 1 minute"
          >
            +1m
          </button>
          <button
            onClick={() => handleAddTime(2)}
            className="px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg bg-white/5 text-gray-300 border border-white/15 hover:bg-white/10 hover:text-white active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label="Add 2 minutes"
          >
            +2m
          </button>
        </div>

        {/* ── Speaker Action Buttons — Skip / Next / No Show ── */}
        <div className="flex items-stretch gap-3 w-full max-w-md mt-2">
          {/* Skip — secondary */}
          <button
            onClick={onSkip}
            disabled={!hasSpeaker}
            data-skip-station
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all min-h-[44px] will-change-transform bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/25 hover:text-amber-300 hover:border-amber-400/30 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label={`Skip ${currentSpeaker.callsign}`}
          >
            Skip
          </button>

          {/* Next — PRIMARY speaker action, teal blue */}
          <button
            onClick={onDone}
            disabled={!hasSpeaker}
            data-advance-queue
            className="flex-[1.3] px-5 py-3.5 text-base font-bold rounded-xl border-2 transition-all will-change-transform bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25 hover:border-cyan-400/40 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label={`Next speaker after ${currentSpeaker.callsign}`}
          >
            Next
          </button>

          {/* No Show — secondary */}
          <button
            onClick={onNoShow}
            disabled={!hasSpeaker}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border transition-all min-h-[44px] will-change-transform bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/25 hover:text-red-300 hover:border-red-400/30 hover:shadow-[0_0_12px_rgba(239,68,68,0.25)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
            aria-label={`Mark ${currentSpeaker.callsign} no show`}
          >
            No Show
          </button>
        </div>

        {/* ── On Deck — proper bottom bar ── */}
        <div className="w-full bg-white/[0.05] border border-white/15 rounded-xl mt-2 px-4 py-4 flex items-center justify-between">
          <span className="font-orbitron text-xs uppercase tracking-[0.15em] text-gray-400 font-medium">
            On Deck
          </span>
          {nextSpeaker ? (
            <span className="font-mono text-white/80 text-sm tracking-wide">
              {nextSpeaker.callsign}
            </span>
          ) : (
            <span className="text-gray-400 italic text-sm">Queue clear</span>
          )}
        </div>
      </div>
    </div>
  );
}
