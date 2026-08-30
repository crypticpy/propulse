import { describe, expect, it } from "vitest";

import {
  CONTINENT_ANCHORS,
  daylightWeight,
  globalLitFraction,
  litFraction,
  solarElevationDeg,
} from "./sun.js";

// Fixed instants (UTC) with well-known solar geometry.
const JUNE_SOLSTICE_NOON = Date.UTC(2026, 5, 21, 12, 0); // 2026-06-21 12:00Z
const DEC_SOLSTICE_NOON = Date.UTC(2026, 11, 21, 12, 0); // 2026-12-21 12:00Z
const MARCH_EQUINOX = Date.UTC(2026, 2, 20, 12, 0); // 2026-03-20 12:00Z

describe("solarElevationDeg", () => {
  it("puts the summer-solstice noon sun at ~63° over 50°N, 0°E", () => {
    // 90 − 50 + 23.44 ≈ 63.4; low-precision algo should land within 2°.
    const elev = solarElevationDeg(50, 0, JUNE_SOLSTICE_NOON);
    expect(elev).toBeGreaterThan(61);
    expect(elev).toBeLessThan(66);
  });

  it("puts the winter-solstice noon sun at ~16° over the same point", () => {
    // 90 − 50 − 23.44 ≈ 16.6.
    const elev = solarElevationDeg(50, 0, DEC_SOLSTICE_NOON);
    expect(elev).toBeGreaterThan(14);
    expect(elev).toBeLessThan(19);
  });

  it("has the equinox noon sun near zenith on the equator at 0°E", () => {
    const elev = solarElevationDeg(0, 0, MARCH_EQUINOX);
    expect(elev).toBeGreaterThan(85);
  });

  it("is night in Sydney while it is noon in Greenwich in June", () => {
    expect(solarElevationDeg(-33.9, 151.2, JUNE_SOLSTICE_NOON)).toBeLessThan(
      -6,
    );
  });

  it("respects longitude: local noon tracks the sun around the planet", () => {
    // 12:00Z is midnight-ish at 180°; 00:00Z is noon-ish there.
    const atMidnightSide = solarElevationDeg(0, 180, MARCH_EQUINOX);
    const atNoonSide = solarElevationDeg(0, 180, Date.UTC(2026, 2, 20, 0, 0));
    expect(atMidnightSide).toBeLessThan(-30);
    expect(atNoonSide).toBeGreaterThan(60);
  });
});

describe("daylightWeight", () => {
  it("ramps 0→1 through civil twilight", () => {
    expect(daylightWeight(-10)).toBe(0);
    expect(daylightWeight(-6)).toBe(0);
    expect(daylightWeight(0)).toBeCloseTo(0.5);
    expect(daylightWeight(6)).toBe(1);
    expect(daylightWeight(45)).toBe(1);
  });
});

describe("litFraction", () => {
  it("disagrees between a daylit and a dark continent", () => {
    // 12:00Z in June: Europe fully lit, Oceania fully dark.
    expect(litFraction(CONTINENT_ANCHORS.EU, JUNE_SOLSTICE_NOON)).toBeCloseTo(
      1,
      1,
    );
    expect(litFraction(CONTINENT_ANCHORS.OC, JUNE_SOLSTICE_NOON)).toBeCloseTo(
      0,
      1,
    );
  });

  it("stays within [0, 1] and defaults to 0.5 on an empty anchor set", () => {
    for (const anchors of Object.values(CONTINENT_ANCHORS)) {
      const f = litFraction(anchors, MARCH_EQUINOX);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(litFraction([], MARCH_EQUINOX)).toBe(0.5);
  });
});

describe("globalLitFraction", () => {
  it("oscillates diurnally because anchors cluster in NA/EU/AS", () => {
    // Sample a full day; ham-weighted daylight peaks near 12Z (EU + NA
    // morning) and bottoms out near 03Z (only East Asia lit).
    const samples: number[] = [];
    for (let h = 0; h < 24; h++) {
      samples.push(globalLitFraction(Date.UTC(2026, 2, 20, h, 0)));
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max).toBeGreaterThan(0.6);
    expect(min).toBeLessThan(0.4);
    expect(max - min).toBeGreaterThan(0.25);
  });
});
