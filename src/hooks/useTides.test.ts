import { describe, expect, it } from "vitest";
import {
  buildTideSparkline,
  findNextTideEvents,
  type TidePoint,
} from "@/hooks/useTides";

describe("buildTideSparkline", () => {
  it("returns an empty sparkline for an empty curve", () => {
    expect(buildTideSparkline([], new Date())).toEqual({
      points: "",
      nowX: null,
      min: 0,
      max: 0,
    });
  });

  it("maps a curve to normalized 0..width / 0..height points", () => {
    const curve: TidePoint[] = [
      { time: "2026-01-01 00:00", heightM: 0 },
      { time: "2026-01-01 12:00", heightM: 1 },
      { time: "2026-01-02 00:00", heightM: 0.5 },
    ];
    const result = buildTideSparkline(
      curve,
      new Date("2026-01-01T12:00:00Z"),
      100,
      32,
    );
    const points = result.points
      .split(" ")
      .map((p) => p.split(",").map(Number));

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual([0, 32]); // min height (0) -> bottom
    expect(points[1]).toEqual([50, 0]); // max height (1), time midpoint -> top
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
    expect(result.nowX).toBeCloseTo(50, 1);
  });

  it("reports nowX as null when now is outside the curve's time range", () => {
    const curve: TidePoint[] = [
      { time: "2026-01-01 00:00", heightM: 0 },
      { time: "2026-01-01 12:00", heightM: 1 },
    ];
    const result = buildTideSparkline(curve, new Date("2026-01-03T00:00:00Z"));
    expect(result.nowX).toBeNull();
  });

  it("handles a flat curve without dividing by zero", () => {
    const curve: TidePoint[] = [
      { time: "2026-01-01 00:00", heightM: 1 },
      { time: "2026-01-01 12:00", heightM: 1 },
    ];
    const result = buildTideSparkline(curve, new Date("2026-01-01T00:00:00Z"));
    expect(Number.isFinite(result.min)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(result.points).not.toContain("NaN");
  });
});

describe("findNextTideEvents", () => {
  const hilo: TidePoint[] = [
    { time: "2026-01-01 00:00", heightM: 0.2, type: "L" },
    { time: "2026-01-01 06:00", heightM: 1.1, type: "H" },
    { time: "2026-01-01 12:00", heightM: 0.1, type: "L" },
    { time: "2026-01-01 18:00", heightM: 1.3, type: "H" },
  ];

  it("finds the nearest upcoming high and low", () => {
    const now = new Date("2026-01-01T07:00:00Z");
    const { nextHigh, nextLow } = findNextTideEvents(hilo, now);
    expect(nextHigh?.time).toBe("2026-01-01 18:00");
    expect(nextLow?.time).toBe("2026-01-01 12:00");
  });

  it("returns nulls when no future events remain", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    const { nextHigh, nextLow } = findNextTideEvents(hilo, now);
    expect(nextHigh).toBeNull();
    expect(nextLow).toBeNull();
  });

  it("returns nulls for an empty event list", () => {
    const { nextHigh, nextLow } = findNextTideEvents([], new Date());
    expect(nextHigh).toBeNull();
    expect(nextLow).toBeNull();
  });
});
