import { describe, expect, it } from "vitest";
import { compactTECPayload, resolveLatestTECGridUrl } from "./atmosSpace";

describe("GloTEC index resolution", () => {
  it("resolves the newest (last) entry and prefixes a relative url", () => {
    expect(
      resolveLatestTECGridUrl([
        {
          url: "/products/glotec/geojson_2d_urt/glotec_icao_20260720T000500Z.geojson",
          time_tag: "2026-07-20T00:05:00Z",
        },
        {
          url: "/products/glotec/geojson_2d_urt/glotec_icao_20260720T001500Z.geojson",
          time_tag: "2026-07-20T00:15:00Z",
        },
      ]),
    ).toBe(
      "https://services.swpc.noaa.gov/products/glotec/geojson_2d_urt/glotec_icao_20260720T001500Z.geojson",
    );
  });

  it("passes through an absolute url unchanged", () => {
    expect(
      resolveLatestTECGridUrl([
        { url: "https://example.com/glotec.geojson", time_tag: "x" },
      ]),
    ).toBe("https://example.com/glotec.geojson");
  });

  it("returns null for an empty or malformed index", () => {
    expect(resolveLatestTECGridUrl([])).toBeNull();
    expect(resolveLatestTECGridUrl(null)).toBeNull();
    expect(resolveLatestTECGridUrl([{ time_tag: "x" }])).toBeNull();
  });
});

describe("GloTEC payload compaction", () => {
  it("extracts lat/lon/tec from GeoJSON point features", () => {
    expect(
      compactTECPayload({
        type: "FeatureCollection",
        time_tag: "2026-07-20T02:05:00Z",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-177.5, -88.75] },
            properties: {
              tec: 4.77,
              anomaly: -0.24,
              hmF2: 336.5,
              NmF2: 184557832766.47,
              quality_flag: 0,
            },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-172.5, -88.75] },
            properties: { tec: 4.81 },
          },
        ],
      }),
    ).toEqual({
      timestamp: "2026-07-20T02:05:00Z",
      grid: [
        { lat: -88.75, lon: -177.5, tec: 4.77 },
        { lat: -88.75, lon: -172.5, tec: 4.81 },
      ],
    });
  });

  it("skips features with missing coordinates or non-numeric tec", () => {
    expect(
      compactTECPayload({
        features: [
          { geometry: { coordinates: [1, 2] }, properties: { tec: "x" } },
          { geometry: { coordinates: [1] }, properties: { tec: 5 } },
          { geometry: null, properties: { tec: 5 } },
          { geometry: { coordinates: [10, 20] }, properties: { tec: 5.5 } },
        ],
      }),
    ).toEqual({
      timestamp: null,
      grid: [{ lat: 20, lon: 10, tec: 5.5 }],
    });
  });

  it("returns an empty grid for malformed input", () => {
    expect(compactTECPayload(null)).toEqual({ grid: [], timestamp: null });
    expect(compactTECPayload({})).toEqual({ grid: [], timestamp: null });
    expect(compactTECPayload({ features: "nope" })).toEqual({
      grid: [],
      timestamp: null,
    });
  });
});
