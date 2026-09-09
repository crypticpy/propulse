import { describe, expect, it } from "vitest";
import {
  activeCount,
  scheduledContests,
  scheduledDxpeditions,
} from "./wallCalendar";

const NOW = new Date("2026-08-31T13:30:00.000Z");
const REFERENCE = new Date("2026-08-31T12:00:00.000Z");

describe("wall calendar rows", () => {
  it("puts the on-air contest first and counts it as active", () => {
    const rows = scheduledContests(
      [
        {
          id: "upcoming",
          title: "Evening Test",
          link: null,
          publishedAt: null,
          summary: "1900Z-2000Z, Aug 31",
        },
        {
          id: "active",
          title: "Active Sprint",
          link: "https://www.contestcalendar.com/active",
          publishedAt: null,
          summary: "1300Z-1400Z, Aug 31",
        },
      ],
      NOW,
      REFERENCE,
    );
    expect(rows.map((row) => row.contest.title)).toEqual([
      "Active Sprint",
      "Evening Test",
    ]);
    expect(activeCount(rows, NOW)).toBe(1);
  });

  it("drops ended DXpeditions and ranks the live call first", () => {
    const rows = scheduledDxpeditions(
      [
        {
          callsign: "PAST",
          entity: "Old Island",
          startDate: "2026-08-01",
          endDate: "2026-08-20",
          bands: "20m",
          modes: "CW",
          qslInfo: "",
          info: "",
          source: "NG3K ADXO",
        },
        {
          callsign: "FUTURE",
          entity: "Future Island",
          startDate: "2026-09-02",
          endDate: "2026-09-04",
          bands: "20-10m",
          modes: "CW",
          qslInfo: "",
          info: "",
          source: "NG3K ADXO",
        },
        {
          callsign: "NOW1",
          entity: "Current Island",
          startDate: "2026-08-30",
          endDate: "2026-09-01",
          bands: "40-10m",
          modes: "CW, SSB",
          qslInfo: "",
          info: "",
          source: "NG3K ADXO",
        },
      ],
      NOW,
    );
    expect(rows.map((row) => row.entry.callsign)).toEqual(["NOW1", "FUTURE"]);
    expect(activeCount(rows, NOW)).toBe(1);
  });
});
