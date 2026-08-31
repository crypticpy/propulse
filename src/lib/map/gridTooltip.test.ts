import { describe, expect, it } from "vitest";
import {
  liveSpotsInGrid,
  mergeGridSpots,
  type GridMatchableSpot,
} from "./gridTooltip";
import type { DXSpot } from "@/types/dxcluster";

/** EM10 spans lon -98..-96, lat 30..31 — pick a point inside it. */
const EM10 = { lat: 30.5, lon: -97.0 };
/** FN31 spans lon -74..-72, lat 41..42. */
const FN31 = { lat: 41.5, lon: -73.0 };

function spot(overrides: Partial<GridMatchableSpot> = {}): GridMatchableSpot {
  return {
    id: "spot-1",
    callsign: "N5XXX",
    spotter: "W1ABC",
    frequency: 14074,
    mode: "FT8",
    time: new Date("2026-08-30T12:00:00Z"),
    dxLat: EM10.lat,
    dxLon: EM10.lon,
    spotterLat: FN31.lat,
    spotterLon: FN31.lon,
    dxLocApprox: false,
    spotterLocApprox: false,
    ...overrides,
  };
}

describe("liveSpotsInGrid", () => {
  it("matches on the DX position", () => {
    expect(liveSpotsInGrid([spot()], "EM10")).toHaveLength(1);
  });

  it("matches on the spotter position", () => {
    expect(liveSpotsInGrid([spot()], "FN31")).toHaveLength(1);
  });

  it("does not match an unrelated grid", () => {
    expect(liveSpotsInGrid([spot()], "JO22")).toHaveLength(0);
  });

  it("accepts a 6-char locator and matches on its 4-char square", () => {
    // The globe reports a 6-char grid under the cursor; squares are 4-char.
    expect(liveSpotsInGrid([spot()], "EM10dx")).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    expect(liveSpotsInGrid([spot()], "em10")).toHaveLength(1);
  });

  it("ignores a DX position that is only a prefix centroid", () => {
    const approx = spot({ dxLocApprox: true });
    // DX no longer counts for EM10...
    expect(liveSpotsInGrid([approx], "EM10")).toHaveLength(0);
    // ...but the real spotter locator still matches its own square.
    expect(liveSpotsInGrid([approx], "FN31")).toHaveLength(1);
  });

  it("ignores a spotter position that is only a prefix centroid", () => {
    const approx = spot({ spotterLocApprox: true });
    expect(liveSpotsInGrid([approx], "FN31")).toHaveLength(0);
    expect(liveSpotsInGrid([approx], "EM10")).toHaveLength(1);
  });

  it("skips non-finite coordinates instead of throwing", () => {
    const broken = spot({ dxLat: Number.NaN, dxLon: Number.NaN });
    expect(() => liveSpotsInGrid([broken], "EM10")).not.toThrow();
    expect(liveSpotsInGrid([broken], "EM10")).toHaveLength(0);
  });

  it("returns nothing for a grid shorter than a square", () => {
    expect(liveSpotsInGrid([spot()], "EM")).toHaveLength(0);
    expect(liveSpotsInGrid([spot()], "")).toHaveLength(0);
  });

  it("carries callsign, frequency and derived band onto the result", () => {
    const [match] = liveSpotsInGrid([spot()], "EM10");
    expect(match.dx).toBe("N5XXX");
    expect(match.spotter).toBe("W1ABC");
    expect(match.frequency).toBe(14074);
    expect(match.band).toBe("20m");
    expect(match.dxGrid).toBe("EM10");
  });
});

describe("mergeGridSpots", () => {
  const cluster: DXSpot = {
    id: "shared",
    spotter: "W1ABC",
    dx: "N5XXX",
    frequency: 14074,
    comment: "cluster record",
    time: new Date("2026-08-30T12:00:00Z"),
  };

  it("keeps both sources when ids differ", () => {
    const live = liveSpotsInGrid([spot({ id: "live-1" })], "EM10");
    expect(mergeGridSpots([cluster], live)).toHaveLength(2);
  });

  it("drops the live copy when a cluster spot already has that id", () => {
    const live = liveSpotsInGrid([spot({ id: "shared" })], "EM10");
    const merged = mergeGridSpots([cluster], live);
    expect(merged).toHaveLength(1);
    expect(merged[0].comment).toBe("cluster record");
  });

  it("returns live spots when there are no cluster spots", () => {
    const live = liveSpotsInGrid([spot()], "EM10");
    expect(mergeGridSpots([], live)).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const clusterList = [cluster];
    const live = liveSpotsInGrid([spot({ id: "live-1" })], "EM10");
    mergeGridSpots(clusterList, live);
    expect(clusterList).toHaveLength(1);
    expect(live).toHaveLength(1);
  });
});
