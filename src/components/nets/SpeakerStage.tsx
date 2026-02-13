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

import type { NetCheckin } from "@/types/net";
import { TurnTimer } from "@/components/nets/TurnTimer";
import type { TurnTimerHandle } from "@/components/nets/TurnTimer";

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
        className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-4"
        style={{
          boxShadow:
            "0 0 60px rgba(255,107,53,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* ── NOW SPEAKING pill badge ── */}
        <span className="inline-flex items-center gap-1.5 bg-plasma-orange/10 text-plasma-orange border border-plasma-orange/20 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em]">
          <span
            className="w-1.5 h-1.5 rounded-full bg-plasma-orange"
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
            }}
          >
            {currentSpeaker.callsign}
          </p>

          {/* Traffic notes */}
          {currentSpeaker.trafficNotes && (
            <p className="text-sm text-gray-300 italic mt-2 bg-white/[0.03] rounded-lg px-3 py-1.5 inline-block">
              {currentSpeaker.trafficNotes}
            </p>
          )}

          {/* Relay info */}
          {currentSpeaker.isRelay && currentSpeaker.relayVia && (
            <p className="text-xs text-purple-400 mt-1">
              via {currentSpeaker.relayVia}
            </p>
          )}
        </div>

        {/* ── Timer — recessed visual container ── */}
        <div className="w-full bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-3 flex justify-center">
          <TurnTimer
            ref={timerRef}
            defaultMinutes={defaultTimerMinutes}
            speakerCallsign={undefined}
          />
        </div>

        {/* ── Action Buttons — Done is the hero ── */}
        <div className="flex items-center gap-3 w-full max-w-md">
          {/* Skip — secondary */}
          <button
            onClick={onSkip}
            disabled={!hasSpeaker}
            data-skip-station
            className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border transition-all min-h-[44px] bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Skip ${currentSpeaker.callsign}`}
          >
            Skip
          </button>

          {/* Done — PRIMARY hero action */}
          <button
            onClick={onDone}
            disabled={!hasSpeaker}
            data-advance-queue
            className="flex-[2] px-5 py-3.5 text-base font-bold rounded-xl border-2 transition-all bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30 hover:border-green-400/40 hover:shadow-[0_0_24px_rgba(34,197,94,0.2)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Mark ${currentSpeaker.callsign} done`}
          >
            Done
          </button>

          {/* No Show — secondary */}
          <button
            onClick={onNoShow}
            disabled={!hasSpeaker}
            className="flex-1 px-4 py-2 text-sm font-medium rounded-xl border transition-all min-h-[44px] bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/25 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Mark ${currentSpeaker.callsign} no show`}
          >
            No Show
          </button>
        </div>

        {/* ── On Deck — proper bottom bar ── */}
        <div className="w-full bg-white/[0.02] border border-white/5 rounded-xl mt-2 px-4 py-3 flex items-center justify-between">
          <span className="font-orbitron text-[10px] uppercase tracking-[0.15em] text-gray-500 font-medium">
            On Deck
          </span>
          {nextSpeaker ? (
            <span className="font-mono text-white/80 text-sm tracking-wide">
              {nextSpeaker.callsign}
            </span>
          ) : (
            <span className="text-gray-600 italic text-sm">Queue clear</span>
          )}
        </div>
      </div>
    </div>
  );
}
