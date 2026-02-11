/**
 * ReplayIndicator Component
 *
 * A floating pill/banner that shows replay status when the user is viewing
 * historical spots. Two visual states:
 *
 *   - Active replay: sepia-toned banner with pulsing amber dot, display time,
 *     playback speed, and a "Stop" button.
 *   - Inactive (time in the past): subtle "Replay" toggle button with a
 *     rewind icon. Grayed out with a "Pro" badge when gated by subscription.
 *
 * Returns null when there is nothing actionable to show (display time is
 * current/future and replay is not active).
 */

import { useMemo } from "react";
import { useFeatureFlags } from "@/lib/featureFlags";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReplayIndicatorProps {
  /** Current display time being shown */
  displayTime: Date;
  /** Playback speed multiplier (1, 2, 5, 10) */
  playSpeed: number;
  /** Whether replay mode is currently active */
  isReplaying: boolean;
  /** Toggle replay on/off */
  onToggle: () => void;
  /** Optional className for positioning */
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum age (ms) of displayTime before the replay UI appears. */
const PAST_THRESHOLD_MS = 60_000; // 1 minute

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatReplayDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

/** SVG rewind icon (two left-pointing triangles). */
function RewindIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M7 2L1 7l6 5V2z" fill="currentColor" />
      <path d="M13 2L7 7l6 5V2z" fill="currentColor" />
    </svg>
  );
}

/** SVG stop icon (filled square). */
function StopIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReplayIndicator({
  displayTime,
  playSpeed,
  isReplaying,
  onToggle,
  className,
}: ReplayIndicatorProps) {
  const flags = useFeatureFlags();
  const canReplay = flags.spotReplay;

  const isInPast = useMemo(() => {
    return Date.now() - displayTime.getTime() >= PAST_THRESHOLD_MS;
  }, [displayTime]);

  // ── Visibility gate ─────────────────────────────────────────────────────
  // Only render when actively replaying OR when displayTime is at least
  // 1 minute in the past.
  if (!isReplaying && !isInPast) {
    return null;
  }

  // ── Active replay banner ────────────────────────────────────────────────
  if (isReplaying) {
    const formattedDate = formatReplayDate(displayTime);

    return (
      <div
        className={`
          inline-flex items-center gap-2
          bg-amber-900/40 backdrop-blur-md border border-amber-500/30 rounded-xl
          px-3 py-1.5 text-xs font-medium select-none shadow-xl
          ${className ?? ""}
        `}
        role="status"
        aria-label={`Replay active: ${formattedDate} UTC at ${playSpeed}x speed`}
      >
        {/* Pulsing amber dot */}
        <span
          className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
          style={{ animation: "replayPulse 1.5s ease-in-out infinite" }}
          aria-hidden="true"
        />

        {/* Label */}
        <span className="font-mono text-amber-300 tracking-wider uppercase">
          Replay
        </span>

        {/* Separator */}
        <span className="text-amber-500/40" aria-hidden="true">
          &middot;
        </span>

        {/* Display time */}
        <span className="font-mono text-amber-200/90 tabular-nums whitespace-nowrap">
          {formattedDate} UTC
        </span>

        {/* Separator */}
        <span className="text-amber-500/40" aria-hidden="true">
          &middot;
        </span>

        {/* Playback speed */}
        <span className="font-mono text-amber-300 tabular-nums">
          {playSpeed}x
        </span>

        {/* Stop button */}
        <button
          type="button"
          onClick={onToggle}
          className="
            ml-1 inline-flex items-center gap-1
            px-2 py-0.5 rounded-lg
            bg-amber-500/20 hover:bg-amber-500/30
            text-amber-200 hover:text-amber-100
            border border-amber-500/20 hover:border-amber-500/40
            transition-colors duration-150
            cursor-pointer
          "
          aria-label="Stop replay"
        >
          <StopIcon className="w-2.5 h-2.5" />
          <span className="text-[11px] font-medium">Stop</span>
        </button>

        {/* Pulse animation keyframes */}
        <style>{`
          @keyframes replayPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    );
  }

  // ── Inactive — gated (no access) ───────────────────────────────────────
  if (!canReplay) {
    return (
      <div
        className={`
          inline-flex items-center gap-2
          bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-xl
          px-3 py-1.5 text-xs font-medium select-none
          text-white/30 cursor-not-allowed
          ${className ?? ""}
        `}
        title="Upgrade to Pro for spot replay"
        role="status"
        aria-label="Spot replay requires Pro subscription"
      >
        <RewindIcon className="w-3.5 h-3.5" />
        <span>Replay</span>
        <span className="px-1.5 py-0.5 rounded bg-plasma-orange/20 text-plasma-orange text-[10px] font-semibold uppercase tracking-wide">
          Pro
        </span>
      </div>
    );
  }

  // ── Inactive — available (time is in the past, user can replay) ────────
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        inline-flex items-center gap-2
        bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-xl
        px-3 py-1.5 text-xs font-medium select-none
        text-white/60 hover:text-white/90
        hover:bg-void-black/90 hover:border-white/20
        transition-colors duration-150 cursor-pointer
        ${className ?? ""}
      `}
      aria-label="Start spot replay"
    >
      <RewindIcon className="w-3.5 h-3.5" />
      <span>Replay</span>
    </button>
  );
}

ReplayIndicator.displayName = "ReplayIndicator";
