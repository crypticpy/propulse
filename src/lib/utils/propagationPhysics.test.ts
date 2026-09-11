/**
 * Physical sanity tests for the propagation engine after the ITU-R P.533/P.372
 * correctness pass. These use loose physical bounds rather than brittle exact
 * values -- the point is that the ABSOLUTE numbers are now defensible (the
 * previous errors partly cancelled: foF2 too low x elevation too high).
 */

import { describe, it, expect } from "vitest";
import {
  calculateM3000F2,
  calculateDLayerAbsorption,
  calculateZenithAngle,
  getAbsorptionAtLocation,
  modifiedDipAngle,
  estimateFoF2,
  calculateF0F2,
  sfiToR12,
  obliqueIncidenceAngle,
  solarNoonZenithAngle,
} from "./ionosphere";
import {
  evaluateHopQuality,
  hopElevationAngle,
  calculateMUF,
} from "./rayTrace";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import { dRegionAbsorption } from "@/lib/propagation/absorption/dRegion";
import {
  isSignalDecodable,
  calculateExpectedSNR,
  MODE_PARAMETERS,
} from "./signal";
import { getManMadeNoise } from "./noiseModel";
import { getGeomagneticLatitude } from "./geomagnetic";

// Equinox so solar declination ~= 0; a 40N reflection point sits at the
// central meridian (lon 0), so UTC 12:00 is local noon and UTC 00:00 midnight.
const NOON = new Date(Date.UTC(2024, 2, 20, 12, 0, 0));
const MIDNIGHT = new Date(Date.UTC(2024, 2, 20, 0, 0, 0));

describe("item 1 - M(3000)F2 Shimazaki inverse", () => {
  it("yields ~3.0-3.5 for typical F2 heights, not the saturated 4.5 ceiling", () => {
    expect(calculateM3000F2(250)).toBeGreaterThan(3.0);
    expect(calculateM3000F2(250)).toBeLessThan(3.6);
    expect(calculateM3000F2(300)).toBeGreaterThan(2.9);
    expect(calculateM3000F2(300)).toBeLessThan(3.4);
    // Previously always clamped to 4.5 because of the km/Mm units bug.
    expect(calculateM3000F2(280)).toBeLessThan(4.0);
  });
  it("is monotonically decreasing with height", () => {
    expect(calculateM3000F2(250)).toBeGreaterThan(calculateM3000F2(320));
  });
});

describe("item 2 - spherical hop geometry", () => {
  it("gives a realistic ~4-5 deg take-off elevation for a 3000 km / 300 km hop", () => {
    const elev = hopElevationAngle(3000, 300);
    expect(elev).toBeGreaterThan(4);
    expect(elev).toBeLessThan(5);
  });
  it("produces a secant-law MUF factor of ~3.0-3.6", () => {
    const elev = hopElevationAngle(3000, 300);
    const factor = calculateMUF(1, elev, 300); // foF2 = 1 -> factor = sec(i)
    expect(factor).toBeGreaterThan(3.0);
    expect(factor).toBeLessThan(3.6);
  });
  it("returns vertical incidence (0 deg) for a 90 deg take-off", () => {
    expect(obliqueIncidenceAngle(90, 300)).toBeCloseTo(0, 5);
  });
});

describe("item 2/3 - reference-path MUF magnitudes", () => {
  it("18-35 MHz for a 3000 km hop at SFI 120, noon mid-latitude", () => {
    const hop = evaluateHopQuality(40, 0, 14, NOON, 120, 2, 3000);
    expect(hop.muf).toBeGreaterThanOrEqual(18);
    expect(hop.muf).toBeLessThanOrEqual(35);
  });
  it("8-18 MHz for the same path at local midnight", () => {
    const hop = evaluateHopQuality(40, 0, 14, MIDNIGHT, 120, 2, 3000);
    expect(hop.muf).toBeGreaterThanOrEqual(8);
    expect(hop.muf).toBeLessThanOrEqual(18);
  });
  it("daytime MUF exceeds nighttime MUF", () => {
    const day = evaluateHopQuality(40, 0, 14, NOON, 120, 2, 3000);
    const night = evaluateHopQuality(40, 0, 14, MIDNIGHT, 120, 2, 3000);
    expect(day.muf).toBeGreaterThan(night.muf);
  });
});

describe("item 3 - shared foF2 estimator (CCIR/URSI magnitudes)", () => {
  it("mid-latitude daytime foF2 ~6-8 MHz at SFI 70", () => {
    const f = estimateFoF2(45, 70);
    expect(f).toBeGreaterThan(6);
    expect(f).toBeLessThan(8.5);
  });
  it("mid-latitude daytime foF2 ~9-12 MHz at SFI 150-200", () => {
    expect(estimateFoF2(45, 150)).toBeGreaterThan(9);
    expect(estimateFoF2(45, 200)).toBeLessThan(13);
  });
  it("night foF2 is 40-60% of daytime with a solar-scaled floor", () => {
    const day = estimateFoF2(30, 150);
    const night = estimateFoF2(140, 150);
    expect(night).toBeGreaterThan(0.35 * day);
    expect(night).toBeLessThan(0.65 * day);
    expect(night).toBeGreaterThan(2); // floor
  });
  it("calculateF0F2 delegates to the same calibration (day > night, realistic noon)", () => {
    const noonF = calculateF0F2(150, 45, 12, 3);
    const nightF = calculateF0F2(150, 45, 0, 3);
    expect(noonF).toBeGreaterThan(8);
    expect(noonF).toBeLessThan(13);
    expect(noonF).toBeGreaterThan(nightF);
  });
});

describe("item 4/12 - D-layer absorption", () => {
  it("7 MHz noon near-vertical absorbs a few dB, not a tuned 10-20", () => {
    // PROP-03 #949. The bound moved because the model did: equation (21)'s
    // absorption term now exists, so the magnitude is set by ATnoon and the
    // penetration factor rather than by a bare coefficient of 677.
    const abs7 = calculateDLayerAbsorption(7, 20, 120);
    expect(abs7).toBeGreaterThan(5);
    expect(abs7).toBeLessThan(20);
  });
  it("21 MHz absorbs much less than 7 MHz at the same conditions", () => {
    const abs7 = calculateDLayerAbsorption(7, 20, 120);
    const abs21 = calculateDLayerAbsorption(21, 20, 120);
    expect(abs21).toBeLessThan(4);
    expect(abs7).toBeGreaterThan(abs21 * 3);
  });
  it("an oblique (low-elevation) ray is absorbed more than a vertical one", () => {
    const vertical = calculateDLayerAbsorption(10, 20, 120, 90);
    const oblique = calculateDLayerAbsorption(10, 20, 120, 6);
    expect(oblique).toBeGreaterThan(vertical * 2);
  });
  it("keeps a small night-time residue instead of switching off at 98 deg", () => {
    // The replaced model ramped absorption to exactly zero between 90 and 98
    // degrees of solar zenith angle and returned 0 beyond. ITU-R P.533-14 does
    // not: it clips the zenith angle at 102 degrees and floors F(chi) at 0.02,
    // which leaves a small residue. A D region that vanishes at a hard
    // threshold is a discontinuity no measurement supports.
    const night = calculateDLayerAbsorption(7, 120, 120);
    const noon = calculateDLayerAbsorption(7, 20, 120);
    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(noon / 5);

    // ...and the old 98 degree cliff is gone. The 0.12 dB step that remains
    // is not this model's: `calculateF0E` still switches its own E layer off
    // at exactly 98 degrees, which moves the penetration factor. That belongs
    // to the climatology leaf (#953), not to equation (20).
    const before = calculateDLayerAbsorption(7, 97.9, 120);
    const after = calculateDLayerAbsorption(7, 98.1, 120);
    expect(Math.abs(after - before)).toBeLessThan(0.2);
  });

  it("reproduces the P.533-14 reference magnitude on the audit circuit", () => {
    // 40 N, March, local noon, one 3000 km hop at hr = 300 km, 14 MHz,
    // SSN 100, foE 3.4 MHz. Measured from the pinned reference build:
    // Li = 14.3536 dB. The replaced expression gave 17.118 dB here, and gave
    // it for structurally wrong reasons: no absorption term, the obliquity
    // secant at 90 km instead of 110 km, and 1 + 0.003 R12 for the activity
    // factor.
    const geometry = hopGeometry({
      groundDistanceKm: 3000,
      hopCount: 1,
      mirrorHeightKm: 300,
    });
    if (geometry.kind !== "supported") throw new Error("expected a hop");
    const crossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 16.5,
      zenithNoonAngleDeg: 16.5,
    };
    const li = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;
    expect(Math.abs(10 * Math.log10(li / 14.3536))).toBeLessThan(0.25);
  });

  it("attenuates away from local noon instead of copying the noon angle", () => {
    // PR #1106 round 1, Codex P1. The positionless entry points used to
    // default the noon zenith angle to the current one, which makes
    // F(chi)/F(chi_noon) identically 1 and deletes the diurnal term of
    // equation (21): every hour absorbed like local noon. The declared
    // crossing is 45 N in March, an equinox month, so its noon angle is
    // |45 - 0| = 45 degrees and the ratio is a real number at every other
    // hour.
    const noon = calculateDLayerAbsorption(7, 45, 150);
    const midAfternoon = calculateDLayerAbsorption(7, 70, 150);
    const evening = calculateDLayerAbsorption(7, 85, 150);
    expect(midAfternoon).toBeLessThan(noon);
    expect(evening).toBeLessThan(midAfternoon);
    expect(noon).toBeCloseTo(9.3587, 3);
    expect(midAfternoon).toBeCloseTo(5.4664, 3);

    // A caller that holds the instant gets the honest declination rather
    // than the equinox stand-in.
    const solstice = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const derived = calculateDLayerAbsorption(7, 40, 150, 90, {
      latitudeDeg: 60,
      date: solstice,
    });
    const declared = calculateDLayerAbsorption(7, 40, 150, 90, {
      latitudeDeg: 60,
      zenithNoonAngleDeg: solarNoonZenithAngle(60, solstice),
    });
    expect(derived).toBe(declared);
    expect(solarNoonZenithAngle(60, solstice)).toBeLessThan(60);
  });

  it("uses the position and season it was given, not the stand-in crossing", () => {
    // Two crossings with the same instantaneous solar zenith angle and
    // nothing else in common: 10 degrees north at the June solstice and 40
    // degrees north at the December one. Equation (21) is a function of
    // latitude, season, modified dip and the crossing's own local-noon angle,
    // so these cannot absorb the same amount. The helper holds all four and
    // used to throw them away, calling the adapter with a frequency and a
    // zenith angle only, which pinned every location to the declared 45
    // degrees north, March, dip 60 stand-in.
    const tropicalJune = new Date("2026-06-21T16:51:09Z");
    const temperateDecember = new Date("2026-12-21T14:05:05Z");
    expect(calculateZenithAngle(10, 0, tropicalJune)).toBeCloseTo(70, 3);
    expect(calculateZenithAngle(40, 0, temperateDecember)).toBeCloseTo(70, 3);

    const tropical = getAbsorptionAtLocation(10, 0, tropicalJune, 7, 150);
    const temperate = getAbsorptionAtLocation(40, 0, temperateDecember, 7, 150);
    expect(tropical).not.toBeCloseTo(temperate, 3);

    // And each one is the adapter called with that crossing's own context,
    // not a number this test invented.
    expect(tropical).toBe(
      calculateDLayerAbsorption(
        7,
        calculateZenithAngle(10, 0, tropicalJune),
        150,
        90,
        {
          latitudeDeg: 10,
          monthIndex: tropicalJune.getUTCMonth(),
          modifiedDipDeg: modifiedDipAngle(10, 0),
          date: tropicalJune,
        },
      ),
    );
  });

  it("no longer clamps absorption at 50 dB", () => {
    // 1.8 MHz at local noon is genuinely opaque. Saturating it at 50 dB made
    // every deeply absorbed circuit look identical.
    expect(calculateDLayerAbsorption(1.8, 10, 200, 5)).toBeGreaterThan(50);
  });
  it("takes the tangent of the inclination, not the inclination itself", () => {
    // The modified dip is atan(tan(I) / sqrt(cos(latitude))). The reference
    // harness supplies the diurnal exponent with dip = tan(moddip) at latitude
    // zero, where the modified dip reduces to atan(dip), which fixes the
    // convention. Passing I itself as the numerator produced 52.8 degrees at
    // 45 degrees geomagnetic latitude where 67.2 is correct, and selected the
    // wrong exponent everywhere but the geomagnetic equator and the poles.
    const gm = getGeomagneticLatitude(45, -158);
    expect(gm).toBeCloseTo(45, 1);
    expect(modifiedDipAngle(45, -158)).toBeCloseTo(67.2, 1);

    // On the geographic equator sqrt(cos(latitude)) is 1, so the modified dip
    // is the dipole inclination itself. This is the harness's own case.
    const equatorial =
      (Math.atan(2 * Math.tan((2.7723144829971615 * Math.PI) / 180)) * 180) /
      Math.PI;
    expect(modifiedDipAngle(0, 0)).toBeCloseTo(equatorial, 9);

    // The ends are unmoved: the geomagnetic equator is zero and the pole is 90.
    expect(getGeomagneticLatitude(-2.8, 0)).toBeCloseTo(0, 1);
    expect(modifiedDipAngle(-2.8, 0)).toBeLessThan(0.05);
    expect(getGeomagneticLatitude(80.5, -72)).toBeCloseTo(89.8, 1);
    expect(modifiedDipAngle(80.5, -72)).toBeCloseTo(90, 1);
  });

  it("sfiToR12 inverts the canonical SFI = 63.7 + 0.728*R12 relation", () => {
    expect(sfiToR12(63.7)).toBeCloseTo(0, 5);
    expect(sfiToR12(120)).toBeCloseTo((120 - 63.7) / 0.728, 5);
    expect(sfiToR12(50)).toBe(0); // clamped >= 0
  });
});

describe("item 6 - ITU-R P.372 man-made noise coefficients", () => {
  // At 1 MHz, log10(f) = 0, so Fam == c (the coefficient at 3 MHz reference form).
  it("uses correct Fam categories (not shifted one step too quiet)", () => {
    expect(getManMadeNoise(1, "city")).toBeCloseTo(76.8, 1);
    expect(getManMadeNoise(1, "residential")).toBeCloseTo(72.5, 1);
    expect(getManMadeNoise(1, "rural")).toBeCloseTo(67.2, 1);
    expect(getManMadeNoise(1, "quiet_rural")).toBeCloseTo(53.6, 1);
  });
  it("noise decreases from city to quiet-rural", () => {
    const f = 7;
    expect(getManMadeNoise(f, "city")).toBeGreaterThan(
      getManMadeNoise(f, "residential"),
    );
    expect(getManMadeNoise(f, "residential")).toBeGreaterThan(
      getManMadeNoise(f, "rural"),
    );
    expect(getManMadeNoise(f, "rural")).toBeGreaterThan(
      getManMadeNoise(f, "quiet_rural"),
    );
  });
});

describe("item 7/8 - mode thresholds in 2500 Hz reference bandwidth", () => {
  it("stores the published/quoted 2500 Hz-referenced thresholds", () => {
    expect(MODE_PARAMETERS.FT8.minSNR).toBe(-21);
    expect(MODE_PARAMETERS.CW.minSNR).toBe(-8);
    expect(MODE_PARAMETERS.SSB.minSNR).toBe(3);
    expect(MODE_PARAMETERS.RTTY.minSNR).toBe(-5);
  });
  it("computes SNR in a mode-independent 2500 Hz reference (no narrow-BW optimism)", () => {
    // Previously FT8's 50 Hz noise floor inflated SNR ~17 dB above SSB's.
    const snrFT8 = calculateExpectedSNR(100, 140, "FT8", 0, 14);
    const snrSSB = calculateExpectedSNR(100, 140, "SSB", 0, 14);
    expect(snrFT8).toBeCloseTo(snrSSB, 5);
  });
  it("FT8 is workable at an SNR where SSB is not", () => {
    const snr = -10; // dB in 2500 Hz reference
    expect(isSignalDecodable(snr, "FT8")).toBe(true);
    expect(isSignalDecodable(snr, "SSB")).toBe(false);
  });
});

describe("item 9 - auroral penalty uses geomagnetic latitude", () => {
  it("does not storm-penalise a high geographic latitude that is geomagnetically benign", () => {
    // 55N/90E (central Asia) is at ~46 deg geomagnetic latitude -- below the
    // 60 deg auroral threshold -- even though a raw |lat| > 55 test would flag
    // it. Its score must therefore be invariant to Kp.
    const quiet = evaluateHopQuality(55, 90, 14, NOON, 120, 1, 3000);
    const storm = evaluateHopQuality(55, 90, 14, NOON, 120, 9, 3000);
    expect(storm.qualityScore).toBe(quiet.qualityScore);
  });
  it("still penalises a genuinely auroral (high geomagnetic latitude) point under high Kp", () => {
    // 55N/95W (central Canada) is at ~63 deg geomagnetic latitude -- above the
    // threshold -- so a geomagnetic storm should degrade it.
    const quiet = evaluateHopQuality(55, -95, 14, NOON, 120, 1, 3000);
    const storm = evaluateHopQuality(55, -95, 14, NOON, 120, 9, 3000);
    expect(storm.qualityScore).toBeLessThan(quiet.qualityScore);
  });
});
