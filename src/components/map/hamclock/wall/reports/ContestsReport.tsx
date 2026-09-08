import { useMemo } from "react";
import { useRssFeed } from "@/hooks/useRssFeed";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getSchedulePhase,
  scheduleCountdown,
} from "@/lib/hamclock/schedule";
import {
  WA7BNM_RSS_URL,
  WA7BNM_SITE_URL,
  activeCount,
  scheduledContests,
} from "@/lib/hamclock/wallCalendar";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

export function ContestsReport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
  const live = activeCount(rows, now);
  const unavailable = error != null || status !== "ok";
  const { footer, updated } = reportFooter(
    "WA7BNM CONTEST CALENDAR",
    unavailable ? null : now,
    now,
  );
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Contests report"
      tone={unavailable ? "warn" : live > 0 ? "good" : "info"}
      hero={unavailable || isLoading ? "—" : live}
      verdict={
        unavailable ? "UNAVAILABLE" : live > 0 ? "ON AIR" : rows.length ? "NEXT" : "NONE"
      }
      facts={[
        { label: "LOADED", value: isLoading ? "—" : rows.length },
        { label: "ON AIR", value: unavailable ? "—" : live },
        { label: "SOURCE", value: "WA7BNM" },
      ]}
      footer={footer}
      updated={updated}
      pinId="contests"
      pinElement={<ContestsReport open onClose={onClose} />}
    >
      <p className="hcr-note">
        {unavailable
          ? "Contest calendar unavailable. The WA7BNM feed did not load."
          : "Times and titles come from the WA7BNM Contest Calendar RSS feed."}
      </p>
      <div className="hca-list" ref={ref}>
        {rows.slice(0, visible).map(({ contest, window }) => {
          const active = getSchedulePhase(window, now) === "active";
          const body = (
            <>
              <div className="hca-identity">
                <strong>
                  {active ? "NOW · " : ""}
                  {contest.title}
                </strong>
                <span>{contest.scheduleText}</span>
              </div>
              <div className="hca-detail">
                <span>{scheduleCountdown(window, now)}</span>
              </div>
            </>
          );
          return contest.link ? (
            <a
              key={contest.id}
              className="hca-row"
              href={contest.link}
              target="_blank"
              rel="noreferrer"
            >
              {body}
            </a>
          ) : (
            <div className="hca-row" key={contest.id}>
              {body}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="hcr-note">
            {isLoading
              ? "Reading the contest calendar…"
              : unavailable
                ? "No contest rows while the feed is down."
                : "No contests in the current feed window."}
          </p>
        )}
      </div>
      <p className="hcr-note">
        TOP {visible} OF {rows.length} LOADED · ACTIVE FIRST
      </p>
      <a
        className="hcr-link-button"
        href={WA7BNM_SITE_URL}
        target="_blank"
        rel="noreferrer"
      >
        WA7BNM CONTEST CALENDAR
      </a>
    </WallReport>
  );
}
