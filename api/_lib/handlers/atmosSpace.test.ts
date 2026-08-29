import { describe, expect, it } from "vitest";
import {
  compactTECPayload,
  parseJtwcRss,
  resolveLatestTECGridUrl,
} from "./atmosSpace";

// Trimmed fixture mirroring the real jtwc.rss structure (captured
// 2026-08-29): a mixed WPac/NIO item with one West Pacific and one
// synthetic North Indian Ocean system (to exercise the id-suffix basin
// split), a Southern Hemisphere item with no active systems, and an
// EPAC/CPAC item that must be ignored (NHC's territory, not ours).
const JTWC_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
<title>Current Northwest Pacific/North Indian Ocean* Tropical Systems</title>
<description><![CDATA[<p><b>Typhoon  20W (Bang-lang) Warning #14 </b><br>
<b>Issued at 29/1500Z<b>
Maximum sustained winds 65 kt near 15.2N 128.4E
<ul><li><a href='https://www.metoc.navy.mil/jtwc/products/wp2026web.txt' target='newwin'>TC Warning Text </a></li></ul>
<br>
<p><b>Tropical Storm  01B (TestIO) Warning #05 </b><br>
<b>Issued at 29/1500Z<b>
<ul><li><a href='https://www.metoc.navy.mil/jtwc/products/io0126web.txt' target='newwin'>TC Warning Text </a></li></ul>
]]></description>
<guid>NWPAC-NIO-WARNINGS</guid>
</item>
<item>
<title>Current Central/Eastern Pacific Tropical Systems</title>
<description><![CDATA[<p><b>Tropical Storm  11E (Karina) Warning #08 </b><br>
<b>Issued at 29/1600Z<b>
<ul><li><a href='https://www.metoc.navy.mil/jtwc/products/ep1126web.txt' target='newwin'>TC Warning Text </a></li></ul>
]]></description>
<guid>EPAC-CPAC-WARNINGS</guid>
</item>
<item>
<title>Current Southern Hemisphere Tropical Systems</title>
<description><![CDATA[<ul><li><font color='red'>No Current Tropical Cyclone Warnings.</font></li></ul>
]]></description>
<guid>SH-WARNINGS</guid>
</item>
</channel></rss>`;

describe("JTWC RSS parsing", () => {
  it("extracts systems from the mixed WPac/NIO item, splitting basin by id suffix", () => {
    const cyclones = parseJtwcRss(JTWC_FIXTURE);
    expect(cyclones).toHaveLength(2);

    const typhoon = cyclones.find((c) => c.id === "20W");
    expect(typhoon).toMatchObject({
      name: "Bang-lang",
      basin: "wpac",
      category: "Typhoon",
      warningNumber: 14,
      lat: 15.2,
      lon: 128.4,
      maxWinds: 65,
      link: "https://www.metoc.navy.mil/jtwc/products/wp2026web.txt",
    });

    const io = cyclones.find((c) => c.id === "01B");
    expect(io).toMatchObject({
      name: "TestIO",
      basin: "io",
      warningNumber: 5,
      lat: null,
      lon: null,
      maxWinds: null,
    });
  });

  it("ignores EPAC/CPAC (NHC's territory) and yields nothing for an empty SH item", () => {
    const cyclones = parseJtwcRss(JTWC_FIXTURE);
    expect(cyclones.some((c) => c.id === "11E")).toBe(false);
  });

  it("returns an empty array for empty or malformed input", () => {
    expect(parseJtwcRss("")).toEqual([]);
    expect(parseJtwcRss("<rss><channel></channel></rss>")).toEqual([]);
  });
});

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
