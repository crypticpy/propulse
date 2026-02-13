/**
 * PhaseIndicator -- Sleek inline segmented pill bar for the 4 net session phases.
 *
 * Renders a compact horizontal row of connected pills: Preamble, Check-In,
 * Rounds, Closeout. Current phase glows plasma-orange, completed phases show
 * a green checkmark and are clickable, future phases are muted. Keyboard
 * number hints overlay each pill corner.
 *
 * Responsive: mobile shows abbreviated labels ("Pre", "In", "Rnd", "End").
 */

import { useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionPhase = "preamble" | "checkin" | "rounds" | "closeout";

interface PhaseIndicatorProps {
  currentPhase: SessionPhase;
  onPhaseSelect: (phase: SessionPhase) => void;
  hasCheckins: boolean;
  completedPhases: SessionPhase[];
}

// ── Phase Definitions ─────────────────────────────────────────────────────────

const PHASES: { key: SessionPhase; label: string; shortLabel: string }[] = [
  { key: "preamble", label: "Preamble", shortLabel: "Pre" },
  { key: "checkin", label: "Check-In", shortLabel: "In" },
  { key: "rounds", label: "Rounds", shortLabel: "Rnd" },
  { key: "closeout", label: "Closeout", shortLabel: "End" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function PhaseIndicator({
  currentPhase,
  onPhaseSelect,
  hasCheckins,
  completedPhases,
}: PhaseIndicatorProps) {
  const isMobile = useIsMobile();

  const isCompleted = useCallback(
    (phase: SessionPhase) => completedPhases.includes(phase),
    [completedPhases],
  );

  const isClickable = useCallback(
    (phase: SessionPhase) => {
      if (phase === currentPhase) return true;
      if (isCompleted(phase)) return true;
      // "rounds" is only clickable if there are check-ins
      if (phase === "rounds" && !hasCheckins) return false;
      return false;
    },
    [currentPhase, isCompleted, hasCheckins],
  );

  return (
    <nav
      className="flex w-full rounded-xl overflow-hidden border border-white/10 bg-white/[0.03] backdrop-blur-sm"
      aria-label="Session phases"
    >
      {PHASES.map((phase, index) => {
        const isCurrent = phase.key === currentPhase;
        const completed = isCompleted(phase.key);
        const clickable = isClickable(phase.key);
        const disabled =
          phase.key === "rounds" && !hasCheckins && !completed && !isCurrent;

        return (
          <button
            key={phase.key}
            type="button"
            onClick={() => clickable && onPhaseSelect(phase.key)}
            disabled={!clickable}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={`${phase.label}${isCurrent ? " (current)" : ""}${completed ? " (completed)" : ""}${disabled ? " (unavailable)" : ""}`}
            className={[
              "flex-1 relative px-3 py-2 text-xs font-medium transition-all select-none",
              // Current phase
              isCurrent
                ? "bg-plasma-orange/10 text-plasma-orange animate-ncs-phase-glow"
                : "",
              // Completed phase (not current)
              completed && !isCurrent
                ? "text-signal-green bg-signal-green/[0.03] hover:bg-white/[0.04] cursor-pointer"
                : "",
              // Future / not clickable, not current
              !clickable && !isCurrent && !completed ? "text-gray-600" : "",
              // Disabled rounds (no checkins)
              disabled ? "opacity-40 cursor-not-allowed" : "",
              // Separator between pills
              index > 0 ? "border-l border-white/5" : "",
              // Focus ring
              clickable
                ? "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-plasma-orange/50"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* Current phase left accent bar */}
            {isCurrent && (
              <div
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-plasma-orange rounded-r shadow-[0_0_8px_rgba(255,107,53,0.4)]"
                aria-hidden="true"
              />
            )}

            {/* Label with optional checkmark */}
            <span className="flex items-center justify-center gap-1.5">
              {completed && !isCurrent && (
                <svg
                  className="w-3 h-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {isCurrent && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-plasma-orange shrink-0"
                  aria-hidden="true"
                />
              )}
              {isMobile ? phase.shortLabel : phase.label}
            </span>

            {/* Keyboard shortcut hint */}
            <span
              className="absolute top-0.5 right-1 text-[8px] leading-none text-gray-600 font-mono pointer-events-none bg-white/[0.03] rounded px-0.5"
              aria-hidden="true"
            >
              {index + 1}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
