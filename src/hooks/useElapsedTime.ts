/**
 * useElapsedTime -- Shared hook that returns a live "HH:MM:SS" string
 * counting up from a given ISO-8601 start timestamp.
 *
 * Updates every second while `startedAt` is defined.
 * Used by SessionControls and NCSLiveDashboard.
 */

import { useEffect, useState } from "react";

/**
 * Returns a live elapsed-time string in "HH:MM:SS" format.
 *
 * @param startedAt - ISO-8601 timestamp string, or undefined if not started
 * @returns Formatted elapsed time string (e.g., "01:23:45")
 */
export function useElapsedTime(startedAt: string | undefined): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return "00:00:00";

  const diff = Math.max(0, now - new Date(startedAt).getTime());
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
