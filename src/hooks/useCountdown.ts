/**
 * useCountdown Hook
 *
 * Live countdown to a UTC timestamp, ticking every second until it ends.
 * Extracted from ContestCountdown so other dashboard widgets (e.g. named
 * countdowns) can reuse the same compact display format:
 * "Nd Nh Nm" / "Nh Nm" / "Nm Ns" / "ended".
 *
 * @module hooks/useCountdown
 */

import { useState, useEffect } from "react";

export interface CountdownState {
  totalMs: number;
  text: string;
  ended: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function computeRemaining(targetUtc: string): TimeRemaining {
  const nowMs = Date.now();
  const targetMs = new Date(targetUtc).getTime();
  const totalMs = Math.max(0, targetMs - nowMs);

  const totalSeconds = Math.floor(totalMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalMs };
}

function formatCompact(t: TimeRemaining): string {
  if (t.totalMs <= 0) return "ended";
  if (t.days > 0) return `${t.days}d ${t.hours}h ${t.minutes}m`;
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`;
  return `${t.minutes}m ${t.seconds}s`;
}

function toState(t: TimeRemaining): CountdownState {
  return { totalMs: t.totalMs, text: formatCompact(t), ended: t.totalMs <= 0 };
}

/**
 * Returns a live-updating countdown to `targetUtc` (an ISO 8601 UTC
 * timestamp). Recomputes immediately on mount / target change, then ticks
 * every second. Stops ticking once the target has passed.
 */
export function useCountdown(targetUtc: string): CountdownState {
  const [state, setState] = useState<CountdownState>(() =>
    toState(computeRemaining(targetUtc)),
  );

  useEffect(() => {
    // Compute immediately on mount / prop change
    setState(toState(computeRemaining(targetUtc)));

    const id = setInterval(() => {
      const next = computeRemaining(targetUtc);
      setState(toState(next));
      if (next.totalMs <= 0) clearInterval(id);
    }, 1_000);

    return () => clearInterval(id);
  }, [targetUtc]);

  return state;
}
