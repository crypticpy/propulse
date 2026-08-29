import { describe, expect, it } from "vitest";
import {
  buildCapCoordinateMap,
  normalizeCapVolcanoes,
  normalizeElevatedVolcanoes,
} from "./volcanoes";

const RAW_ELEVATED = [
  {
    obs_fullname: "Alaska Volcano Observatory",
    obs_abbr: "avo",
    volcano_name: "Great Sitkin",
    vnum: "311120",
    sent_utc: "2026-08-28 18:37:48",
    sent_unixtime: 1787942268,
    color_code: "ORANGE",
    alert_level: "WATCH",
  },
  {
    obs_fullname: "Alaska Volcano Observatory",
    obs_abbr: "avo",
    volcano_name: "Kupreanof",
    vnum: "312060",
    sent_utc: "2026-08-28 18:37:48",
    sent_unixtime: 1787942268,
    color_code: "YELLOW",
    alert_level: "ADVISORY",
  },
];

const RAW_CAP = [
  {
    volcano_name_appended: "Great Sitkin Volcano",
    latitude: 52.0765,
    longitude: -176.1109,
    vnum: "311120",
    obs_abbr: "avo",
    alert_level: "WATCH",
    color_code: "ORANGE",
    sent_date_cap: "2026-08-28T10:37:48-08:00",
  },
];

describe("buildCapCoordinateMap", () => {
  it("maps vnum to lat/lon for entries with numeric coordinates", () => {
    const map = buildCapCoordinateMap(RAW_CAP);
    expect(map.get("311120")).toEqual({ lat: 52.0765, lon: -176.1109 });
  });

  it("ignores entries missing coordinates or vnum", () => {
    const map = buildCapCoordinateMap([
      { volcano_name_appended: "No Coords", vnum: "999" },
      { latitude: 1, longitude: 2 },
    ]);
    expect(map.size).toBe(0);
  });

  it("returns an empty map for non-array input", () => {
    expect(buildCapCoordinateMap(null).size).toBe(0);
  });
});

describe("normalizeElevatedVolcanoes", () => {
  it("normalizes fields and enriches coordinates from the CAP map", () => {
    const coordMap = buildCapCoordinateMap(RAW_CAP);
    const result = normalizeElevatedVolcanoes(RAW_ELEVATED, coordMap);

    expect(result).toEqual([
      {
        volcanoName: "Great Sitkin",
        obsAbbr: "avo",
        alertLevel: "WATCH",
        colorCode: "ORANGE",
        lat: 52.0765,
        lon: -176.1109,
        lastUpdate: new Date(1787942268 * 1000).toISOString(),
      },
      {
        volcanoName: "Kupreanof",
        obsAbbr: "avo",
        alertLevel: "ADVISORY",
        colorCode: "YELLOW",
        lat: null,
        lon: null,
        lastUpdate: new Date(1787942268 * 1000).toISOString(),
      },
    ]);
  });

  it("defaults the coordinate map to empty and leaves lat/lon null", () => {
    const result = normalizeElevatedVolcanoes(RAW_ELEVATED);
    expect(result.every((v) => v.lat === null && v.lon === null)).toBe(true);
  });

  it("returns an empty array for non-array input", () => {
    expect(normalizeElevatedVolcanoes(null)).toEqual([]);
  });

  it("skips entries without a volcano_name", () => {
    expect(normalizeElevatedVolcanoes([{ vnum: "1" }])).toEqual([]);
  });
});

describe("normalizeCapVolcanoes", () => {
  it("normalizes the CAP feed directly", () => {
    expect(normalizeCapVolcanoes(RAW_CAP)).toEqual([
      {
        volcanoName: "Great Sitkin Volcano",
        obsAbbr: "avo",
        alertLevel: "WATCH",
        colorCode: "ORANGE",
        lat: 52.0765,
        lon: -176.1109,
        lastUpdate: "2026-08-28T10:37:48-08:00",
      },
    ]);
  });

  it("returns an empty array for non-array input", () => {
    expect(normalizeCapVolcanoes(undefined)).toEqual([]);
  });
});
