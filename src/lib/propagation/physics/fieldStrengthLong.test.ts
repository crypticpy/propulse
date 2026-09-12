// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  EARTH_RADIUS_KM,
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  longPathMuf,
  MAX_ROUTE_DISTANCE_KM,
  type LongPathMufState,
} from "./longPath/fM";
import { longPathLuf } from "./longPath/fL";
import {
  etlDbuVPerM,
  focusGainUnlimitedDb,
  freeSpaceFieldStrengthDbuVPerM,
  frequencyFactor,
  longPathFieldStrength,
  DEFAULT_TRANSMITTER_POWER_DB_KW,
  EIRP_REFERENCE_OFFSET_DB,
  FREE_SPACE_FIELD_CONSTANT_DB,
  ISOTROPIC_GAIN_DBI,
  LONG_PATH_INCLUDED_MECHANISMS,
  LONG_PATH_MIN_DISTANCE_KM,
  LONG_PATH_ONLY_DISTANCE_KM,
  LY_DB,
  MAX_FOCUS_GAIN_DB,
  type LongPathFieldStrengthInputs,
  type ResolvedLongPathFieldStrength,
} from "./fieldStrengthLong";

/**
 * Every expected number here is transcribed from the published equations again
 * in this file, or worked out by hand in the comment above the assertion.
 *
 *   Etl = E0 [1 - (fM+fH)^2/((fM+fH)^2 + (fL+fH)^2)
 *                 [(fL+fH)^2/(f+fH)^2 + (f+fH)^2/(fM+fH)^2]]
 *         - 30.0 + Pt + Gtl + Gap - Ly                                   (39)
 *   E0  = 139.6 - 20 log p                                               (40)
 *   Gap = 10 log [D / (R0 |sin(D/R0)|)], limited to 15 dB                (41)
 */

function route(tx: GeodeticPoint, rx: GeodeticPoint): ResolvedRoute {
  const resolved = resolveRoute(tx, rx);
  if (resolved.kind !== "resolved") {
    throw new Error(`fixture route is ${resolved.kind}`);
  }
  return resolved;
}

function stretched(base: ResolvedRoute, groundDistanceKm: number): ResolvedRoute {
  return {
    ...base,
    groundDistanceKm,
    arcAngleRad: groundDistanceKm / EARTH_RADIUS_KM,
  };
}

const EQUATORIAL = route(
  { latitudeDeg: 0, longitudeDeg: 0 },
  { latitudeDeg: 0, longitudeDeg: 80 },
);

/** A diurnal curve, so the K factor of equation (32) has something to act on. */
function diurnalState(utcHour: number): LongPathMufState {
  return {
    foF2MHz: 6 + 4 * Math.cos(((utcHour - 12) / 24) * 2 * Math.PI),
    m3000F2: 3,
    gyrofrequency300kmMHz: 1.2,
  };
}

function inputs(
  overrides: Partial<LongPathFieldStrengthInputs> = {},
): LongPathFieldStrengthInputs {
  return {
    route: stretched(EQUATORIAL, 9671.01),
    frequencyMHz: 14.1,
    monthIndex: 2,
    utcHour: 19,
    r12: 130,
    sample: (_point, _label, utcHour) => diurnalState(utcHour),
    ...overrides,
  };
}

function resolved(
  overrides: Partial<LongPathFieldStrengthInputs> = {},
): ResolvedLongPathFieldStrength {
  const result = longPathFieldStrength(inputs(overrides));
  if (result.kind !== "field_strength") {
    throw new Error(`${result.reason}: ${result.detail}`);
  }
  return result;
}

describe("equation (40), the free-space field strength for 3 MW e.i.r.p.", () => {
  it("is the published constant at a slant range of one kilometre", () => {
    expect(FREE_SPACE_FIELD_CONSTANT_DB).toBe(139.6);
    expect(freeSpaceFieldStrengthDbuVPerM(1)).toBeCloseTo(139.6, 12);
  });

  it("falls by 20 dB per decade of slant range", () => {
    expect(freeSpaceFieldStrengthDbuVPerM(10)).toBeCloseTo(119.6, 12);
    expect(freeSpaceFieldStrengthDbuVPerM(1000)).toBeCloseTo(79.6, 12);
    expect(freeSpaceFieldStrengthDbuVPerM(10000)).toBeCloseTo(59.6, 12);
  });

  it("matches a hand evaluation on a real long-path slant range", () => {
    // 10 032.51 km, the three-hop p' of the 9 671.01 km London to Cape Town
    // golden circuit: 139.6 - 20 log10(10032.51) = 59.571808 dB(1 uV/m).
    expect(freeSpaceFieldStrengthDbuVPerM(10032.51)).toBeCloseTo(
      59.57180797413484,
      9,
    );
  });
});

describe("equation (41), the long-distance focusing gain", () => {
  it("is essentially zero on a short arc, where the chord and the arc agree", () => {
    // x/sin(x) - 1 is x^2/6, so the gain at 1 km is 1.8e-8 dB and at 100 km
    // is 1.8e-4 dB. Small, but not zero, and asserted at the size it really is.
    expect(focusGainUnlimitedDb(1)).toBeCloseTo(0, 7);
    expect(focusGainUnlimitedDb(100)).toBeCloseTo(0, 3);
  });

  it("matches a hand evaluation at 8 278 km", () => {
    // D/R0 = 1.299342 rad, sin = 0.963631, so
    // 10 log10(8278.11 / (6371 x 0.963631)) = 1.29925 dB.
    expect(focusGainUnlimitedDb(8278.11)).toBeCloseTo(1.29925, 5);
  });

  it("diverges as the path approaches the antipode", () => {
    const nearAntipode = Math.PI * EARTH_RADIUS_KM - 1;
    expect(focusGainUnlimitedDb(nearAntipode)).toBeGreaterThan(
      MAX_FOCUS_GAIN_DB,
    );
    expect(Number.isFinite(focusGainUnlimitedDb(nearAntipode))).toBe(true);
  });

  it("is limited to 15 dB where the formula runs away", () => {
    const result = resolved({
      route: stretched(EQUATORIAL, Math.PI * EARTH_RADIUS_KM - 1),
    });
    expect(result.terms.focusGainLimited).toBe(true);
    expect(result.terms.focusGainDb).toBe(MAX_FOCUS_GAIN_DB);
    expect(result.terms.focusGainUnlimitedDb).toBeGreaterThan(
      MAX_FOCUS_GAIN_DB,
    );
    expect(result.assumptions.join(" ")).toContain("limits it to 15 dB");
  });

  it("passes the formula through untouched where it is inside the limit", () => {
    const result = resolved();
    expect(result.terms.focusGainLimited).toBe(false);
    expect(result.terms.focusGainDb).toBe(result.terms.focusGainUnlimitedDb);
    expect(result.terms.focusGainDb).toBeCloseTo(
      focusGainUnlimitedDb(9671.01),
      12,
    );
  });
});

describe("the bracket of equation (39)", () => {
  it("is exactly zero at both reference frequencies", () => {
    // Writing a = (fM+fH)^2 and b = (fL+fH)^2, the bracket is b/x + x/a, which
    // is (a+b)/a at x = a and again at x = b; the leading a/(a+b) cancels it
    // to 1 both times, so the factor is 0. This is the sharpest check on the
    // expression there is and it needs no reference value at all.
    const fMMHz = 22;
    const fLMHz = 4;
    const fHMHz = 1.2;
    expect(
      frequencyFactor({ frequencyMHz: fMMHz, fMMHz, fLMHz, fHMHz }),
    ).toBeCloseTo(0, 12);
    expect(
      frequencyFactor({ frequencyMHz: fLMHz, fMMHz, fLMHz, fHMHz }),
    ).toBeCloseTo(0, 12);
  });

  it("peaks at the geometric mean of the two shifted frequencies", () => {
    const fMMHz = 22;
    const fLMHz = 4;
    const fHMHz = 1.2;
    const a = (fMMHz + fHMHz) ** 2;
    const b = (fLMHz + fHMHz) ** 2;
    const peakFrequency = Math.sqrt((fMMHz + fHMHz) * (fLMHz + fHMHz)) - fHMHz;
    const peak = frequencyFactor({
      frequencyMHz: peakFrequency,
      fMMHz,
      fLMHz,
      fHMHz,
    });
    expect(peak).toBeCloseTo(1 - (2 * Math.sqrt(a * b)) / (a + b), 12);
    for (const frequencyMHz of [5, 8, 12, 16, 20]) {
      expect(
        frequencyFactor({ frequencyMHz, fMMHz, fLMHz, fHMHz }),
      ).toBeLessThanOrEqual(peak + 1e-12);
    }
  });

  it("goes negative outside the fL to fM window", () => {
    const fMMHz = 22;
    const fLMHz = 4;
    const fHMHz = 1.2;
    expect(
      frequencyFactor({ frequencyMHz: 2, fMMHz, fLMHz, fHMHz }),
    ).toBeLessThan(0);
    expect(
      frequencyFactor({ frequencyMHz: 40, fMMHz, fLMHz, fHMHz }),
    ).toBeLessThan(0);
  });

  it("matches the published expression written out again", () => {
    const fMMHz = 18.5;
    const fLMHz = 5.25;
    const fHMHz = 1.05;
    const frequencyMHz = 14.1;
    const upper = (fMMHz + fHMHz) ** 2;
    const lower = (fLMHz + fHMHz) ** 2;
    const operating = (frequencyMHz + fHMHz) ** 2;
    const byHand =
      1 - (upper / (upper + lower)) * (lower / operating + operating / upper);
    expect(frequencyFactor({ frequencyMHz, fMMHz, fLMHz, fHMHz })).toBeCloseTo(
      byHand,
      12,
    );
  });
});

describe("equation (39) assembled", () => {
  it("subtracts Ly, so the published -0.14 dB raises the field strength", () => {
    expect(LY_DB).toBe(-0.14);
    expect(EIRP_REFERENCE_OFFSET_DB).toBe(30);
    const common = {
      freeSpaceFieldStrengthDbuVPerM: 60,
      frequencyFactor: 0.5,
      transmitterPowerDbKw: 0,
      transmitterGainDbi: 0,
      focusGainDb: 1.3,
    };
    const published = etlDbuVPerM({ ...common, lyDb: -0.14 });
    const reference = etlDbuVPerM({ ...common, lyDb: -0.17 });
    // The pinned reference's own NOIL is -0.17, which is 0.03 dB higher on
    // every long circuit. See deviation 1.
    expect(reference - published).toBeCloseTo(0.03, 12);
  });

  it("matches the published expression written out again", () => {
    const terms = {
      freeSpaceFieldStrengthDbuVPerM: 59.5718,
      frequencyFactor: 0.4321,
      transmitterPowerDbKw: -10,
      transmitterGainDbi: 7.5,
      focusGainDb: 2.75,
      lyDb: -0.14,
    };
    // 59.5718 x 0.4321 = 25.740975; minus 30, minus 10, plus 7.5, plus 2.75,
    // and minus a Ly of -0.14 is plus 0.14: -3.869025 dB(1 uV/m).
    const byHand = 59.5718 * 0.4321 - 30.0 - 10 + 7.5 + 2.75 + 0.14;
    expect(etlDbuVPerM(terms)).toBeCloseTo(byHand, 12);
    expect(etlDbuVPerM(terms)).toBeCloseTo(-3.869025, 6);
  });

  it("moves one for one with the transmitter power and the antenna gain", () => {
    const base = {
      freeSpaceFieldStrengthDbuVPerM: 60,
      frequencyFactor: 0.5,
      transmitterPowerDbKw: 0,
      transmitterGainDbi: 0,
      focusGainDb: 0,
      lyDb: LY_DB,
    };
    expect(
      etlDbuVPerM({ ...base, transmitterPowerDbKw: 10 }) - etlDbuVPerM(base),
    ).toBeCloseTo(10, 12);
    expect(
      etlDbuVPerM({ ...base, transmitterGainDbi: 3 }) - etlDbuVPerM(base),
    ).toBeCloseTo(3, 12);
  });

  it("collapses to the antenna and focusing terms at f = fM", () => {
    // The bracket is zero there, so E0 drops out entirely and what is left is
    // -30 + Pt + Gtl + Gap - Ly. A field strength that does not do this has a
    // sign or a grouping error in the bracket.
    const result = resolved();
    const atFM = resolved({ frequencyMHz: result.fMMHz });
    expect(atFM.terms.frequencyFactor).toBeCloseTo(0, 12);
    expect(atFM.etlDbuVPerM).toBeCloseTo(
      -30 + 0 + 0 + atFM.terms.focusGainDb - LY_DB,
      9,
    );
  });
});

describe("the assembled long-path field strength", () => {
  it("carries fM, fL and fH from the two leaves unchanged", () => {
    const result = resolved();
    const muf = longPathMuf({
      route: inputs().route,
      utcHour: 19,
      sample: inputs().sample,
    });
    if (muf.kind !== "resolved") throw new Error(muf.detail);
    const luf = longPathLuf({
      route: inputs().route,
      monthIndex: 2,
      utcHour: 19,
      r12: 130,
      gyrofrequencyMHz: muf.gyrofrequencyMHz,
      virtualSlantRangeKm: muf.virtualSlantRangeKm,
    });
    if (luf.kind !== "resolved") throw new Error(luf.detail);
    expect(result.fMMHz).toBe(muf.fMMHz);
    expect(result.fLMHz).toBe(luf.fLMHz);
    expect(result.fHMHz).toBe(muf.gyrofrequencyMHz);
    expect(result.virtualSlantRangeKm).toBe(muf.virtualSlantRangeKm);
    expect(result.basicMufMHz).toBe(muf.basicMufMHz);
  });

  it("reassembles equation (39) from its own recorded terms", () => {
    const result = resolved();
    expect(result.terms.freeSpaceFieldStrengthDbuVPerM).toBeCloseTo(
      freeSpaceFieldStrengthDbuVPerM(result.virtualSlantRangeKm),
      12,
    );
    expect(result.terms.frequencyFactor).toBeCloseTo(
      frequencyFactor({
        frequencyMHz: result.frequencyMHz,
        fMMHz: result.fMMHz,
        fLMHz: result.fLMHz,
        fHMHz: result.fHMHz,
      }),
      12,
    );
    expect(result.etlDbuVPerM).toBeCloseTo(
      etlDbuVPerM({
        freeSpaceFieldStrengthDbuVPerM:
          result.terms.freeSpaceFieldStrengthDbuVPerM,
        frequencyFactor: result.terms.frequencyFactor,
        transmitterPowerDbKw: result.terms.transmitterPowerDbKw,
        transmitterGainDbi: result.terms.transmitterGainDbi,
        focusGainDb: result.terms.focusGainDb,
        lyDb: result.terms.lyDb,
      }),
      12,
    );
    expect(result.fieldStrengthDbuVPerM).toBe(result.etlDbuVPerM);
  });

  it("defaults to one kilowatt into an isotropic radiator and says so", () => {
    const result = resolved();
    expect(DEFAULT_TRANSMITTER_POWER_DB_KW).toBe(0);
    expect(ISOTROPIC_GAIN_DBI).toBe(0);
    expect(result.terms.transmitterPowerDbKw).toBe(0);
    expect(result.terms.transmitterGainDbi).toBe(0);
    expect(result.assumptions.join(" ")).toContain("one kilowatt");
    expect(result.assumptions.join(" ")).toContain("isotropic");
  });

  it("records no antenna assumption once the caller states both", () => {
    const result = resolved({
      transmitterPowerDbKw: -30,
      transmitterGainDbi: 11.5,
    });
    expect(result.terms.transmitterPowerDbKw).toBe(-30);
    expect(result.terms.transmitterGainDbi).toBe(11.5);
    expect(result.assumptions).toEqual([]);
  });

  it("names which of section 5.3's two distance statements applies", () => {
    expect(LONG_PATH_MIN_DISTANCE_KM).toBe(7000);
    expect(LONG_PATH_ONLY_DISTANCE_KM).toBe(9000);
    expect(resolved({ route: stretched(EQUATORIAL, 7500) }).range).toBe(
      "blend_7000_to_9000_km",
    );
    expect(resolved({ route: stretched(EQUATORIAL, 9000) }).range).toBe(
      "blend_7000_to_9000_km",
    );
    expect(resolved({ route: stretched(EQUATORIAL, 9000.1) }).range).toBe(
      "above_9000_km",
    );
  });

  it("declares what is already inside El, so a head cannot add it twice", () => {
    const result = resolved();
    expect([...result.alreadyIncludedMechanisms]).toEqual([
      "free_space",
      "transmitter_power",
      "transmitting_antenna_gain",
      "long_distance_focusing",
      "excess",
    ]);
    expect([...LONG_PATH_INCLUDED_MECHANISMS]).toEqual([
      ...result.alreadyIncludedMechanisms,
    ]);
    // Section 5.3 models no receiving antenna and itemises no loss budget, so
    // neither may be claimed here.
    expect(result.alreadyIncludedMechanisms).not.toContain("absorption");
    expect(result.alreadyIncludedMechanisms).not.toContain("above_muf");
    expect(result.alreadyIncludedMechanisms).not.toContain("auroral");
  });
});

describe("what section 5.3.3 refuses rather than guesses", () => {
  it("declines a path shorter than 7 000 km with its own reason, not the MUF's", () => {
    const result = longPathFieldStrength(
      inputs({ route: stretched(EQUATORIAL, 6999) }),
    );
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.muf).toBeNull();
    expect(result.luf).toBeNull();
  });

  it("declines a frequency that is not positive", () => {
    for (const frequencyMHz of [0, -1, Number.NaN]) {
      const result = longPathFieldStrength(inputs({ frequencyMHz }));
      expect(result.kind).toBe("unsupported");
      if (result.kind !== "unsupported") continue;
      expect(result.reason).toBe("out_of_domain");
      expect(result.detail).toContain("(f + fH)^2");
    }
  });

  it("declines a non-finite power or gain", () => {
    expect(
      longPathFieldStrength(inputs({ transmitterPowerDbKw: Number.NaN })).kind,
    ).toBe("unsupported");
    expect(
      longPathFieldStrength(inputs({ transmitterGainDbi: Number.NaN })).kind,
    ).toBe("unsupported");
  });

  it("passes an unsupported fM through with its own label and the leaf record", () => {
    const result = longPathFieldStrength(
      inputs({ route: stretched(EQUATORIAL, MAX_ROUTE_DISTANCE_KM + 1) }),
    );
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("muf_unsupported");
    expect(result.muf?.kind).toBe("unsupported");
    expect(result.luf).toBeNull();
  });

  it("passes an unsupported fL through with its own label and both leaf records", () => {
    const result = longPathFieldStrength(inputs({ monthIndex: 12 }));
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("luf_unsupported");
    expect(result.muf?.kind).toBe("resolved");
    expect(result.luf?.kind).toBe("unsupported");
  });

  it("never returns a NaN on any numeric field of a resolved record", () => {
    for (const groundDistanceKm of [7000, 8500, 12000, 19000, 26400.16]) {
      const result = resolved({
        route: stretched(EQUATORIAL, groundDistanceKm),
        utcHour: 6,
      });
      const numbers = [
        result.groundDistanceKm,
        result.frequencyMHz,
        result.fMMHz,
        result.fLMHz,
        result.fHMHz,
        result.virtualSlantRangeKm,
        result.etlDbuVPerM,
        result.fieldStrengthDbuVPerM,
        result.basicMufMHz,
        result.terms.freeSpaceFieldStrengthDbuVPerM,
        result.terms.frequencyFactor,
        result.terms.focusGainUnlimitedDb,
        result.terms.focusGainDb,
        result.terms.lyDb,
        result.terms.transmitterPowerDbKw,
        result.terms.transmitterGainDbi,
      ];
      for (const value of numbers) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("returns non_finite_result rather than an infinite El when an absurdly large but finite frequency overflows equation (39)'s bracket", () => {
    // frequencyMHz only has to be finite and positive to pass the check above.
    // At 1e200 MHz it still is, but (f + fH)^2 inside frequencyFactor()
    // overflows double range on its own, well before fM, fL or any sampled
    // ionospheric quantity is involved: this is the fieldStrengthLong sibling
    // of the fM finding, an input whose own bound cannot see what it does in
    // combination with the rest of the equation.
    const result = longPathFieldStrength(inputs({ frequencyMHz: 1e200 }));
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("non_finite_result");
    expect(result.detail).toContain("terms.frequencyFactor");
    expect(result.detail).toContain("Infinity");
  });
});
