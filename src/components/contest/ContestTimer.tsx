/**
 * ContestTimer - Countdown clock and off-time operating tracker
 *
 * Features:
 * - HH:MM:SS countdown to contest end (or elapsed time if contest hasn't ended)
 * - Off-time progress bar when off-time rules are provided:
 *   - Green: operating time used < 80%
 *   - Yellow: operating time used 80-95%
 *   - Red: operating time used > 95% or violation
 * - Status text: "42:00 operating / 6:00 off-time"
 * - Warning banners when approaching off-time limits
 * - Compact mode for embedding in header areas
 * - Dark theme styling matching Propulse design system
 * - Updates every second via useEffect + setInterval
 */

import { useState, useEffect, useMemo, memo } from "react";
import {
  getOffTimeStatus,
  formatOffTimeWarning,
  formatMinutes,
  type OffTimeRules,
  type OffTimeStatus,
} from "@/lib/contest/offTimeTracker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContestTimerProps {
  /** Contest start time */
  contestStart: Date;
  /** Contest end time */
  contestEnd: Date;
  /** Off-time rules (omit if the contest has no operating time limits) */
  offTimeRules?: OffTimeRules;
  /** QSO timestamps in milliseconds for off-time calculation */
  qsoTimestamps: number[];
  /** Additional CSS classes */
  className?: string;
  /** Compact mode renders just the clock + mini progress bar */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a duration in seconds to HH:MM:SS
 */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Determine progress bar color class based on percentage used.
 */
function getProgressColor(percent: number, isViolation: boolean): string {
  if (isViolation || percent > 95) return "bg-alert-red";
  if (percent > 80) return "bg-yellow-500";
  return "bg-signal-green";
}

/**
 * Determine warning severity for styling.
 */
function getWarningSeverity(
  status: OffTimeStatus,
): "none" | "warning" | "critical" {
  if (status.isViolation || status.remainingOperatingMinutes <= 0) {
    return "critical";
  }
  if (status.remainingOperatingMinutes < 30) return "critical";
  if (status.remainingOperatingMinutes < 120) return "warning";
  return "none";
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Countdown clock display
 */
const CountdownClock = memo(function CountdownClock({
  contestStart,
  contestEnd,
  compact,
}: {
  contestStart: Date;
  contestEnd: Date;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const contestEndMs = contestEnd.getTime();
  const contestStartMs = contestStart.getTime();
  const isContestOver = now >= contestEndMs;
  const hasStarted = now >= contestStartMs;

  // Remaining time to contest end
  const remainingSeconds = Math.max(0, (contestEndMs - now) / 1000);
  // Elapsed time since contest start
  const elapsedSeconds = Math.max(0, (now - contestStartMs) / 1000);

  const timeDisplay = isContestOver
    ? "00:00:00"
    : formatCountdown(remainingSeconds);
  const elapsedDisplay = formatCountdown(
    isContestOver ? (contestEndMs - contestStartMs) / 1000 : elapsedSeconds,
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-sm font-bold tabular-nums ${
            isContestOver
              ? "text-gray-500"
              : remainingSeconds < 3600
                ? "text-alert-red animate-pulse"
                : "text-cosmic-cyan"
          }`}
        >
          {timeDisplay}
        </span>
        {!isContestOver && hasStarted && (
          <span className="text-[10px] text-gray-500">rem</span>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      {/* Main countdown */}
      <div
        className={`font-mono text-2xl font-black tabular-nums tracking-wider ${
          isContestOver
            ? "text-gray-500"
            : remainingSeconds < 3600
              ? "text-alert-red animate-pulse"
              : "text-cosmic-cyan"
        }`}
      >
        {timeDisplay}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
        {isContestOver ? "Contest Over" : "Remaining"}
      </div>
      {/* Elapsed time */}
      {hasStarted && (
        <div className="mt-1 text-xs text-gray-400 font-mono tabular-nums">
          {elapsedDisplay} elapsed
        </div>
      )}
    </div>
  );
});

/**
 * Off-time progress bar with percentage and color transitions
 */
const OffTimeProgressBar = memo(function OffTimeProgressBar({
  status,
  compact,
}: {
  status: OffTimeStatus;
  compact?: boolean;
}) {
  const barColor = getProgressColor(
    status.percentOperating,
    status.isViolation,
  );
  const percent = Math.min(100, status.percentOperating);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-gray-400 tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Progress bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span className="font-mono tabular-nums">
          {formatMinutes(status.totalOperatingMinutes)} operating
        </span>
        <span className="font-mono tabular-nums">
          {formatMinutes(status.totalOffTimeMinutes)} off
        </span>
      </div>
    </div>
  );
});

/**
 * Warning banner for off-time alerts
 */
const OffTimeWarningBanner = memo(function OffTimeWarningBanner({
  status,
}: {
  status: OffTimeStatus;
}) {
  const severity = getWarningSeverity(status);
  const message = formatOffTimeWarning(status);

  if (severity === "none" || !message) return null;

  const isCritical = severity === "critical";

  return (
    <div
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
        isCritical
          ? "bg-alert-red/20 border border-alert-red/50 text-alert-red animate-pulse"
          : "bg-yellow-500/15 border border-yellow-500/40 text-yellow-400"
      }`}
    >
      {/* Warning icon */}
      <svg
        className="w-3.5 h-3.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span className="truncate">{message}</span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * ContestTimer — countdown clock with optional off-time tracking
 */
export const ContestTimer = memo(function ContestTimer({
  contestStart,
  contestEnd,
  offTimeRules,
  qsoTimestamps,
  className = "",
  compact = false,
}: ContestTimerProps) {
  // Recalculate off-time status every second (driven by the clock tick)
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const offTimeStatus = useMemo(() => {
    // Force recalculation on each tick
    void tick;
    if (!offTimeRules) return null;
    return getOffTimeStatus(
      qsoTimestamps,
      contestStart.getTime(),
      contestEnd.getTime(),
      offTimeRules,
    );
  }, [tick, offTimeRules, qsoTimestamps, contestStart, contestEnd]);

  // ---- Compact mode ----
  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <CountdownClock
          contestStart={contestStart}
          contestEnd={contestEnd}
          compact
        />
        {offTimeStatus && <OffTimeProgressBar status={offTimeStatus} compact />}
      </div>
    );
  }

  // ---- Full mode ----
  return (
    <div
      className={`rounded-xl border border-white/10 bg-nebula-blue/50 backdrop-blur-sm p-3 space-y-2 ${className}`}
    >
      {/* Clock */}
      <CountdownClock contestStart={contestStart} contestEnd={contestEnd} />

      {/* Off-time section */}
      {offTimeStatus && (
        <>
          <OffTimeProgressBar status={offTimeStatus} />

          {/* Remaining operating time */}
          <div className="text-center">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              Operating time left:{" "}
            </span>
            <span
              className={`text-xs font-mono font-bold tabular-nums ${
                offTimeStatus.remainingOperatingMinutes < 30
                  ? "text-alert-red"
                  : offTimeStatus.remainingOperatingMinutes < 120
                    ? "text-yellow-400"
                    : "text-signal-green"
              }`}
            >
              {formatMinutes(offTimeStatus.remainingOperatingMinutes)}
            </span>
          </div>

          {/* Warning banner */}
          <OffTimeWarningBanner status={offTimeStatus} />
        </>
      )}

      {/* No off-time rules indicator */}
      {!offTimeRules && (
        <div className="text-center text-[10px] text-gray-500">
          No off-time rules
        </div>
      )}
    </div>
  );
});

export default ContestTimer;
