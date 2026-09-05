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
});
