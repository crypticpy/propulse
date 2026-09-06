import { describe, expect, it } from "vitest";
import {
  latestActiveBySourceTime,
  latestBySourceTime,
  normalizedSourceTime,
} from "./solar.js";

describe("solar source selection", () => {
  it("selects the newest row independent of source array order", () => {
    const newestFirst = [
      { time_tag: "2026-07-15T17:40:00", value: 2 },
      { time_tag: "2026-07-14T17:40:00", value: 1 },
    ];
    const oldestFirst = [...newestFirst].reverse();
    expect(latestBySourceTime(newestFirst)?.value).toBe(2);
    expect(latestBySourceTime(oldestFirst)?.value).toBe(2);
  });

  it("prefers the newest active spacecraft row over a newer inactive one", () => {
    // NOAA RTSW interleaves SOLAR1 (active) with ACE/IMAP (inactive) rows.
    const rows = [
      {
        time_tag: "2026-09-06T14:43:00",
        active: false,
        source: "IMAP",
        bt: 5.7,
      },
      {
        time_tag: "2026-09-06T14:43:00",
        active: true,
        source: "SOLAR1",
        bt: 5.9,
      },
      {
        time_tag: "2026-09-06T14:42:00",
        active: true,
        source: "SOLAR1",
        bt: 6.1,
      },
      {
        time_tag: "2026-09-06T14:44:00",
        active: false,
        source: "ACE",
        bt: 5.5,
      },
    ];
    expect(latestActiveBySourceTime(rows)?.source).toBe("SOLAR1");
    expect(latestActiveBySourceTime(rows)?.bt).toBe(5.9);
  });

  it("falls back to the newest row when NOAA marks no spacecraft active", () => {
    const rows = [
      {
        time_tag: "2026-09-06T14:43:00",
        active: false,
        source: "IMAP",
        bt: 5.7,
      },
      {
        time_tag: "2026-09-06T14:44:00",
        active: false,
        source: "ACE",
        bt: 5.5,
      },
    ];
    expect(latestActiveBySourceTime(rows)?.source).toBe("ACE");
  });

  it("normalizes timestamp and monthly source formats to UTC", () => {
    expect(normalizedSourceTime({ time_tag: "2026-07-15T17:40:00" })).toBe(
      "2026-07-15T17:40:00.000Z",
    );
    expect(normalizedSourceTime({ "time-tag": "2026-06" })).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("returns null when no valid source timestamp exists", () => {
    expect(latestBySourceTime([{ time_tag: "invalid", value: 1 }])).toBeNull();
    expect(normalizedSourceTime(null)).toBeNull();
  });
});
