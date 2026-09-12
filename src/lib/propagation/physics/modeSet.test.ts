// @vitest-environment node

import { describe, expect, it } from "vitest";

import { maximumHopGroundDistanceKm } from "@/lib/propagation/geometry/hop";
import { f2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import {
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import { maxHopForMinElevationKm, MIN_ELEVATION_DEG } from "./basicMuf";
import type { ControlPointLabel } from "./controlPoints";
import {
  E_LAYER_SCREENING_FACTOR,
  screeningFrequencyMHz,
} from "./eLayerScreening";
import {
  modeSet,
  E_MODE_MAX_HOP_KM,
  type ModeControlPointSampler,
  type ModeControlPointState,
  type ResolvedModeSet,
} from "./modeSet";
import type { PropagationMode } from "./modeTypes";

/**
 * Every expected number in this file was computed from the published P.533-14
 * equations by an independent Python transcription written from the
 * recommendation text before this module was run, in the convention
 * `basicMuf.test.ts` uses. The inputs and the intermediates are recorded beside
 * each one.
 *
 * The shared transcription:
 *
 *   R0    = 6371 km
 *   hr    = min(1490 / M(3000)F2 - 176, 500)                          (2)
 *   psi   = D / (2 n R0)
 *   delta = atan2(cos psi - R0/(R0 + hr), sin psi)                    (13)
 *   i     = asin(R0 cos delta / (R0 + hr))
 *   dhmax = 2 R0 (pi/2 - delta_min - i(delta_min, hr))    at delta_min = 3 deg
 *   fs    = 1.05 foE / cos(i at 110 km)                           (11), (12)
 *
 * Section 5.1's mirror height is `reflectionHeight.ts`'s long G/J/U formula and
 * is pinned in that leaf's own tests, so it is not re-derived here. Where a
 * reported elevation is asserted, the height comes from that leaf and equation
 * (13) is applied to it by `elevationDegAt` below, which is this file's own
 * transcription. What is asserted about fs is the part that holds whatever the
 * height is: cos i is at most 1, so `fs >= 1.05 foE` always, and a case built
 * so that 1.05 foE already exceeds the operating frequency is screened for
 * certain. That is a hand-provable inequality rather than a number copied out
 * of the implementation.
 */
const PRECISION = 9;
const EARTH_RADIUS_KM = 6371;

/** Equation (13), this file's own transcription, in degrees. */
function elevationDegAt(
  groundDistanceKm: number,
  hopCount: number,
  mirrorHeightKm: number,
): number {
  const psi = groundDistanceKm / (2 * hopCount * EARTH_RADIUS_KM);
  return (
    (Math.atan2(
      Math.cos(psi) - EARTH_RADIUS_KM / (EARTH_RADIUS_KM + mirrorHeightKm),
      Math.sin(psi),
    ) *
      180) /
    Math.PI
  );
}

/** A route of an exact length; see `controlPoints.test.ts` for why. */
function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = resolveRoute(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 10, longitudeDeg: 40 },
  );
  if (base.kind !== "resolved") throw new Error("fixture route is degenerate");
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

interface StateOverrides {
  readonly foF2MHz?: number;
  readonly m3000F2?: number;
  readonly foEMHz?: number;
  readonly r12?: number;
}

const BASE_STATE: ModeControlPointState = {
  foF2MHz: 9,
  m3000F2: 3,
  foEMHz: 1.8,
  gyrofrequency300kmMHz: 1.2,
  r12: 50,
};

/** The same overrides at every control point Table 1 can name. */
function uniform(
  overrides: StateOverrides,
): Partial<Record<ControlPointLabel, StateOverrides>> {
  const labels: readonly ControlPointLabel[] = [
    "M",
    "T + 1000",
    "R - 1000",
    "T + d0/2",
    "R - d0/2",
  ];
  return Object.fromEntries(labels.map((label) => [label, overrides]));
}

/**
 * A state whose section 5.1 height is far below its equation (2) height.
 *
 * M(3000)F2 = 2.5 puts equation (2) at 1490/2.5 - 176 = 420 km. foF2/foE = 4 is
 * above 3.33 and xr = 5/12 is below 1, so section 5.1 takes case (b), whose
 * A2 + B2 b lands near 200 km on a hop this long. A 200 km mirror does not
 * reach 3300 km; a 420 km one does.
 */
const LOW_SECTION_5_1_STATE: StateOverrides = {
  foF2MHz: 12,
  foEMHz: 3,
  m3000F2: 2.5,
};

/**
 * A state whose section 5.1 height is not a height at all.
 *
 * Every value is in range on its own and equation (2) is happy with it
 * (1490/6 - 176 = 72.33 km), but foF2/foE = 2 is at or under 3.33 and xr = 1,
 * so section 5.1 takes case (c), whose H = 1490/(M + dM) - 316 is -78.89 km
 * here and whose A3 + B3 b comes out negative. The formulas of section 5.1 are
 * fits, not physics, and nothing in the recommendation bounds them below.
 */
const NON_POSITIVE_SECTION_5_1_STATE: StateOverrides = {
  foF2MHz: 10,
  foEMHz: 5,
  m3000F2: 6,
  r12: 0,
};

/** A sampler that answers a different state per control-point label. */
function samplerByLabel(
  byLabel: Partial<Record<ControlPointLabel, StateOverrides>>,
): {
  sample: ModeControlPointSampler;
  seen: ControlPointLabel[];
} {
  const seen: ControlPointLabel[] = [];
  const sample: ModeControlPointSampler = (
    _point: GeodeticPoint,
    label: ControlPointLabel,
  ) => {
    seen.push(label);
    return { ...BASE_STATE, ...(byLabel[label] ?? {}) };
  };
  return { sample, seen };
}

function resolved(result: ReturnType<typeof modeSet>): ResolvedModeSet {
  if (result.kind !== "resolved") {
    throw new Error(`expected a resolved mode set, got: ${result.detail}`);
  }
  return result;
}

function modeNamed(set: ResolvedModeSet, label: string): PropagationMode {
  const mode = set.modes.find((candidate) => candidate.label === label);
  if (mode === undefined) throw new Error(`no mode ${label} in the set`);
  return mode;
}

describe("section 5.2.1: which modes are considered", () => {
  it("names up to three E modes and up to six F2 modes on a short path", () => {
    // D = 1500 km. E: dhmax(110 km) = 1775.582206543904 km > 1500, so n0 = 1
    // and the three E modes are 1E, 2E, 3E. F2: hr = 1490/3 - 176 =
    // 320.666666666667 km, dhmax(320.667) = 3347.443352589471 km > 1500, so
    // n0 = 1 and the six F2 modes are 1F2 to 6F2.
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    expect(set.modes.map((mode) => mode.label)).toEqual([
      "1E",
      "2E",
      "3E",
      "1F2",
      "2F2",
      "3F2",
      "4F2",
      "5F2",
      "6F2",
    ]);
    // E modes first, then F2, each in ascending hop order: the order a report
    // shows and the order the reference's own loops run in.
    expect(set.modes.slice(0, 3).every((mode) => mode.layer === "E")).toBe(
      true,
    );
    expect(set.modes.slice(3).every((mode) => mode.layer === "F2")).toBe(true);
  });

  it("drops to two E modes when the lowest order cannot reach", () => {
    // D = 3000 km. 3000/1 = 3000 > 1775.582206543904, so 1E does not exist at
    // all; 3000/2 = 1500 < 1775.58, so n0 = 2 and the E set is 2E, 3E. Section
    // 5.2.1 says "the lowest-order mode ... and the next two higher-order
    // modes", and there is no fourth.
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(3000), frequencyMHz: 20, sample }),
    );
    const eModes = set.modes.filter((mode) => mode.layer === "E");
    expect(eModes.map((mode) => mode.label)).toEqual(["2E", "3E"]);
  });

  it("has no E mode at all beyond 4000 km", () => {
    // Section 5.2.1: "up to three E modes (for paths up to 4 000 km)".
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(5000), frequencyMHz: 20, sample }),
    );
    expect(set.modes.some((mode) => mode.layer === "E")).toBe(false);
    expect(set.basicMuf.e).toBeNull();
  });

  it("refuses a route or a frequency it has no equation for", () => {
    const { sample } = samplerByLabel({});
    expect(() =>
      modeSet({ route: routeOfLength(0), frequencyMHz: 14, sample }),
    ).toThrow(RangeError);
    expect(() =>
      modeSet({ route: routeOfLength(1500), frequencyMHz: 0, sample }),
    ).toThrow(RangeError);
    expect(() =>
      modeSet({ route: routeOfLength(1500), frequencyMHz: Number.NaN, sample }),
    ).toThrow(RangeError);
  });

  it("reports the slice A refusal rather than inventing a mode set", () => {
    // Beyond 9000 km the short-path method does not apply and `basicMuf`
    // refuses; there is no mode set to build on top of a refusal.
    const { sample } = samplerByLabel({});
    const result = modeSet({
      route: routeOfLength(9500),
      frequencyMHz: 14,
      sample,
    });
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason).toBe("out_of_domain");
    expect(result.groundDistanceKm).toBe(9500);
  });
});

describe("equation (13): the elevation of each mode", () => {
  it("takes E modes from 110 km", () => {
    // D = 1500 km at hr = 110 km:
    //   1E: psi = 0.117720922932, delta = 4.891588369164 deg
    //   2E: psi = 0.058860461466, delta = 14.524965930084 deg
    //   3E: psi = 0.039240307644, delta = 22.441622168126 deg
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    expect(modeNamed(set, "1E").mirrorHeightKm).toBe(110);
    expect(modeNamed(set, "1E").elevationDeg).toBeCloseTo(
      4.891588369163673,
      PRECISION,
    );
    expect(modeNamed(set, "2E").elevationDeg).toBeCloseTo(
      14.524965930083765,
      PRECISION,
    );
    expect(modeNamed(set, "3E").elevationDeg).toBeCloseTo(
      22.441622168126024,
      PRECISION,
    );
    // Radians and degrees are the same angle, not two answers.
    const oneE = modeNamed(set, "1E");
    expect(((oneE.elevationRad as number) * 180) / Math.PI).toBeCloseTo(
      oneE.elevationDeg as number,
      12,
    );
  });

  it("selects F2 modes on the equation (2) height at the mid-point", () => {
    // Section 5.2.1's first criterion. M(3000)F2 = 3 at M, so
    // hr = 1490/3 - 176 = 320.666666666667 km, and D = 1500 km <= dmax:
    //   1F2: delta = 19.243081389366 deg
    //   2F2: delta = 38.137779972466 deg
    // Those two numbers are also, exactly, what the pinned reference reports as
    // `ele` and `DMele`, which is why the comparator carries them.
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    expect(set.f2SelectionMirrorHeightKm).toBeCloseTo(
      320.6666666666667,
      PRECISION,
    );
    expect(set.f2SelectionMirrorHeightSource).toBe("mid_path");
    expect(set.f2SelectionMirrorHeightLabel).toBe("M");
    expect(modeNamed(set, "1F2").selectionMirrorHeightKm).toBeCloseTo(
      320.6666666666667,
      PRECISION,
    );
    expect(modeNamed(set, "1F2").selectionElevationDeg as number).toBeCloseTo(
      19.2430813893664,
      PRECISION,
    );
    expect(modeNamed(set, "2F2").selectionElevationDeg as number).toBeCloseTo(
      38.137779972465815,
      PRECISION,
    );
  });

  it("reports F2 elevations from the section 5.1 height, not that one", () => {
    // Section 5.1 defines equation (13)'s hr itself, so the reported elevation
    // is equation (13) at the section 5.1 height of this mode's own hop. The
    // height comes from `reflectionHeight.ts`, which has its own tests; what is
    // asserted here is that equation (13) is applied to THAT height and to no
    // other. D = 1500 km is under dmax, so Table 1c names the mid-point alone
    // and the mean is over one point.
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    for (const hopCount of [1, 2]) {
      const mode = modeNamed(set, `${String(hopCount)}F2`);
      const heightKm = f2ReflectionHeight({
        ...BASE_STATE,
        frequencyMHz: 20,
        groundDistanceKm: 1500,
        hopCount,
      }).heightKm;
      expect(mode.mirrorHeightKm).toBeCloseTo(heightKm, PRECISION);
      expect(mode.elevationDeg).toBeCloseTo(
        elevationDegAt(1500, hopCount, heightKm),
        PRECISION,
      );
      // The two heights really are different numbers here, so the assertion
      // above could not have passed by them coinciding.
      expect(
        Math.abs(mode.mirrorHeightKm - mode.selectionMirrorHeightKm),
      ).toBeGreaterThan(1);
      expect(
        Math.abs(
          (mode.elevationDeg as number) -
            (mode.selectionElevationDeg as number),
        ),
      ).toBeGreaterThan(0.5);
      // Radians and degrees are the same angle, not two answers.
      expect(((mode.elevationRad as number) * 180) / Math.PI).toBeCloseTo(
        mode.elevationDeg as number,
        12,
      );
    }
  });

  it.each([1490 / 176, 9])(
    "returns an explicit domain rejection when a Table 1c height is non-positive (M=%s)",
    (m3000F2) => {
      const { sample } = samplerByLabel({
        "T + d0/2": { foF2MHz: 10 },
        M: { foF2MHz: 9 },
        "R - d0/2": { foF2MHz: 7, m3000F2 },
      });
      // Equation (2): 1490/M - 176 is zero at the boundary, negative above.
      // Midpoint geometry still admits the circuit; one selection point must
      // not abort it with hopGeometry's positive-height RangeError.
      const set = modeSet({
        route: routeOfLength(5000),
        frequencyMHz: 20,
        sample,
      });
      expect(set.kind).toBe("unsupported");
      if (set.kind !== "unsupported")
        throw new Error("expected domain rejection");
      expect(set.reason).toBe("out_of_domain");
      expect(set.detail).toContain("R - d0/2");
      expect(set.detail).toContain("non-positive equation (2) mirror height");
      expect(set.groundDistanceKm).toBe(5000);
    },
  );

  it("takes them from the Table 1c point with the lower foF2 beyond dmax", () => {
    // D = 5000 km, dmax restricted to 4000, so section 5.2.1's second clause
    // applies. Table 1c names T + d0/2, M and R - d0/2; foF2 is 10, 9 and 7, so
    // the height comes from R - d0/2, where M(3000)F2 = 2.5 gives
    // hr = 1490/2.5 - 176 = 420 km. n0 is still found at the mid-point height
    // (dhmax(320.667) = 3347.44 km, 5000/2 = 2500 < 3347.44, so n0 = 2), and
    // then every mode is selected at 420 km:
    //   2F2: delta = 12.343701514760 deg
    //   6F2: delta = 42.415485176459 deg
    const { sample } = samplerByLabel({
      "T + d0/2": { foF2MHz: 10 },
      M: { foF2MHz: 9 },
      "R - d0/2": { foF2MHz: 7, m3000F2: 2.5 },
    });
    const set = resolved(
      modeSet({ route: routeOfLength(5000), frequencyMHz: 20, sample }),
    );
    expect(set.f2SelectionMirrorHeightSource).toBe("table_1c_lowest_fof2");
    expect(set.f2SelectionMirrorHeightLabel).toBe("R - d0/2");
    expect(set.f2SelectionMirrorHeightKm).toBeCloseTo(420, PRECISION);
    expect(set.modes.map((mode) => mode.label)).toEqual([
      "2F2",
      "3F2",
      "4F2",
      "5F2",
      "6F2",
    ]);
    expect(modeNamed(set, "2F2").selectionElevationDeg as number).toBeCloseTo(
      12.343701514759823,
      PRECISION,
    );
    expect(modeNamed(set, "6F2").selectionElevationDeg as number).toBeCloseTo(
      42.415485176458894,
      PRECISION,
    );
  });
});

describe("section 4: screening, and contract M07's labelling", () => {
  it("leaves a mode alone when fs is below the operating frequency", () => {
    // foE = 1.8 MHz everywhere, f = 20 MHz. fs = 1.05 x 1.8 sec i, and sec i on
    // a 1500 km hop from any section 5.1 height is under 3, so fs is under
    // 5.7 MHz and cannot reach 20.
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    expect(set.screening.kind).toBe("evaluated");
    for (const mode of set.modes) {
      expect(mode.status).toBe("supported");
    }
    const oneF2 = modeNamed(set, "1F2");
    expect(oneF2.screeningFrequencyMHz).not.toBeNull();
    // The inequality that holds whatever the section 5.1 height is: cos i <= 1.
    expect(oneF2.screeningFrequencyMHz as number).toBeGreaterThanOrEqual(
      E_LAYER_SCREENING_FACTOR * 1.8,
    );
    // Section 4's delta_F and the mode's reported elevation are one angle now:
    // equation (12) is taken at `elevationRad` and the record carries no second
    // screening elevation to disagree with it.
    expect(oneF2.screeningFrequencyMHz as number).toBeCloseTo(
      screeningFrequencyMHz(1.8, oneF2.elevationRad as number),
      12,
    );
    // And that angle is not the selection angle, so the identity above is a
    // statement about which height section 4 used.
    expect(oneF2.mirrorHeightKm).not.toBe(oneF2.selectionMirrorHeightKm);
  });

  it("labels every screened F2 mode and drops none of them", () => {
    // D = 3000 km, so section 4 takes the HIGHER of the two 1000 km foE values:
    // 1.8 at T + 1000 and 6.0 at R - 1000, so foE = 6.0. At f = 6 MHz,
    // fs >= 1.05 x 6.0 = 6.3 MHz > 6 MHz whatever the incidence angle, so every
    // F2 mode is screened. Contract M07: they stay on the list, labelled.
    const labelled = samplerByLabel({
      "T + 1000": { foF2MHz: 12, foEMHz: 1.8 },
      "R - 1000": { foF2MHz: 12, foEMHz: 6.0 },
      M: { foF2MHz: 12 },
    });
    const set = resolved(
      modeSet({
        route: routeOfLength(3000),
        frequencyMHz: 6,
        sample: labelled.sample,
      }),
    );
    expect(set.screening.kind).toBe("evaluated");
    if (set.screening.kind === "evaluated") {
      expect(set.screening.foEMHz).toBe(6.0);
      expect(set.screening.sampledFoEMHz).toEqual([1.8, 6.0]);
    }

    const f2Modes = set.modes.filter((mode) => mode.layer === "F2");
    expect(f2Modes.length).toBeGreaterThan(0);
    for (const mode of f2Modes) {
      expect(mode.status).toBe("screened");
      expect(mode.unsupportedReason).toBeNull();
      expect(mode.screeningFrequencyMHz as number).toBeGreaterThanOrEqual(
        E_LAYER_SCREENING_FACTOR * 6.0,
      );
      // Still a full record: a report has to be able to say how short of the
      // screening frequency the band was.
      expect(mode.elevationDeg as number).toBeGreaterThan(0);
      expect(mode.virtualSlantRangeKm).not.toBeNull();
      expect(mode.basicMufMHz).toBeGreaterThan(0);
    }
    // Not one of them survives into the selected set, and the E modes do.
    expect(set.supportedModes.every((mode) => mode.layer === "E")).toBe(true);
    expect(set.supportedModes.length).toBe(
      set.modes.filter((mode) => mode.layer === "E").length,
    );
    // supportedModes is a filter of modes, never a second list.
    for (const mode of set.supportedModes) {
      expect(set.modes).toContain(mode);
    }
  });

  it("never screens an E mode, because fs is what stops it reaching F2", () => {
    const labelled = samplerByLabel({
      "T + 1000": { foF2MHz: 12, foEMHz: 1.8 },
      "R - 1000": { foF2MHz: 12, foEMHz: 6.0 },
      M: { foF2MHz: 12 },
    });
    const set = resolved(
      modeSet({
        route: routeOfLength(3000),
        frequencyMHz: 6,
        sample: labelled.sample,
      }),
    );
    for (const mode of set.modes.filter((m) => m.layer === "E")) {
      expect(mode.screeningFrequencyMHz).toBeNull();
      // Section 5.1 gives an E mode hr = 110 km and equation (2) is an F2
      // formula, so both heights are the one number.
      expect(mode.mirrorHeightKm).toBe(110);
      expect(mode.selectionMirrorHeightKm).toBe(110);
      expect(mode.status).toBe("supported");
    }
  });

  it("screens nothing beyond 4000 km, where section 4 is not evaluated", () => {
    // The same foE that screened every mode at 3000 km, on a 5000 km path.
    // Section 4 considers screening "for paths up to 4 000 km" and this is not
    // one, so there is no fs and no mode is screened.
    const { sample } = samplerByLabel({
      "T + 1000": { foEMHz: 6.0 },
      "R - 1000": { foEMHz: 6.0 },
    });
    const set = resolved(
      modeSet({ route: routeOfLength(5000), frequencyMHz: 6, sample }),
    );
    expect(set.screening.kind).toBe("not_evaluated");
    if (set.screening.kind === "not_evaluated") {
      expect(set.screening.reason).toBe("path_beyond_4000_km");
    }
    for (const mode of set.modes) {
      expect(mode.screeningFrequencyMHz).toBeNull();
      // The section 5.1 height is still computed, because equation (13) needs
      // it on every path; only section 4 stops at 4 000 km.
      expect(mode.mirrorHeightKm).toBeGreaterThan(0);
      expect(mode.status).not.toBe("screened");
    }
  });
});

describe("the 3 degree elevation floor, on the height selection uses", () => {
  it("labels a mode the Table 1c height puts under the floor", () => {
    // Deviation 3 of the module header, constructed. D = 5400 km. n0 is chosen
    // at the mid-point height hr = 1490/3 - 176 = 320.666666666667 km, where
    // 5400/2 = 2700 < dhmax(320.667) = 3347.443352589471 km, so n0 = 2. Beyond
    // dmax, section 5.2.1's first criterion moves the selection height to the
    // Table 1c point with the lower foF2, R - d0/2, where M(3000)F2 = 4.0 gives
    // hr = 1490/4 - 176 = 196.5 km; equation (13) at 196.5 km over a 2700 km
    // hop is 2.056933994142 degrees, under the 3 degree floor. The reference
    // keeps this mode because it applied the floor only when it chose n0 at the
    // other height; we label it and keep it on the list.
    const { sample } = samplerByLabel({
      "T + d0/2": { foF2MHz: 10 },
      M: { foF2MHz: 9 },
      "R - d0/2": { foF2MHz: 7, m3000F2: 4.0 },
    });
    const set = resolved(
      modeSet({ route: routeOfLength(5400), frequencyMHz: 20, sample }),
    );
    expect(set.f2SelectionMirrorHeightKm).toBeCloseTo(196.5, PRECISION);
    const twoF2 = modeNamed(set, "2F2");
    expect(twoF2.selectionElevationDeg as number).toBeCloseTo(
      2.056933994142354,
      PRECISION,
    );
    expect(twoF2.selectionElevationDeg as number).toBeLessThan(
      MIN_ELEVATION_DEG,
    );
    expect(twoF2.status).toBe("geometrically_unsupported");
    expect(twoF2.unsupportedReason).toBe("below_minimum_elevation");
    // Labelled, not dropped, and the higher orders are unaffected.
    expect(set.modes.map((mode) => mode.label)).toEqual([
      "2F2",
      "3F2",
      "4F2",
      "5F2",
      "6F2",
    ]);
    expect(modeNamed(set, "3F2").status).toBe("supported");
    expect(set.supportedModes.map((mode) => mode.label)).toEqual([
      "3F2",
      "4F2",
      "5F2",
      "6F2",
    ]);
  });
});

describe("when the section 5.1 height cannot close a selected hop", () => {
  it("labels the mode and reports no elevation rather than a negative one", () => {
    // The two heights are independent, so section 5.2.1 can select a mode at
    // the equation (2) height whose hop is longer than the section 5.1 height
    // reaches. Equation (13) is an arctangent with no floor, so it returns a
    // negative angle there and equation (19) returns nothing at all; the
    // recommendation does not address the case and the reference never meets
    // it, because it reports the equation (2) elevation. Constructed here:
    // D = 6600 km with `LOW_SECTION_5_1_STATE` at every control point, so the
    // equation (2) height is 420 km and n0 = 2 (6600/2 = 3300 km, inside
    // dhmax(420) = 3749.0 km), while the section 5.1 height is near 200 km.
    const { sample } = samplerByLabel(uniform(LOW_SECTION_5_1_STATE));
    const set = resolved(
      modeSet({ route: routeOfLength(6600), frequencyMHz: 5, sample }),
    );
    const twoF2 = modeNamed(set, "2F2");

    // The condition, stated in terms a reader can check against the leaf
    // rather than against this module: the selection height reaches this hop
    // and the section 5.1 height does not.
    expect(
      maximumHopGroundDistanceKm(twoF2.selectionMirrorHeightKm),
    ).toBeGreaterThan(twoF2.hopGroundDistanceKm);
    expect(maximumHopGroundDistanceKm(twoF2.mirrorHeightKm)).toBeLessThan(
      twoF2.hopGroundDistanceKm,
    );

    expect(twoF2.status).toBe("geometrically_unsupported");
    expect(twoF2.unsupportedReason).toBe("mirror_height_cannot_close_hop");
    // No elevation is reported at all, rather than a negative one: there is no
    // angle, and a consumer that pointed an antenna at -0.2 degrees would be
    // acting on a number the recommendation never produced.
    expect(twoF2.elevationRad).toBeNull();
    expect(twoF2.elevationDeg).toBeNull();
    expect(twoF2.virtualSlantRangeKm).toBeNull();
    // And the record still says why section 5.2.1 selected it.
    expect(twoF2.selectionElevationDeg as number).toBeGreaterThan(
      MIN_ELEVATION_DEG,
    );
    expect(twoF2.selectionSlantRangeKm).not.toBeNull();
    expect(twoF2.selectionMirrorHeightKm).toBeCloseTo(420, PRECISION);

    // The mode is labelled, not dropped, and the higher orders are unaffected.
    expect(set.modes).toContain(twoF2);
    expect(set.supportedModes).not.toContain(twoF2);
    expect(modeNamed(set, "3F2").status).toBe("supported");
    expect(modeNamed(set, "3F2").elevationDeg).not.toBeNull();
  });

  it("is the only thing that nulls an elevation", () => {
    // The invariant `modeTypes.ts` states: the three product fields are null
    // exactly on a `geometrically_unsupported` mode with this reason. Checked
    // over every case this file builds, so a future branch that returns a null
    // for some other reason is caught here.
    const routes: readonly [number, number, StateOverrides][] = [
      [1500, 20, LOW_SECTION_5_1_STATE],
      [3000, 6, LOW_SECTION_5_1_STATE],
      [5000, 20, LOW_SECTION_5_1_STATE],
      [5400, 20, LOW_SECTION_5_1_STATE],
      [6600, 5, LOW_SECTION_5_1_STATE],
      [500, 10, NON_POSITIVE_SECTION_5_1_STATE],
      [2500, 10, NON_POSITIVE_SECTION_5_1_STATE],
    ];
    const reasonsSeen = new Set<string>();
    for (const [groundDistanceKm, frequencyMHz, state] of routes) {
      const { sample } = samplerByLabel(uniform(state));
      const set = resolved(
        modeSet({
          route: routeOfLength(groundDistanceKm),
          frequencyMHz,
          sample,
        }),
      );
      for (const mode of set.modes) {
        const nulled =
          mode.elevationRad === null ||
          mode.elevationDeg === null ||
          mode.virtualSlantRangeKm === null;
        expect(mode.elevationRad === null).toBe(nulled);
        expect(mode.elevationDeg === null).toBe(nulled);
        expect(mode.virtualSlantRangeKm === null).toBe(nulled);
        if (nulled) {
          expect(mode.status).toBe("geometrically_unsupported");
          expect([
            "mirror_height_cannot_close_hop",
            "mirror_height_not_positive",
          ]).toContain(mode.unsupportedReason);
          reasonsSeen.add(mode.unsupportedReason as string);
        }
      }
    }
    // Both halves of the invariant are exercised rather than asserted over a
    // set that only ever meets one of them.
    expect([...reasonsSeen].sort()).toEqual([
      "mirror_height_cannot_close_hop",
      "mirror_height_not_positive",
    ]);
  });
});

describe("when the section 5.1 formula returns no height at all", () => {
  it("labels the mode rather than throwing out of the geometry", () => {
    // Section 5.1's (a), (b) and (c) are polynomial fits and the
    // recommendation bounds none of them below, so a state whose values are
    // each perfectly ordinary can put the height at or under zero. Here
    // M(3000)F2 = 6 makes H = 1490/(6 + dM) - 316 negative and foF2/foE = 2
    // takes branch (c), which returns -33.637 km on this hop. There is no
    // mirror to reflect from, equation (13) has no argument, and `hopGeometry`
    // rejects the height outright, so the mode has to be labelled before it is
    // asked for geometry or the whole circuit dies with it.
    const height = f2ReflectionHeight({
      m3000F2: 6,
      foF2MHz: 10,
      foEMHz: 5,
      r12: 0,
      frequencyMHz: 10,
      groundDistanceKm: 500,
      hopCount: 1,
    });
    expect(height.branch).toBe("5.1c");
    expect(height.heightKm).toBeCloseTo(-33.637451687433625, PRECISION);

    const { sample } = samplerByLabel(uniform(NON_POSITIVE_SECTION_5_1_STATE));
    const set = resolved(
      modeSet({ route: routeOfLength(500), frequencyMHz: 10, sample }),
    );
    const oneF2 = modeNamed(set, "1F2");

    expect(oneF2.status).toBe("geometrically_unsupported");
    expect(oneF2.unsupportedReason).toBe("mirror_height_not_positive");
    // The height the formula gave is kept, because a reader of the record has
    // to be able to see what happened without rerunning the leaf.
    expect(oneF2.mirrorHeightKm).toBeCloseTo(-33.637451687433625, PRECISION);
    expect(oneF2.elevationRad).toBeNull();
    expect(oneF2.elevationDeg).toBeNull();
    expect(oneF2.virtualSlantRangeKm).toBeNull();
    // Section 4 needs equation (13)'s angle, which does not exist here.
    expect(oneF2.screeningFrequencyMHz).toBeNull();
    // And section 5.2.1's own geometry is untouched: equation (2) gives
    // 1490/6 - 176 = 72.33 km, which reflects this 500 km hop perfectly well,
    // so the record still shows why the mode was selected.
    expect(oneF2.selectionMirrorHeightKm).toBeCloseTo(
      1490 / 6 - 176,
      PRECISION,
    );
    expect(oneF2.selectionElevationDeg).not.toBeNull();
    expect(oneF2.selectionSlantRangeKm).not.toBeNull();

    // Every F2 mode on this path is in the same state, and every E mode is
    // unaffected: section 5.2.1 fixes their mirror at 110 km, so an E mode has
    // no formula that can fail this way.
    for (const mode of set.modes) {
      if (mode.layer !== "F2") continue;
      expect(mode.unsupportedReason).toBe("mirror_height_not_positive");
      expect(mode.mirrorHeightKm).toBeLessThan(0);
    }
    for (const mode of set.modes) {
      if (mode.layer !== "E") continue;
      expect(mode.mirrorHeightKm).toBe(110);
      expect(mode.status).toBe("supported");
      expect(mode.elevationDeg).not.toBeNull();
    }
    expect(set.supportedModes.every((mode) => mode.layer === "E")).toBe(true);
  });
});

describe("the hop-length criteria section 5.2.1 also states", () => {
  it("cannot fire for E modes, because the 3 degree floor is stricter", () => {
    // dhmax(110 km) = 2 R0 (pi/2 - 3 deg - i(3 deg, 110 km))
    //               = 1775.582206543904 km, which is under 2 000 km.
    // `lowestOrderHopCount` only admits an n whose hop is under that, so
    // section 5.2.1's "lowest-order mode with hop length up to 2 000 km" is
    // already true of every E mode that exists. The criterion is still coded;
    // this is the arithmetic that makes it unreachable today, and it is
    // asserted so that a change to the floor or to the E height is reported
    // here rather than silently making the criterion load-bearing.
    expect(maxHopForMinElevationKm(110)).toBeCloseTo(1775.5822065439036, 6);
    expect(maxHopForMinElevationKm(110)).toBeLessThan(E_MODE_MAX_HOP_KM);
  });

  it("cannot fire for F2 modes over the physical range of the maps", () => {
    // The same statement for F2, where the bound is dmax rather than a
    // constant. `lowestOrderHopCount` admits n only when
    // D/n < min(dhmax(hr), 4000), and dmax is at least that over every
    // M(3000)F2 the CCIR maps produce and every foF2/foE ratio:
    //   hr    = min(1490/M - 176, 500)                                   (2)
    //   B     = M - 0.124 + (M^2 - 4)(0.0215 + 0.005 sin(7.854/x - 1.9635))  (6)
    //   dmax  = min(4780 + (12610 + 2140/x^2 - 49720/x^4 + 688900/x^6)
    //               (1/B - 0.303), 4000)                                 (5)
    // Swept over M in [1.5, 6] and x in [2, 50] the largest value of
    // min(dhmax(hr), 4000) - dmax is 0 km, reached only where both are the
    // 4000 km restriction itself.
    let worstGapKm = Number.NEGATIVE_INFINITY;
    for (let mHundredths = 150; mHundredths <= 600; mHundredths += 1) {
      const m3000F2 = mHundredths / 100;
      const hrKm = Math.min(1490 / m3000F2 - 176, 500);
      if (hrKm <= 0) continue;
      const longestHopKm = Math.min(maxHopForMinElevationKm(hrKm), 4000);
      for (let xHundredths = 200; xHundredths <= 5000; xHundredths += 5) {
        const x = xHundredths / 100;
        const b =
          m3000F2 -
          0.124 +
          (m3000F2 * m3000F2 - 4) *
            (0.0215 + 0.005 * Math.sin(7.854 / x - 1.9635));
        const dmaxKm = Math.min(
          4780 +
            (12610 + 2140 / x ** 2 - 49720 / x ** 4 + 688900 / x ** 6) *
              (1 / b - 0.303),
          4000,
        );
        worstGapKm = Math.max(worstGapKm, longestHopKm - dmaxKm);
      }
    }
    expect(worstGapKm).toBeLessThanOrEqual(0);
  });
});

describe("the control points a mode set asks the ionosphere for", () => {
  it("asks each distinct point exactly once", () => {
    // D = 3000 km. `basicMuf` wants M and Table 1a's T + 1000 / R - 1000,
    // section 4 wants Table 1b's T + 1000 / R - 1000, and the section 5.1
    // height wants Table 1c's M. That is three distinct places asked five
    // times; the cache turns it into three calls.
    const { sample, seen } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(3000), frequencyMHz: 20, sample }),
    );
    expect([...seen].sort()).toEqual(["M", "R - 1000", "T + 1000"]);
    expect(set.controlPoints.map((point) => point.label)).toEqual(seen);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("carries slice A's own result rather than a second copy of it", () => {
    const { sample } = samplerByLabel({});
    const set = resolved(
      modeSet({ route: routeOfLength(1500), frequencyMHz: 20, sample }),
    );
    expect(set.basicMuf.kind).toBe("resolved");
    expect(set.dmaxKm).toBe(set.basicMuf.dmaxKm);
    // Every mode's basic MUF is the one slice A computed, not a new one.
    for (const mode of set.modes) {
      const layer = mode.layer === "E" ? set.basicMuf.e : set.basicMuf.f2;
      const slice = layer?.modes.find(
        (candidate) => candidate.hopCount === mode.hopCount,
      );
      expect(slice).toBeDefined();
      expect(mode.basicMufMHz).toBe(slice?.basicMufMHz);
      expect(mode.hopGroundDistanceKm).toBe(slice?.hopGroundDistanceKm);
    }
  });
});
