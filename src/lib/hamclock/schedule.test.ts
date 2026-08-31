import { describe, expect, it } from "vitest";
import {
  dxpeditionWindow,
  getSchedulePhase,
  parseWa7bnmContest,
  scheduleCountdown,
  selectScheduleWindow,
} from "./schedule";

const REFERENCE = new Date("2026-08-31T12:00:00.000Z");

function item(summary: string) {
  return {
    id: "contest-1",
    title: "Example Contest",
    link: "https://www.contestcalendar.com/example",
    publishedAt: null,
    summary,
  };
}

describe("HamClock schedule normalization", () => {
  it("parses a same-day WA7BNM operating window", () => {
    expect(parseWa7bnmContest(item("1300Z-1400Z, Aug 31"), REFERENCE)).toMatchObject({
      startUtc: "2026-08-31T13:00:00.000Z",
      endUtc: "2026-08-31T14:00:00.000Z",
    });
  });

  it("takes the outer bounds of cross-day and multi-segment schedules", () => {
    const parsed = parseWa7bnmContest(
      item("2200Z, Aug 31 to 1200Z, Sep 1 and 1200Z-2359Z, Sep 2"),
      REFERENCE,
    );
    expect(parsed).toMatchObject({
      startUtc: "2026-08-31T22:00:00.000Z",
      endUtc: "2026-09-02T23:59:00.000Z",
    });
    expect(parsed?.segments).toEqual([
      {
        startUtc: "2026-08-31T22:00:00.000Z",
        endUtc: "2026-09-01T12:00:00.000Z",
      },
      {
        startUtc: "2026-09-02T12:00:00.000Z",
        endUtc: "2026-09-02T23:59:00.000Z",
      },
    ]);
  });

  it("resolves a December to January feed across the year boundary", () => {
    const parsed = parseWa7bnmContest(
      item("2300Z, Dec 31 to 0100Z, Jan 1"),
      new Date("2026-12-31T12:00:00.000Z"),
    );
    expect(parsed).toMatchObject({
      startUtc: "2026-12-31T23:00:00.000Z",
      endUtc: "2027-01-01T01:00:00.000Z",
    });
  });

  it("rejects descriptions without a supported UTC schedule", () => {
    expect(parseWa7bnmContest(item("Schedule to be announced"), REFERENCE)).toBeNull();
  });

  it("classifies and counts down normalized windows", () => {
    const window = {
      startUtc: "2026-08-31T13:00:00.000Z",
      endUtc: "2026-08-31T15:00:00.000Z",
    };
    expect(getSchedulePhase(window, REFERENCE)).toBe("upcoming");
    expect(scheduleCountdown(window, REFERENCE)).toBe("Starts in 1h 0m");
    const activeNow = new Date("2026-08-31T14:30:00.000Z");
    expect(getSchedulePhase(window, activeNow)).toBe("active");
    expect(scheduleCountdown(window, activeNow)).toBe("Ends in 30m");
  });

  it("selects the next real segment instead of marking an off-air gap active", () => {
    const parsed = parseWa7bnmContest(
      item("1300Z-1400Z, Aug 31 and 1900Z-2000Z, Aug 31"),
      REFERENCE,
    );
    const gapNow = new Date("2026-08-31T15:00:00.000Z");
    const window = selectScheduleWindow(parsed?.segments ?? [], gapNow);

    expect(window).toEqual({
      startUtc: "2026-08-31T19:00:00.000Z",
      endUtc: "2026-08-31T20:00:00.000Z",
    });
    expect(window && getSchedulePhase(window, gapNow)).toBe("upcoming");
    expect(window && scheduleCountdown(window, gapNow)).toBe("Starts in 4h 0m");
  });

  it("treats NG3K date-only operations as complete UTC days", () => {
    expect(
      dxpeditionWindow({ startDate: "2026-09-01", endDate: "2026-09-03" }),
    ).toEqual({
      startUtc: "2026-09-01T00:00:00.000Z",
      endUtc: "2026-09-03T23:59:59.999Z",
    });
  });

  it("rejects syntactically valid but impossible NG3K calendar dates", () => {
    expect(
      dxpeditionWindow({ startDate: "2026-02-31", endDate: "2026-03-04" }),
    ).toBeNull();
    expect(
      dxpeditionWindow({ startDate: "2026-02-01", endDate: "2026-02-30" }),
    ).toBeNull();
  });
});
