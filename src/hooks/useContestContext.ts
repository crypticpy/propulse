/**
 * useContestContext Hook
 *
 * Provides reactive contest calendar awareness to any component. Computes
 * which contests are currently active, which are upcoming, which bands are
 * busy with contest traffic, and which bands are quiet.
 *
 * Key design decisions:
 * - Uses a 60-second polling interval to detect contest boundary crossings
 * - Returns stable references via useMemo for downstream optimization
 * - Works fully offline using the bundled static calendar dataset
 * - Can optionally merge remote calendar updates when online
 *
 * @module hooks/useContestContext
 */

import { useState, useEffect, useMemo, useRef } from "react";

import type {
  ContestCalendarEntry,
  ContestCalendarContext,
} from "@/lib/contest/contestCalendarTypes";

import {
  getActiveContests,
  getUpcomingContests,
  getNextContestBoundary,
  WARC_BANDS,
  HF_CONTEST_BANDS,
} from "@/lib/data/contestCalendar";

import {
  fetchRemoteCalendar,
  mergeCalendars,
} from "@/lib/contest/contestCalendarSync";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often (ms) to re-evaluate contest boundaries */
const POLL_INTERVAL_MS = 60_000;

/** How far ahead (days) to look for upcoming contests */
const UPCOMING_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Reactive contest calendar awareness.
 *
 * Returns a `ContestCalendarContext` that automatically updates when the
 * current time crosses a contest start or end boundary. All derived
 * values are memoized for referential stability.
 *
 * @example
 * ```tsx
 * function BandIndicator() {
 *   const { isContestWeekend, quietBands, activeContests } = useContestContext();
 *   if (!isContestWeekend) return null;
 *   return <div>Quiet bands: {quietBands.join(", ")}</div>;
 * }
 * ```
 */
export function useContestContext(): ContestCalendarContext {
  // -------------------------------------------------------------------------
  // Clock tick — drives all derived state
  // -------------------------------------------------------------------------
  const [tick, setTick] = useState(() => Date.now());
  const nextBoundaryRef = useRef<number | null>(null);

  // Remote overlay (optional, lazy-loaded)
  const [remoteEntries, setRemoteEntries] = useState<ContestCalendarEntry[]>(
    [],
  );
  const fetchedRef = useRef(false);

  // Attempt a single remote fetch on mount (non-blocking)
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchRemoteCalendar()
      .then((entries) => {
        if (entries.length > 0) {
          setRemoteEntries(entries);
        }
      })
      .catch(() => {
        // Graceful fallback — static data is always available
      });
  }, []);

  // Polling: check every 60s, but also snap to the next contest boundary
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTick(now);

      // Recalculate next boundary after each tick
      const boundary = getNextContestBoundary(new Date(now));
      nextBoundaryRef.current = boundary ? boundary.getTime() : null;
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  // Snap to boundary: if the next boundary is within the polling interval,
  // schedule an extra tick at exactly that time for instant reactivity
  useEffect(() => {
    const boundaryMs = nextBoundaryRef.current;
    if (boundaryMs === null) return;

    const delta = boundaryMs - Date.now();
    if (delta <= 0 || delta > POLL_INTERVAL_MS) return;

    const snap = setTimeout(() => setTick(Date.now()), delta + 50);
    return () => clearTimeout(snap);
  }, [tick]);

  // -------------------------------------------------------------------------
  // Derived state (all memoized)
  // -------------------------------------------------------------------------

  const now = useMemo(() => new Date(tick), [tick]);

  const activeContests = useMemo(() => {
    const staticActive = getActiveContests(now);
    if (remoteEntries.length === 0) return staticActive;
    const merged = mergeCalendars(staticActive, remoteEntries);
    // Only return those that are currently active after merge
    const nowMs = now.getTime();
    return merged.filter((c) => {
      const s = new Date(c.startUtc).getTime();
      const e = new Date(c.endUtc).getTime();
      return nowMs >= s && nowMs <= e;
    });
  }, [now, remoteEntries]);

  const upcomingContests = useMemo(() => {
    const staticUpcoming = getUpcomingContests(now, UPCOMING_WINDOW_DAYS);
    if (remoteEntries.length === 0) return staticUpcoming;
    const merged = mergeCalendars(staticUpcoming, remoteEntries);
    const nowMs = now.getTime();
    const futureMs = nowMs + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return merged
      .filter((c) => {
        const s = new Date(c.startUtc).getTime();
        return s > nowMs && s <= futureMs;
      })
      .sort(
        (a, b) =>
          new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
      );
  }, [now, remoteEntries]);

  const isContestWeekend = useMemo(
    () => activeContests.length > 0,
    [activeContests],
  );

  const contestBands = useMemo(() => {
    const bands = new Set<string>();
    for (const contest of activeContests) {
      for (const band of contest.bands) {
        bands.add(band);
      }
    }
    return bands;
  }, [activeContests]);

  const quietBands = useMemo(() => {
    const quiet: string[] = [];

    // WARC bands are ALWAYS quiet — never have contests
    for (const band of WARC_BANDS) {
      quiet.push(band);
    }

    // Any standard HF contest band NOT used by active contests
    for (const band of HF_CONTEST_BANDS) {
      if (!contestBands.has(band)) {
        quiet.push(band);
      }
    }

    return quiet;
  }, [contestBands]);

  const nextContest = useMemo(
    () => (upcomingContests.length > 0 ? upcomingContests[0] : null),
    [upcomingContests],
  );

  // -------------------------------------------------------------------------
  // Return stable context object
  // -------------------------------------------------------------------------

  return useMemo<ContestCalendarContext>(
    () => ({
      activeContests,
      upcomingContests,
      isContestWeekend,
      contestBands,
      quietBands,
      nextContest,
    }),
    [
      activeContests,
      upcomingContests,
      isContestWeekend,
      contestBands,
      quietBands,
      nextContest,
    ],
  );
}
