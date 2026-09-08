import type { DxpeditionEntry } from "@/hooks/useDxpeditions";
import type { RssFeedItem } from "@/hooks/useRssFeed";
import {
  compareActiveThenStart,
  dxpeditionWindow,
  getSchedulePhase,
  parseWa7bnmContest,
  selectScheduleWindow,
  type ScheduleWindow,
  type Wa7bnmContest,
} from "./schedule";

export const WA7BNM_RSS_URL = "https://www.contestcalendar.com/calendar.rss";
export const WA7BNM_SITE_URL = "https://www.contestcalendar.com/";
export const NG3K_ADXO_URL = "https://ng3k.com/Misc/adxo.html";

export interface ScheduledContest {
  contest: Wa7bnmContest;
  window: ScheduleWindow;
}

export interface ScheduledDxpedition {
  entry: DxpeditionEntry;
  window: ScheduleWindow;
}

/** WA7BNM entries still on air or not yet started, active first. */
export function scheduledContests(
  items: RssFeedItem[],
  now: Date,
  reference: Date,
): ScheduledContest[] {
  return items
    .map((item) => parseWa7bnmContest(item, reference))
    .filter((entry): entry is Wa7bnmContest => entry !== null)
    .map((contest): ScheduledContest | null => {
      const window = selectScheduleWindow(contest.segments, now);
      return window ? { contest, window } : null;
    })
    .filter((row): row is ScheduledContest => row !== null)
    .sort((a, b) => compareActiveThenStart(a.window, b.window, now));
}

/** NG3K operations that have not ended, active first. */
export function scheduledDxpeditions(
  entries: DxpeditionEntry[],
  now: Date,
): ScheduledDxpedition[] {
  return entries
    .map((entry): ScheduledDxpedition | null => {
      const window = dxpeditionWindow(entry);
      return window ? { entry, window } : null;
    })
    .filter((row): row is ScheduledDxpedition => row !== null)
    .filter((row) => getSchedulePhase(row.window, now) !== "ended")
    .sort((a, b) => compareActiveThenStart(a.window, b.window, now));
}

export function activeCount<T extends { window: ScheduleWindow }>(
  rows: T[],
  now: Date,
): number {
  return rows.filter((row) => getSchedulePhase(row.window, now) === "active")
    .length;
}
