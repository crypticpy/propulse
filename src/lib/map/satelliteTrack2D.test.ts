import { describe, expect, it } from "vitest";
import type { TLEData } from "@/types/satellite";
import { buildFlatSatelliteTrack } from "./satelliteTrack2D";

// Same fixture as src/lib/api/satellites.test.ts's ISS_TLE.
const ISS_TLE: TLEData = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  line2: "2 25544  51.6400 120.0000 0005000  10.0000 350.0000 15.50000000123456",
  noradId: 25544,
};

const WIDTH = 1000;
const HEIGHT = 500;

describe("buildFlatSatelliteTrack", () => {
  it("produces no past segments when showPast is false", () => {
    const geometry = buildFlatSatelliteTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    expect(geometry.pastSegments).toEqual([]);
    expect(geometry.futureSegments.length).toBeGreaterThan(0);
  });

  it("produces past segments when showPast is true", () => {
    const geometry = buildFlatSatelliteTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: true },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    expect(geometry.pastSegments.length).toBeGreaterThan(0);
  });

  it("keeps every point inside the canvas bounds", () => {
    const geometry = buildFlatSatelliteTrack(
      ISS_TLE,
      { orbitsAhead: 2, showPast: true },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    const allPoints = [
      ...geometry.pastSegments.flat(),
      ...geometry.futureSegments.flat(),
      ...geometry.dots,
      ...geometry.labels,
    ];
    expect(allPoints.length).toBeGreaterThan(0);
    for (const p of allPoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(HEIGHT);
    }
  });

  it("never draws a segment spanning more than half the canvas width (dateline split)", () => {
    // 3 orbits ahead at a 1-minute step guarantees at least one antimeridian
    // crossing for a ~93-minute-period LEO satellite like the ISS.
    const geometry = buildFlatSatelliteTrack(
      ISS_TLE,
      { orbitsAhead: 3, showPast: true },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    for (const segment of [
      ...geometry.pastSegments,
      ...geometry.futureSegments,
    ]) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i].x - segment[i - 1].x)).toBeLessThanOrEqual(
          WIDTH / 2,
        );
      }
    }
  });

  it("bounds dots and labels the same way the globe's selectors do", () => {
    // A long multi-orbit track would otherwise produce hundreds of raw
    // 10-minute/label candidates; selectTrackDotIndices/selectTrackLabelIndices
    // cap both. Reverting buildFlatSatelliteTrack to select every 10-minute
    // point directly (skipping the shared selectors) makes this assertion
    // fail: with orbitsAhead=3 on a ~93-minute ISS period there are ~280
    // track points, well past MAX_TRACK_DOTS (60) if uncapped.
    const geometry = buildFlatSatelliteTrack(
      ISS_TLE,
      { orbitsAhead: 3, showPast: true },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    expect(geometry.dots.length).toBeLessThanOrEqual(60);
    expect(geometry.labels.length).toBeLessThanOrEqual(12);
  });
});
