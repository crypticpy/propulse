import { describe, expect, it } from "vitest";
import SunCalc from "suncalc";
import { getMoonSnapshot } from "./moon";

const ALL_PHASE_NAMES = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

describe("getMoonSnapshot", () => {
  it("returns a phase within [0, 1)", () => {
    const snapshot = getMoonSnapshot(new Date("2024-06-15T12:00:00Z"), 40, -105);
    expect(snapshot.phase).toBeGreaterThanOrEqual(0);
    expect(snapshot.phase).toBeLessThan(1);
  });

  it("reaches all 8 phase-name buckets across a lunar month", () => {
    const start = new Date("2024-01-01T00:00:00Z").getTime();
    const seen = new Set<string>();
    // Sample hourly across ~30 days (a full lunar cycle is ~29.53 days).
    for (let h = 0; h < 30 * 24; h += 1) {
      const snapshot = getMoonSnapshot(new Date(start + h * 3_600_000), 40, -105);
      seen.add(snapshot.phaseName);
    }
    expect([...seen].sort()).toEqual([...ALL_PHASE_NAMES].sort());
  });

  it("emoji matches the reported phase name", () => {
    const snapshot = getMoonSnapshot(new Date("2024-01-01T00:00:00Z"), 40, -105);
    const expectedEmoji: Record<string, string> = {
      "New Moon": "\u{1F311}",
      "Waxing Crescent": "\u{1F312}",
      "First Quarter": "\u{1F313}",
      "Waxing Gibbous": "\u{1F314}",
      "Full Moon": "\u{1F315}",
      "Waning Gibbous": "\u{1F316}",
      "Last Quarter": "\u{1F317}",
      "Waning Crescent": "\u{1F318}",
    };
    expect(snapshot.emoji).toBe(expectedEmoji[snapshot.phaseName]);
  });

  it.each([
    new Date("2024-01-01T00:00:00Z"),
    new Date("2024-06-15T12:00:00Z"),
    new Date("2025-03-01T00:00:00Z"),
    new Date("2026-08-29T00:00:00Z"),
    new Date("2027-12-31T00:00:00Z"),
  ])(
    "finds a next full moon within 31 days where illumination is >0.98 (%s)",
    (at) => {
      const snapshot = getMoonSnapshot(at, 40, -105);
      const daysAhead =
        (snapshot.nextFullMoon.getTime() - at.getTime()) / 86_400_000;
      expect(daysAhead).toBeGreaterThanOrEqual(0);
      expect(daysAhead).toBeLessThanOrEqual(31);
      expect(
        SunCalc.getMoonIllumination(snapshot.nextFullMoon).fraction,
      ).toBeGreaterThan(0.98);
    },
  );

  it.each([
    new Date("2024-01-01T00:00:00Z"),
    new Date("2024-06-15T12:00:00Z"),
    new Date("2025-03-01T00:00:00Z"),
    new Date("2026-08-29T00:00:00Z"),
    new Date("2027-12-31T00:00:00Z"),
  ])(
    "finds a next new moon within 31 days where illumination is <0.02 (%s)",
    (at) => {
      const snapshot = getMoonSnapshot(at, 40, -105);
      const daysAhead =
        (snapshot.nextNewMoon.getTime() - at.getTime()) / 86_400_000;
      expect(daysAhead).toBeGreaterThanOrEqual(0);
      expect(daysAhead).toBeLessThanOrEqual(31);
      expect(
        SunCalc.getMoonIllumination(snapshot.nextNewMoon).fraction,
      ).toBeLessThan(0.02);
    },
  );

  it("returns azimuth in [0, 360)", () => {
    const snapshot = getMoonSnapshot(new Date("2024-06-15T12:00:00Z"), 40, -105);
    expect(snapshot.azimuth).toBeGreaterThanOrEqual(0);
    expect(snapshot.azimuth).toBeLessThan(360);
  });

  it("finds both moonrise and moonset for a mid-latitude observer on a day that has both", () => {
    // Verified against suncalc directly: 2024-06-01 at 40N/-105W has both a
    // moonrise (~08:07 UTC) and a moonset (~20:05 UTC).
    const snapshot = getMoonSnapshot(new Date("2024-06-01T00:00:00Z"), 40, -105);
    expect(snapshot.rise).not.toBeNull();
    expect(snapshot.set).not.toBeNull();
  });

  it("returns a plausible lunar distance in km", () => {
    const snapshot = getMoonSnapshot(new Date("2024-06-15T12:00:00Z"), 40, -105);
    expect(snapshot.distanceKm).toBeGreaterThan(356_000);
    expect(snapshot.distanceKm).toBeLessThan(407_000);
  });
});
