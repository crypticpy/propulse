/**
 * TurnTimer -- Configurable countdown timer with SVG progress ring.
 *
 * Default 3 minutes. Visual states: running (green), paused (amber), expired (red).
 * Warning at 30 seconds. Timer state saved in sessionStorage to survive page refresh.
 * Uses useRef for interval, cleanup on unmount.
 *
 * Exposes a `TurnTimerHandle` via `forwardRef` for imperative control:
 * - `reset()`: stop and reset to full time
 * - `start()`: start from current remaining (or full if idle/expired)
 * - `resetAndStart()`: reset to default time and immediately start
 *
 * Accepts an optional `speakerCallsign` displayed above the ring.
 *
 * ARIA: role="progressbar" on SVG ring, aria-live="assertive" only at warning
 * threshold (<30s), descriptive labels on all controls, paused state label.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";

// ── Imperative Handle ────────────────────────────────────────────────────────

export interface TurnTimerHandle {
  /** Stop timer and reset to full time (idle state). */
  reset: () => void;
  /** Start from current remaining time (or full time if idle/expired). */
  start: () => void;
  /** Reset to default time and immediately start — used for auto-advancing. */
  resetAndStart: () => void;
  /** Pause a running timer. No-op if not running. */
  pause: () => void;
  /** Add time to the current timer (in minutes). */
  addTime: (mins: number) => void;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TurnTimerProps {
  defaultMinutes?: number;
  onExpired?: () => void;
  speakerCallsign?: string; // Displayed above the timer ring
  /** When true, don't render the control buttons div. */
  hideControls?: boolean;
  /** Callback fired when timer state changes. */
  onStateChange?: (state: TimerState) => void;
}

export type TimerState = "idle" | "running" | "paused" | "expired";

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

export const TurnTimer = forwardRef<TurnTimerHandle, TurnTimerProps>(
  function TurnTimer(
    {
      defaultMinutes = 3,
      onExpired,
      speakerCallsign,
      hideControls,
      onStateChange,
    },
    ref,
  ) {
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

    // ── State Change Callback ─────────────────────────────────────────────
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    useEffect(() => {
      onStateChangeRef.current?.(timerState);
    }, [timerState]);

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

    // ── Imperative Handle ──────────────────────────────────────────────────

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          handleReset();
        },
        start: () => {
          // Start from current remaining, or full time if idle/expired
          const newRemaining =
            timerState === "expired" || timerState === "idle"
              ? totalSeconds
              : remaining;
          setRemaining(newRemaining);
          setTimerState("running");
          saveTimerState(newRemaining, "running", totalSeconds);
          startInterval();
        },
        resetAndStart: () => {
          stopInterval();
          const newRemaining = totalDefault;
          setTotalSeconds(totalDefault);
          setRemaining(newRemaining);
          setTimerState("running");
          saveTimerState(newRemaining, "running", totalDefault);
          // Use a microtask to ensure state is set before starting interval
          queueMicrotask(() => {
            startInterval();
          });
        },
        pause: () => {
          if (timerState === "running") {
            stopInterval();
            setTimerState("paused");
            saveTimerState(remaining, "paused", totalSeconds);
          }
        },
        addTime: (mins: number) => {
          handleAddTime(mins);
        },
      }),
      [
        handleReset,
        handleAddTime,
        totalSeconds,
        totalDefault,
        timerState,
        remaining,
        startInterval,
        stopInterval,
      ],
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
              ? "stroke-emerald-400"
              : "stroke-gray-500";

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
        {!hideControls && (
          <h3 className="font-orbitron text-xs uppercase tracking-widest text-gray-300 self-start">
            Turn Timer
          </h3>
        )}

        {/* Speaker callsign label */}
        {!hideControls && speakerCallsign && (
          <p className="text-xs uppercase tracking-widest text-gray-300 text-center mb-1">
            {speakerCallsign}
          </p>
        )}

        {/* SVG Progress Ring */}
        <div
          className={`relative ${isWarning ? "animate-ncs-timer-urgency rounded-full" : timerState === "expired" ? "animate-ncs-timer-critical rounded-full" : ""}`}
        >
          <svg
            viewBox="0 0 120 120"
            className="w-36 h-36 sm:w-40 sm:h-40"
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
              className="text-white/[0.12]"
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
              className={`${strokeColor} transition-[stroke-dashoffset,stroke] duration-700 ease-out ${timerState === "expired" ? "animate-pulse" : ""}`}
              transform="rotate(-90 60 60)"
            />
          </svg>

          {/* Center time text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`font-mono text-3xl sm:text-4xl font-bold tabular-nums transition-colors duration-300 ${
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
        {!hideControls && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartPause}
              className={`px-4 py-2.5 min-h-[44px] text-xs font-semibold rounded-xl border will-change-transform hover:brightness-110 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none ${
                timerState === "running"
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                  : "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 hover:shadow-[0_0_16px_rgba(34,197,94,0.3)]"
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
              className="px-4 py-2.5 min-h-[44px] text-xs font-medium rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white/15 hover:text-white will-change-transform hover:brightness-110 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
              aria-label="Reset timer"
            >
              Reset
            </button>

            <button
              onClick={() => handleAddTime(1)}
              className="px-2.5 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white/15 hover:text-white will-change-transform hover:brightness-110 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
              aria-label="Add 1 minute"
            >
              +1m
            </button>

            <button
              onClick={() => handleAddTime(2)}
              className="px-2.5 py-2 min-h-[44px] text-xs font-medium rounded-xl bg-white/5 text-gray-300 border border-white/10 hover:bg-white/15 hover:text-white will-change-transform hover:brightness-110 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-plasma-orange/70 focus-visible:outline-none"
              aria-label="Add 2 minutes"
            >
              +2m
            </button>
          </div>
        )}
      </div>
    );
  },
);
