/**
 * netStreaks — compute check-in streak metrics from session dates.
 *
 * A "streak" is a run of consecutive scheduled occurrences that the
 * operator attended.  The gap threshold varies by schedule pattern so
 * that a weekly net tolerates up to 10 days between check-ins while a
 * daily net only allows 2.
 */

// ── Public Types ─────────────────────────────────────────────────────────────

export interface StreakResult {
  /** Current consecutive streak (from most recent date backward) */
  current: number;
  /** All-time longest streak */
  longest: number;
  /** Total number of check-in dates */
  totalCheckins: number;
  /** ISO date of the first ever check-in, or null if none */
  firstCheckinDate: string | null;
  /** ISO date of the most recent check-in, or null if none */
  lastCheckinDate: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip time component, keeping only the YYYY-MM-DD date portion. */
function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** Absolute day-gap between two YYYY-MM-DD strings. */
function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(da - db) / msPerDay;
}

/** Maximum gap (in days) that still counts as "consecutive" for a pattern. */
function gapThreshold(pattern: string | undefined): number {
  switch (pattern) {
    case "daily":
      return 2;
    case "weekly":
      return 10;
    case "biweekly":
      return 18;
    case "monthly":
      return 35;
    default:
      // "adhoc" or unspecified
      return 14;
  }
}

// ── Core Function ────────────────────────────────────────────────────────────

/**
 * Compute check-in streak from a list of session dates.
 *
 * @param checkinDates    - ISO date/datetime strings when the user checked in
 * @param schedulePattern - recurrence pattern of the net (determines gap threshold)
 * @returns Streak metrics including current, longest, and total count
 */
export function computeStreak(
  checkinDates: string[],
  schedulePattern?: string,
): StreakResult {
  if (checkinDates.length === 0) {
    return {
      current: 0,
      longest: 0,
      totalCheckins: 0,
      firstCheckinDate: null,
      lastCheckinDate: null,
    };
  }

  // Deduplicate by date-only portion and sort ascending
  const unique = [...new Set(checkinDates.map(toDateOnly))].sort();

  const threshold = gapThreshold(schedulePattern);

  // Walk forward through sorted dates, tracking runs of consecutive attendance
  let longest = 1;
  let run = 1;
  // Array of run lengths, last element = current (most-recent) streak
  const runs: number[] = [];

  for (let i = 1; i < unique.length; i++) {
    if (daysBetween(unique[i - 1], unique[i]) <= threshold) {
      run += 1;
    } else {
      runs.push(run);
      if (run > longest) longest = run;
      run = 1;
    }
  }

  // Close the final run
  runs.push(run);
  if (run > longest) longest = run;

  // The current streak is only "alive" if the most recent check-in is within
  // the gap threshold of today — otherwise the streak has lapsed.
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = unique[unique.length - 1];
  const daysSinceLast = daysBetween(lastDate, today);
  const current = daysSinceLast <= threshold ? runs[runs.length - 1] : 0;

  return {
    current,
    longest,
    totalCheckins: unique.length,
    firstCheckinDate: unique[0],
    lastCheckinDate: unique[unique.length - 1],
  };
}
