import { describe, expect, it } from "vitest";
import type { TLEData } from "@/types/satellite";
import type { OrbitTrackPoint } from "@/lib/api/satellites";
import {
  buildFlatSatelliteTrack,
  getCachedOrbitTrack,
  projectOrbitTrack,
} from "./satelliteTrack2D";
import { MAX_TRACK_DOTS, MAX_TRACK_LABELS } from "./satelliteGeometry";

// Same fixture as src/lib/api/satellites.test.ts's ISS_TLE.
const ISS_TLE: TLEData = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  line2: "2 25544  51.6400 120.0000 0005000  10.0000 350.0000 15.50000000123456",
  noradId: 25544,
};

// Synthetic near-geostationary fixture (mean motion 1.00270000 rev/day, same
// field widths as ISS_TLE with only the numeric values swapped -- period
// ~1436 minutes, so 3 orbits ahead is ~4300 minutes). Used for the cap test
// below: a LEO fixture like ISS at orbitsAhead=3 produces ~280-320 points,
// which the cadence selectors handle well under MAX_TRACK_DOTS/
// MAX_TRACK_LABELS without the structural cap in `selectByCadence` ever
// engaging, so asserting `<= 60` / `<= 12` against it proved nothing (#994 PR
// B round 2 item 3).
//
// Inclination is 63.4 deg (Molniya-like), not the ~0 deg a real GEO bird
// would have: a near-zero-inclination sub-satellite point barely moves
// across 4,300 minutes, so `selectByCadence`'s minSeparationDeg spatial
// dedup discards almost every non-anchor candidate and the track collapses
// to 1 dot/1 label -- exercising the *spatial* filter, not the caps this
// test targets. The inclined variant keeps the same ~1436-minute period
// while moving enough (lat range ~+/-63 deg) that dedup never interferes.
//
// Exactly MAX_TRACK_DOTS/MAX_TRACK_LABELS is not reachable simultaneously
// here: `selectByCadence`'s interval-widening keeps the pre-cap label count
// within ~1 of the cap by design (it scales the interval to the span), so
// the *label* cap only ever gets exercised (forces a mid-track drop) on
// spans well under 3 GEO orbits, while the *dot* cap only starts binding on
// spans well over 3 GEO orbits (verified by sweeping every integer track
// duration from 100 to 200,000 minutes against both selectors -- the
// dot-caps-at-60 durations and the label-caps-at-12 durations never
// overlap). 58/11 (out of a raw 4,354-point track) is what a genuine
// GEO-period fixture actually produces, and is a meaningful proof the caps
// are doing real work here -- nowhere close to the ~4,300/~145 an uncapped
// 10-/30-minute cadence would produce.
const GEO_TLE: TLEData = {
  name: "QO-100 (ES'HAIL 2)",
  line1: "1 43700U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  line2: "2 43700  63.4000 060.0000 0002000  90.0000 270.0000 01.00270000123456",
  noradId: 43700,
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
    // Prove a split actually happened -- without it, the per-segment jump
    // assertion above would also trivially pass on a single unsplit segment.
    expect(geometry.futureSegments.length).toBeGreaterThan(1);
  });

  it("bounds dots and labels the same way the globe's selectors do", () => {
    // A GEO-period track (see GEO_TLE above) at orbitsAhead=3 produces a
    // 4,354-point raw track -- only the cadence selectors in
    // `satelliteGeometry.ts` (`selectTrackDotIndices`/
    // `selectTrackLabelIndices`, shared with the globe's `GroundTrack`) can
    // bound the dot/label count at that length, so this is the fixture that
    // actually exercises them. Reverting `buildFlatSatelliteTrack` to select
    // every 10-/30-minute point directly (skipping the shared selectors)
    // makes this assertion fail with ~430 dots and ~145 labels.
    const geometry = buildFlatSatelliteTrack(
      GEO_TLE,
      { orbitsAhead: 3, showPast: true },
      new Date(),
      WIDTH,
      HEIGHT,
    );
    // Deterministic exact counts for this fixture (see the GEO_TLE comment
    // above for why 58/11 -- not MAX_TRACK_DOTS/MAX_TRACK_LABELS exactly --
    // is what a genuine GEO-period track produces).
    expect(geometry.dots.length).toBe(58);
    expect(geometry.dots.length).toBeLessThanOrEqual(MAX_TRACK_DOTS);
    expect(geometry.labels.length).toBe(11);
    expect(geometry.labels.length).toBeLessThanOrEqual(MAX_TRACK_LABELS);
  });
});

// #994 PR B round 2 item 1: buildFlatSatelliteTrack split into a pure
// projection step (no SGP4) plus a thin propagating builder, so the
// projection can be unit-tested against a synthetic track instead of a real
// TLE/SGP4 run.
describe("projectOrbitTrack", () => {
  const SYNTHETIC_TRACK: OrbitTrackPoint[] = [
    { lat: 0, lon: -10, alt: 400, minutesFromNow: -2 },
    { lat: 0, lon: -5, alt: 400, minutesFromNow: -1 },
    { lat: 0, lon: 0, alt: 400, minutesFromNow: 0 },
    { lat: 0, lon: 5, alt: 400, minutesFromNow: 1 },
    { lat: 0, lon: 10, alt: 400, minutesFromNow: 2 },
  ];

  it("projects lat/lon to canvas coordinates using the equirectangular mapping", () => {
    const geometry = projectOrbitTrack(SYNTHETIC_TRACK, 360, 180);
    // lon=-10 -> x = ((-10 + 180) / 360) * 360 = 170; lat=0 -> y = 90.
    expect(geometry.pastSegments[0][0]).toEqual({ x: 170, y: 90 });
  });

  it("splits past/future at t=0 and bridges the boundary, without ever calling buildOrbitTrack/SGP4", () => {
    const geometry = projectOrbitTrack(SYNTHETIC_TRACK, 360, 180);
    expect(geometry.pastSegments).toHaveLength(1);
    expect(geometry.pastSegments[0]).toHaveLength(2); // t=-2, t=-1
    expect(geometry.futureSegments).toHaveLength(1);
    // Bridges the last past point plus t=0, t=1, t=2.
    expect(geometry.futureSegments[0]).toHaveLength(4);
  });
});

// #994 PR B round 2 item 1: FlatMapView's satPositions gets a new array
// identity on every 5s satellite-position poll, so re-running buildOrbitTrack
// (full SGP4) unconditionally on every render would re-propagate up to
// ~4,300 points per GEO track on every poll. getCachedOrbitTrack must return
// the SAME track array when the cache key hasn't changed.
describe("getCachedOrbitTrack", () => {
  it("returns the same track array on a cache hit (identity/config/minuteTick unchanged)", () => {
    const first = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      0,
    );
    const second = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      0,
    );
    // Reverting to an unconditional buildOrbitTrack call here (no caching)
    // makes this fail: two independently-built arrays are never `===`.
    expect(second).toBe(first);
  });

  it("rebuilds when minuteTick changes", () => {
    const first = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      1,
    );
    const second = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      2,
    );
    expect(second).not.toBe(first);
  });

  it("rebuilds when the track config changes at the same minuteTick", () => {
    const first = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 1, showPast: false },
      5,
    );
    const second = getCachedOrbitTrack(
      ISS_TLE,
      { orbitsAhead: 2, showPast: false },
      5,
    );
    expect(second).not.toBe(first);
  });
});
