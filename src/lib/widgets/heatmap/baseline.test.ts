import { describe, expect, it } from "vitest";
import { metricValue as publicMetricValue } from "./index";
import { computeHeatmap, metricValue } from "./compute";
import {
  baselineKey,
  buildBaselineLookup,
  computeRatio,
  CROWDED_MIN_COUNT,
  CROWDED_RATIO_THRESHOLD,
  isCrowded,
  formatHeatmapRatio,
  latestCompleteHour,
  lookupBaseline,
  regionalHeatmapCells,
  type BaselineInput,
} from "./baseline";

describe("baselineKey", () => {
  it("exposes metricValue through the public index without changing its result", () => {
    const cell = computeHeatmap([], { now: 0 })[0];
    expect(publicMetricValue(cell, "count")).toBe(metricValue(cell, "count"));
  });
  it("joins band, continent and hour", () => {
    expect(baselineKey("20m", "EU", 14)).toBe("20m|EU|14");
  });
});

describe("complete regional hour ratios", () => {
  it("uses the hour being measured, never the current wall-clock hour", () => {
    const hour = latestCompleteHour(Date.parse("2026-09-09T00:15:00Z"));
    expect(hour).toBe("2026-09-08T23:00:00.000Z");
    const baseline = new Map([["20m|EU|23", 1000], ["20m|EU|0", 1], ["20m|NA|23", 1000]]);
    const cells = regionalHeatmapCells(baseline, new Map([["20m|EU|23", 1000], ["20m|NA|23", 1]]), hour);
    expect(cells.find((cell) => cell.band === "20m" && cell.continent === "EU")).toMatchObject({ count: 1000, ratio: 0 });
    expect(cells.find((cell) => cell.band === "20m" && cell.continent === "NA")).toMatchObject({ count: 1, ratio: -3 });
  });

  it("does not fabricate zero counts for a wholly missing hour", () => {
    expect(regionalHeatmapCells(new Map([["20m|EU|12", 1000]]), new Map(), "2026-09-09T12:00:00Z")).toEqual([]);
  });

  it("renders bounds and missing medians visibly instead of pretending they are exact", () => {
    expect(formatHeatmapRatio(computeRatio(999, 0))).toBe("\u22653.00");
    expect(formatHeatmapRatio(computeRatio(0, 999))).toBe("\u2264-3.00");
    expect(formatHeatmapRatio(0)).toBe("0.00");
    expect(formatHeatmapRatio(null)).toBe("NO BASELINE");
  });
});

describe("buildBaselineLookup", () => {
  it("looks up an exact band/continent/hour match", () => {
    const rows: BaselineInput[] = [
      { band: "20m", continent: "EU", utcHour: 14, meanCount: 12 },
      { band: "40m", continent: "NA", utcHour: 3, meanCount: 4 },
    ];
    const lookup = buildBaselineLookup(rows);
    expect(lookupBaseline(lookup, "20m", "EU", 14)).toBe(12);
    expect(lookupBaseline(lookup, "40m", "NA", 3)).toBe(4);
  });

  it("returns null for a cell with no baseline row", () => {
    const lookup = buildBaselineLookup([]);
    expect(lookupBaseline(lookup, "20m", "EU", 14)).toBeNull();
  });

  it("averages multiple rows sharing the same key instead of last-wins", () => {
    const rows: BaselineInput[] = [
      { band: "20m", continent: "EU", utcHour: 14, meanCount: 10 },
      { band: "20m", continent: "EU", utcHour: 14, meanCount: 20 },
    ];
    const lookup = buildBaselineLookup(rows);
    expect(lookupBaseline(lookup, "20m", "EU", 14)).toBe(15);
  });
});

describe("computeRatio", () => {
  it("is null when there is no baseline", () => {
    expect(computeRatio(50, null)).toBeNull();
  });

  it("is 0 when count matches the baseline mean exactly", () => {
    expect(computeRatio(9, 9)).toBe(0);
  });

  it("is positive when busier than baseline, negative when quieter", () => {
    expect(computeRatio(40, 10)).toBeGreaterThan(0);
    expect(computeRatio(2, 40)).toBeLessThan(0);
  });

  it("matches the documented log2((count+1)/(mean+1)) formula", () => {
    expect(computeRatio(19, 9)).toBeCloseTo(1, 10); // (20)/(10) = 2 -> log2(2) = 1
  });

  it("does not divide by zero when the baseline mean is 0", () => {
    expect(computeRatio(3, 0)).toBe(Math.log2(4));
    expect(computeRatio(0, 0)).toBe(0);
  });
});

describe("isCrowded", () => {
  it("requires both ratio above the 2x floor and count >= 10", () => {
    // ratio > 1 (more than 2x baseline) but under the absolute count floor
    const lowCountRatio = computeRatio(9, 1); // (10)/(2)=5 -> log2(5) > 1
    expect(lowCountRatio).toBeGreaterThan(CROWDED_RATIO_THRESHOLD);
    expect(isCrowded(lowCountRatio, 9)).toBe(false);

    // same ratio, but count clears the absolute floor
    const highCountRatio = computeRatio(19, 3); // (20)/(4)=5 -> same ratio, count=19
    expect(isCrowded(highCountRatio, 19)).toBe(true);
  });

  it("is false when ratio is null", () => {
    expect(isCrowded(null, 1000)).toBe(false);
  });

  it("is false right at the count floor's boundary below it", () => {
    expect(isCrowded(2, CROWDED_MIN_COUNT - 1)).toBe(false);
    expect(isCrowded(2, CROWDED_MIN_COUNT)).toBe(true);
  });

  it("is false when at or below the ratio threshold even with plenty of count", () => {
    expect(isCrowded(CROWDED_RATIO_THRESHOLD, 100)).toBe(false);
  });
});
