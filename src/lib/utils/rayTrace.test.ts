import { describe, expect, it } from "vitest";
import { calculateReflectionPoints, traceRayPath } from "./rayTrace";

const DATE = new Date("2026-06-21T18:00:00Z");

const NY = { lat: 40.7, lon: -74.0 };
const TOKYO = { lat: 35.7, lon: 139.7 };

function trace(pathMode: "short" | "long") {
  return traceRayPath({
    startLat: NY.lat,
    startLon: NY.lon,
    endLat: TOKYO.lat,
    endLon: TOKYO.lon,
    frequencyMHz: 14.074,
    date: DATE,
    sfi: 150,
    kp: 2,
    pathMode,
  });
}

describe("traceRayPath", () => {
  it("defaults to the short path hop geometry", () => {
    const result = trace("short");
    expect(result.pathMode).toBe("short");
    expect(result.hops.length).toBeGreaterThanOrEqual(3);
    expect(result.hops.length).toBeLessThanOrEqual(5);
    expect(result.totalDistanceKm).toBeGreaterThan(9_000);
    expect(result.totalDistanceKm).toBeLessThan(12_000);
  });

  it("traces more hops along the long path than the short path", () => {
    const shortPath = trace("short");
    const longPath = trace("long");

    expect(longPath.pathMode).toBe("long");
    expect(longPath.hops.length).toBeGreaterThan(shortPath.hops.length);
    expect(longPath.totalDistanceKm).toBeGreaterThan(shortPath.totalDistanceKm);
    expect(longPath.summary).toContain("long-path");
  });

  it("places long-path reflections away from the short-path midpoint", () => {
    const shortMid = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      1,
      DATE,
      "short",
    )[0];
    const longMid = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      1,
      DATE,
      "long",
    )[0];

    const separation = Math.hypot(
      shortMid.lat - longMid.lat,
      shortMid.lon - longMid.lon,
    );
    expect(separation).toBeGreaterThan(40);
  });

  it("spreads over the virtual slant range, never the ground range", () => {
    // PROP-03 #949, contract M15. The wave travels the slant range of
    // P.533-14 equation (19); the ground range is the shadow it casts.
    for (const mode of ["short", "long"] as const) {
      const result = trace(mode);
      expect(result.support.kind).toBe("supported");
      expect(result.virtualSlantRangeKm).toBeGreaterThan(
        result.totalDistanceKm,
      );
      const expected =
        32.45 +
        20 * Math.log10(14.074) +
        20 * Math.log10(result.virtualSlantRangeKm);
      expect(result.losses.freeSpaceDb).toBeCloseTo(expected, 12);
    }
  });

  it("reports a loss budget whose parts sum exactly to the total", () => {
    // Exact float equality, not a tolerance: any rounding inside the engine
    // would break this, which is the point. A caller must be able to subtract
    // one itemised term and get the rest back.
    for (const mode of ["short", "long"] as const) {
      const { losses, totalPathLossDb } = trace(mode);
      expect(
        losses.freeSpaceDb +
          losses.absorptionDb +
          losses.terrainDb +
          losses.polarisationDb,
      ).toBe(totalPathLossDb);
    }
  });

  it("does not round the per-hop physics", () => {
    const { hops, totalAbsorptionDb } = trace("short");
    expect(hops.length).toBeGreaterThan(0);
    const rounded = hops.every(
      (hop) =>
        hop.absorptionDb === Math.round(hop.absorptionDb * 10) / 10 &&
        hop.muf === Math.round(hop.muf * 100) / 100,
    );
    expect(rounded).toBe(false);
    expect(totalAbsorptionDb).not.toBe(Math.round(totalAbsorptionDb * 10) / 10);
  });

  it("counts two D-region passes per hop", () => {
    const result = trace("short");
    expect(result.absorptionPassCount).toBe(2 * result.hops.length);
  });

  it("agrees with the analytic slant range on a single hop", () => {
    const result = traceRayPath({
      startLat: 0,
      startLon: 0,
      endLat: 0,
      endLon: 1,
      frequencyMHz: 14,
      date: DATE,
      sfi: 150,
      kp: 2,
    });
    const groundKm = result.totalDistanceKm;
    const psi = groundKm / (2 * 6371);
    const chord =
      2 * Math.sqrt(6371 ** 2 + 6671 ** 2 - 2 * 6371 * 6671 * Math.cos(psi));
    expect(result.virtualSlantRangeKm).toBeCloseTo(chord, 6);
    expect(
      20 * Math.log10(result.virtualSlantRangeKm / groundKm),
    ).toBeGreaterThan(10);
  });

  it("rejects a circuit whose endpoints determine no great circle", () => {
    const result = traceRayPath({
      startLat: 40,
      startLon: -74,
      endLat: -40,
      endLon: 106,
      frequencyMHz: 14,
      date: DATE,
      sfi: 150,
      kp: 2,
    });
    expect(result.support.kind).toBe("ambiguous_geometry");
    expect(result.hops).toHaveLength(0);
    expect(result.isPathViable).toBe(false);
    expect(result.summary).toContain("no ray path");
  });

  it("declares what it stands in for", () => {
    const result = trace("short");
    expect(result.assumptions.join(" ")).toContain("300 km");
    expect(result.assumptions.join(" ")).toContain("1.2 MHz");
  });

  it("keeps long-path control points on the great circle", () => {
    // The long path used to be sampled from a 20 to 40 point polyline and then
    // snapped with Math.round, so a reflection point could be tens of
    // kilometres off the circle it is supposed to lie on.
    const points = calculateReflectionPoints(
      NY.lat,
      NY.lon,
      TOKYO.lat,
      TOKYO.lon,
      7,
      DATE,
      "long",
    );
    expect(points).toHaveLength(7);
    for (let i = 0; i < points.length; i++) {
      expect(points[i].fractionAlongPath).toBeCloseTo((2 * i + 1) / 14, 12);
    }
  });
});
