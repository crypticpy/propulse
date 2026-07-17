import { describe, expect, it } from "vitest";
import { latestBySourceTime, normalizedSourceTime } from "./solar.js";

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
