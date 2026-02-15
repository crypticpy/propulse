/**
 * ContestCountdown Component
 *
 * Displays a live countdown timer to a contest start or end.
 * Updates every second via setInterval. Shows compact format:
 * "2d 14h 32m" / "14h 32m" / "32m 15s"
 *
 * @module components/dashboard/ContestCountdown
 */

import { useState, useEffect } from "react";

export interface ContestCountdownProps {
  /** ISO 8601 UTC target timestamp */
  targetUtc: string;
  /** Whether this is counting down to the end (true) or start (false) */
  isActive: boolean;
  className?: string;
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
  if (t.totalMs <= 0) return "0m";
  if (t.days > 0) return `${t.days}d ${t.hours}h ${t.minutes}m`;
  if (t.hours > 0) return `${t.hours}h ${t.minutes}m`;
  return `${t.minutes}m ${t.seconds}s`;
}

export function ContestCountdown({
  targetUtc,
  isActive,
  className = "",
}: ContestCountdownProps) {
  const [remaining, setRemaining] = useState<TimeRemaining>(() =>
    computeRemaining(targetUtc),
  );

  useEffect(() => {
    // Compute immediately on mount / prop change
    setRemaining(computeRemaining(targetUtc));

    const id = setInterval(() => {
      const next = computeRemaining(targetUtc);
      setRemaining(next);
      if (next.totalMs <= 0) clearInterval(id);
    }, 1_000);

    return () => clearInterval(id);
  }, [targetUtc]);

  const label = isActive ? "Ends in" : "Starts in";
  const expired = remaining.totalMs <= 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-mono tabular-nums ${className}`}
      aria-label={`${label} ${formatCompact(remaining)}`}
    >
      <span className="text-gray-400">{label}</span>
      <span className={expired ? "text-gray-500" : "text-white font-medium"}>
        {expired ? "ended" : formatCompact(remaining)}
      </span>
    </span>
  );
}

ContestCountdown.displayName = "ContestCountdown";

export default ContestCountdown;
