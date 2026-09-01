import { describe, expect, it } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import {
  buildAzimuthalSpotClusters,
  limitAzimuthalBackgroundTraces,
} from "./azimuthalSpotAggregation";

function spot(id: string): LiveSpot {
  return {
    id,
    dx: id,
    spotter: "TEST",
    frequency: 14_074,
    mode: "FT8",
    band: "20m",
    source: "PSKReporter",
    comment: "",
    time: new Date("2026-09-01T12:00:00Z"),
  };
}

describe("buildAzimuthalSpotClusters", () => {
  it("aggregates dense screen-space endpoints while preserving exact reports", () => {
    const candidates = [
      { dxLat: 1, dxLon: 1, originalSpot: spot("A") },
      { dxLat: 2, dxLon: 2, originalSpot: spot("B") },
      { dxLat: 80, dxLon: 80, originalSpot: spot("C") },
    ];
    const clusters = buildAzimuthalSpotClusters(
      candidates,
      (lat) => (lat < 10 ? { x: 100 + lat, y: 100 } : { x: 300, y: 300 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );

    expect(clusters).toHaveLength(2);
    expect(clusters[0].members.map((member) => member.originalSpot.id)).toEqual(
      ["A", "B"],
    );
    expect(clusters[1].members[0].originalSpot).toBe(candidates[2].originalSpot);
  });

  it("filters projected and zoomed points outside the visible viewport", () => {
    const clusters = buildAzimuthalSpotClusters(
      [{ dxLat: 0, dxLon: 0, originalSpot: spot("OFFSCREEN") }],
      () => ({ x: 600, y: 300 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 2 },
    );
    expect(clusters).toEqual([]);
  });

  it("combines near-identical endpoints across a nominal cell boundary", () => {
    const clusters = buildAzimuthalSpotClusters(
      [
        { dxLat: 31, dxLon: 0, originalSpot: spot("LEFT") },
        { dxLat: 33, dxLon: 0, originalSpot: spot("RIGHT") },
      ],
      (lat) => ({ x: lat, y: 100 }),
      {
        canvasSize: 600,
        center: 300,
        displaySize: 600,
        zoom: 1,
        cellSize: 32,
      },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(2);
  });

  it("reconciles chained neighbors without order-dependent overlap", () => {
    const clusters = buildAzimuthalSpotClusters(
      [
        { dxLat: 0, dxLon: 0, originalSpot: spot("ZERO") },
        { dxLat: 32, dxLon: 0, originalSpot: spot("EDGE") },
        { dxLat: 31, dxLon: 0, originalSpot: spot("BRIDGE") },
      ],
      (lat) => ({ x: lat, y: 100 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("absorbs controls that would overlap around the prospective center", () => {
    const clusters = buildAzimuthalSpotClusters(
      [0, 33, 16.5].map((x) => ({
        dxLat: x,
        dxLon: 0,
        originalSpot: spot(`X${x}`),
      })),
      (lat) => ({ x: lat, y: 100 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("is deterministic when distant endpoints arrive before their bridge", () => {
    const clusters = buildAzimuthalSpotClusters(
      [0, 64, 31].map((x) => ({
        dxLat: x,
        dxLon: 0,
        originalSpot: spot(`X${x}`),
      })),
      (lat) => ({ x: lat, y: 100 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
    expect(clusters[0].x).toBe(32);
  });

  it("reconciles two-dimensional clusters whose rendered controls overlap", () => {
    const clusters = buildAzimuthalSpotClusters(
      [
        [48, 81],
        [71, 88],
        [95, 39],
        [46, 28],
        [67, 24],
      ].map(([x, y]) => ({
        dxLat: x,
        dxLon: y,
        originalSpot: spot(`X${x}Y${y}`),
      })),
      (lat, lon) => ({ x: lat, y: lon }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );

    for (let aIndex = 0; aIndex < clusters.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < clusters.length; bIndex += 1) {
        const a = clusters[aIndex];
        const b = clusters[bIndex];
        const separated =
          a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top;
        expect(separated).toBe(true);
      }
    }
  });

  it("does not let single-linkage chains collapse a wide run", () => {
    const clusters = buildAzimuthalSpotClusters(
      [0, 31, 62, 93].map((x) => ({
        dxLat: x,
        dxLon: 0,
        originalSpot: spot(`X${x}`),
      })),
      (lat) => ({ x: lat, y: 100 }),
      { canvasSize: 600, center: 300, displaySize: 600, zoom: 1 },
    );
    expect(clusters.length).toBeGreaterThan(1);
    expect(
      Math.max(...clusters.map((cluster) => cluster.members.length)),
    ).toBeLessThan(4);
  });
});

describe("limitAzimuthalBackgroundTraces", () => {
  it("caps generic routes without copying an already-bounded list", () => {
    const bounded = [1, 2];
    expect(limitAzimuthalBackgroundTraces(bounded, 3)).toBe(bounded);
    expect(limitAzimuthalBackgroundTraces([1, 2, 3, 4], 3)).toEqual([
      1, 2, 3,
    ]);
  });
});
