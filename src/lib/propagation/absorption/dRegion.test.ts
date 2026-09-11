import { describe, expect, it } from "vitest";

import {
  absorptionFactorAtNoon,
  absorptionTerm,
  diurnalAbsorptionExponent,
  dRapAbsorptionDb,
  dRapScaleToFrequency,
  dRegionAbsorption,
  FIT_RESIDUALS,
  penetrationFactor,
  REFERENCE_ANCHORS,
  solarZenithFactor,
  type DRegionCrossing,
} from "./dRegion";
import { hopGeometry, type SupportedHopGeometry } from "../geometry/hop";

/** The tolerance declared in the plan and in the module doc block. */
const ANCHOR_TOLERANCE_DB = 0.25;

function supported(
  groundDistanceKm: number,
  hopCount: number,
  mirrorHeightKm: number,
): SupportedHopGeometry {
  const geometry = hopGeometry({ groundDistanceKm, hopCount, mirrorHeightKm });
  if (geometry.kind !== "supported") {
    throw new Error(`expected a supported hop, got ${geometry.reason}`);
  }
  return geometry;
}

describe("the fitted model against its reference anchors", () => {
  it("reproduces every anchor's absorption term inside the declared tolerance", () => {
    let worstDb = 0;
    for (const anchor of REFERENCE_ANCHORS) {
      const crossing: DRegionCrossing = {
        latitudeDeg: anchor.latitude_deg,
        monthIndex: anchor.month_index,
        modifiedDipDeg: anchor.moddip_deg,
        foEMHz: anchor.foE_mhz,
        zenithAngleDeg: anchor.zenith_deg,
        zenithNoonAngleDeg: anchor.zenith_noon_deg,
      };
      const modelled = absorptionTerm(crossing, anchor.fv_mhz);
      const errorDb = Math.abs(
        10 * Math.log10(modelled / anchor.absorption_term),
      );
      expect(
        errorDb,
        `${anchor.case_id}: ${modelled.toFixed(4)} vs reference ${anchor.absorption_term.toFixed(4)}`,
      ).toBeLessThan(ANCHOR_TOLERANCE_DB);
      worstDb = Math.max(worstDb, errorDb);
    }
    // The number quoted in the module doc block. Re-derived here so it cannot
    // drift out of the documentation.
    expect(worstDb).toBeCloseTo(FIT_RESIDUALS.absorption_term_max_db, 9);
    expect(worstDb).toBeCloseTo(0.049, 3);
  });

  it("reproduces each measured primitive", () => {
    for (const anchor of REFERENCE_ANCHORS) {
      expect(
        absorptionFactorAtNoon(anchor.latitude_deg, anchor.month_index) /
          anchor.at_noon -
          1,
      ).toBeLessThan(FIT_RESIDUALS.at_noon_max_relative + 1e-12);
      expect(
        Math.abs(
          penetrationFactor(anchor.fv_mhz / anchor.foE_mhz) /
            anchor.penetration_factor -
            1,
        ),
      ).toBeLessThan(FIT_RESIDUALS.penetration_max_relative + 1e-12);
      const monthIndex =
        anchor.latitude_deg < 0
          ? (anchor.month_index + 6) % 12
          : anchor.month_index;
      expect(
        Math.abs(
          diurnalAbsorptionExponent(anchor.moddip_deg, monthIndex) -
            anchor.diurnal_exponent,
        ),
      ).toBeLessThan(FIT_RESIDUALS.diurnal_exponent_max_absolute + 1e-12);
    }
  });

  it("publishes the residuals the doc block quotes", () => {
    expect(FIT_RESIDUALS.at_noon_max_relative).toBeLessThan(0.015);
    expect(FIT_RESIDUALS.penetration_max_relative).toBeLessThan(0.0005);
    expect(FIT_RESIDUALS.diurnal_exponent_max_absolute).toBeLessThan(0.025);
    expect(FIT_RESIDUALS.absorption_term_max_db).toBeLessThan(
      ANCHOR_TOLERANCE_DB,
    );
  });
});

describe("absorption magnitude on the audit circuit (R2)", () => {
  // 40.0 N, March, local noon, one 3000 km F2 hop at hr = 300 km,
  // f = 14 MHz, SSN = 100, foE = 3.4 MHz, fL = 1.2 MHz.
  //
  // Measured from the pinned reference build: ATnoon = 352.200,
  // phi(0.81310) = 1.11336, and at local noon F(chi)/F(chi_noon) = 1 exactly,
  // so AT = 392.1255 and equation (20) gives Li = 14.3536 dB.
  const REFERENCE_LI_DB = 14.3536;

  const geometry = supported(3000, 1, 300);
  const crossing: DRegionCrossing = {
    latitudeDeg: 40,
    monthIndex: 2,
    modifiedDipDeg: 55,
    foEMHz: 3.4,
    zenithAngleDeg: 16.5,
    zenithNoonAngleDeg: 16.5,
  };

  it("lands within the declared tolerance of the reference", () => {
    const result = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    expect(result.verticalFrequencyMHz).toBeCloseTo(2.7645, 4);
    expect(
      Math.abs(10 * Math.log10(result.absorptionDb / REFERENCE_LI_DB)),
    ).toBeLessThan(ANCHOR_TOLERANCE_DB);
    expect(result.absorptionDb).toBeCloseTo(REFERENCE_LI_DB, 0);
  });

  it("is far below the shipped heuristic, which had no absorption term", () => {
    // The replaced expression was
    //   677 * sec(i_90) * (1 + 0.003 R12) * cos(0.881 chi) / (f + fL)^2
    // with sec(i_90) = 5.5020, R12 = 100 and chi = 40 degrees.
    const shipped =
      (677 *
        (1 / Math.cos(geometry.incidenceAngle90Rad)) *
        (1 + 0.003 * 100) *
        Math.max(0, Math.cos((0.881 * 40 * Math.PI) / 180))) /
      (14 + 1.2) ** 2;
    expect(shipped).toBeCloseTo(17.118, 2);

    const result = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    expect(result.absorptionDb).toBeLessThan(shipped);
  });

  it("does not clamp a genuinely opaque circuit at 50 dB", () => {
    const result = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 3.5,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    expect(result.absorptionDb).toBeGreaterThan(50);
  });
});

describe("pass accounting", () => {
  it("requires exactly two crossings per hop", () => {
    const geometry = supported(3000, 2, 300);
    const crossing: DRegionCrossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 20,
      zenithNoonAngleDeg: 20,
    };
    expect(() =>
      dRegionAbsorption({
        crossings: [crossing],
        hopCount: 2,
        frequencyMHz: 14,
        incidenceAngle110Rad: geometry.incidenceAngle110Rad,
        ssn: 100,
      }),
    ).toThrow(RangeError);

    const result = dRegionAbsorption({
      crossings: [crossing, crossing, crossing, crossing],
      hopCount: 2,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    expect(result.passCount).toBe(4);
    expect(result.perCrossingTerms).toHaveLength(4);
  });

  it("averages across the terminator instead of sampling one end", () => {
    const geometry = supported(3000, 1, 300);
    const day: DRegionCrossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 20,
      zenithNoonAngleDeg: 20,
    };
    const night: DRegionCrossing = { ...day, foEMHz: 0.9, zenithAngleDeg: 100 };

    const dayOnly = dRegionAbsorption({
      crossings: [day, day],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;
    const nightOnly = dRegionAbsorption({
      crossings: [night, night],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;
    const straddling = dRegionAbsorption({
      crossings: [day, night],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;

    expect(nightOnly).toBeLessThan(dayOnly);
    expect(straddling).toBeLessThan(dayOnly);
    expect(straddling).toBeGreaterThan(nightOnly);
    expect(straddling).toBeCloseTo((dayOnly + nightOnly) / 2, 9);
  });

  it("scales linearly with the hop count at fixed geometry", () => {
    const geometry = supported(3000, 1, 300);
    const crossing: DRegionCrossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 20,
      zenithNoonAngleDeg: 20,
    };
    const one = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;
    const three = dRegionAbsorption({
      crossings: Array.from({ length: 6 }, () => crossing),
      hopCount: 3,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    }).absorptionDb;
    expect(three).toBeCloseTo(3 * one, 9);
  });

  it("declares the gyrofrequency assumption only when the scalar is used", () => {
    const geometry = supported(3000, 1, 300);
    const crossing: DRegionCrossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55,
      foEMHz: 3.4,
      zenithAngleDeg: 20,
      zenithNoonAngleDeg: 20,
    };
    const declared = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    expect(declared.assumptions.join(" ")).toContain("1.2 MHz");

    const supplied = dRegionAbsorption({
      crossings: [crossing, crossing],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
      gyrofrequencyMHz: 0.8,
    });
    expect(supplied.assumptions.join(" ")).not.toContain("1.2 MHz");
  });
});

describe("F(chi) (equation 21)", () => {
  it("clips the zenith angle at 102 degrees and floors at 0.02", () => {
    expect(solarZenithFactor(110, 1.2)).toBe(solarZenithFactor(102, 1.2));
    expect(solarZenithFactor(102, 1.2)).toBe(0.02);
    expect(solarZenithFactor(0, 1.2)).toBe(1);
  });

  it("has no 90 to 98 degree ramp and no discontinuity at 98", () => {
    const before = solarZenithFactor(97.999, 1.2);
    const after = solarZenithFactor(98.001, 1.2);
    expect(Math.abs(after - before)).toBeLessThan(1e-3);
  });
});

describe("the NOAA D-RAP convention (R8)", () => {
  // 1 dB of vertical round trip, hD = 90 km, elevation 4.261 degrees.
  const elevationAngleRad = (4.261475865 * Math.PI) / 180;

  it("halves the round trip for one crossing and applies the obliquity", () => {
    const secant =
      1 /
      Math.sqrt(1 - ((6371 * Math.cos(elevationAngleRad)) / (6371 + 90)) ** 2);
    expect(secant).toBeCloseTo(5.502, 4);
    expect(
      dRapAbsorptionDb({
        verticalRoundTripDb: 1,
        elevationAngleRad,
        crossings: 1,
      }),
    ).toBeCloseTo(2.751, 4);
    expect(
      dRapAbsorptionDb({
        verticalRoundTripDb: 1,
        elevationAngleRad,
        crossings: 2,
      }),
    ).toBeCloseTo(5.502, 4);
  });

  it("scales with frequency to the minus three halves", () => {
    expect(dRapScaleToFrequency(8, 10, 20)).toBeCloseTo(8 * 2 ** -1.5, 12);
  });

  it("reduces to the vertical round trip at the zenith", () => {
    expect(
      dRapAbsorptionDb({
        verticalRoundTripDb: 3,
        elevationAngleRad: Math.PI / 2,
        crossings: 2,
      }),
    ).toBeCloseTo(3, 12);
  });
});
