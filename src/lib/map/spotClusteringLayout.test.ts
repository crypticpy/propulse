import { describe, expect, it } from "vitest";
import {
  resolveAggregateReportThreshold,
  resolveCollisionPaddingPx,
  resolveMaxStackOffsetPx,
} from "./spotClusteringLayout";

describe("resolveAggregateReportThreshold (SP-09 round 3 B3)", () => {
  it("follows minClusterSize when clustering is enabled", () => {
    expect(
      resolveAggregateReportThreshold({ enabled: true, gridSize: 5, minClusterSize: 3 }),
    ).toBe(3);
    expect(
      resolveAggregateReportThreshold({ enabled: true, gridSize: 5, minClusterSize: 7 }),
    ).toBe(7);
  });

  it("clamps minClusterSize to the documented 2-10 range", () => {
    expect(
      resolveAggregateReportThreshold({ enabled: true, gridSize: 5, minClusterSize: 1 }),
    ).toBe(2);
    expect(
      resolveAggregateReportThreshold({ enabled: true, gridSize: 5, minClusterSize: 99 }),
    ).toBe(10);
  });

  it("disables aggregation entirely when clustering is off, regardless of minClusterSize", () => {
    expect(
      resolveAggregateReportThreshold({ enabled: false, gridSize: 5, minClusterSize: 3 }),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("resolveMaxStackOffsetPx (PR #615 review finding 2)", () => {
  it("caps the label stack offset at 40px when clustering is enabled", () => {
    expect(
      resolveMaxStackOffsetPx({ enabled: true, gridSize: 5, minClusterSize: 3 }),
    ).toBe(40);
  });

  it("removes the cap when clustering is off, so the deterministic fan never drops a spot", () => {
    expect(
      resolveMaxStackOffsetPx({ enabled: false, gridSize: 5, minClusterSize: 3 }),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("resolveCollisionPaddingPx (PR #615 review finding 3)", () => {
  it("follows the Screen Spacing slider's gridSize", () => {
    expect(
      resolveCollisionPaddingPx({ enabled: true, gridSize: 12, minClusterSize: 3 }),
    ).toBe(12);
  });

  it("floors at 4px regardless of a smaller gridSize", () => {
    expect(
      resolveCollisionPaddingPx({ enabled: true, gridSize: 1, minClusterSize: 3 }),
    ).toBe(4);
  });
});
