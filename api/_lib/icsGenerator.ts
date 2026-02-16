/**
 * ICS Calendar Generator — RFC 5545 compliant
 *
 * Generates iCalendar (.ics) feeds for ham radio net schedules.
 * Used by per-net and bundle calendar edge functions.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc5545
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const CRLF = "\r\n";
const PRODID = "-//Propulse//Ham Radio Net Calendar//EN";
const MAX_LINE_OCTETS = 70; // Conservative: fold at 70 chars to be safe with multi-byte UTF-8

/** ICS day abbreviations indexed by JS day-of-week (0 = Sunday) */
const ICS_BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Database shape for net schedule (snake_case JSONB from Supabase) */
export interface NetScheduleRow {
  pattern: string;
  dayOfWeek?: number; // 0 = Sunday
  dayOfMonth?: number; // 1-31
  timeUtc: string; // "HH:MM"
  timezone?: string;
}

/** Database shape for a net row (snake_case from Supabase) */
export interface NetRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  frequency: string;
  alt_frequency: string | null;
  mode: string;
  band: string;
  schedule: NetScheduleRow | null;
  duration_minutes: number | null;
  region: string | null;
  repeater_info: {
    callsign: string;
    offset: string;
    tone: string;
  } | null;
  website_url: string | null;
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Format a Date as an ICS datetime string in UTC.
 * Output: YYYYMMDDTHHMMSSZ (RFC 5545 §3.3.5)
 */
export function formatIcsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

/**
 * Escape text per RFC 5545 §3.3.11.
 * Backslash, semicolon, comma are escaped; newlines become literal \n.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold content lines longer than 75 octets per RFC 5545 §3.1.
 * Continuation lines begin with a single space character.
 */
export function foldLine(line: string): string {
  if (line.length <= MAX_LINE_OCTETS) return line;

  const parts: string[] = [];
  parts.push(line.slice(0, MAX_LINE_OCTETS));
  let remaining = line.slice(MAX_LINE_OCTETS);

  // Continuation lines: CRLF + space, then up to 74 chars (75 - 1 for the space)
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, MAX_LINE_OCTETS - 1));
    remaining = remaining.slice(MAX_LINE_OCTETS - 1);
  }

  return parts.join(CRLF + " ");
}

/**
 * Sanitize a string for use in Content-Disposition filename.
 * Removes non-ASCII and special characters, replaces spaces with hyphens.
 */
export function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[^\x20-\x7E]/g, "") // strip non-printable-ASCII
      .replace(/[<>:"/\\|?*]/g, "") // strip filesystem-unsafe chars
      .replace(/\s+/g, "-") // spaces → hyphens
      .replace(/-+/g, "-") // collapse multiple hyphens
      .replace(/^-|-$/g, "") // trim leading/trailing hyphens
      .slice(0, 64) || // cap length
    "calendar"
  );
}

// ─── Schedule Computation ───────────────────────────────────────────────────
// Duplicated from src/lib/utils/netSchedule.ts because edge functions
// cannot import from the src/ directory.

/**
 * Parse an "HH:MM" timeUtc string into [hours, minutes].
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

/** Build a UTC Date for today (or a given base) at the specified HH:MM. */
function todayAtUtcTime(hours: number, minutes: number, base?: Date): Date {
  const d = base ? new Date(base) : new Date();
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

/** Add N days to a Date (returns new Date). */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Compute the next occurrence of a recurring net schedule from now.
 *
 * - daily    : today at timeUtc if future, else tomorrow
 * - weekly   : next occurrence of dayOfWeek at timeUtc
 * - biweekly : same as weekly but 14-day gap if passed
 * - monthly  : next occurrence of dayOfMonth at timeUtc
 * - adhoc    : null (no predictable schedule)
 */
export function computeNextSession(schedule: NetScheduleRow): Date | null {
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

      const daysUntil = (targetDay - currentDay + 7) % 7;
      const candidate = addDays(todayAtUtcTime(hours, minutes), daysUntil);

      if (candidate.getTime() <= now.getTime()) {
        return addDays(candidate, 7);
      }
      return candidate;
    }

    case "biweekly": {
      const targetDay = schedule.dayOfWeek ?? 0;
      const currentDay = now.getUTCDay();

      const daysUntil = (targetDay - currentDay + 7) % 7;
      const candidate = addDays(todayAtUtcTime(hours, minutes), daysUntil);

      if (candidate.getTime() <= now.getTime()) {
        return addDays(candidate, 14);
      }

      if (daysUntil === 0) {
        return candidate;
      }

      return candidate;
    }

    case "monthly": {
      const targetDayOfMonth = schedule.dayOfMonth ?? 1;
      const nowYear = now.getUTCFullYear();
      const nowMonth = now.getUTCMonth();

      const thisMonth = new Date(
        Date.UTC(nowYear, nowMonth, targetDayOfMonth, hours, minutes, 0, 0),
      );

      if (thisMonth.getTime() > now.getTime()) {
        if (thisMonth.getUTCMonth() === nowMonth) {
          return thisMonth;
        }
      }

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

// ─── RRULE Builder ──────────────────────────────────────────────────────────

/**
 * Build an RFC 5545 RRULE string for a net schedule pattern.
 * Returns null for adhoc schedules (no recurrence).
 */
function buildRRule(schedule: NetScheduleRow): string | null {
  switch (schedule.pattern) {
    case "daily":
      return "RRULE:FREQ=DAILY";

    case "weekly": {
      const day = ICS_BYDAY[schedule.dayOfWeek ?? 0];
      return `RRULE:FREQ=WEEKLY;BYDAY=${day}`;
    }

    case "biweekly": {
      const day = ICS_BYDAY[schedule.dayOfWeek ?? 0];
      return `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`;
    }

    case "monthly": {
      const dayOfMonth = schedule.dayOfMonth ?? 1;
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`;
    }

    case "adhoc":
      return null;

    default:
      return null;
  }
}

// ─── Description Builder ────────────────────────────────────────────────────

/**
 * Build a human-readable DESCRIPTION for a net VEVENT.
 */
function buildDescription(net: NetRow): string {
  const lines: string[] = [];

  lines.push(`Frequency: ${net.frequency} ${net.mode}`);

  if (net.alt_frequency) {
    lines.push(`Alt Frequency: ${net.alt_frequency}`);
  }

  lines.push(`Band: ${net.band}`);

  if (net.duration_minutes) {
    lines.push(`Duration: ${net.duration_minutes} minutes`);
  }

  if (net.repeater_info) {
    const ri = net.repeater_info;
    lines.push(`Repeater: ${ri.callsign} (${ri.offset}, ${ri.tone})`);
  }

  if (net.description) {
    lines.push("");
    lines.push(net.description);
  }

  lines.push("");
  lines.push("Powered by Propulse — https://propulse.vercel.app");

  return lines.join("\\n");
}

// ─── ICS Line Builder ───────────────────────────────────────────────────────

/**
 * Build a single ICS property line, folded per RFC 5545 §3.1.
 */
function icsLine(property: string, value: string): string {
  return foldLine(`${property}:${value}`);
}

// ─── VEVENT Builder ─────────────────────────────────────────────────────────

/**
 * Build a VEVENT block for a single net.
 * Returns empty string if the net has no schedule or is adhoc with no next session.
 */
function buildVEvent(net: NetRow): string {
  if (!net.schedule) return "";

  const nextSession = computeNextSession(net.schedule);
  if (!nextSession) return "";

  const duration = net.duration_minutes ?? 60;
  const endTime = new Date(nextSession.getTime() + duration * 60_000);
  const now = new Date();

  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(icsLine("UID", `net-${net.id}@propulse.app`));
  lines.push(icsLine("DTSTAMP", formatIcsDate(now)));
  lines.push(icsLine("DTSTART", formatIcsDate(nextSession)));
  lines.push(icsLine("DTEND", formatIcsDate(endTime)));

  const rrule = buildRRule(net.schedule);
  if (rrule) {
    lines.push(foldLine(rrule));
  }

  lines.push(icsLine("SUMMARY", escapeIcsText(net.name)));
  lines.push(icsLine("DESCRIPTION", buildDescription(net)));
  lines.push(
    icsLine("LOCATION", escapeIcsText(`${net.frequency} ${net.mode}`)),
  );
  lines.push(icsLine("URL", `https://propulse.vercel.app/nets/${net.id}`));
  lines.push(icsLine("STATUS", "CONFIRMED"));
  lines.push("END:VEVENT");

  return lines.join(CRLF);
}

// ─── Public Generators ──────────────────────────────────────────────────────

/**
 * Generate a VCALENDAR with a single VEVENT for one net.
 * Returns a complete RFC 5545 ICS string with CRLF line endings.
 */
export function generateNetIcs(net: NetRow): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push(icsLine("VERSION", "2.0"));
  lines.push(foldLine(`PRODID:${PRODID}`));
  lines.push(icsLine("CALSCALE", "GREGORIAN"));
  lines.push(icsLine("METHOD", "PUBLISH"));
  lines.push(icsLine("X-WR-CALNAME", escapeIcsText(net.name)));

  const vevent = buildVEvent(net);
  if (vevent) {
    lines.push(vevent);
  }

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

/**
 * Generate a VCALENDAR with multiple VEVENTs (one per net).
 * Used for the authenticated "My Nets" subscription bundle.
 */
export function generateBundleIcs(
  nets: NetRow[],
  calendarName: string,
): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push(icsLine("VERSION", "2.0"));
  lines.push(foldLine(`PRODID:${PRODID}`));
  lines.push(icsLine("CALSCALE", "GREGORIAN"));
  lines.push(icsLine("METHOD", "PUBLISH"));
  lines.push(icsLine("X-WR-CALNAME", escapeIcsText(calendarName)));

  for (const net of nets) {
    const vevent = buildVEvent(net);
    if (vevent) {
      lines.push(vevent);
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}

/**
 * Generate an empty VCALENDAR (no events).
 * Used when a user has no net subscriptions.
 */
export function generateEmptyCalendar(): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push(icsLine("VERSION", "2.0"));
  lines.push(foldLine(`PRODID:${PRODID}`));
  lines.push(icsLine("CALSCALE", "GREGORIAN"));
  lines.push(icsLine("METHOD", "PUBLISH"));
  lines.push(icsLine("X-WR-CALNAME", "My Nets — Propulse"));
  lines.push("END:VCALENDAR");
  return lines.join(CRLF) + CRLF;
}
