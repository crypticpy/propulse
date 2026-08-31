import type { RssFeedItem } from "@/hooks/useRssFeed";
import type { DxpeditionEntry } from "@/hooks/useDxpeditions";

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

// WA7BNM descriptions express every operating segment as one of:
//   0000Z-2359Z, Sep 5
//   0000Z, Sep 5 to 1200Z, Sep 6
// Repeated segments are joined with "and". Scanning each time/date token and
// taking the outer bounds handles all three forms without scraping detail HTML.
const WA7BNM_TIME_DATE =
  /(\d{4})Z(?:-(\d{4})Z(?:\s*\([^)]*\))?)?,\s*([A-Z][a-z]{2})\s+(\d{1,2})/g;

export interface ScheduleWindow {
  startUtc: string;
  endUtc: string;
}

export interface Wa7bnmContest extends ScheduleWindow {
  id: string;
  title: string;
  link: string | null;
  scheduleText: string;
}

export type SchedulePhase = "active" | "upcoming" | "ended";

function parseClock(value: string): { hour: number; minute: number } | null {
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(2));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 24) return null;
  if (hour === 24 && minute !== 0) return null;
  return { hour, minute };
}

/** Resolve a month/day near the feed's current reference week. Considering
 * adjacent years makes the Dec→Jan weekly feed work without a published year. */
function dateNearReference(
  month: number,
  day: number,
  clock: { hour: number; minute: number },
  reference: Date,
): Date | null {
  const years = [
    reference.getUTCFullYear() - 1,
    reference.getUTCFullYear(),
    reference.getUTCFullYear() + 1,
  ];
  const candidates = years
    .map((year) => {
      const date = new Date(
        Date.UTC(year, month, day, clock.hour === 24 ? 0 : clock.hour, clock.minute),
      );
      if (clock.hour === 24) date.setUTCDate(date.getUTCDate() + 1);
      return date;
    })
    .filter((date) => {
      // Reject rollover produced by impossible source dates such as Feb 31.
      const sourceDate = new Date(date);
      if (clock.hour === 24) sourceDate.setUTCDate(sourceDate.getUTCDate() - 1);
      return sourceDate.getUTCMonth() === month && sourceDate.getUTCDate() === day;
    });

  return (
    candidates.sort(
      (a, b) =>
        Math.abs(a.getTime() - reference.getTime()) -
        Math.abs(b.getTime() - reference.getTime()),
    )[0] ?? null
  );
}

/** Parse one item from WA7BNM's officially published calendar.rss feed. */
export function parseWa7bnmContest(
  item: RssFeedItem,
  reference: Date,
): Wa7bnmContest | null {
  const instants: Array<{ start: Date; end: Date }> = [];
  for (const match of item.summary.matchAll(WA7BNM_TIME_DATE)) {
    const startClock = parseClock(match[1]);
    const endClock = parseClock(match[2] ?? match[1]);
    const month = MONTH_INDEX[match[3]];
    const day = Number(match[4]);
    if (!startClock || !endClock || month === undefined || !Number.isInteger(day)) {
      continue;
    }
    const start = dateNearReference(month, day, startClock, reference);
    let end = dateNearReference(month, day, endClock, reference);
    if (!start || !end) continue;
    // A same-date range such as 2300Z-0100Z crosses midnight even when the
    // publisher omits the second date.
    if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    instants.push({ start, end });
  }
  if (instants.length === 0) return null;

  const start = new Date(Math.min(...instants.map((instant) => instant.start.getTime())));
  const end = new Date(Math.max(...instants.map((instant) => instant.end.getTime())));
  return {
    id: item.id ?? `${item.title}:${item.summary}`,
    title: item.title,
    link: item.link,
    scheduleText: item.summary,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

/** NG3K publishes date precision rather than exact times, so its active window
 * deliberately spans the complete UTC start/end days. */
export function dxpeditionWindow(
  entry: Pick<DxpeditionEntry, "startDate" | "endDate">,
): ScheduleWindow | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.endDate)
  ) {
    return null;
  }
  const start = new Date(`${entry.startDate}T00:00:00.000Z`);
  const end = new Date(`${entry.endDate}T23:59:59.999Z`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return null;
  }
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function getSchedulePhase(
  window: ScheduleWindow,
  now: Date,
): SchedulePhase {
  const nowMs = now.getTime();
  if (nowMs < new Date(window.startUtc).getTime()) return "upcoming";
  if (nowMs <= new Date(window.endUtc).getTime()) return "active";
  return "ended";
}

function compactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function scheduleCountdown(
  window: ScheduleWindow,
  now: Date,
): string {
  const phase = getSchedulePhase(window, now);
  if (phase === "ended") return "Ended";
  const target = new Date(
    phase === "active" ? window.endUtc : window.startUtc,
  ).getTime();
  return `${phase === "active" ? "Ends" : "Starts"} in ${compactDuration(target - now.getTime())}`;
}
