import { useCallback, useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore, type KioskHeaderScale } from "@/stores/kioskStore";

export type WallClockMode = "clock" | "stopwatch";

const HEADER_HEIGHT_PX: Record<KioskHeaderScale, number> = {
  compact: 40,
  standard: 48,
  large: 64,
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatStopwatch(elapsedMs: number): string {
  const bounded = Math.max(0, Math.floor(elapsedMs));
  const hours = Math.floor(bounded / 3_600_000);
  const minutes = Math.floor((bounded % 3_600_000) / 60_000);
  const seconds = Math.floor((bounded % 60_000) / 1_000);
  const hundredths = Math.floor((bounded % 1_000) / 10);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "button, a[href], input, select, textarea, [contenteditable='true']",
      ),
    )
  );
}

/** Full-bleed, distance-readable clock and stopwatch scenes for kiosk walls. */
export function WallClockDisplay({ mode }: { mode: WallClockMode }) {
  const hour12 = useSettingsStore((state) => state.timeFormat !== "24h");
  const presentation = useKioskStore((state) => state.presentation);
  const kioskActive = useKioskStore((state) => state.active);
  const [now, setNow] = useState(() => new Date());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulatedMs, setAccumulatedMs] = useState(0);

  useEffect(() => {
    // A paused stopwatch has no time-dependent UI. Avoid waking an unattended
    // wall every second until it is running again.
    if (mode === "stopwatch" && startedAt === null) return;
    const cadence = mode === "stopwatch" && startedAt !== null ? 50 : 1_000;
    const timer = setInterval(() => setNow(new Date()), cadence);
    return () => clearInterval(timer);
  }, [mode, startedAt]);

  const elapsedMs =
    accumulatedMs + (startedAt === null ? 0 : now.getTime() - startedAt);

  const toggleStopwatch = useCallback(() => {
    const instant = Date.now();
    if (startedAt === null) {
      setNow(new Date(instant));
      setStartedAt(instant);
      return;
    }
    setAccumulatedMs((value) => value + instant - startedAt);
    setStartedAt(null);
    setNow(new Date(instant));
  }, [startedAt]);

  const resetStopwatch = useCallback(() => {
    setStartedAt(null);
    setAccumulatedMs(0);
    setNow(new Date());
  }, []);

  useEffect(() => {
    if (mode !== "stopwatch") return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Let focused controls keep their native keyboard activation; otherwise
      // Space would toggle here on keydown and click the button again on keyup.
      if (isInteractiveTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) toggleStopwatch();
      } else if (event.key.toLowerCase() === "r") {
        resetStopwatch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, resetStopwatch, toggleStopwatch]);

  const localTime = useMemo(
    () =>
      mode === "clock"
        ? now.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12,
          })
        : "",
    [mode, now, hour12],
  );
  const utcTime = useMemo(
    () =>
      mode === "clock"
        ? now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: "UTC",
          })
        : "",
    [mode, now],
  );
  const date = useMemo(
    () =>
      mode === "clock"
        ? now.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : "",
    [mode, now],
  );
  const numeralClass = presentation.slashedZero
    ? "font-slashed-zero"
    : "tabular-nums";

  return (
    <main
      className="relative isolate flex w-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(255,107,53,0.11),transparent_42%),linear-gradient(180deg,#07101d_0%,#02050a_100%)] px-6 text-center"
      style={{
        minHeight: `calc(100dvh - ${
          kioskActive ? HEADER_HEIGHT_PX[presentation.headerScale] : 64
        }px)`,
      }}
    >
      <div className="pointer-events-none absolute inset-x-[8%] top-1/2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {mode === "clock" ? (
        <>
          <p className="mb-2 font-mono text-[clamp(0.7rem,1.2vw,1rem)] uppercase tracking-[0.45em] text-plasma-orange/75">
            Local time
          </p>
          <time
            className={`${numeralClass} font-mono text-[clamp(4.2rem,17vw,17rem)] font-black leading-none tracking-[-0.075em] text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.08)]`}
            dateTime={now.toISOString()}
          >
            {localTime}
          </time>
          <p className="mt-5 font-orbitron text-[clamp(1rem,2.2vw,2rem)] tracking-[0.12em] text-white/55">
            {date}
          </p>
          <div className="mt-10 flex items-baseline gap-3 border-t border-white/10 pt-5 font-mono">
            <span className={`${numeralClass} text-[clamp(1.5rem,4vw,3.5rem)] text-plasma-orange`}>
              {utcTime}
            </span>
            <span className="text-[clamp(0.65rem,1.2vw,0.9rem)] tracking-[0.35em] text-white/35">
              UTC
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 font-mono text-[clamp(0.7rem,1.2vw,1rem)] uppercase tracking-[0.5em] text-plasma-orange/75">
            Stopwatch
          </p>
          <output
            className={`${numeralClass} font-mono text-[clamp(3.8rem,15vw,15rem)] font-black leading-none tracking-[-0.08em] text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.08)]`}
            aria-live="off"
          >
            {formatStopwatch(elapsedMs)}
          </output>
          <div className="mt-12 flex items-center gap-4">
            <button
              type="button"
              onClick={toggleStopwatch}
              className="min-h-12 min-w-32 rounded-xl border border-plasma-orange/45 bg-plasma-orange/15 px-7 py-3 font-orbitron text-sm uppercase tracking-[0.18em] text-plasma-orange transition hover:bg-plasma-orange/25"
            >
              {startedAt === null ? "Start" : "Pause"}
            </button>
            <button
              type="button"
              onClick={resetStopwatch}
              disabled={elapsedMs === 0}
              className="min-h-12 min-w-32 rounded-xl border border-white/15 bg-white/[0.04] px-7 py-3 font-orbitron text-sm uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Reset
            </button>
          </div>
          <p className="mt-6 font-mono text-xs tracking-widest text-white/25">
            SPACE start/pause · R reset
          </p>
        </>
      )}
    </main>
  );
}
