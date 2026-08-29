import { describe, expect, it } from "vitest";
import { getPlanetVisibilities, type PlanetName } from "./planets";

const LAT = 40;
const LON = -105;

// ~20 dates spread across 2024-2027, at varying times of day, to exercise
// the model across multiple planetary configurations and seasons.
const SWEEP_DATES = [
  new Date("2024-01-15T03:00:00Z"),
  new Date("2024-03-01T09:00:00Z"),
  new Date("2024-04-20T15:00:00Z"),
  new Date("2024-06-15T21:00:00Z"),
  new Date("2024-08-01T00:00:00Z"),
  new Date("2024-09-23T06:00:00Z"),
  new Date("2024-11-10T12:00:00Z"),
  new Date("2024-12-25T18:00:00Z"),
  new Date("2025-02-14T04:00:00Z"),
  new Date("2025-04-05T10:00:00Z"),
  new Date("2025-05-22T16:00:00Z"),
  new Date("2025-07-04T22:00:00Z"),
  new Date("2025-09-01T01:00:00Z"),
  new Date("2025-10-31T07:00:00Z"),
  new Date("2025-12-21T13:00:00Z"),
  new Date("2026-02-01T19:00:00Z"),
  new Date("2026-04-15T02:00:00Z"),
  new Date("2026-06-30T08:00:00Z"),
  new Date("2026-09-15T14:00:00Z"),
  new Date("2027-01-01T20:00:00Z"),
];

const ALL_PLANETS: PlanetName[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

describe("getPlanetVisibilities", () => {
  it("returns all five planets exactly once", () => {
    for (const date of SWEEP_DATES) {
      const results = getPlanetVisibilities(date, LAT, LON);
      expect(results).toHaveLength(5);
      const names = results.map((r) => r.planet).sort();
      expect(names).toEqual([...ALL_PLANETS].sort());
    }
  });

  it("is deterministic across repeated calls", () => {
    const date = SWEEP_DATES[3];
    const first = getPlanetVisibilities(date, LAT, LON);
    const second = getPlanetVisibilities(date, LAT, LON);
    expect(second).toEqual(first);
  });

  it("keeps ra/dec/elongation within valid ranges for every planet and date", () => {
    for (const date of SWEEP_DATES) {
      for (const result of getPlanetVisibilities(date, LAT, LON)) {
        expect(result.ra).toBeGreaterThanOrEqual(0);
        expect(result.ra).toBeLessThan(360);
        expect(result.dec).toBeGreaterThanOrEqual(-90);
        expect(result.dec).toBeLessThanOrEqual(90);
        expect(result.elongation).toBeGreaterThanOrEqual(0);
        expect(result.elongation).toBeLessThanOrEqual(180);
        expect(result.azimuth).toBeGreaterThanOrEqual(0);
        expect(result.azimuth).toBeLessThan(360);
      }
    }
  });

  it("keeps Mercury's elongation within its physical max (~28deg) and Venus within its (~48deg)", () => {
    for (const date of SWEEP_DATES) {
      const results = getPlanetVisibilities(date, LAT, LON);
      const mercury = results.find((r) => r.planet === "Mercury")!;
      const venus = results.find((r) => r.planet === "Venus")!;
      expect(mercury.elongation).toBeLessThan(28.5);
      expect(venus.elongation).toBeLessThan(48.5);
    }
  });

  it("keeps Venus magnitude within its known apparent-magnitude range", () => {
    for (const date of SWEEP_DATES) {
      const venus = getPlanetVisibilities(date, LAT, LON).find((r) => r.planet === "Venus")!;
      expect(venus.magnitude).toBeGreaterThanOrEqual(-5);
      expect(venus.magnitude).toBeLessThanOrEqual(-3.2);
    }
  });

  it("keeps Jupiter magnitude within its known apparent-magnitude range", () => {
    for (const date of SWEEP_DATES) {
      const jupiter = getPlanetVisibilities(date, LAT, LON).find((r) => r.planet === "Jupiter")!;
      expect(jupiter.magnitude).toBeGreaterThanOrEqual(-3.0);
      expect(jupiter.magnitude).toBeLessThanOrEqual(-1.5);
    }
  });

  it("keeps Mars magnitude within its known apparent-magnitude range (a physical sanity check on geocentric distance)", () => {
    // Mars' apparent magnitude is a direct function of its Sun-Mars and
    // Earth-Mars distances; bounding it to its known real-world range is an
    // indirect check that the model's Mars-Earth geocentric distance stays
    // physically plausible across the sweep.
    for (const date of SWEEP_DATES) {
      const mars = getPlanetVisibilities(date, LAT, LON).find((r) => r.planet === "Mars")!;
      expect(mars.magnitude).toBeGreaterThanOrEqual(-3.0);
      expect(mars.magnitude).toBeLessThanOrEqual(2.0);
    }
  });

  it("assigns a valid visibility bucket to every planet", () => {
    const valid = new Set(["evening", "morning", "all-night", "not-visible"]);
    for (const date of SWEEP_DATES) {
      for (const result of getPlanetVisibilities(date, LAT, LON)) {
        expect(valid.has(result.visibility)).toBe(true);
      }
    }
  });
});
