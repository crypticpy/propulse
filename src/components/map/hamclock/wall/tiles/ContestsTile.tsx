import { lazy, Suspense, useMemo, useState } from "react";
import { useRssFeed } from "@/hooks/useRssFeed";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getSchedulePhase,
  scheduleCountdown,
} from "@/lib/hamclock/schedule";
import {
  WA7BNM_RSS_URL,
  activeCount,
  scheduledContests,
} from "@/lib/hamclock/wallCalendar";
import { HamClockTile, TileHero, TileSub } from "../HamClockTile";
import { useVisibleRows } from "../useVisibleRows";

const ContestsReport = lazy(() =>
  import("../reports/ContestsReport").then((m) => ({
    default: m.ContestsReport,
  })),
);

/** Optional wall tile: current WA7BNM contests. Not on a shipped page. */
export function ContestsTile() {
  const { items, status, isLoading, error } = useRssFeed(WA7BNM_RSS_URL);
  const now = useUTCClock();
  const calendarDay = now.toISOString().slice(0, 10);
  const reference = useMemo(
    () => new Date(`${calendarDay}T12:00:00.000Z`),
    [calendarDay],
  );
  const rows = useMemo(
    () => scheduledContests(items, now, reference),
    [items, now, reference],
  );
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);
  const [reportOpen, setReportOpen] = useState(false);
  const live = activeCount(rows, now);
  // "empty" is a feed that loaded fine and parsed to zero items — not a
  // load failure, and distinct from unreachable/too-large (#609 review N7).
  const unavailable =
    error != null || (status !== "ok" && status !== "empty");

  if (isLoading) {
    return (
      <HamClockTile title="Contests" source="WA7BNM">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hc-placeholder">LOADING CALENDAR</p>
      </HamClockTile>
    );
  }

  if (unavailable) {
    return (
      <HamClockTile title="Contests" source="WA7BNM" state="var(--hc-warn)">
        <TileHero tone="hc-dim-text">—</TileHero>
        <p className="hc-placeholder">CONTEST CALENDAR UNAVAILABLE</p>
      </HamClockTile>
    );
  }

  const verdict = live > 0 ? "ON AIR" : rows.length > 0 ? "NEXT" : "NONE";
  const next = rows[0];

  return (
    <>
      <HamClockTile
        title="Contests"
        source="WA7BNM"
        grow
        state={live > 0 ? "var(--hc-good)" : undefined}
        onOpen={() => setReportOpen(true)}
        openLabel={`Contests: ${live} on air of ${rows.length}. Open the contest report`}
      >
        <div className="hc-heroline">
          <TileHero tone={live > 0 ? "hc-good" : "hc-dim-text"} flush>
            {String(live)}
          </TileHero>
          <div
            className={`hc-verdict${live > 0 ? " hc-glow hc-good" : ""}`}
          >
            {verdict}
          </div>
        </div>
        <TileSub>
          <span>
            {next
              ? scheduleCountdown(next.window, now).toUpperCase()
              : "NO CONTESTS IN THE CURRENT FEED WINDOW"}
          </span>
        </TileSub>
        <div className="hc-rows" ref={ref}>
          {rows.slice(0, visible).map(({ contest, window }) => {
            const active = getSchedulePhase(window, now) === "active";
            return (
              <div className="hc-row" key={contest.id}>
                <span
                  className={`hc-chip${active ? " hc-chip--now" : " hc-chip--next"}`}
                >
                  {active ? "NOW" : "NEXT"}
                </span>
                <span className="hc-row-call">
                  {contest.title}
                  <small>{contest.scheduleText}</small>
                </span>
                <span
                  className={`hc-row-age${active ? " hc-row-age--new" : ""}`}
                >
                  {scheduleCountdown(window, now)}
                </span>
              </div>
            );
          })}
        </div>
      </HamClockTile>
      {reportOpen && (
        <Suspense fallback={null}>
          <ContestsReport open onClose={() => setReportOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
