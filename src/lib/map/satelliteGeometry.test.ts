import { describe, expect, it } from "vitest";
import {
  MAX_TRACK_DOTS,
  MAX_TRACK_LABELS,
  selectLimitedFootprints,
  selectTrackDotIndices,
  selectTrackLabelIndices,
  type TrackLabelPoint,
} from "./satelliteGeometry";

// ---------------------------------------------------------------------------
// selectTrackLabelIndices (#1029 review — bound orbit-track label count)
// ---------------------------------------------------------------------------

/** Build a track of one point per minute from `startMin` to `endMin` inclusive. */
function buildMinuteTrack(
  startMin: number,
  endMin: number,
  latLonAt: (minutesFromNow: number) => { lat: number; lon: number },
): TrackLabelPoint[] {
  const points: TrackLabelPoint[] = [];
  for (let m = startMin; m <= endMin; m++) {
    const { lat, lon } = latLonAt(m);
    points.push({ lat, lon, minutesFromNow: m });
  }
  return points;
}

describe("selectTrackLabelIndices", () => {
  it("bounds a GEO 3-orbit track (period ~1436 min) to <= MAX_TRACK_LABELS labels", () => {
    const periodMin = 1436;
    const pastMin = 45;
    const forwardMin = periodMin * 3;
    // Geostationary: sub-satellite point barely moves.
    const track = buildMinuteTrack(-pastMin, forwardMin, (m) => ({
      lat: 0.01 * Math.sin(m / 500),
      lon: -75 + 0.01 * Math.cos(m / 500),
    }));

    const indices = selectTrackLabelIndices(track);

    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length).toBeLessThanOrEqual(MAX_TRACK_LABELS);
  });

  it("keeps the 30-minute cadence for a short LEO-length (135 min) track", () => {
    // Fast-moving LEO ground track so spatial dedup never interferes.
    const track = buildMinuteTrack(-45, 90, (m) => ({
      lat: 10 * Math.sin(m / 10),
      lon: -160 + m * 2,
    }));

    const indices = selectTrackLabelIndices(track);
    const minutes = indices.map((i) => track[i].minutesFromNow);

    // Every selected label lands on a 30-minute boundary.
    for (const m of minutes) {
      expect(Math.abs(m % 30)).toBe(0);
    }
    // The full 30-minute cadence across the track is present.
    expect(minutes).toEqual([-30, 0, 30, 60, 90]);
  });

  it("always keeps the t=0 label even when it falls within minSeparationDeg of the prior label", () => {
    // t=-30 and t=0 sit at nearly the same lat/lon (satellite barely moved),
    // which would make the spatial dedup skip t=0 if it weren't protected.
    const track = buildMinuteTrack(-30, 30, (m) => ({
      lat: m <= 0 ? 10 : 10 + (m / 30) * 5,
      lon: -100,
    }));

    const indices = selectTrackLabelIndices(track, { minSeparationDeg: 2 });
    const minutes = indices.map((i) => track[i].minutesFromNow);

    expect(minutes).toContain(0);
  });

  it("returns an empty array for an empty track", () => {
    expect(selectTrackLabelIndices([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// selectTrackDotIndices (#1029 review round 2 — bound orbit-track dot count)
// ---------------------------------------------------------------------------

describe("selectTrackDotIndices", () => {
  it("bounds a GEO 3-orbit track (period ~1436 min) to <= MAX_TRACK_DOTS dots", () => {
    const periodMin = 1436;
    const pastMin = 45;
    const forwardMin = periodMin * 3;
    // Geostationary: sub-satellite point barely moves.
    const track = buildMinuteTrack(-pastMin, forwardMin, (m) => ({
      lat: 0.01 * Math.sin(m / 500),
      lon: -75 + 0.01 * Math.cos(m / 500),
    }));

    const indices = selectTrackDotIndices(track);

    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length).toBeLessThanOrEqual(MAX_TRACK_DOTS);
  });

  it("reproduces today's every-10-minute dot set unchanged for a short (135 min) LEO track", () => {
    // Fast-moving LEO ground track so spatial dedup never interferes.
    const track = buildMinuteTrack(-45, 90, (m) => ({
      lat: 10 * Math.sin(m / 10),
      lon: -160 + m * 2,
    }));

    const indices = selectTrackDotIndices(track);
    const minutes = indices.map((i) => track[i].minutesFromNow);

    // The exact set the old `point.minutesFromNow % 10 === 0` loop produced.
    const expectedMinutes = track
      .map((p) => p.minutesFromNow)
      .filter((m) => m % 10 === 0);

    expect(minutes).toEqual(expectedMinutes);
  });

  it("returns an empty array for an empty track", () => {
    expect(selectTrackDotIndices([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// selectByCadence structural cap (#1029 review round 3 — off-by-one at the
// exact maxCount * intervalMin boundary)
// ---------------------------------------------------------------------------

describe("selectByCadence boundary enforcement", () => {
  it("caps a dot track landing exactly on MAX_TRACK_DOTS * intervalMin, keeping t=0 and dropping the far endpoint", () => {
    // 0..600 minutes at a 10-minute cadence (a ~200-minute-period satellite,
    // 3 orbits ahead) used to reproduce the un-rounded 10-minute cadence
    // exactly and select 61 indices -- one past the instancedMesh's fixed
    // MAX_TRACK_DOTS (60) capacity. Movement is monotonic and fast enough
    // that the 1-degree spatial dedup never interferes.
    const track = buildMinuteTrack(0, 600, (m) => ({
      lat: -60 + m * 0.2,
      lon: -150 + m * 0.3,
    }));

    const indices = selectTrackDotIndices(track);
    const minutes = indices.map((i) => track[i].minutesFromNow);

    expect(indices.length).toBe(MAX_TRACK_DOTS);
    expect(minutes).toContain(0);
    expect(minutes).not.toContain(600);
  });

  it("caps the label selector at its own maxLabels * intervalMin boundary", () => {
    // With maxLabels overridden to 32, a 0..960-minute track at the
    // selector's 30-minute base cadence reproduces the same off-by-one
    // shape (33 raw candidates for a 32-label budget) as the dot case
    // above, just at a different (maxCount, interval) pair -- proving the
    // fix lives in the shared `selectByCadence` helper, not a
    // dot-specific special case.
    const track = buildMinuteTrack(0, 960, (m) => ({
      lat: -60 + m * 0.2,
      lon: -150 + m * 0.3,
    }));

    const indices = selectTrackLabelIndices(track, { maxLabels: 32 });
    const minutes = indices.map((i) => track[i].minutesFromNow);

    expect(indices.length).toBe(32);
    expect(minutes).toContain(0);
    expect(minutes).not.toContain(960);
  });

  it("never exceeds its cap across a sweep of track durations from 0 to 3000 minutes", () => {
    for (let durationMin = 0; durationMin <= 3000; durationMin++) {
      const track = buildMinuteTrack(0, durationMin, (m) => ({
        lat: -60 + m * 0.2,
        lon: -150 + m * 0.3,
      }));

      const dotIndices = selectTrackDotIndices(track);
      expect(dotIndices.length).toBeLessThanOrEqual(MAX_TRACK_DOTS);

      const labelIndices = selectTrackLabelIndices(track);
      expect(labelIndices.length).toBeLessThanOrEqual(MAX_TRACK_LABELS);
    }
  });
});

// ---------------------------------------------------------------------------
// selectLimitedFootprints (#1029 review — selected satellite must always win)
// ---------------------------------------------------------------------------

interface FootprintFixture {
  satelliteId: string;
}

describe("selectLimitedFootprints", () => {
  it("keeps the selected satellite when five tracked footprints already fill every slot", () => {
    const tracked: FootprintFixture[] = [
      { satelliteId: "1" },
      { satelliteId: "2" },
      { satelliteId: "3" },
      { satelliteId: "4" },
      { satelliteId: "5" },
    ];
    const selected: FootprintFixture = { satelliteId: "99" };
    // Caller (GlobeView) orders tracked ids first, selected somewhere after.
    const footprints = [...tracked, selected];

    const limited = selectLimitedFootprints(footprints, {
      maxFootprints: 5,
      trackedSatelliteIds: new Set(["1", "2", "3", "4", "5"]),
      selectedSatelliteId: "99",
    });

    expect(limited.length).toBe(5);
    expect(limited.some((fp) => fp.satelliteId === "99")).toBe(true);
  });

  it("still keeps every tracked id when there is no selection", () => {
    const footprints: FootprintFixture[] = [
      { satelliteId: "a" },
      { satelliteId: "b" },
      { satelliteId: "c" },
      { satelliteId: "d" },
      { satelliteId: "e" },
      { satelliteId: "tracked" },
    ];

    const limited = selectLimitedFootprints(footprints, {
      maxFootprints: 5,
      trackedSatelliteIds: new Set(["tracked"]),
      selectedSatelliteId: null,
    });

    expect(limited.length).toBe(5);
    expect(limited.some((fp) => fp.satelliteId === "tracked")).toBe(true);
  });

  it("is a no-op slice when there is nothing to rescue", () => {
    const footprints: FootprintFixture[] = [
      { satelliteId: "a" },
      { satelliteId: "b" },
      { satelliteId: "c" },
    ];

    const limited = selectLimitedFootprints(footprints, {
      maxFootprints: 5,
    });

    expect(limited).toEqual(footprints);
  });
});
