/**
 * Shared UTC clock hook — single interval shared across all consumers.
 * Eliminates 6-7 duplicate `setInterval(() => setNow(new Date()), 1000)` calls.
 */

import { useState, useEffect } from "react";

const utcListeners = new Set<() => void>();
let utcInterval: ReturnType<typeof setInterval> | null = null;

export function useUTCClock(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    utcListeners.add(update);
    if (!utcInterval) {
      utcInterval = setInterval(
        () => utcListeners.forEach((fn) => fn()),
        intervalMs,
      );
    }
    return () => {
      utcListeners.delete(update);
      if (utcListeners.size === 0 && utcInterval) {
        clearInterval(utcInterval);
        utcInterval = null;
      }
    };
  }, [intervalMs]);
  return now;
}
