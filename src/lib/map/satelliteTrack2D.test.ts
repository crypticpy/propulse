import { afterEach, describe, expect, it, vi } from "vitest";
import type { TLEData } from "@/types/satellite";
import type { OrbitTrackPoint } from "@/lib/api/satellites";
import {
  buildFlatSatelliteTrack,
  getCachedOrbitTrack,
  getOrbitTrackMinuteBucket,
  projectOrbitTrack,
  pruneOrbitTrackCache,
} from "./satelliteTrack2D";
import { MAX_TRACK_DOTS, MAX_TRACK_LABELS } from "./satelliteGeometry";
import { MAX_SATELLITE_TRACKS } from "@/stores/mapStore";
import {
  observeSatelliteTrackLabelColors,
  resolveSatelliteTrackLabelColors,
} from "./satelliteTrackDraw2D";

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

// #994 PR B round 2 Codex thread 1: getCachedOrbitTrack's cache key must be
// keyed on an absolute-time bucket, not a component-local render counter --
// a counter resets to 0 on remount while the module-level cache survives, so
// reopening the view with the same satellite/TLE/config would hit a stale
// `...|0` entry from an earlier visit.
describe("getOrbitTrackMinuteBucket", () => {
  afterEach(() => vi.useRealTimers());

  it("changes after 5 simulated minutes, producing a fresh cached track", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));
    const satellite: TLEData = { ...ISS_TLE, noradId: 900001 };
    const config = { orbitsAhead: 1 as const, showPast: false };

    const bucketAtM = getOrbitTrackMinuteBucket();
    const first = getCachedOrbitTrack(satellite, config, bucketAtM);

    vi.setSystemTime(new Date("2026-01-01T00:05:45Z"));
    const bucketAtMPlus5 = getOrbitTrackMinuteBucket();
    const second = getCachedOrbitTrack(satellite, config, bucketAtMPlus5);

    // Reverting to a fixed/resettable counter (e.g. always 0) makes both of
    // these fail: the bucket wouldn't change and the second call would be a
    // stale cache hit instead of a fresh build.
    expect(bucketAtMPlus5).not.toBe(bucketAtM);
    expect(second).not.toBe(first);
  });
});

// #994 PR B round 2 Codex thread 2: the propagation cache must not grow
// unbounded -- it should track at most MAX_SATELLITE_TRACKS entries (the
// same cap mapStore enforces on simultaneously tracked satellites) with LRU
// eviction, and pruneOrbitTrackCache should drop a cleared track's entry
// immediately rather than waiting for the LRU bound.
describe("orbit-track propagation cache bound and pruning", () => {
  const CACHE_TEST_CONFIG = { orbitsAhead: 1 as const, showPast: false };
  const BASE_NORAD_ID = 910000;

  function fixture(noradId: number): TLEData {
    return { ...ISS_TLE, noradId };
  }

  it("evicts the least-recently-used satellite once more than MAX_SATELLITE_TRACKS are mapped", () => {
    const ids = Array.from(
      { length: MAX_SATELLITE_TRACKS + 1 },
      (_, i) => BASE_NORAD_ID + i,
    );
    const builds = ids.map((id) =>
      getCachedOrbitTrack(fixture(id), CACHE_TEST_CONFIG, 100),
    );

    // The first-mapped satellite should have been evicted to keep the cache
    // at MAX_SATELLITE_TRACKS entries: calling it again with the identical
    // key must rebuild (a fresh array), not return the cached one. Reverting
    // the eviction loop makes this fail (`second === first`).
    const rebuiltFirst = getCachedOrbitTrack(
      fixture(ids[0]),
      CACHE_TEST_CONFIG,
      100,
    );
    expect(rebuiltFirst).not.toBe(builds[0]);

    // The most recently added satellite must still be a cache hit.
    const lastIndex = ids.length - 1;
    const cachedLast = getCachedOrbitTrack(
      fixture(ids[lastIndex]),
      CACHE_TEST_CONFIG,
      100,
    );
    expect(cachedLast).toBe(builds[lastIndex]);
  });

  it("pruneOrbitTrackCache removes a cleared satellite's entry immediately", () => {
    const id = BASE_NORAD_ID + 100;
    const first = getCachedOrbitTrack(fixture(id), CACHE_TEST_CONFIG, 200);

    // Simulate clearSatelliteTrack: the active set no longer contains it.
    pruneOrbitTrackCache(new Set());

    const second = getCachedOrbitTrack(fixture(id), CACHE_TEST_CONFIG, 200);
    // Reverting pruneOrbitTrackCache to a no-op makes this fail: the entry
    // would still be cached under the identical key, so `second` would be
    // `=== first`.
    expect(second).not.toBe(first);
  });
});

// `observeSatelliteTrackLabelColors`/`resolveSatelliteTrackLabelColors` live
// in `./satelliteTrackDraw2D`, tested here rather than in a new file to stay
// within this PR's file budget (#994 PR B round 3 Codex thread 1).
describe("observeSatelliteTrackLabelColors (#994 PR B round 3 Codex thread 1)", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--su-text");
    document.documentElement.style.removeProperty("--su-panel");
    document.documentElement.classList.remove("light", "dark");
  });

  it("fires when the root element's style attribute changes -- not just data-hamclock-theme", async () => {
    document.documentElement.style.setProperty("--su-text", "#111111");
    const before = resolveSatelliteTrackLabelColors();
    expect(before.text).toBe("#111111");

    const callback = vi.fn();
    const dispose = observeSatelliteTrackLabelColors(callback);

    // Simulates `applyThemeToDocument` re-theming the ordinary PropSphere
    // page: it writes `--su-text` via `root.style.setProperty`, not via
    // `data-hamclock-theme` (only set inside a HamClock wall tile).
    // Reverting the attributeFilter back to `["data-hamclock-theme"]` alone
    // makes this fail: the callback is never called.
    document.documentElement.style.setProperty("--su-text", "#222222");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalled();
    expect(resolveSatelliteTrackLabelColors().text).toBe("#222222");

    dispose();
  });

  it("fires when the root element's class attribute changes (theme dark/light class toggle)", async () => {
    const callback = vi.fn();
    const dispose = observeSatelliteTrackLabelColors(callback);

    document.documentElement.classList.add("light");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalled();
    dispose();
  });

  it("still fires on data-hamclock-theme changes on a descendant div (unchanged behavior)", async () => {
    const div = document.createElement("div");
    div.setAttribute("data-hamclock-theme", "pulse");
    document.body.appendChild(div);

    const callback = vi.fn();
    const dispose = observeSatelliteTrackLabelColors(callback);

    div.setAttribute("data-hamclock-theme", "brass");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalled();
    dispose();
    document.body.removeChild(div);
  });

  it("does NOT fire on a descendant style mutation (#994 PR B round 4 Codex thread 1 P1 perf regression)", async () => {
    // Simulates FlatMapView's own pan/zoom `previewNavigation`, which
    // writes `style.transform` on a descendant on every animation frame.
    // A subtree-wide `style` filter (the round-3 fix) fired the callback on
    // every such frame even with no orbit track active, defeating the
    // retained-canvas navigation path. Reverting the split back to one
    // `subtree: true` observer watching `style` makes this fail.
    const div = document.createElement("div");
    document.body.appendChild(div);

    const callback = vi.fn();
    const dispose = observeSatelliteTrackLabelColors(callback);

    div.style.transform = "translate3d(10px, 0, 0)";
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).not.toHaveBeenCalled();
    dispose();
    document.body.removeChild(div);
  });

  it("resolves the same object reference across consecutive calls when nothing changed (#994 PR B round 4 Codex thread 1 P1 perf regression)", () => {
    document.documentElement.style.setProperty("--su-text", "#333333");
    document.documentElement.style.setProperty("--su-panel", "#444444");

    const first = resolveSatelliteTrackLabelColors();
    const second = resolveSatelliteTrackLabelColors();
    // Reverting the memoized-comparison fix (returning a fresh object every
    // call) makes this fail: `second` would be `!==` `first` despite
    // identical panel/text values, which propagates into React state and
    // forces a needless re-render on every spurious notification.
    expect(second).toBe(first);

    document.documentElement.style.setProperty("--su-text", "#555555");
    const third = resolveSatelliteTrackLabelColors();
    expect(third).not.toBe(second);
    expect(third.text).toBe("#555555");
  });
});
