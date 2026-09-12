import { describe, expect, it } from "vitest";

import {
  absorptionFactorAtNoon,
  absorptionTerm,
  diurnalAbsorptionExponent,
  dRapAbsorptionDb,
  dRapScaleToFrequency,
  DEFAULT_GYROFREQUENCY_MHZ,
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

/**
 * The circuit the anchor residual is expressed on: one 3000 km hop with the
 * mirror at 300 km, 14 MHz, SSN 100, fL 1.2 MHz, which is the plan's R2 audit
 * case and the first anchor exactly. Equation (20) is a loss in dB, so the
 * error that matters is a difference of losses. A log ratio of the absorption
 * terms is a different quantity entirely and understates it: on this circuit
 * it reports 0.016 where the loss is out by 0.0536 dB.
 */
const ANCHOR_CIRCUIT = supported(3000, 1, 300);
const ANCHOR_CIRCUIT_SCALE =
  (1 + 0.0067 * 100) /
  ((14 + 1.2) ** 2 * Math.cos(ANCHOR_CIRCUIT.incidenceAngle110Rad));

describe("the fitted model against its reference anchors", () => {
  it("reproduces every anchor's equation (20) loss inside the declared tolerance", () => {
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
      const modelledLiDb =
        ANCHOR_CIRCUIT_SCALE * absorptionTerm(crossing, anchor.fv_mhz);
      const referenceLiDb = ANCHOR_CIRCUIT_SCALE * anchor.absorption_term;
      const errorDb = Math.abs(modelledLiDb - referenceLiDb);
      expect(
        errorDb,
        `${anchor.case_id}: ${modelledLiDb.toFixed(4)} dB vs reference ${referenceLiDb.toFixed(4)} dB`,
      ).toBeLessThan(ANCHOR_TOLERANCE_DB);
      worstDb = Math.max(worstDb, errorDb);
    }
    // The number quoted in the module doc block. Re-derived here so it cannot
    // drift out of the documentation.
    expect(worstDb).toBeCloseTo(FIT_RESIDUALS.absorption_li_max_db, 9);
    expect(worstDb).toBeCloseTo(0.073, 3);
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
    expect(FIT_RESIDUALS.absorption_li_max_db).toBeLessThan(
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
    // A difference of losses, not a ratio: both numbers are already in dB.
    expect(Math.abs(result.absorptionDb - REFERENCE_LI_DB)).toBeLessThan(
      ANCHOR_TOLERANCE_DB,
    );
    expect(Math.abs(result.absorptionDb - REFERENCE_LI_DB)).toBeCloseTo(
      0.0536,
      3,
    );
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

  it("reports the dip it was handed and claims nothing about its source", () => {
    // This leaf never chooses where the dip comes from, so it used to assert
    // something false: that the climatology provider evaluated it at 300 km.
    // A caller with a true 100 km dip was mislabelled by its own result.
    const geometry = supported(3000, 1, 300);
    const entry: DRegionCrossing = {
      latitudeDeg: 40,
      monthIndex: 2,
      modifiedDipDeg: 55.25,
      foEMHz: 3.4,
      zenithAngleDeg: 20,
      zenithNoonAngleDeg: 20,
    };
    const exit = { ...entry, modifiedDipDeg: 61.5 };
    const result = dRegionAbsorption({
      crossings: [entry, exit],
      hopCount: 1,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
    });
    const dipLines = result.assumptions.filter((line) =>
      line.toLowerCase().includes("magnetic dip"),
    );
    expect(dipLines).toHaveLength(1);
    expect(dipLines[0]).toContain("caller-supplied");
    expect(dipLines[0]).toContain("55.25 to 61.50 degrees");
    expect(dipLines[0]).not.toContain("climatology provider");
    expect(dipLines[0]).not.toContain("taken at 300 km");
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

describe("the per-crossing longitudinal gyrofrequency (#1108)", () => {
  const geometry = supported(3000, 1, 300);
  const base: DRegionCrossing = {
    latitudeDeg: 40,
    monthIndex: 2,
    modifiedDipDeg: 55,
    foEMHz: 3.4,
    zenithAngleDeg: 20,
    zenithNoonAngleDeg: 20,
  };

  function run(
    crossings: readonly DRegionCrossing[],
    gyrofrequencyMHz?: number,
  ) {
    return dRegionAbsorption({
      crossings,
      hopCount: crossings.length / 2,
      frequencyMHz: 14,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn: 100,
      ...(gyrofrequencyMHz === undefined ? {} : { gyrofrequencyMHz }),
    });
  }

  it("divides each crossing by its own (f + fL) squared", () => {
    // fL is a property of where the crossing is. A 4-hop circuit straddles tens
    // of degrees of dip, so one scalar for the whole mode reintroduces exactly
    // the defect the per-crossing pass accounting was written to remove.
    const entry: DRegionCrossing = { ...base, gyrofrequencyMHz: 0.35 };
    const exit: DRegionCrossing = { ...base, gyrofrequencyMHz: 1.79 };
    const mixed = run([entry, exit]);

    const term = absorptionTerm(base, mixed.verticalFrequencyMHz);
    const cosIncidence = Math.cos(geometry.incidenceAngle110Rad);
    const expected =
      ((1 + 0.0067 * 100) *
        ((term / (14 + 0.35) ** 2 + term / (14 + 1.79) ** 2) / 2)) /
      cosIncidence;

    expect(mixed.absorptionDb).toBeCloseTo(expected, 12);
    expect(mixed.gyrofrequenciesMHz).toEqual([0.35, 1.79]);
    // And it is genuinely between the two uniform circuits, not either of them.
    const uniformLowFl = run([entry, entry]).absorptionDb;
    const uniformHighFl = run([exit, exit]).absorptionDb;
    expect(mixed.absorptionDb).toBeLessThan(uniformLowFl);
    expect(mixed.absorptionDb).toBeGreaterThan(uniformHighFl);
  });

  it("falls back to the mode-wide value for a crossing that carries none", () => {
    const withOwn: DRegionCrossing = { ...base, gyrofrequencyMHz: 0.9 };
    const result = run([withOwn, base], 1.6);
    expect(result.gyrofrequenciesMHz).toEqual([0.9, 1.6]);
  });

  it("reduces exactly to the single-scalar form when every fL is the same", () => {
    // The refactor must not be a silent change of model: with a uniform fL the
    // folded mean is algebraically the old (f + fL)^2 divide outside the sum,
    // and it must also be that number to the last bit the arithmetic allows.
    const day: DRegionCrossing = { ...base, gyrofrequencyMHz: 1.37 };
    const night: DRegionCrossing = {
      ...base,
      gyrofrequencyMHz: 1.37,
      foEMHz: 0.9,
      zenithAngleDeg: 100,
    };
    const folded = run([day, night]).absorptionDb;

    const cosIncidence = Math.cos(geometry.incidenceAngle110Rad);
    const verticalFrequencyMHz = 14 * cosIncidence;
    const meanTerm =
      (absorptionTerm(day, verticalFrequencyMHz) +
        absorptionTerm(night, verticalFrequencyMHz)) /
      2;
    const scalarForm =
      ((1 + 0.0067 * 100) * meanTerm) / ((14 + 1.37) ** 2 * cosIncidence);

    expect(Math.abs(folded - scalarForm)).toBeLessThanOrEqual(
      8 * Number.EPSILON * Math.abs(scalarForm),
    );
    // The mode-wide input reaches the same place as the per-crossing one.
    const dayNoFl: DRegionCrossing = { ...day, gyrofrequencyMHz: undefined };
    const nightNoFl: DRegionCrossing = {
      ...night,
      gyrofrequencyMHz: undefined,
    };
    expect(run([dayNoFl, nightNoFl], 1.37).absorptionDb).toBe(folded);
  });

  it("does not tell a caller who supplied exactly 1.2 MHz that it got the stand-in", () => {
    // The selection used to compare the value to 1.2, so a caller that
    // legitimately computed 1.2 MHz was labelled as having supplied nothing.
    const supplied = run([base, base], DEFAULT_GYROFREQUENCY_MHZ);
    expect(supplied.assumptions.join(" ")).not.toContain(
      "the caller supplied no value",
    );
    const perCrossing = run([
      { ...base, gyrofrequencyMHz: DEFAULT_GYROFREQUENCY_MHZ },
      { ...base, gyrofrequencyMHz: DEFAULT_GYROFREQUENCY_MHZ },
    ]);
    expect(perCrossing.assumptions.join(" ")).not.toContain(
      "the caller supplied no value",
    );
  });

  it("still declares the 1.2 MHz stand-in when no fL is supplied anywhere", () => {
    const declared = run([base, base]);
    expect(declared.gyrofrequenciesMHz).toEqual([
      DEFAULT_GYROFREQUENCY_MHZ,
      DEFAULT_GYROFREQUENCY_MHZ,
    ]);
    const line = declared.assumptions.find((entry) =>
      entry.includes("1.2 MHz"),
    );
    expect(line).toBeDefined();
    expect(line).toContain("100 km");
  });
});
