import { describe, expect, it } from "vitest";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import type { GlobeSpotLayoutPayload } from "@/lib/map/globeSpotLayout";
import type {
  ProjectedSpotLayoutCandidate,
  SpotLayoutAggregate,
} from "@/lib/map/screenSpaceSpotLayout";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import {
  mergeSpotBeacons,
  resolveAggregateReportThreshold,
  resolveCollisionPaddingPx,
  resolveMaxStackOffsetPx,
} from "./spotClusteringLayout";

function presentableSpot(id: string): PresentableSpot {
  return {
    id,
    spotter: `SPOTTER-${id}`,
    dx: `DX-${id}`,
    frequency: 14074,
    comment: "",
    time: new Date("2026-09-09T00:00:00Z"),
  };
}

function member(
  id: string,
  reportId: string,
): ProjectedSpotLayoutCandidate<GlobeSpotLayoutPayload> {
  return {
    id,
    reportId,
    kind: "dx-label",
    lat: 40,
    lon: -75,
    width: 82,
    height: 22,
    x: 300,
    y: 300,
    clipZ: 0,
    visible: true,
    payload: {
      spot: presentableSpot(reportId),
      role: "dx",
      color: "#ffffff",
    },
  };
}

function aggregate(
  id: string,
  reportIds: string[],
): SpotLayoutAggregate<GlobeSpotLayoutPayload> {
  const members = reportIds.map((reportId) => member(`${reportId}:dx`, reportId));
  return {
    id,
    center: { lat: 40, lon: -75 },
    screenCenter: { x: 300, y: 300 },
    members,
    memberReportIds: reportIds,
    count: reportIds.length,
    primary: members[0],
    sizeScale: 1.2,
  };
}

function geographicCluster(id: string): SpotClusterData {
  const spot = { ...presentableSpot(id), source: "Cluster" as const };
  return {
    id,
    center: { lat: 10, lon: 10 },
    spots: [spot],
    count: 1,
    primarySpot: spot,
  };
}

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

describe("mergeSpotBeacons (PR #615 round 5 blocking finding)", () => {
  it("converts a screen-space aggregate to a beacon when no geographic clusters exist", () => {
    const agg = aggregate("screen-agg-1", ["r1", "r2", "r3"]);
    const result = mergeSpotBeacons([agg], []);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("screen:screen-agg-1");
    expect(result[0].center).toEqual({ lat: 40, lon: -75 });
    expect(result[0].count).toBe(3);
    expect(result[0].spots.map((spot) => spot.id)).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
    expect(result[0].primarySpot.id).toBe("r1");
  });

  it("lists geographic clusters first, then screen-space aggregates, with no id collision", () => {
    const geo = geographicCluster("geo-1");
    const agg = aggregate("geo-1", ["r1", "r2"]);
    const result = mergeSpotBeacons([agg], [geo]);

    expect(result.map((cluster) => cluster.id)).toEqual([
      "geo-1",
      "screen:geo-1",
    ]);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeSpotBeacons([], [])).toEqual([]);
  });
});
