import { describe, expect, it } from "vitest";
import { activityIsCurrent, activityRows, daylightDay, recentContacts } from "./presentation";
import type { BandActivityStatus } from "@/hooks/useBandActivity";
import type { LogEntry } from "@/lib/db/types";

describe("Home observation presentation", () => {
  it("withholds retained counts after an error, expiry, or future timestamp", () => {
    expect(activityIsCurrent(1_000, false, 120_999)).toBe(true);
    expect(activityIsCurrent(1_000, false, 121_000)).toBe(false);
    expect(activityIsCurrent(1_000, true, 2_000)).toBe(false);
    expect(activityIsCurrent(3_000, false, 2_000)).toBe(false);
    expect(activityIsCurrent(0, false, 2_000)).toBe(false);
  });
  it("keeps measured zero separate from missing coverage and ranks the same counts used by bars", () => {
    const rows = [{band:"20m",obs20m:30,reporters20m:4}, {band:"40m",obs20m:0,reporters20m:0}, {band:"10m",obs20m:-1,reporters20m:0}] as BandActivityStatus[];
    expect(activityRows(new Map(rows.map(row => [row.band,row]))).map(row => [row.band,row.obs20m])).toEqual([["20m",30],["40m",0]]);
    expect(activityRows(undefined)).toEqual([]);
  });
});

describe("QTH daylight", () => {
  it("handles polar summer and winter without invented sunrise times", () => {
    const summer = daylightDay(Date.parse("2026-06-21T12:00:00Z"), 89, 0)!;
    const winter = daylightDay(Date.parse("2026-12-21T12:00:00Z"), 89, 0)!;
    expect(summer.allDay).toBe(true);
    expect(winter.allNight).toBe(true);
    expect(summer.events).toEqual([]);
    expect(winter.events).toEqual([]);
  });
  it("uses the correct UTC day at the date line and rejects invalid coordinates", () => {
    const now = Date.parse("2026-09-05T23:50:00Z");
    for (const lon of [-179, 179]) {
      const day = daylightDay(now, 10, lon)!;
      expect(new Date(day.start).toISOString()).toBe("2026-09-05T00:00:00.000Z");
      expect(day.events.every(event => event.at >= day.start && event.at < day.start + 86_400_000)).toBe(true);
      expect(day.events.length).toBe(2);
      expect(day.fraction).toBeGreaterThan(0.99);
    }
    expect(daylightDay(now, NaN, 0)).toBeNull();
  });
});

it("counts contacts by UTC day and excludes future and malformed entries", () => {
  const entries = [
    {date:"2026-09-05",timeOn:"00:00",callsign:"N0NOW"},
    {date:"2026-09-04",timeOn:"23:59:59",callsign:"N0LAST"},
    {date:"2026-09-05",timeOn:"05:00",callsign:"N0FUTURE"},
    {date:"bad",timeOn:"00:00",callsign:"N0BAD"},
    {date:"2026-08-29",timeOn:"12:00",callsign:"N0OLD"},
  ] as LogEntry[];
  const summary = recentContacts(entries, Date.parse("2026-09-05T00:10:00Z"));
  expect(summary.today).toBe(1);
  expect(summary.week).toBe(2);
  expect(summary.latest?.callsign).toBe("N0NOW");
  expect(summary.days[0].date).toBe("2026-08-30");
});
