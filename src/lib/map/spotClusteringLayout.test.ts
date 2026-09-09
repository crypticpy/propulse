import { describe, expect, it } from "vitest";
import { resolveAggregateReportThreshold } from "./spotClusteringLayout";

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
