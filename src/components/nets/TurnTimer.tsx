/**
 * TurnTimer -- Configurable countdown timer with SVG progress ring.
 *
 * Default 3 minutes. Visual states: running (green), paused (amber), expired (red).
 * Warning at 30 seconds. Timer state saved in sessionStorage to survive page refresh.
 * Uses useRef for interval, cleanup on unmount.
 *
 * ARIA: role="progressbar" on SVG ring, aria-live="assertive" only at warning
 * threshold (<30s), descriptive labels on all controls, paused state label.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface TurnTimerProps {
  defaultMinutes?: number;
  onExpired?: () => void;
}

type TimerState = "idle" | "running" | "paused" | "expired";

// ── Session Storage Key ──────────────────────────────────────────────────────

function getStorageKey(): string {
  // Use a stable key per browser tab via sessionStorage
  return "propulse-turn-timer-state";
}

function saveTimerState(remaining: number, state: TimerState, total: number) {
  try {
    sessionStorage.setItem(
      getStorageKey(),
      JSON.stringify({ remaining, state, total, savedAt: Date.now() }),
    );
  } catch {
    // Ignore storage errors
  }
}

function loadTimerState(): {
  remaining: number;
  state: TimerState;
  total: number;
} | null {
  try {
    const raw = sessionStorage.getItem(getStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.state === "running") {
      // Adjust for time elapsed while away
      const elapsed = Math.floor((Date.now() - parsed.savedAt) / 1000);
      const adjusted = Math.max(0, parsed.remaining - elapsed);
      return {
        remaining: adjusted,
        state: adjusted <= 0 ? "expired" : "running",
        total: parsed.total,
      };
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── Spoken time helper ───────────────────────────────────────────────────────

function spokenTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0)
    return `${m} minute${m !== 1 ? "s" : ""} ${s} second${s !== 1 ? "s" : ""}`;
  if (m > 0) return `${m} minute${m !== 1 ? "s" : ""}`;
  return `${s} second${s !== 1 ? "s" : ""}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TurnTimer({ defaultMinutes = 3, onExpired }: TurnTimerProps) {
  const totalDefault = defaultMinutes * 60;
  const saved = useRef(loadTimerState());

  const [totalSeconds, setTotalSeconds] = useState(
    saved.current?.total ?? totalDefault,
  );
  const [remaining, setRemaining] = useState(
    saved.current?.remaining ?? totalDefault,
  );
  const [timerState, setTimerState] = useState<TimerState>(
    saved.current?.state ?? "idle",
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // ── Tick Logic ───────────────────────────────────────────────────────────

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startInterval = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          stopInterval();
          setTimerState("expired");
          saveTimerState(0, "expired", totalSeconds);
          onExpiredRef.current?.();
          return 0;
        }
        saveTimerState(next, "running", totalSeconds);
        return next;
      });
    }, 1000);
  }, [stopInterval, totalSeconds]);

  // Resume running timer on mount
  useEffect(() => {
    if (timerState === "running") {
      startInterval();
    }
    return stopInterval;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ─────────────────────────────────────────────────────────────

  const handleStartPause = useCallback(() => {
    if (timerState === "running") {
      stopInterval();
      setTimerState("paused");
      saveTimerState(remaining, "paused", totalSeconds);
    } else {
      const newRemaining =
        timerState === "expired" || timerState === "idle"
          ? totalSeconds
          : remaining;
      setRemaining(newRemaining);
      setTimerState("running");
      saveTimerState(newRemaining, "running", totalSeconds);
      startInterval();
    }
  }, [timerState, remaining, totalSeconds, startInterval, stopInterval]);

  const handleReset = useCallback(() => {
    stopInterval();
    setRemaining(totalSeconds);
    setTimerState("idle");
    saveTimerState(totalSeconds, "idle", totalSeconds);
  }, [totalSeconds, stopInterval]);

  const handleAddTime = useCallback(
    (mins: number) => {
      const added = mins * 60;
      setRemaining((prev) => {
        const next = prev + added;
        setTotalSeconds((t) => {
          const newTotal = t + added;
          saveTimerState(next, timerState, newTotal);
          return newTotal;
        });
        return next;
      });
      if (timerState === "expired") {
        setTimerState("paused");
      }
    },
    [timerState],
  );

  // ── SVG Progress Ring ────────────────────────────────────────────────────

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const dashOffset = circumference * (1 - progress);

  const isWarning =
    remaining <= 30 && remaining > 0 && timerState === "running";

  const strokeColor =
    timerState === "expired"
      ? "stroke-red-500"
      : isWarning
        ? "stroke-amber-400"
        : timerState === "paused"
          ? "stroke-amber-400"
          : timerState === "running"
            ? "stroke-green-400"
            : "stroke-gray-600";

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeText = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Button label varies by timer state
  const startPauseLabel =
    timerState === "running"
      ? "Pause timer"
      : timerState === "expired"
        ? "Restart timer"
        : "Start timer";

  // Spoken timer label for the progress ring
  const timerAriaLabel =
    timerState === "paused"
      ? `Timer paused at ${spokenTime(remaining)}`
      : timerState === "expired"
        ? "Timer expired"
        : timerState === "running"
          ? `Turn timer, ${spokenTime(remaining)} remaining`
          : `Turn timer, ${spokenTime(remaining)}`;

  return (
    <div
      className="flex flex-col items-center gap-3"
      role="region"
      aria-label="Turn timer"
    >
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500 self-start">
        Turn Timer
      </h3>

      {/* SVG Progress Ring */}
      <div className="relative">
        <svg
          viewBox="0 0 120 120"
          className="w-28 h-28"
          role="progressbar"
          aria-valuenow={remaining}
          aria-valuemin={0}
          aria-valuemax={totalSeconds}
          aria-label={timerAriaLabel}
        >
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-white/5"
          />
          {/* Progress ring */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={`${strokeColor} transition-all duration-500 ${timerState === "expired" ? "animate-pulse" : ""}`}
            transform="rotate(-90 60 60)"
          />
        </svg>

        {/* Center time text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-mono text-xl font-bold ${
              timerState === "expired"
                ? "text-red-400 animate-pulse"
                : isWarning
                  ? "text-amber-400"
                  : "text-white"
            }`}
            aria-hidden="true"
          >
            {timeText}
          </span>
        </div>
      </div>

      {/* Warning announcement — only fires when warning state is active */}
      {isWarning && (
        <div className="sr-only" aria-live="assertive" aria-atomic="true">
          Warning: {spokenTime(remaining)} remaining
        </div>
      )}

      {/* Timer expired announcement */}
      {timerState === "expired" && (
        <div className="sr-only" aria-live="assertive" aria-atomic="true">
          Turn timer has expired
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleStartPause}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            timerState === "running"
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30"
              : "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"
          }`}
          aria-label={startPauseLabel}
        >
          {timerState === "running"
            ? "Pause"
            : timerState === "expired"
              ? "Restart"
              : "Start"}
        </button>

        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
          aria-label="Reset timer"
        >
          Reset
        </button>

        <button
          onClick={() => handleAddTime(1)}
          className="px-2 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
          aria-label="Add 1 minute"
        >
          +1m
        </button>

        <button
          onClick={() => handleAddTime(2)}
          className="px-2 py-1.5 text-xs font-medium rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 transition-colors"
          aria-label="Add 2 minutes"
        >
          +2m
        </button>
      </div>
    </div>
  );
}
