import { useMemo } from "react";
import { useRssFeed } from "@/hooks/useRssFeed";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getSchedulePhase,
  parseWa7bnmContest,
  scheduleCountdown,
  type Wa7bnmContest,
} from "@/lib/hamclock/schedule";

export const WA7BNM_RSS_URL = "https://www.contestcalendar.com/calendar.rss";
const WA7BNM_SITE_URL = "https://www.contestcalendar.com/";
const MAX_ROWS = 6;

/** Current WA7BNM contests from its published RSS feed. The source label and
 * outbound links are kept visible as required by the feed's usage terms. */
export function HamClockContestsPanel() {
  const { items, status, isLoading } = useRssFeed(WA7BNM_RSS_URL);
  const now = useUTCClock();
  const calendarDay = now.toISOString().slice(0, 10);
  const parserReference = useMemo(
    () => new Date(`${calendarDay}T12:00:00.000Z`),
    [calendarDay],
  );
  // Parsing the complete feed is tied to data/day changes, not the shared
  // one-second display clock used for countdown labels.
  const parsed = useMemo(
    () =>
      items
        .map((item) => parseWa7bnmContest(item, parserReference))
        .filter((entry): entry is Wa7bnmContest => entry !== null),
    [items, parserReference],
  );
  const contests = useMemo(() => {
    const rows = parsed
      .filter((entry) => getSchedulePhase(entry, now) !== "ended");
    return rows
      .sort((a, b) => {
        const aActive = getSchedulePhase(a, now) === "active";
        const bActive = getSchedulePhase(b, now) === "active";
        if (aActive !== bActive) return aActive ? -1 : 1;
        return new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime();
      })
      .slice(0, MAX_ROWS);
  }, [parsed, now]);

  if (isLoading) {
    return <p className="font-mono text-[10px] text-white/35">Loading calendar…</p>;
  }
  if (status !== "ok") {
    return <p className="font-mono text-[10px] text-white/35">Contest calendar unavailable</p>;
  }
  if (contests.length === 0) {
    return <p className="font-mono text-[10px] text-white/35">No contests in the current feed window</p>;
  }

  return (
    <div className="space-y-1.5">
      {contests.map((contest) => {
        const active = getSchedulePhase(contest, now) === "active";
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              {active && (
                <span className="rounded border border-signal-green/35 bg-signal-green/10 px-1 font-mono text-[8px] font-bold text-signal-green">
                  NOW
                </span>
              )}
              <span className="truncate text-[11px] font-semibold text-gray-200">
                {contest.title}
              </span>
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px]">
              <span className={active ? "text-signal-green" : "text-plasma-orange"}>
                {scheduleCountdown(contest, now)}
              </span>
              <span className="truncate text-white/30">{contest.scheduleText}</span>
            </span>
          </>
        );
        return contest.link ? (
          <a
            key={contest.id}
            href={contest.link}
            target="_blank"
            rel="noreferrer"
            className="block rounded border border-white/[0.07] bg-white/[0.025] px-2 py-1.5 hover:border-white/20 hover:bg-white/[0.05]"
          >
            {content}
          </a>
        ) : (
          <div
            key={contest.id}
            className="rounded border border-white/[0.07] bg-white/[0.025] px-2 py-1.5"
          >
            {content}
          </div>
        );
      })}
      <a
        href={WA7BNM_SITE_URL}
        target="_blank"
        rel="noreferrer"
        className="block text-right font-mono text-[8px] uppercase tracking-wider text-white/25 hover:text-plasma-orange"
      >
        WA7BNM Contest Calendar ↗
      </a>
    </div>
  );
}
