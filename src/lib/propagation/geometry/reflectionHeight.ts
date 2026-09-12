/**
 * F2-mode mirror reflection height, ITU-R P.533-14 section 5.1 (PROP-03,
 * #1108 PR B2, mathematical contract M05).
 *
 * `hop.ts` solves the geometry of a mirror at a given height; this leaf says
 * what that height is. It is a circuit quantity, not a climatology quantity:
 * section 5.1 makes hr a function of the operating frequency and the hop
 * length as well as of foF2, foE, M(3000)F2 and R12 at the control point,
 * which is why `provider.ts` declares `mirrorReflectionHeight` unsupported and
 * leaves it here.
 *
 * Every constant below is the recommendation's own. Equation numbers are
 * P.533-14's; "section 5.1(a)" etc. name the three cases the text lists under
 * "The mirror reflection height for F2 modes, hr, is calculated as follows".
 *
 * PROCEDURE, in the order the recommendation gives it:
 *
 *  1. Hop count. Section 3.5.1.1: "the lowest-order mode, n0, is determined by
 *     geometrical considerations, using the mirror reflection height hr derived
 *     at the mid-path control point from" equation (2),
 *     `hr = min(1490 / M(3000)F2 - 176, 500)`. That is exactly
 *     `mirrorHeightFromM3000F2` in `hop.ts`, so it is called, and n0 is the
 *     `minimumHopCount` of `hop.ts` at that height (equation (13) with a
 *     positive elevation). Section 5.2.1 then admits as the lowest F2 mode only
 *     one "with a hop length up to dmax (km)", so the count is raised until
 *     `D / n <= dmax`. Section 3.5.1.1 restricts dmax to 4000 km for the basic
 *     MUF, and the reference applies that restricted dmax to the mode gate, so
 *     `dmaxKm` here is the restricted one.
 *  2. dmax. Equations (5) and (6):
 *       `B = M - 0.124 + (M^2 - 4) (0.0215 + 0.005 sin(7.854 / x - 1.9635))`
 *       `dmax = 4780 + (12610 + 2140 / x^2 - 49720 / x^4 + 688900 / x^6) (1/B - 0.303)`
 *     with `x = max(foF2 / foE, 2)` (section 3.5.1.1, "foF2/foE, or 2,
 *     whichever is the larger"). That floor belongs to dmax only; section 5.1
 *     uses the raw ratio and its own floor of 1.8 on `y`.
 *  3. The height for a hop of `d = D / n`. Section 5.1:
 *       `x = foF2 / foE`, `y = max(x, 1.8)`
 *       `dM = 0.18 / (y - 1.4) + 0.096 (R12 - 25) / 150`
 *       `H = 1490 / (M(3000)F2 + dM) - 316`
 *       `xr = f / foF2`
 *     (a) `x > 3.33` and `xr >= 1`:
 *       `E1 = -0.09707 xr^3 + 0.6870 xr^2 - 0.7506 xr + 0.6`
 *       `F1 = -1.862 xr^4 + 12.95 xr^3 - 32.03 xr^2 + 33.50 xr - 10.91` (xr <= 1.71)
 *       `F1 = 1.21 + 0.2 xr`                                        (xr > 1.71)
 *       `G  = -2.102 xr^4 + 19.50 xr^3 - 63.15 xr^2 + 90.47 xr - 44.73` (xr <= 3.7)
 *       `G  = 19.25`                                                (xr > 3.7)
 *       `ds = 160 + (H + 43) G`, `a = (d - ds) / (H + 140)`
 *       `A1 = 140 + (H - 47) E1`, `B1 = 150 + (H - 17) F1 - A1`
 *       `h = A1 + B1 2.4^(-a)` when `B1 >= 0` and `a >= 0`, else `A1 + B1`
 *     (b) `x > 3.33` and `xr < 1`:
 *       `Z = max(xr, 0.1)`
 *       `E2 = 0.1906 Z^2 + 0.00583 Z + 0.1936`, `F2 = 0.645 Z^2 + 0.883 Z + 0.162`
 *       `A2 = 151 + (H - 47) E2`, `B2 = 141 + (H - 24) F2 - A2`
 *       `df = min(0.115 d / (Z (H + 140)), 0.65)`
 *       `b = -7.535 df^4 + 15.75 df^3 - 8.834 df^2 - 0.378 df + 1`
 *       `h = A2 + B2 b` when `B2 >= 0`, else `A2 + B2`
 *     (c) `x <= 3.33`:
 *       `J = -0.7126 y^3 + 5.863 y^2 - 16.13 y + 16.07`
 *       `U = 8e-5 (H - 80) (1 + 11 y^-2.2) + 1.2e-3 H y^-3.6`
 *       `h = 115 + H J + U d`
 *     and in every case `hr = min(h, 800)`. The cap is 800 km, section 5.1's
 *     own; the 500 km of equation (2) belongs to the hop-count step only.
 *
 * WHERE THE ITU REFERENCE IMPLEMENTATION DISAGREES, AND WHY WE DO NOT FOLLOW
 * IT. `MirrorReflectionHeight()` in the reference's `ELayerScreeningFrequency.c`
 * evaluates the section 5.1(a) skip-distance polynomial as
 * `G = -2.102 xr^4 + 19.50 xr^3 - 63.15 xr^2 - 44.73`, without the published
 * `+ 90.47 xr` term. The term is load-bearing: the published G is ~0 at
 * xr = 1 (skip distance ds = 160 km when f = foF2, as it should be) and
 * 19.27 at xr = 3.7, continuous to 0.02 with the 19.25 constant above the
 * limit. The reference's G is -90.5 at xr = 1 and -315.5 at xr = 3.7, so its
 * ds is tens of thousands of kilometres negative, `a` is always large and
 * positive, and `h` collapses to `A1` for every hop: the skip-distance
 * transition the formula exists to model never happens. At H = 200 km,
 * xr = 1.5, d = 1000 km the published formula gives h = A1 + B1 = 434.1 km
 * and the reference gives A1 = 245.9 km, 188 km apart. Branches (b) and (c), and branch (a)
 * above xr = 3.7, do not touch the term and agree with the reference exactly;
 * `reflectionHeight.test.ts` pins both the agreement and the disagreement.
 * The published formula is what this leaf computes. The reference is a parity
 * oracle where it follows the text and a known defect where it does not.
 *
 * The 0.02 step in G at xr = 3.7 (19.27 against 19.25) is real and is
 * P.533-14's own: it moves ds by 0.02 (H + 43) km, about 5 km at H = 200. It
 * is pinned in the tests and not smoothed here.
 *
 * WHAT THIS LEAF DOES NOT DO. Section 5.1 evaluates hr at the path midpoint
 * for paths up to dmax and, for longer paths, at each of the Table 1c control
 * points with the mean taken. This leaf is the per-control-point term: it takes
 * one set of ionospheric parameters and returns one height. A caller drawing a
 * circuit longer than dmax that wants the published mean has to call it at
 * each control point and average. It also does not re-check that its own
 * height still reaches the hop it was computed for: the hop count is fixed by
 * equation (2) exactly as section 3.5.1.1 says, and a section 5.1 height that
 * comes out lower than the equation (2) one can leave a hop near the grazing
 * limit below the horizon in `hopGeometry`. That is P.533's procedure and it is
 * reported through the result, not corrected.
 *
 * No rounding anywhere. Units: MHz, km, sunspot number; angles never leave
 * `hop.ts`.
 */

import { minimumHopCount, mirrorHeightFromM3000F2, MAX_HOP_COUNT } from "./hop";

/** Upper bound on the section 5.1 F2 mirror height, km. P.533-14 section 5.1. */
export const MAX_F2_REFLECTION_HEIGHT_KM = 800;

/** dmax is restricted to this for the basic MUF. P.533-14 section 3.5.1.1. */
export const MAX_DMAX_KM = 4000;

/** foF2/foE floor used by dmax, equations (5) and (6). Section 3.5.1.1. */
const DMAX_RATIO_FLOOR = 2;

/** foF2/foE floor used by section 5.1's `y`. */
const REFLECTION_RATIO_FLOOR = 1.8;

/** Section 5.1's branch limit on x = foF2/foE between (a)/(b) and (c). */
const BRANCH_RATIO_LIMIT = 3.33;

export type F2ReflectionHeightBranch = "5.1a" | "5.1b" | "5.1c";

export interface F2ReflectionHeightInputs {
  /** F2 propagation factor M(3000)F2 at the control point, dimensionless. */
  readonly m3000F2: number;
  /** F2-layer critical frequency at the control point, MHz. */
  readonly foF2MHz: number;
  /** E-layer critical frequency at the control point, MHz. */
  readonly foEMHz: number;
  /** Smoothed sunspot number the ionospheric state was evaluated at. */
  readonly r12: number;
  /** Operating (wave) frequency, MHz. */
  readonly frequencyMHz: number;
  /** Ground distance of the whole circuit along its resolved route, km. */
  readonly groundDistanceKm: number;
}

export interface F2ReflectionHeight {
  /** hr, km. `min(h, 800)`. */
  readonly heightKm: number;
  /** h before the 800 km cap, km. Equal to `heightKm` unless `capped`. */
  readonly uncappedHeightKm: number;
  /** Whether the 800 km cap of section 5.1 engaged. */
  readonly capped: boolean;
  /** Which of section 5.1's three cases produced the height. */
  readonly branch: F2ReflectionHeightBranch;
  /** dmax restricted to 4000 km, km. Equations (5), (6), section 3.5.1.1. */
  readonly dmaxKm: number;
  /** dmax before the 4000 km restriction, km. */
  readonly unrestrictedDmaxKm: number;
  /** The equation (2) height the hop count was chosen on, km. */
  readonly geometryHeightKm: number;
  /** n0 from equation (2) geometry alone, before the dmax gate. */
  readonly geometricHopCount: number;
  /** The hop count the height was computed for. */
  readonly hopCount: number;
  /** `d = D / n`, km. */
  readonly hopGroundDistanceKm: number;
  /** foF2/foE, unfloored. */
  readonly x: number;
  /** f/foF2. */
  readonly xr: number;
  /** Section 5.1's H, km. */
  readonly H: number;
  /** Skip distance ds of section 5.1(a), km; null on the other branches. */
  readonly skipDistanceKm: number | null;
  readonly inputs: F2ReflectionHeightInputs;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `${name} must be a positive finite number, received ${String(value)}.`,
    );
  }
}

function assertInputs(inputs: F2ReflectionHeightInputs): void {
  assertPositiveFinite("m3000F2", inputs.m3000F2);
  assertPositiveFinite("foF2MHz", inputs.foF2MHz);
  assertPositiveFinite("foEMHz", inputs.foEMHz);
  assertPositiveFinite("frequencyMHz", inputs.frequencyMHz);
  if (!Number.isFinite(inputs.r12) || inputs.r12 < 0) {
    throw new RangeError(
      `r12 must be a finite non-negative sunspot number, received ${String(inputs.r12)}.`,
    );
  }
  if (
    !Number.isFinite(inputs.groundDistanceKm) ||
    inputs.groundDistanceKm < 0
  ) {
    throw new RangeError(
      `groundDistanceKm must be a non-negative finite number, received ${String(inputs.groundDistanceKm)}.`,
    );
  }
}

/**
 * dmax, km, unrestricted. P.533-14 equations (5) and (6) with the section
 * 3.5.1.1 floor of 2 on foF2/foE.
 */
export function maximumHopLengthKm(
  m3000F2: number,
  foF2MHz: number,
  foEMHz: number,
): number {
  assertPositiveFinite("m3000F2", m3000F2);
  assertPositiveFinite("foF2MHz", foF2MHz);
  assertPositiveFinite("foEMHz", foEMHz);
  const x = Math.max(foF2MHz / foEMHz, DMAX_RATIO_FLOOR);
  // Equation (6).
  const B =
    m3000F2 -
    0.124 +
    (m3000F2 * m3000F2 - 4) * (0.0215 + 0.005 * Math.sin(7.854 / x - 1.9635));
  // Equation (5).
  return (
    4780 +
    (12610 + 2140 / x ** 2 - 49720 / x ** 4 + 688900 / x ** 6) * (1 / B - 0.303)
  );
}

/** Section 5.1(a): x > 3.33, xr >= 1. Returns h before the cap, and ds. */
function branchA(
  H: number,
  xr: number,
  hopKm: number,
): { h: number; skipDistanceKm: number } {
  const E1 = -0.09707 * xr ** 3 + 0.687 * xr ** 2 - 0.7506 * xr + 0.6;
  const F1 =
    xr <= 1.71
      ? -1.862 * xr ** 4 + 12.95 * xr ** 3 - 32.03 * xr ** 2 + 33.5 * xr - 10.91
      : 1.21 + 0.2 * xr;
  // The published polynomial, +90.47 xr included. See the module header for
  // the reference implementation's dropped term and what it does to ds.
  const G =
    xr <= 3.7
      ? -2.102 * xr ** 4 + 19.5 * xr ** 3 - 63.15 * xr ** 2 + 90.47 * xr - 44.73
      : 19.25;
  const skipDistanceKm = 160 + (H + 43) * G;
  const a = (hopKm - skipDistanceKm) / (H + 140);
  const A1 = 140 + (H - 47) * E1;
  const B1 = 150 + (H - 17) * F1 - A1;
  const h = B1 >= 0 && a >= 0 ? A1 + B1 * 2.4 ** -a : A1 + B1;
  return { h, skipDistanceKm };
}

/** Section 5.1(b): x > 3.33, xr < 1. Returns h before the cap. */
function branchB(H: number, xr: number, hopKm: number): number {
  const Z = Math.max(xr, 0.1);
  const E2 = 0.1906 * Z ** 2 + 0.00583 * Z + 0.1936;
  const F2 = 0.645 * Z ** 2 + 0.883 * Z + 0.162;
  const A2 = 151 + (H - 47) * E2;
  const B2 = 141 + (H - 24) * F2 - A2;
  const df = Math.min((0.115 * hopKm) / (Z * (H + 140)), 0.65);
  const b =
    -7.535 * df ** 4 + 15.75 * df ** 3 - 8.834 * df ** 2 - 0.378 * df + 1;
  return B2 >= 0 ? A2 + B2 * b : A2 + B2;
}

/** Section 5.1(c): x <= 3.33. Returns h before the cap. */
function branchC(H: number, y: number, hopKm: number): number {
  const J = -0.7126 * y ** 3 + 5.863 * y ** 2 - 16.13 * y + 16.07;
  const U = 8e-5 * (H - 80) * (1 + 11 * y ** -2.2) + 1.2e-3 * H * y ** -3.6;
  return 115 + H * J + U * hopKm;
}

/**
 * The F2-mode mirror reflection height of an HF circuit at one control point.
 *
 * Throws `RangeError` on inputs the recommendation has no value for; never
 * clamps them into range.
 */
export function f2ReflectionHeight(
  inputs: F2ReflectionHeightInputs,
): F2ReflectionHeight {
  assertInputs(inputs);
  const { m3000F2, foF2MHz, foEMHz, r12, frequencyMHz, groundDistanceKm } =
    inputs;

  // Step 1: hop count. Equation (2) geometry, then the section 5.2.1 gate.
  const geometryHeightKm = mirrorHeightFromM3000F2(m3000F2);
  const geometricHopCount = minimumHopCount(groundDistanceKm, geometryHeightKm);
  const unrestrictedDmaxKm = maximumHopLengthKm(m3000F2, foF2MHz, foEMHz);
  const dmaxKm = Math.min(unrestrictedDmaxKm, MAX_DMAX_KM);
  let hopCount = geometricHopCount;
  while (groundDistanceKm / hopCount > dmaxKm) {
    hopCount += 1;
    if (hopCount > MAX_HOP_COUNT) {
      throw new RangeError(
        `no hop count at or below ${String(MAX_HOP_COUNT)} keeps the hop ` +
          `within dmax = ${String(dmaxKm)} km over ${String(groundDistanceKm)} km.`,
      );
    }
  }
  const hopGroundDistanceKm = groundDistanceKm / hopCount;

  // Step 3: section 5.1 at this hop length.
  const x = foF2MHz / foEMHz;
  const y = Math.max(x, REFLECTION_RATIO_FLOOR);
  const deltaM = 0.18 / (y - 1.4) + (0.096 * (r12 - 25)) / 150;
  const H = 1490 / (m3000F2 + deltaM) - 316;
  const xr = frequencyMHz / foF2MHz;

  let branch: F2ReflectionHeightBranch;
  let h: number;
  let skipDistanceKm: number | null = null;
  if (x > BRANCH_RATIO_LIMIT && xr >= 1) {
    branch = "5.1a";
    ({ h, skipDistanceKm } = branchA(H, xr, hopGroundDistanceKm));
  } else if (x > BRANCH_RATIO_LIMIT) {
    branch = "5.1b";
    h = branchB(H, xr, hopGroundDistanceKm);
  } else {
    branch = "5.1c";
    h = branchC(H, y, hopGroundDistanceKm);
  }

  const capped = h > MAX_F2_REFLECTION_HEIGHT_KM;
  return {
    heightKm: capped ? MAX_F2_REFLECTION_HEIGHT_KM : h,
    uncappedHeightKm: h,
    capped,
    branch,
    dmaxKm,
    unrestrictedDmaxKm,
    geometryHeightKm,
    geometricHopCount,
    hopCount,
    hopGroundDistanceKm,
    x,
    xr,
    H,
    skipDistanceKm,
    inputs,
  };
}
