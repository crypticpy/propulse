import { describe, expect, it } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { clusterSpots } from "./useSpotClustering";

function liveSpot(
  id: string,
  overrides: Partial<LiveSpot> = {},
): LiveSpot {
  return {
    id,
    spotter: "K1ABC",
    dx: "ZZ0ZZZ",
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    source: "PSKReporter",
    ...overrides,
  };
}

const clusteringOptions = {
  enabled: true,
  gridSize: 5,
  minClusterSize: 2,
};

describe("clusterSpots", () => {
  it("clusters spots after resolving a missing raw location from the DX grid", () => {
    const result = clusterSpots(
      [
        liveSpot("grid-1", { dxGrid: "EM10aa" }),
        liveSpot("grid-2", { dxGrid: "EM10ab" }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].spots.map((spot) => spot.id).sort()).toEqual([
      "grid-1",
      "grid-2",
    ]);
    expect(result.singles).toHaveLength(0);
  });

  it("treats zero latitude and longitude as valid explicit coordinates", () => {
    const result = clusterSpots(
      [
        liveSpot("zero-1", { dxLat: 0, dxLon: 0 }),
        liveSpot("zero-2", { dxLat: 0.25, dxLon: 0.25 }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].center.lat).toBeCloseTo(0.125);
    expect(result.clusters[0].center.lon).toBeCloseTo(0.125);
  });

  it("falls back to callsign-prefix locations when coordinates and grid are missing", () => {
    const result = clusterSpots(
      [
        liveSpot("ja-1", { dx: "JA1ABC" }),
        liveSpot("ja-2", { dx: "JA2XYZ" }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].center.lat).toBeCloseTo(36);
    expect(result.clusters[0].center.lon).toBeCloseTo(138);
  });

  it("clusters exactly at the threshold and preserves sub-threshold spots as singles", () => {
    const atThreshold = clusterSpots(
      [
        liveSpot("threshold-1", { dxLat: 10, dxLon: 10 }),
        liveSpot("threshold-2", { dxLat: 10.2, dxLon: 10.2 }),
      ],
      { ...clusteringOptions, minClusterSize: 2 },
    );
    const belowThreshold = clusterSpots(
      [
        liveSpot("threshold-1", { dxLat: 10, dxLon: 10 }),
        liveSpot("threshold-2", { dxLat: 10.2, dxLon: 10.2 }),
      ],
      { ...clusteringOptions, minClusterSize: 3 },
    );

    expect(atThreshold.clusters).toHaveLength(1);
    expect(belowThreshold.clusters).toHaveLength(0);
    expect(belowThreshold.singles.map((spot) => spot.id).sort()).toEqual([
      "threshold-1",
      "threshold-2",
    ]);
  });

  it("falls back to a meaningful threshold for fractional values below one", () => {
    const result = clusterSpots(
      [
        liveSpot("fractional-1", { dxLat: 10, dxLon: 10 }),
        liveSpot("fractional-2", { dxLat: 10.2, dxLon: 10.2 }),
      ],
      { ...clusteringOptions, minClusterSize: 0.5 },
    );

    expect(result.clusters).toHaveLength(0);
    expect(result.singles).toHaveLength(2);
  });

  it("keeps neighboring spatial groups separate with stable memberships and IDs", () => {
    const spots = [
      liveSpot("west-old", {
        dxLat: 20,
        dxLon: 1,
        time: new Date("2026-08-31T10:00:00Z"),
      }),
      liveSpot("east-new", {
        dxLat: 20,
        dxLon: 8.2,
        time: new Date("2026-08-31T13:00:00Z"),
      }),
      liveSpot("west-new", {
        dxLat: 20.2,
        dxLon: 1.2,
        time: new Date("2026-08-31T14:00:00Z"),
      }),
      liveSpot("east-old", {
        dxLat: 20.2,
        dxLon: 8,
        time: new Date("2026-08-31T09:00:00Z"),
      }),
    ];

    const original = clusterSpots(spots, clusteringOptions);
    const reordered = clusterSpots([...spots].reverse(), clusteringOptions);

    expect(original.clusters).toHaveLength(2);
    expect(original.clusters.map((cluster) => cluster.id)).toEqual(
      reordered.clusters.map((cluster) => cluster.id),
    );
    expect(
      original.clusters.map((cluster) =>
        cluster.spots.map((spot) => spot.id),
      ),
    ).toEqual(
      reordered.clusters.map((cluster) =>
        cluster.spots.map((spot) => spot.id),
      ),
    );
    expect(
      original.clusters.map((cluster) => cluster.primarySpot.id).sort(),
    ).toEqual(["east-new", "west-new"]);
  });

  it("uses a circular longitude centroid for a cluster across the dateline", () => {
    const result = clusterSpots(
      [
        liveSpot("dateline-east", { dxLat: 5, dxLon: 179 }),
        liveSpot("dateline-west", { dxLat: 7, dxLon: -179 }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].center.lat).toBeCloseTo(6);
    expect(Math.abs(result.clusters[0].center.lon)).toBeCloseTo(180);
  });

  it("retains an unresolvable spot as a single", () => {
    const unresolved = liveSpot("unresolved", {
      dx: "",
      dxGrid: undefined,
      dxLat: undefined,
      dxLon: undefined,
    });

    const result = clusterSpots([unresolved], clusteringOptions);

    expect(result.totalSpots).toBe(1);
    expect(result.clusters).toHaveLength(0);
    expect(result.singles).toEqual([unresolved]);
  });
});
