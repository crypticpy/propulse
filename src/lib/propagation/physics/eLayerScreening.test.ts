// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  type ControlPointSampler,
  type MufControlPointState,
} from "./basicMuf";
import type { ControlPointLabel } from "./controlPoints";
import {
  isScreened,
  pathScreeningFoE,
  screeningFrequencyMHz,
  screeningIncidenceAngleRad,
  E_LAYER_SCREENING_FACTOR,
  E_SCREENING_MAX_PATH_KM,
} from "./eLayerScreening";

/**
 * Every expected number in this file was computed from the published P.533-14
 * equations (11), (12) and (13), by an independent Python transcription
 * written from the recommendation text before this module was run. The inputs
 * and the intermediate values are recorded beside each one so the arithmetic
 * can be checked without this file. None of them is a snapshot of
 * `eLayerScreening.ts`.
 *
 * The shared transcription, for reference:
 *
 *   psi   = d / (2 R0)                         R0 = 6371 km
 *   delta = atan2(cos psi - R0/(R0 + hr), sin psi)              (13)
 *   i     = asin(R0 cos delta / (R0 + 110))                     (12)
 *   fs    = 1.05 foE / cos i                                    (11)
 */
const PRECISION = 9;

/** A route of an exact length; see `controlPoints.test.ts` for why. */
function routeOfLength(groundDistanceKm: number): ResolvedRoute {
  const base = resolveRoute(
    { latitudeDeg: 0, longitudeDeg: 0 },
    { latitudeDeg: 10, longitudeDeg: 40 },
  );
  if (base.kind !== "resolved") throw new Error("fixture route is degenerate");
  return { ...base, groundDistanceKm, arcAngleRad: groundDistanceKm / 6371 };
}

const state = (foEMHz: number): MufControlPointState => ({
  foF2MHz: 8,
  m3000F2: 3,
  foEMHz,
  gyrofrequency300kmMHz: 1.2,
});

/** A sampler that answers a different foE per Table 1b label. */
function samplerByLabel(
  byLabel: Partial<Record<ControlPointLabel, number>>,
  fallback = 1,
): { sample: ControlPointSampler; seen: ControlPointLabel[] } {
  const seen: ControlPointLabel[] = [];
  const sample: ControlPointSampler = (
    _point: GeodeticPoint,
    label: ControlPointLabel,
  ) => {
    seen.push(label);
    return state(byLabel[label] ?? fallback);
  };
  return { sample, seen };
}

describe("equation (12): angle of incidence at 110 km", () => {
  it("is zero for a ray going straight up", () => {
    // delta = pi/2, cos delta = 0, so arcsin(0) = 0 whatever R0 and hr are.
    expect(screeningIncidenceAngleRad(Math.PI / 2)).toBeCloseTo(0, 12);
  });

  it("is 60.113284 degrees for the 1000 km, 300 km-mirror ray", () => {
    // psi = 1000 / 12742 = 0.078480615288 rad
    // cos psi = 0.996921976847, sin psi = 0.078400077036
    // R0/(R0 + 300) = 0.955029230999
    // delta = atan2(0.041892745848, 0.078400077036) = 0.490745187548 rad
    // i = asin((6371/6481) cos 0.490745187548) = 1.049174738661 rad
    expect(screeningIncidenceAngleRad(0.49074518754842666)).toBeCloseTo(
      1.0491747386612604,
      PRECISION,
    );
  });

  it("reaches 79.43 degrees as the ray goes flat, sec i to 5.45", () => {
    // delta = 0: i = asin(6371/6481) = asin(0.983027310600) = 1.386292018291
    // rad = 79.428681820738 deg, sec i = 5.450800918569. A horizontal F2 ray
    // is screened up to five and a half times foE, which is why fs matters at
    // all on a long path: the incidence term, not foE, does most of the work.
    const i = screeningIncidenceAngleRad(0);
    expect((i * 180) / Math.PI).toBeCloseTo(79.42868182073788, 6);
    expect(1 / Math.cos(i)).toBeCloseTo(5.450800918569461, 6);
  });
});

describe("equation (11): fs = 1.05 foE sec i", () => {
  it("is 1.05 foE at vertical incidence", () => {
    expect(screeningFrequencyMHz(2, Math.PI / 2)).toBeCloseTo(2.1, 12);
    expect(E_LAYER_SCREENING_FACTOR).toBe(1.05);
  });

  it("is 4.214440957 MHz for foE = 2 MHz on the 1000 km, 300 km ray", () => {
    // i = 1.049174738661 rad (above), cos i = 0.498286729226
    // fs = 1.05 x 2 / 0.498286729226 = 4.214440957041 MHz
    expect(screeningFrequencyMHz(2, 0.49074518754842666)).toBeCloseTo(
      4.214440957041354,
      PRECISION,
    );
  });

  it("is 5.871233095 MHz for foE = 2.6 MHz on the 1250 km, 350 km ray", () => {
    // psi = 1250 / 12742 = 0.098100769110 rad
    // R0/(R0 + 350) = 0.947916048148
    // delta = 0.449632... rad = 25.761971142696 deg
    // i = 1.087205... rad, cos i = 0.464978984123
    // fs = 1.05 x 2.6 / 0.464978984123 = 5.871233094863 MHz
    const delta = (25.761971142696257 * Math.PI) / 180;
    expect(screeningFrequencyMHz(2.6, delta)).toBeCloseTo(
      5.871233094863425,
      PRECISION,
    );
    // The same ray with the other end's lower foE, for the higher-of-two rule
    // below: 1.05 x 1.8 / 0.464978984123 = 4.064699834905 MHz.
    expect(screeningFrequencyMHz(1.8, delta)).toBeCloseTo(
      4.064699834905447,
      PRECISION,
    );
  });

  it("is a plain multiple of foE, because foE is a factor", () => {
    const delta = 0.3;
    expect(screeningFrequencyMHz(6, delta)).toBeCloseTo(
      3 * screeningFrequencyMHz(2, delta),
      12,
    );
  });

  it("rises steeply as the ray flattens", () => {
    // The same 3 MHz foE on a 2000 km hop at a 250 km mirror:
    // delta = 9.252705777162 deg, i = 75.986079472444 deg,
    // cos i = 0.242157630575, fs = 1.05 x 3 / 0.242157630575 = 13.008055920 MHz
    const delta = (9.2527057771617 * Math.PI) / 180;
    expect(screeningFrequencyMHz(3, delta)).toBeCloseTo(
      13.00805592011769,
      PRECISION,
    );
  });

  it("refuses a foE it has no equation for", () => {
    expect(() => screeningFrequencyMHz(0, 0.5)).toThrow(RangeError);
    expect(() => screeningFrequencyMHz(-1, 0.5)).toThrow(RangeError);
    expect(() => screeningFrequencyMHz(2, Number.NaN)).toThrow(RangeError);
  });
});

describe("section 5.2.1's screening criterion", () => {
  it("keeps a mode whose fs is strictly below the frequency", () => {
    expect(isScreened(4.21, 4.22)).toBe(false);
  });

  it("screens a mode at exactly fs, because the text says 'less than'", () => {
    expect(isScreened(4.21, 4.21)).toBe(true);
    expect(isScreened(4.21, 4.2)).toBe(true);
  });

  it("does not screen where section 4 was never evaluated", () => {
    expect(isScreened(null, 0.5)).toBe(false);
  });
});

describe("section 4: which foE", () => {
  it("takes the mid-point value up to 2000 km", () => {
    const { sample, seen } = samplerByLabel({ M: 2.4 });
    const result = pathScreeningFoE({ route: routeOfLength(1500), sample });
    expect(result.kind).toBe("evaluated");
    if (result.kind !== "evaluated") return;
    expect(result.foEMHz).toBe(2.4);
    expect(seen).toEqual(["M"]);
    expect(result.points.map((p) => p.label)).toEqual(["M"]);
  });

  it("still takes the mid-point at exactly 2000 km", () => {
    // Table 1b's first row is 0 < D <= 2000, so the boundary belongs to M.
    const { sample, seen } = samplerByLabel({ M: 2.4 });
    const result = pathScreeningFoE({ route: routeOfLength(2000), sample });
    expect(seen).toEqual(["M"]);
    expect(result.kind).toBe("evaluated");
  });

  it("takes the HIGHER of the two 1000 km control points beyond 2000 km", () => {
    // The opposite of section 3.3's lower-of-two for the basic MUF. Getting
    // this backwards makes every marginal F2 mode survive that should not.
    const { sample, seen } = samplerByLabel({
      "T + 1000": 1.8,
      "R - 1000": 2.6,
    });
    const result = pathScreeningFoE({ route: routeOfLength(2500), sample });
    expect(result.kind).toBe("evaluated");
    if (result.kind !== "evaluated") return;
    expect(result.foEMHz).toBe(2.6);
    expect(result.sampledFoEMHz).toEqual([1.8, 2.6]);
    expect(seen).toEqual(["T + 1000", "R - 1000"]);
  });

  it("is still evaluated at exactly 4000 km", () => {
    // Section 4: "for paths up to 4 000 km", inclusive.
    const { sample } = samplerByLabel({ "T + 1000": 1.8, "R - 1000": 2.6 });
    const result = pathScreeningFoE({
      route: routeOfLength(E_SCREENING_MAX_PATH_KM),
      sample,
    });
    expect(result.kind).toBe("evaluated");
  });

  it("is not evaluated at all beyond 4000 km", () => {
    const { sample, seen } = samplerByLabel({ "T + 1000": 1.8 });
    const result = pathScreeningFoE({ route: routeOfLength(4000.5), sample });
    expect(result.kind).toBe("not_evaluated");
    if (result.kind !== "not_evaluated") return;
    expect(result.reason).toBe("path_beyond_4000_km");
    expect(result.detail).toContain("4000 km");
    // And nothing was sampled: there is no question to ask the ionosphere.
    expect(seen).toEqual([]);
  });

  it("refuses a route with no usable length", () => {
    const { sample } = samplerByLabel({});
    expect(() => pathScreeningFoE({ route: routeOfLength(0), sample })).toThrow(
      RangeError,
    );
  });
});
