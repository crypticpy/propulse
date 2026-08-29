import { describe, expect, it } from "vitest";
import {
  decimateCurve,
  findNearestStation,
  haversineKm,
  parseLatLon,
  parsePredictions,
  parseStationList,
  parseStationParam,
} from "./atmosTides";

describe("parseLatLon", () => {
  it("accepts in-range coordinates", () => {
    expect(parseLatLon("40.7", "-74.0")).toEqual({ lat: 40.7, lon: -74.0 });
  });

  it("rejects missing, non-numeric, or out-of-range values", () => {
    expect(parseLatLon(null, "-74.0")).toBeNull();
    expect(parseLatLon("abc", "-74.0")).toBeNull();
    expect(parseLatLon("95", "-74.0")).toBeNull();
    expect(parseLatLon("40.7", "-200")).toBeNull();
  });
});

describe("parseStationParam", () => {
  it("accepts digits-only ids of plausible length", () => {
    expect(parseStationParam("8518750")).toBe("8518750");
  });

  it("rejects non-numeric or implausible ids", () => {
    expect(parseStationParam(null)).toBeNull();
    expect(parseStationParam("abc1234")).toBeNull();
    expect(parseStationParam("12")).toBeNull();
    expect(parseStationParam("1234567890")).toBeNull();
  });
});

describe("parseStationList", () => {
  it("extracts id/name/lat/lng and drops invalid rows", () => {
    expect(
      parseStationList({
        stations: [
          { id: "8518750", name: "The Battery", lat: "40.7", lng: "-74.01" },
          { id: "8519483", name: "missing coords", lat: null, lng: "-74" },
          { name: "missing id", lat: "1", lng: "2" },
        ],
      }),
    ).toEqual([{ id: "8518750", name: "The Battery", lat: 40.7, lng: -74.01 }]);
  });

  it("returns an empty array for malformed input", () => {
    expect(parseStationList(null)).toEqual([]);
    expect(parseStationList({})).toEqual([]);
  });
});

describe("haversineKm / findNearestStation", () => {
  const stations = [
    { id: "1", name: "Near", lat: 40.71, lng: -74.0 },
    { id: "2", name: "Far", lat: 34.05, lng: -118.24 },
  ];

  it("distance from a point to itself is ~0", () => {
    expect(haversineKm(40.7, -74.0, 40.7, -74.0)).toBeCloseTo(0, 5);
  });

  it("finds the closer station", () => {
    const result = findNearestStation(stations, 40.7, -74.0);
    expect(result?.station.id).toBe("1");
    expect(result?.distanceKm).toBeLessThan(5);
  });

  it("returns null for an empty station list", () => {
    expect(findNearestStation([], 40.7, -74.0)).toBeNull();
  });
});

describe("decimateCurve", () => {
  it("passes through arrays already within the cap", () => {
    const points = [1, 2, 3];
    expect(decimateCurve(points, 48)).toEqual(points);
  });

  it("strides down to roughly the requested cap", () => {
    const points = Array.from({ length: 96 }, (_, i) => i);
    const result = decimateCurve(points, 48);
    expect(result.length).toBeLessThanOrEqual(48);
    expect(result[0]).toBe(0);
  });
});

describe("parsePredictions", () => {
  it("parses valid hi/lo and curve rows, skipping malformed ones", () => {
    expect(
      parsePredictions({
        predictions: [
          { t: "2026-08-29 00:00", v: "1.234", type: "H" },
          { t: "2026-08-29 06:12", v: "0.100", type: "L" },
          { t: "2026-08-29 12:00", v: "not-a-number" },
          { v: "1.0", type: "H" },
        ],
      }),
    ).toEqual([
      { time: "2026-08-29 00:00", heightM: 1.234, type: "H" },
      { time: "2026-08-29 06:12", heightM: 0.1, type: "L" },
    ]);
  });

  it("returns an empty array for malformed input", () => {
    expect(parsePredictions(null)).toEqual([]);
    expect(parsePredictions({})).toEqual([]);
  });
});
