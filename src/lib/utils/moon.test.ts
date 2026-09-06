import { describe, expect, it } from "vitest";
import SunCalc from "suncalc";
import {
  equatorialToGalacticLatitudeDeg,
  getMoonConditions,
  getMoonDeclinationDeg,
  getMoonGalacticLatitudeDeg,
  getMoonRangeRateKmS,
  getMoonSnapshot,
  getMoonTopocentricRangeKm,
  getSublunarPoint,
  topocentricRangeKm,
} from "./moon";

const DEG_TO_RAD = Math.PI / 180;

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
  it("keeps lightweight live conditions separate from phase-event searches", () => {
    const at = new Date("2024-06-15T12:00:00Z");
    const conditions = getMoonConditions(at, 40, -105);
    const snapshot = getMoonSnapshot(at, 40, -105);

    expect(conditions).toEqual({
      phase: snapshot.phase,
      illumination: snapshot.illumination,
      phaseName: snapshot.phaseName,
      emoji: snapshot.emoji,
      rise: snapshot.rise,
      set: snapshot.set,
      altitude: snapshot.altitude,
      azimuth: snapshot.azimuth,
      distanceKm: snapshot.distanceKm,
    });
    expect("nextFullMoon" in conditions).toBe(false);
    expect("nextNewMoon" in conditions).toBe(false);
  });

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

describe("getSublunarPoint", () => {
  it.each([
    "2024-01-01T00:00:00Z",
    "2024-06-15T12:00:00Z",
    "2026-08-31T18:30:00Z",
  ])("returns the point where the Moon is overhead at %s", (iso) => {
    const at = new Date(iso);
    const point = getSublunarPoint(at);
    const overhead = SunCalc.getMoonPosition(at, point.lat, point.lon);

    expect(point.lat).toBeGreaterThanOrEqual(-90);
    expect(point.lat).toBeLessThanOrEqual(90);
    expect(point.lon).toBeGreaterThanOrEqual(-180);
    expect(point.lon).toBeLessThan(180);
    expect((overhead.altitude * 180) / Math.PI).toBeGreaterThan(89.9);
  });

  it("moves continuously across the dateline", () => {
    const before = getSublunarPoint(new Date("2024-06-15T12:00:00Z"));
    const after = getSublunarPoint(new Date("2024-06-15T12:01:00Z"));
    const wrappedDelta = Math.abs(
      ((after.lon - before.lon + 540) % 360) - 180,
    );

    expect(wrappedDelta).toBeLessThan(1);
  });
});

describe("getMoonDeclinationDeg", () => {
  it("agrees with the sub-lunar point's latitude (a point is overhead exactly at the Moon's own declination)", () => {
    for (const iso of [
      "2024-01-01T00:00:00Z",
      "2024-06-15T12:00:00Z",
      "2026-08-31T18:30:00Z",
    ]) {
      const at = new Date(iso);
      expect(getMoonDeclinationDeg(at)).toBeCloseTo(
        getSublunarPoint(at).lat,
        9,
      );
    }
  });

  it("stays within the Moon's physically bounded declination range", () => {
    const start = new Date("2024-01-01T00:00:00Z").getTime();
    for (let h = 0; h < 30 * 24; h += 6) {
      const decl = getMoonDeclinationDeg(new Date(start + h * 3_600_000));
      expect(decl).toBeGreaterThanOrEqual(-29);
      expect(decl).toBeLessThanOrEqual(29);
    }
  });
});

describe("getMoonRangeRateKmS", () => {
  // Independent re-derivation of the formula under test, so
  // "matches a manual ... difference" below is an actual cross-check rather
  // than the implementation testing itself. Mirrors the constants and steps
  // documented on `getMoonRangeRateKmS` in moon.ts.
  const EARTH_ROTATION_RAD_S = 7.2921159e-5;
  const EARTH_RADIUS_KM = 6371.0;

  function manualRangeRateKmS(
    at: Date,
    lat: number,
    lon: number,
    deltaSeconds = 60,
  ): number {
    const before = SunCalc.getMoonPosition(
      new Date(at.getTime() - deltaSeconds * 1000),
      lat,
      lon,
    ).distance;
    const after = SunCalc.getMoonPosition(
      new Date(at.getTime() + deltaSeconds * 1000),
      lat,
      lon,
    ).distance;
    const geocentricRateKmS = (after - before) / (2 * deltaSeconds);
    const { altitude, azimuth } = SunCalc.getMoonPosition(at, lat, lon);
    const observerSpeedKmS =
      EARTH_ROTATION_RAD_S * EARTH_RADIUS_KM * Math.cos(lat * DEG_TO_RAD);
    const lineOfSightEastComponent = -Math.sin(azimuth) * Math.cos(altitude);
    return geocentricRateKmS - observerSpeedKmS * lineOfSightEastComponent;
  }

  it("is negative while the Moon is rising toward the east (observer rotation dominates the geocentric orbital term)", () => {
    // 2026-09-12T13:14Z, Austin TX: Moon well below the horizon (alt ~ -6.6
    // deg), azimuth ~ -87 deg from south (near due east) -- rising.
    const at = new Date("2026-09-12T13:14:00Z");
    const rate = getMoonRangeRateKmS(at, 30.27, -97.74);
    expect(rate).toBeLessThan(0);
  });

  it("is positive while the Moon is setting toward the west", () => {
    // 2026-09-26T13:14Z, Austin TX: Moon below the horizon (alt ~ -12.2
    // deg), azimuth ~ +101 deg from south (west of south) -- setting.
    const at = new Date("2026-09-26T13:14:00Z");
    const rate = getMoonRangeRateKmS(at, 30.27, -97.74);
    expect(rate).toBeGreaterThan(0);
  });

  it("matches a manual finite difference plus the observer-rotation correction over the same window", () => {
    const at = new Date("2026-09-12T13:14:00Z");
    const lat = 30.27;
    const lon = -97.74;
    const delta = 60;
    expect(getMoonRangeRateKmS(at, lat, lon, delta)).toBeCloseTo(
      manualRangeRateKmS(at, lat, lon, delta),
      9,
    );
  });

  it("is dominated by the observer's own rotation, not the geocentric orbital term, near the eastern horizon at the equator", () => {
    // 2026-09-05T00:28Z at the equator (0, 0): the Moon is right at
    // moonrise, near due east (az ~ -118 deg from south) -- exactly the
    // geometry where the ~0.46 km/s equatorial rotation term is largest
    // relative to the orbital term (a few hundredths of a km/s).
    const at = new Date("2026-09-05T00:28:00Z");
    const lat = 0;
    const lon = 0;
    const rate = getMoonRangeRateKmS(at, lat, lon);
    const before = SunCalc.getMoonPosition(
      new Date(at.getTime() - 60_000),
      lat,
      lon,
    ).distance;
    const after = SunCalc.getMoonPosition(
      new Date(at.getTime() + 60_000),
      lat,
      lon,
    ).distance;
    const geocentricRateKmS = (after - before) / 120;
    expect(Math.abs(rate)).toBeGreaterThan(Math.abs(geocentricRateKmS) * 5);
  });

  it("flips sign between moonrise and moonset for the same observer", () => {
    const lat = 0;
    const lon = 0;
    const rising = getMoonRangeRateKmS(new Date("2026-09-05T00:28:00Z"), lat, lon);
    const setting = getMoonRangeRateKmS(new Date("2026-09-05T13:06:00Z"), lat, lon);
    expect(rising).toBeLessThan(0);
    expect(setting).toBeGreaterThan(0);
  });
});

describe("equatorialToGalacticLatitudeDeg", () => {
  it("is near zero for a position on the galactic plane (the galactic anticenter, l=180)", () => {
    const b = equatorialToGalacticLatitudeDeg(
      85.65 * DEG_TO_RAD,
      28.93 * DEG_TO_RAD,
    );
    expect(Math.abs(b)).toBeLessThan(5);
  });

  it("is close to +90 for the north galactic pole's own coordinates", () => {
    const b = equatorialToGalacticLatitudeDeg(
      192.85948 * DEG_TO_RAD,
      27.12825 * DEG_TO_RAD,
    );
    expect(b).toBeGreaterThan(85);
  });

  it("is close to -90 for the point antipodal to the north galactic pole", () => {
    const b = equatorialToGalacticLatitudeDeg(
      (192.85948 + 180) * DEG_TO_RAD,
      -27.12825 * DEG_TO_RAD,
    );
    expect(b).toBeLessThan(-85);
  });
});

describe("getMoonGalacticLatitudeDeg", () => {
  it("stays within [-90, 90] across a lunar month", () => {
    const start = new Date("2024-01-01T00:00:00Z").getTime();
    for (let h = 0; h < 30 * 24; h += 6) {
      const b = getMoonGalacticLatitudeDeg(new Date(start + h * 3_600_000));
      expect(b).toBeGreaterThanOrEqual(-90);
      expect(b).toBeLessThanOrEqual(90);
    }
  });

  it("differs from the Moon's declination -- the galactic plane sits ~63 deg from the celestial equator, so the two are not interchangeable", () => {
    const at = new Date("2026-09-05T13:14:00Z");
    const galacticLatitude = getMoonGalacticLatitudeDeg(at);
    const declination = getMoonDeclinationDeg(at);
    expect(Math.abs(galacticLatitude - declination)).toBeGreaterThan(5);
  });
});

describe("topocentricRangeKm", () => {
  const R = 384_400;
  const Re = 6371;

  it("is R - Re at the zenith (h = 90 deg): the observer sits Re closer to the Moon's centre than Earth's own centre does", () => {
    expect(topocentricRangeKm(R, 90, Re)).toBeCloseTo(R - Re, 6);
  });

  it("is sqrt(R^2 + Re^2) at the horizon (h = 0 deg)", () => {
    expect(topocentricRangeKm(R, 0, Re)).toBeCloseTo(
      Math.sqrt(R * R + Re * Re),
      6,
    );
  });

  it("is always at most Re away from the geocentric range, for any altitude", () => {
    for (let h = -90; h <= 90; h += 10) {
      expect(Math.abs(topocentricRangeKm(R, h, Re) - R)).toBeLessThanOrEqual(
        Re + 1e-6,
      );
    }
  });
});

describe("getMoonTopocentricRangeKm", () => {
  it("matches the geocentric distance minus the observer's own radius when the Moon sits at the observer's zenith", () => {
    // The sub-lunar point is, by construction, exactly overhead of itself.
    const at = new Date("2026-09-05T13:14:00Z");
    const sub = getSublunarPoint(at);
    const geocentricKm = getMoonConditions(at, sub.lat, sub.lon).distanceKm;
    const topoKm = getMoonTopocentricRangeKm(at, sub.lat, sub.lon);
    expect(topoKm).toBeCloseTo(geocentricKm - 6371, 0);
  });

  it("differs from the geocentric distance by nearly an Earth radius when the Moon is high overhead", () => {
    // Verified: Moon altitude ~= 85 deg at Austin, TX at this instant -- near
    // the observer's zenith, where `topocentricRangeKm`'s correction is
    // largest (it collapses to `R - Re` exactly at h = 90 deg); it shrinks
    // toward zero back down at the horizon, the opposite of naive parallax
    // intuition, because the observer is closest to the Moon's centre when
    // looking straight up, not when looking along the horizon.
    const at = new Date("2026-09-05T13:14:00Z");
    const lat = 30.27;
    const lon = -97.74;
    const geocentricKm = getMoonConditions(at, lat, lon).distanceKm;
    const topoKm = getMoonTopocentricRangeKm(at, lat, lon);
    expect(Math.abs(topoKm - geocentricKm)).toBeGreaterThan(6000);
  });
});
