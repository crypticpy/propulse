import { describe, expect, it } from "vitest";
import { GridGlowRenderer } from "./GridGlowCanvas";

describe("GridGlowRenderer active cells", () => {
  it("uses canonical activity cells for click membership and sleeps after recency", () => {
    const renderer = new GridGlowRenderer();
    renderer.setActivityCells([
      {
        id: "2:EM",
        grid: "EM",
        resolution: 2,
        reportCount: 2,
        uniqueDxCallsignCount: 2,
        uniqueReporterCallsignCount: 1,
        uniquePathCount: 2,
        newestTimestamp: 1_000,
        oldestTimestamp: 500,
        sourceMix: {
          PSKReporter: 0,
          RBN: 0,
          Cluster: 2,
          "WSJT-X": 0,
        },
        modeMix: { CW: 2 },
        reportIds: ["one", "two"],
        reports: [],
        densityScore: 0.5,
        recencyScore: 1,
        color: "#06b6d4",
      },
    ]);

    expect(renderer.getActiveGridSquares(1_500)).toEqual(["EM"]);
    expect(renderer.getNextAnimationDelay(1_500)).toBe(0);
    expect(renderer.getNextAnimationDelay(6_000)).toBeNull();
  });

  it("keeps animating a clock-skewed activity cell until its pulse decays", () => {
    const renderer = new GridGlowRenderer();
    renderer.setActivityCells([
      {
        id: "2:EM",
        grid: "EM",
        resolution: 2,
        reportCount: 1,
        uniqueDxCallsignCount: 1,
        uniqueReporterCallsignCount: 1,
        uniquePathCount: 1,
        newestTimestamp: 61_000,
        oldestTimestamp: 61_000,
        sourceMix: {
          PSKReporter: 1,
          RBN: 0,
          Cluster: 0,
          "WSJT-X": 0,
        },
        modeMix: { FT8: 1 },
        reportIds: ["future"],
        reports: [],
        densityScore: 0.1,
        recencyScore: 1,
        color: "#3b82f6",
      },
    ]);

    expect(renderer.getNextAnimationDelay(1_000)).toBe(60_000);
    expect(renderer.getNextAnimationDelay(65_999)).toBe(0);
    expect(renderer.getNextAnimationDelay(66_000)).toBeNull();
  });

  it("exposes exactly the persisted cells that remain clickable", () => {
    const renderer = new GridGlowRenderer();
    renderer.persistEdges = true;
    renderer.addGlow({
      gridSquare: "em12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getActiveGridSquares(61_000)).toEqual(["EM12"]);
    expect(renderer.getActiveGridSquares(91_000)).toEqual([]);
  });

  it("sleeps through a steady persisted edge and wakes for its fade", () => {
    const renderer = new GridGlowRenderer();
    renderer.persistEdges = true;
    renderer.addGlow({
      gridSquare: "EM12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getNextAnimationDelay(1_100)).toBe(0);
    expect(renderer.getNextAnimationDelay(3_000)).toBe(58_000);
    expect(renderer.getNextAnimationDelay(61_000)).toBe(0);
    expect(renderer.getNextAnimationDelay(91_000)).toBeNull();
  });

  it("stops the clock after a transient pulse settles", () => {
    const renderer = new GridGlowRenderer();
    renderer.addGlow({
      gridSquare: "EM12",
      color: "#00ffff",
      timestamp: 1_000,
    });

    expect(renderer.getNextAnimationDelay(1_500)).toBe(0);
    expect(renderer.getNextAnimationDelay(2_000)).toBeNull();
  });
});
