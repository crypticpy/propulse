import { describe, expect, it } from "vitest";
import {
  bboxAround,
  haversineKm,
  sortStationsByDistance,
  type MetarStation,
} from "@/hooks/useMetar";

describe("bboxAround", () => {
  it("builds a symmetric box around the center point", () => {
    expect(bboxAround(30, -97, 1)).toEqual({
      minLat: 29,
      minLon: -98,
      maxLat: 31,
      maxLon: -96,
    });
  });

  it("clamps latitude to +88 near the north pole", () => {
    expect(bboxAround(89.5, 10, 1)).toEqual({
      minLat: 87,
      minLon: 9,
      maxLat: 89,
      maxLon: 11,
    });
  });

  it("clamps latitude to -88 near the south pole", () => {
    expect(bboxAround(-90, -170, 1)).toEqual({
      minLat: -89,
      minLon: -171,
      maxLat: -87,
      maxLon: -169,
    });
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(30, -97, 30, -97)).toBe(0);
  });

  it("computes a known distance (roughly Austin to Dallas)", () => {
    const distance = haversineKm(30.2672, -97.7431, 32.7767, -96.797);
    expect(distance).toBeGreaterThan(280);
    expect(distance).toBeLessThan(300);
  });
});

function makeStation(overrides: Partial<MetarStation>): MetarStation {
  return {
    icaoId: null,
    name: null,
    lat: null,
    lon: null,
    obsTime: null,
    temp: null,
    dewp: null,
    wdir: null,
    wspd: null,
    wgst: null,
    visib: null,
    altim: null,
    wxString: null,
    fltCat: null,
    rawOb: null,
    ...overrides,
  };
}

describe("sortStationsByDistance", () => {
  it("orders stations nearest-first", () => {
    const far = makeStation({ icaoId: "FAR", lat: 40, lon: -97 });
    const near = makeStation({ icaoId: "NEAR", lat: 30.1, lon: -97 });
    const mid = makeStation({ icaoId: "MID", lat: 33, lon: -97 });

    const sorted = sortStationsByDistance([far, near, mid], 30, -97);

    expect(sorted.map((s) => s.icaoId)).toEqual(["NEAR", "MID", "FAR"]);
  });

  it("pushes stations without coordinates to the end", () => {
    const noCoords = makeStation({ icaoId: "NONE" });
    const withCoords = makeStation({ icaoId: "HAS", lat: 31, lon: -97 });

    const sorted = sortStationsByDistance([noCoords, withCoords], 30, -97);

    expect(sorted.map((s) => s.icaoId)).toEqual(["HAS", "NONE"]);
  });
});
