/**
 * Calendar URL builders — generate Google Calendar, Outlook, webcal, and ICS
 * download links for ham radio net schedules. No API auth required; uses URL
 * schemes and .ics file downloads.
 */

import type { Net, NetSchedule } from "@/types/net";
import { getNextSessionTime } from "@/lib/utils/netSchedule";

// ── ICS day-of-week abbreviations (0 = Sunday) ─────────────────────────────

const ICS_BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Format a Date as `YYYYMMDDTHHMMSSZ` for Google Calendar date params.
 */
export function formatGcalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

/**
 * Build an iCalendar RRULE string from a NetSchedule.
 *
 * - daily    -> `RRULE:FREQ=DAILY`
 * - weekly   -> `RRULE:FREQ=WEEKLY;BYDAY=TU`
 * - biweekly -> `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU`
 * - monthly  -> `RRULE:FREQ=MONTHLY;BYMONTHDAY=15`
 * - adhoc    -> null
 */
export function buildRRule(schedule: NetSchedule): string | null {
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
      const dom = schedule.dayOfMonth ?? 1;
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dom}`;
    }

    case "adhoc":
      return null;

    default:
      return null;
  }
}

/**
 * Build a plain-text event description including frequency, mode, band,
 * duration, region, and a link to the net detail page.
 */
export function buildEventDescription(net: Net): string {
  const lines: string[] = [];

  lines.push(`Frequency: ${net.frequency} ${net.mode}`);
  if (net.altFrequency) {
    lines.push(`Alt Frequency: ${net.altFrequency}`);
  }
  lines.push(`Band: ${net.band}`);
  if (net.durationMinutes) {
    lines.push(`Duration: ~${net.durationMinutes} min`);
  }
  if (net.region) {
    lines.push(`Region: ${net.region}`);
  }
  if (net.repeaterInfo) {
    const rpt = net.repeaterInfo;
    lines.push(`Repeater: ${rpt.callsign} (${rpt.offset}, ${rpt.tone})`);
  }
  if (net.description) {
    lines.push("");
    lines.push(net.description);
  }

  lines.push("");
  lines.push(`${window.location.origin}/nets/${net.id}`);

  return lines.join("\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a Google Calendar "add event" URL for a net.
 * Returns null if the net has no schedule or no computable next session.
 */
export function buildGoogleCalendarUrl(net: Net): string | null {
  if (!net.schedule) return null;

  const start = getNextSessionTime(net.schedule);
  if (!start) return null;

  const durationMs = (net.durationMinutes ?? 60) * 60_000;
  const end = new Date(start.getTime() + durationMs);

  const location = `${net.frequency} ${net.mode}`;
  const description = buildEventDescription(net);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: net.name,
    dates: `${formatGcalDate(start)}/${formatGcalDate(end)}`,
    details: description,
    location,
  });

  const rrule = buildRRule(net.schedule);
  if (rrule) {
    params.set("recur", rrule);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build an Outlook.com "add event" URL for a net.
 * Outlook's URL scheme does not support RRULE — this creates a single event.
 * Returns null if the net has no schedule or no computable next session.
 */
export function buildOutlookUrl(net: Net): string | null {
  if (!net.schedule) return null;

  const start = getNextSessionTime(net.schedule);
  if (!start) return null;

  const durationMs = (net.durationMinutes ?? 60) * 60_000;
  const end = new Date(start.getTime() + durationMs);

  const location = `${net.frequency} ${net.mode}`;
  const description = buildEventDescription(net);

  const params = new URLSearchParams({
    rru: "addevent",
    subject: net.name,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: description,
    location,
    path: "/calendar/action/compose",
  });

  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/**
 * Build a webcal:// subscription URL for a single net's ICS feed.
 * Triggers the OS calendar subscription handler (Apple Calendar, etc.).
 */
export function buildWebcalUrl(netId: string): string {
  const origin = window.location.origin;
  return `webcal://${origin.replace(/^https?:\/\//, "")}/api/calendar/net/${netId}.ics`;
}

/**
 * Build a direct .ics download URL for a single net.
 */
export function buildIcsDownloadUrl(netId: string): string {
  return `${window.location.origin}/api/calendar/net/${netId}.ics`;
}

/**
 * Build a webcal:// subscription URL for the user's entire "my nets" bundle.
 */
export function buildMyNetsWebcalUrl(token: string): string {
  const origin = window.location.origin;
  return `webcal://${origin.replace(/^https?:\/\//, "")}/api/calendar/my-nets.ics?token=${token}`;
}
