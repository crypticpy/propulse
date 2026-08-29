import { describe, expect, it } from "vitest";
import {
  compactMetarPayload,
  normalizeMetarStation,
  parseBbox,
  parseIds,
} from "./metar";

describe("parseIds", () => {
  it("accepts a comma list of valid ICAO codes", () => {
    expect(parseIds("kjfk, klax,KORD")).toEqual({
      ok: true,
      ids: ["KJFK", "KLAX", "KORD"],
    });
  });

  it("accepts 3-letter and 4-letter codes", () => {
    expect(parseIds("KJFK,ABC")).toEqual({ ok: true, ids: ["KJFK", "ABC"] });
  });

  it("rejects more than 10 ids", () => {
    const ids = Array.from({ length: 11 }, (_, i) => `K${String(i).padStart(3, "0")}`);
    const result = parseIds(ids.join(","));
    expect(result.ok).toBe(false);
  });

  it("rejects malformed ids", () => {
    expect(parseIds("KJFK,!!").ok).toBe(false);
    expect(parseIds("TOOLONGID").ok).toBe(false);
  });

  it("rejects empty input", () => {
    expect(parseIds(" , ").ok).toBe(false);
  });
});

describe("parseBbox", () => {
  it("accepts a valid small box", () => {
    expect(parseBbox("30,-90,32,-88")).toEqual({
      ok: true,
      bbox: { minLat: 30, minLon: -90, maxLat: 32, maxLon: -88 },
    });
  });

  it("rejects a box larger than 4 degrees on an axis", () => {
    expect(parseBbox("30,-90,36,-88").ok).toBe(false);
    expect(parseBbox("30,-90,32,-80").ok).toBe(false);
  });

  it("rejects out-of-range latitude/longitude", () => {
    expect(parseBbox("-95,-90,32,-88").ok).toBe(false);
    expect(parseBbox("30,-190,32,-88").ok).toBe(false);
  });

  it("rejects inverted ranges", () => {
    expect(parseBbox("32,-90,30,-88").ok).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(parseBbox("30,-90,32").ok).toBe(false);
    expect(parseBbox("a,b,c,d").ok).toBe(false);
  });
});

describe("normalizeMetarStation", () => {
  it("picks the panel-relevant fields and preserves nulls for missing ones", () => {
    expect(
      normalizeMetarStation({
        icaoId: "KJFK",
        name: "New York/JF Kennedy Intl, NY, US",
        lat: 40.6392,
        lon: -73.7639,
        obsTime: 1788025860,
        temp: 25,
        dewp: 10,
        wdir: 40,
        wspd: 5,
        visib: "10+",
        altim: 1023.8,
        wxString: undefined,
        cover: "SCT",
        clouds: [{ cover: "FEW", base: 6000 }],
        fltCat: "VFR",
        rawOb: "METAR KJFK 291751Z ...",
      }),
    ).toEqual({
      icaoId: "KJFK",
      name: "New York/JF Kennedy Intl, NY, US",
      lat: 40.6392,
      lon: -73.7639,
      obsTime: 1788025860,
      temp: 25,
      dewp: 10,
      wdir: 40,
      wspd: 5,
      wgst: null,
      visib: "10+",
      altim: 1023.8,
      wxString: null,
      cldCvg: "SCT",
      clouds: [{ cover: "FEW", base: 6000 }],
      fltCat: "VFR",
      rawOb: "METAR KJFK 291751Z ...",
    });
  });

  it("defaults clouds to an empty array when absent", () => {
    expect(normalizeMetarStation({ icaoId: "KLAX" }).clouds).toEqual([]);
  });
});

describe("compactMetarPayload", () => {
  it("returns an empty, untruncated payload for non-array input", () => {
    expect(compactMetarPayload(null)).toEqual({ stations: [], truncated: false });
  });

  it("passes through stations under the cap", () => {
    const raw = [{ icaoId: "KJFK" }, { icaoId: "KLAX" }];
    const result = compactMetarPayload(raw);
    expect(result.truncated).toBe(false);
    expect(result.stations).toHaveLength(2);
  });

  it("truncates to 200 stations and sets truncated when over the cap", () => {
    const raw = Array.from({ length: 250 }, (_, i) => ({ icaoId: `K${i}` }));
    const result = compactMetarPayload(raw);
    expect(result.truncated).toBe(true);
    expect(result.stations).toHaveLength(200);
  });

  it("truncates on oversized byte size even under the station-count cap", () => {
    const raw = [{ icaoId: "KJFK" }];
    const result = compactMetarPayload(raw, true);
    expect(result.truncated).toBe(true);
    expect(result.stations).toHaveLength(1);
  });
});
