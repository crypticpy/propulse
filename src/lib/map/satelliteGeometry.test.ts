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
