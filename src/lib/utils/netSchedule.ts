/**
 * Net schedule utilities — compute next session times, format schedules,
 * and determine minutes-until-next for alert timing.
 */

import type { NetSchedule } from "@/types/net";

// ── Day-of-week labels ──────────────────────────────────────────────────────

/** Full day names indexed by day-of-week (0 = Sunday) */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Short day names indexed by day-of-week (0 = Sunday) */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Parse an "HH:MM" timeUtc string into hours and minutes.
 * Returns [0, 0] if parsing fails.
 */
function parseTimeUtc(timeUtc: string): [number, number] {
  const parts = timeUtc.split(":");
  if (parts.length < 2) return [0, 0];

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return [0, 0];
  return [hours, minutes];
}

/**
 * Build a UTC Date for today (or a given base) at the specified HH:MM.
 */
function todayAtUtcTime(hours: number, minutes: number, base?: Date): Date {
  const d = base ? new Date(base) : new Date();
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Add N days to a Date (returns new Date).
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Ordinal suffix for a day-of-month number (1st, 2nd, 3rd, 4th, ...).
 */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute the next occurrence of a recurring net schedule from now.
 *
 * - `weekly`   : uses `dayOfWeek` (0=Sun) and `timeUtc` (HH:MM). Finds next occurrence.
 * - `biweekly` : same as weekly but skips every other week (assumes current week is "on").
 * - `monthly`  : uses `dayOfMonth` and `timeUtc`. Finds next occurrence.
 * - `daily`    : uses `timeUtc`. If today's time has passed, returns tomorrow.
 * - `adhoc`    : returns null (no predictable schedule).
 *
 * All computations are in UTC.
 *
 * @param schedule - The net's recurrence schedule
 * @returns Next session Date in UTC, or null for adhoc schedules
 */
export function getNextSessionTime(schedule: NetSchedule): Date | null {
  const now = new Date();
  const [hours, minutes] = parseTimeUtc(schedule.timeUtc);

  switch (schedule.pattern) {
    case "daily": {
      const todaySession = todayAtUtcTime(hours, minutes);
      if (todaySession.getTime() > now.getTime()) {
        return todaySession;
      }
      return addDays(todaySession, 1);
    }

    case "weekly": {
      const targetDay = schedule.dayOfWeek ?? 0;
      const currentDay = now.getUTCDay();

      // Days until next occurrence of the target day
      let daysUntil = (targetDay - currentDay + 7) % 7;

      // Build candidate at target day + time
      const candidate = addDays(todayAtUtcTime(hours, minutes), daysUntil);

      // If same day but time has passed, jump to next week
      if (candidate.getTime() <= now.getTime()) {
        return addDays(candidate, 7);
      }
      return candidate;
    }

    case "biweekly": {
      const targetDay = schedule.dayOfWeek ?? 0;
      const currentDay = now.getUTCDay();

      let daysUntil = (targetDay - currentDay + 7) % 7;
      const candidate = addDays(todayAtUtcTime(hours, minutes), daysUntil);

      if (candidate.getTime() <= now.getTime()) {
        // Time has passed this week — next occurrence is in 2 weeks
        return addDays(candidate, 14);
      }

      // Current week is "on" — if daysUntil is 0 and time hasn't passed,
      // this week works. Otherwise it's the next occurrence of that weekday
      // which is this coming week (on-week). If we're past the target day
      // the modular arithmetic gives us 7 days, but that would be the off-week,
      // so we skip to 14 days.
      if (daysUntil === 0) {
        return candidate;
      }

      // daysUntil > 0: the target day hasn't arrived yet this week (on-week)
      return candidate;
    }

    case "monthly": {
      const targetDayOfMonth = schedule.dayOfMonth ?? 1;
      const nowYear = now.getUTCFullYear();
      const nowMonth = now.getUTCMonth();

      // Try this month
      const thisMonth = new Date(
        Date.UTC(nowYear, nowMonth, targetDayOfMonth, hours, minutes, 0, 0),
      );

      if (thisMonth.getTime() > now.getTime()) {
        // Verify the day didn't roll over (e.g., Feb 31 → Mar 3)
        if (thisMonth.getUTCMonth() === nowMonth) {
          return thisMonth;
        }
      }

      // Try next month
      const nextMonth = new Date(
        Date.UTC(nowYear, nowMonth + 1, targetDayOfMonth, hours, minutes, 0, 0),
      );
      return nextMonth;
    }

    case "adhoc":
      return null;

    default:
      return null;
  }
}

/**
 * Format a schedule into a human-readable string.
 *
 * - weekly   : "Every Tuesday at 01:00 UTC"
 * - biweekly : "Every other Tuesday at 01:00 UTC"
 * - monthly  : "Monthly on day 15 at 01:00 UTC"
 * - daily    : "Daily at 01:00 UTC"
 * - adhoc    : "Ad-hoc (no fixed schedule)"
 *
 * @param schedule - The net's recurrence schedule
 * @returns Human-readable schedule description
 */
export function formatSchedule(schedule: NetSchedule): string {
  switch (schedule.pattern) {
    case "daily":
      return `Daily at ${schedule.timeUtc} UTC`;

    case "weekly": {
      const dayName = DAY_NAMES[schedule.dayOfWeek ?? 0];
      return `Every ${dayName} at ${schedule.timeUtc} UTC`;
    }

    case "biweekly": {
      const dayName = DAY_NAMES[schedule.dayOfWeek ?? 0];
      return `Every other ${dayName} at ${schedule.timeUtc} UTC`;
    }

    case "monthly": {
      const day = schedule.dayOfMonth ?? 1;
      return `Monthly on day ${day} at ${schedule.timeUtc} UTC`;
    }

    case "adhoc":
      return "Ad-hoc (no fixed schedule)";

    default:
      return "Unknown schedule";
  }
}

/**
 * Compute the number of minutes from now until the next scheduled session.
 *
 * @param schedule - The net's recurrence schedule
 * @returns Minutes until next session, or null for adhoc schedules
 */
export function getMinutesUntilNext(schedule: NetSchedule): number | null {
  const next = getNextSessionTime(schedule);
  if (!next) return null;

  const now = Date.now();
  const diffMs = next.getTime() - now;

  // Should always be positive since getNextSessionTime returns future dates,
  // but clamp to zero just in case of edge timing.
  return Math.max(0, Math.floor(diffMs / 60_000));
}

/**
 * Get a short day label for the schedule.
 *
 * - weekly / biweekly : "Tue", "Mon", etc.
 * - monthly           : "15th", "1st", etc.
 * - daily             : "Daily"
 * - adhoc             : "Ad-hoc"
 *
 * @param schedule - The net's recurrence schedule
 * @returns Short day label string
 */
export function getScheduleDayLabel(schedule: NetSchedule): string {
  switch (schedule.pattern) {
    case "daily":
      return "Daily";

    case "weekly":
    case "biweekly":
      return DAY_SHORT[schedule.dayOfWeek ?? 0];

    case "monthly":
      return ordinal(schedule.dayOfMonth ?? 1);

    case "adhoc":
      return "Ad-hoc";

    default:
      return "—";
  }
}
