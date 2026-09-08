import { describe, expect, it } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { clusterSpots } from "./useSpotClustering";
import { lookupCountry, lookupUsSubdivision } from "@/lib/spots/grouping";

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
  it("clusters grid locators by geography, not 5-degree cells", () => {
    const result = clusterSpots(
      [
        liveSpot("grid-1", { dx: "K5AAA", dxGrid: "EM10aa" }),
        liveSpot("grid-2", { dx: "K5BBB", dxGrid: "EM10ab" }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].spots.map((spot) => spot.id).sort()).toEqual([
      "grid-1",
      "grid-2",
    ]);
    expect(result.clusters[0].center).toEqual(lookupUsSubdivision(30, -97)?.anchor);
    expect(result.singles).toHaveLength(0);
  });

  it("does not invent a country for ocean zero coordinates", () => {
    const result = clusterSpots(
      [
        liveSpot("zero-1", { dx: "TEST1AA", dxLat: 0, dxLon: 0 }),
        liveSpot("zero-2", { dx: "TEST2AA", dxLat: 0.25, dxLon: 0.25 }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(0);
    expect(result.singles.map((spot) => spot.id).sort()).toEqual(["zero-1", "zero-2"]);
  });

  it("keeps callsign-prefix locations as an approximate country group", () => {
    const result = clusterSpots(
      [
        liveSpot("ja-1", { dx: "JA1ABC" }),
        liveSpot("ja-2", { dx: "JA2XYZ" }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].center).toEqual(lookupCountry(36, 138)?.anchor);
    expect(result.clusters[0].id).toContain("country:JP");
    expect(result.clusters[0].id).toContain("approximate");
  });

  it("clusters exactly at the threshold and preserves sub-threshold spots as singles", () => {
    const atThreshold = clusterSpots(
      [
        liveSpot("threshold-1", { dx: "EA1AAA", dxLat: 40.4, dxLon: -3.7 }),
        liveSpot("threshold-2", { dx: "EA1BBB", dxLat: 40.5, dxLon: -3.6 }),
      ],
      { ...clusteringOptions, minClusterSize: 2 },
    );
    const belowThreshold = clusterSpots(
      [
        liveSpot("threshold-1", { dx: "EA1AAA", dxLat: 40.4, dxLon: -3.7 }),
        liveSpot("threshold-2", { dx: "EA1BBB", dxLat: 40.5, dxLon: -3.6 }),
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
        liveSpot("fractional-1", { dx: "EA1AAA", dxLat: 40.4, dxLon: -3.7 }),
        liveSpot("fractional-2", { dx: "EA1BBB", dxLat: 40.5, dxLon: -3.6 }),
      ],
      { ...clusteringOptions, minClusterSize: 0.5 },
    );

    expect(result.clusters).toHaveLength(0);
    expect(result.singles).toHaveLength(2);
  });

  it("keeps neighboring countries separate with stable memberships and IDs", () => {
    const spots = [
      liveSpot("spain-old", {
        dx: "EA1OLD",
        dxLat: 40.4,
        dxLon: -3.7,
        time: new Date("2026-08-31T10:00:00Z"),
      }),
      liveSpot("norway-new", {
        dx: "LA1NEW",
        dxLat: 60,
        dxLon: 8,
        time: new Date("2026-08-31T13:00:00Z"),
      }),
      liveSpot("spain-new", {
        dx: "EA1NEW",
        dxLat: 40.5,
        dxLon: -3.6,
        time: new Date("2026-08-31T14:00:00Z"),
      }),
      liveSpot("norway-old", {
        dx: "LA1OLD",
        dxLat: 59.5,
        dxLon: 7.5,
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
    ).toEqual(["norway-new", "spain-new"]);
  });

  it("does not merge dateline neighbors by proximity or camera", () => {
    const result = clusterSpots(
      [
        liveSpot("dateline-east", { dxLat: 5, dxLon: 179 }),
        liveSpot("dateline-west", { dxLat: 7, dxLon: -179 }),
      ],
      clusteringOptions,
    );

    expect(result.clusters).toHaveLength(0);
    expect(result.singles.map((spot) => spot.id).sort()).toEqual([
      "dateline-east",
      "dateline-west",
    ]);
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

  it("keeps live group ids when clustering is disabled so expansion can sync", () => {
    const result = clusterSpots(
      [
        liveSpot("es-1", { dx: "EA1AAA", dxLat: 40.4, dxLon: -3.7 }),
        liveSpot("es-2", { dx: "EA1BBB", dxLat: 40.5, dxLon: -3.6 }),
      ],
      { ...clusteringOptions, enabled: false },
    );
    expect(result.clusters).toHaveLength(0);
    expect(result.liveGroupIds.length).toBeGreaterThan(0);
  });
});
