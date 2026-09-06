import { describe, expect, it } from "vitest";
import {
  latestActiveBySourceTime,
  latestBySourceTime,
  gfzTimestamp,
  latestFiniteGfzHp60,
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

describe("GFZ Hp60 selection", () => {
  const now = Date.parse("2026-09-06T14:00:00Z");

  it("selects the latest finite entry at or before now", () => {
    const response = {
      Hp60: [1.0, 1.333, 1.667],
      datetime: [
        "2026-09-06T12:00:00Z",
        "2026-09-06T13:00:00Z",
        "2026-09-06T14:00:00Z",
      ],
    };
    const result = latestFiniteGfzHp60(response, now);
    expect(result).toEqual({ value: 1.667, time: "2026-09-06T14:00:00.000Z" });
  });

  it("skips null and NaN entries for hours not yet computed", () => {
    const response = {
      Hp60: [1.0, null, Number.NaN],
      datetime: [
        "2026-09-06T12:00:00Z",
        "2026-09-06T13:00:00Z",
        "2026-09-06T14:00:00Z",
      ],
    };
    const result = latestFiniteGfzHp60(response, now);
    expect(result).toEqual({ value: 1.0, time: "2026-09-06T12:00:00.000Z" });
  });

  it("ignores entries after now", () => {
    const response = {
      Hp60: [1.0, 2.0],
      datetime: ["2026-09-06T13:00:00Z", "2026-09-06T15:00:00Z"],
    };
    const result = latestFiniteGfzHp60(response, now);
    expect(result).toEqual({ value: 1.0, time: "2026-09-06T13:00:00.000Z" });
  });

  it("returns null when no entry is usable", () => {
    expect(latestFiniteGfzHp60({ Hp60: [null], datetime: ["2026-09-06T13:00:00Z"] }, now)).toBeNull();
    expect(latestFiniteGfzHp60(null, now)).toBeNull();
    expect(latestFiniteGfzHp60({}, now)).toBeNull();
  });
});

describe("gfzTimestamp", () => {
  it("emits whole-second UTC timestamps GFZ accepts", () => {
    expect(gfzTimestamp(Date.parse("2026-09-06T13:07:09.572Z"))).toBe(
      "2026-09-06T13:07:09Z",
    );
    expect(gfzTimestamp(Date.parse("2026-09-06T13:07:09Z"))).toBe(
      "2026-09-06T13:07:09Z",
    );
  });
});
