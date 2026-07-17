import { describe, expect, it } from "vitest";
import {
  normalizeTimeSeries,
  parseUtcInstant,
  toFiniteNumber,
} from "./normalization";

describe("solar normalization primitives", () => {
  it("parses timestamp-only and monthly NOAA formats as UTC", () => {
    expect(new Date(parseUtcInstant("2026-07-15T12:00:00")!).toISOString()).toBe(
      "2026-07-15T12:00:00.000Z",
    );
    expect(new Date(parseUtcInstant("2026-06")!).toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("sorts, de-duplicates by timestamp with last-row winner, and bounds", () => {
    const result = normalizeTimeSeries(
      [
        { at: "2026-07-15T12:02:00Z", value: 2 },
        { at: "2026-07-15T12:01:00Z", value: 1 },
        { at: "2026-07-15T12:02:00Z", value: 3 },
        { at: "invalid", value: 99 },
      ],
      {
        timestamp: (row) => row.at,
        maxRows: 2,
        now: Date.parse("2026-07-15T13:00:00Z"),
      },
    );
    expect(result).toEqual([
      { at: "2026-07-15T12:01:00Z", value: 1 },
      { at: "2026-07-15T12:02:00Z", value: 3 },
    ]);
  });

  it("rejects an unusable header-only/invalid result", () => {
    expect(() =>
      normalizeTimeSeries([{ at: "invalid" }], {
        timestamp: (row) => row.at,
        maxRows: 10,
      }),
    ).toThrow(/no usable/i);
  });

  it("does not coerce null or blank values to zero", () => {
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("0")).toBe(0);
  });
});
