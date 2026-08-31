/**
 * Shared UTC clock hook — single interval shared across all consumers.
 * Eliminates 6-7 duplicate `setInterval(() => setNow(new Date()), 1000)` calls.
 */

import { useEffect, useMemo, useState } from "react";

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

const MAP_DISPLAY_TICK_MS = 60_000;

/**
 * Tick the map's effective time without coupling the large PropSphere tree to
 * the one-second masthead clock. Absolute scenario/replay times stay frozen;
 * live and offset-from-live modes advance once per minute.
 */
export function useMapDisplayTime(
  timeOffsetHours: number,
  absoluteTime: string | null,
  intervalMs = MAP_DISPLAY_TICK_MS,
): Date {
  const [wallClock, setWallClock] = useState(() => new Date());

  useEffect(() => {
    if (absoluteTime) return;
    const update = () => setWallClock(new Date());
    update();
    const interval = setInterval(update, intervalMs);
    return () => clearInterval(interval);
  }, [absoluteTime, intervalMs]);

  return useMemo(() => {
    if (absoluteTime) return new Date(absoluteTime);
    return new Date(
      wallClock.getTime() + timeOffsetHours * 60 * 60 * 1000,
    );
  }, [absoluteTime, timeOffsetHours, wallClock]);
}
