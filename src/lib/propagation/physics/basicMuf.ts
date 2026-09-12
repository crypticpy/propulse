/**
 * ITU-R P.533-14 basic MUF, sections 3.3 and 3.5 (PROP-08, #954 slice A).
 *
 * The basic MUF is the highest frequency at which the ionosphere alone will
 * support a mode, before any allowance for the propagation mechanisms above it
 * (that allowance is `operationalMuf.ts`). Section 3.1: "Where both E and F2
 * modes are considered the higher of the two basic MUFs of the lowest-order E
 * and F2 modes give the basic MUF for the path."
 *
 * THE EQUATIONS, as published:
 *
 *   (1)  nE(D)MUF = foE sec(i110)
 *        i110 is the angle of incidence at a mirror-reflection height of
 *        110 km for a hop of length d = D/n.
 *
 *   (3)  nF2(D)MUF = [1 + (Cd / C3000)(B - 1)] foF2 + (fH / 2)(1 - d / dmax)
 *   (4)  Cd = 0.74 - 0.591 Z - 0.424 Z^2 - 0.090 Z^3 + 0.088 Z^4
 *             + 0.181 Z^5 + 0.096 Z^6,     Z = 1 - 2 d / dmax
 *   (5)  dmax = 4780 + (12610 + 2140/x^2 - 49720/x^4 + 688900/x^6)(1/B - 0.303)
 *   (6)  B = M(3000)F2 - 0.124 + ([M(3000)F2]^2 - 4)
 *            (0.0215 + 0.005 sin(7.854/x - 1.9635))
 *        x = foF2/foE, or 2, whichever is the larger; C3000 is Cd at
 *        d = 3000 km; fH is the electron gyrofrequency at 300 km at the
 *        control point.
 *
 *   (7)  nF2(D)MUF = n0F2(dmax)MUF . Mn / Mn0
 *   (8)  Mn / Mn0 = nF2(D)MUF / n0F2(D)MUF, both from equation (3)
 *
 * Equations (5) and (6) live in `geometry/reflectionHeight.ts` as
 * `maximumHopLengthKm` and `mufFactorB` and are imported, not restated.
 *
 * THE RESTRICTIONS, in the recommendation's own words:
 *
 *  - "For the calculation of the basic MUF dmax is restricted to be no greater
 *    than 4000 km" (section 3.5.1.1). `controlPoints.basicMufDmaxKm`.
 *  - "For the calculation of Mn and Mn0, the maximum hop distance, dmax, is
 *    recalculated at the control point and can be larger than 4000 km"
 *    (section 3.5.2.2). `controlPoints.higherOrderModeDmaxKm`.
 *  - For a path longer than dmax the lowest-order basic MUF is "the lower of
 *    the F2(dmax)MUF values determined from equation (3) for the two control
 *    points given in Table 1a)", and for the higher orders "the lower of the
 *    values calculated at the two control points of Table 1a) is selected".
 *  - foE for equation (1) is the Table 1a value, and "for path lengths of
 *    2000-4000 km the lower value is selected" (section 3.3).
 *
 * MODE EXISTENCE IS NOT THE SECTION 5.1 HEIGHT. Section 3.5.1.1 fixes the
 * lowest-order mode "by geometrical considerations, using the mirror
 * reflection height hr derived at the mid-path control point from" equation
 * (2), `hr = min(1490/M(3000)F2 - 176, 500)`. That is `mirrorHeightFromM3000F2`
 * in `geometry/hop.ts`. The section 5.1 height in `geometry/reflectionHeight.ts`
 * is a different quantity for a different purpose (elevation angles and path
 * geometry) and is deliberately not used here. E modes mirror at a fixed
 * 110 km.
 *
 * WHERE THE ITU REFERENCE IMPLEMENTATION ADDS A RULE THE TEXT DOES NOT STATE,
 * AND WE FOLLOW IT. `MUFBasic.c` does not admit a mode down to the grazing ray.
 * It computes the longest hop that leaves at `MINELEANGLES = 3` degrees,
 *
 *      dh = 2 R0 (pi/2 - delta_min - i(delta_min, hr))
 *
 * caps it at 4000 km, and takes the lowest-order mode as the first n with
 * `dh > D/n`. At hr = 110 km that is 1771 km, well inside the 2351 km grazing
 * limit `hop.ts` would allow, so the rule is load-bearing and not cosmetic: it
 * changes which E mode is the lowest order on most paths over 1771 km. It is
 * implemented here as `MIN_ELEVATION_DEG`, named, and testable.
 *
 * AND WHERE IT DIFFERS FROM THE TEXT IN A WAY WE ALSO FOLLOW, BECAUSE THE
 * GOLDEN CASES ARE THE ORACLE. Section 3.5.1.2 says the lowest-order basic MUF
 * of a path longer than dmax is "F2(dmax)MUF", which reads as equation (3)
 * evaluated at d = dmax. `CalcF2DMUF()` instead passes the real hop length
 * D/n0 and clips to dmax only inside Cd, so the gyrofrequency term keeps
 * `1 - (D/n0)/dmax`, which is negative whenever D/n0 > dmax. The two readings
 * differ by `(fH/2)((D/n0)/dmax - 1)`, a few hundred kHz on a long path.
 * `f2BasicMufMHz` takes the hop length and the dmax separately and does what
 * the reference does; `basicMuf.test.ts` pins both the value and the sign of
 * that term so the choice is visible rather than buried.
 *
 * WHICH dmax THE OUTER POINTS USE. On a path longer than dmax the lowest-order
 * F2(dmax)MUF is evaluated at T + d0/2 and R - d0/2 with each point's own
 * foF2, foE, M(3000)F2 and gyrofrequency but with the mid-path dmax (restricted
 * to 4000 km). Table 1 defines dmax as "calculated at the mid-path control
 * point", and section 3.5.2.2 lifts that only for Mn and Mn0, where dmax "is
 * recalculated at the control point". The reference does the same:
 * `MUFBasic.c` passes `path->dmax` to both outer points and calls `Calcdmax()`
 * per point only inside the Mn/Mn0 scaling. `basicMuf.test.ts` pins it.
 *
 * NO IONOSPHERE IS FETCHED HERE. The circuit hands in one `sample` callback
 * that answers for any point on the route, which is this codebase's form of
 * the mathematical contract's M03 requirement that the portable state callback
 * "reach every control-point calculation". The callback is synchronous because
 * `IonosphereProvider.state` is.
 *
 * Units: MHz, km, radians. Nothing is rounded.
 */

import {
  hopGeometry,
  incidenceAngleRad,
  mirrorHeightFromM3000F2,
} from "@/lib/propagation/geometry/hop";
import {
  mufFactorB,
  MAX_DMAX_KM,
} from "@/lib/propagation/geometry/reflectionHeight";
import {
  EARTH_RADIUS_KM,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  basicMufDmaxKm,
  basicMufFoEMHz,
  higherOrderModeDmaxKm,
  hopGroundDistanceKm,
  maximumHopLengthKm,
  midPointSite,
  selectControlPoints,
  E_MODE_MAX_PATH_KM,
  MAX_SHORT_PATH_KM,
  MID_POINT_ONLY_PATH_KM,
  type ControlPointLabel,
  type ControlPointSite,
} from "./controlPoints";

/** The E-layer mirror-reflection height of equation (1), km. */
export const E_LAYER_MIRROR_HEIGHT_KM = 110;

/** `MINELEANGLES` of the ITU reference: the lowest elevation a mode may use. */
export const MIN_ELEVATION_DEG = 3;

/** Section 3.5.2: "higher-order modes (paths up to 9 000 km)", 6 F2 modes. */
export const MAX_F2_MODES = 6;

/** Section 5.2.1 admits at most three E modes. */
export const MAX_E_MODES = 3;

/** The hop length at which `C3000` is evaluated, km. Section 3.5.1.1. */
export const C3000_HOP_KM = 3000;

const DEG_TO_RAD = Math.PI / 180;

/** Everything equations (1) and (3) need at one control point. */
export interface MufControlPointState {
  /** F2-layer critical frequency, MHz. */
  readonly foF2MHz: number;
  /** F2 propagation factor M(3000)F2, dimensionless. */
  readonly m3000F2: number;
  /** E-layer critical frequency, MHz. */
  readonly foEMHz: number;
  /** Electron gyrofrequency at 300 km, MHz. Equation (3)'s fH. */
  readonly gyrofrequency300kmMHz: number;
}

export type ControlPointSampler = (
  point: GeodeticPoint,
  label: ControlPointLabel,
) => MufControlPointState;

export interface BasicMufInputs {
  readonly route: ResolvedRoute;
  readonly sample: ControlPointSampler;
}

export interface BasicMufMode {
  readonly layer: "E" | "F2";
  /** n, the number of hops. */
  readonly hopCount: number;
  /** d = D / n, km. */
  readonly hopGroundDistanceKm: number;
  readonly basicMufMHz: number;
}

export interface LayerBasicMuf {
  /** n0, the lowest-order mode of this layer. */
  readonly lowestOrderHopCount: number;
  /** The layer's basic MUF for the path: the lowest-order mode's. */
  readonly basicMufMHz: number;
  readonly modes: readonly BasicMufMode[];
}

export interface SampledControlPoint {
  readonly label: ControlPointLabel;
  readonly point: GeodeticPoint;
  readonly state: MufControlPointState;
}

export interface ResolvedBasicMuf {
  readonly kind: "resolved";
  readonly groundDistanceKm: number;
  /** dmax at M, restricted to 4000 km. Section 3.5.1.1. */
  readonly dmaxKm: number;
  /** dmax at M before the restriction, km. */
  readonly unrestrictedDmaxKm: number;
  /** The equation (2) mirror height at M the mode order was chosen on, km. */
  readonly mirrorHeightKm: number;
  readonly e: LayerBasicMuf | null;
  readonly f2: LayerBasicMuf | null;
  /** The higher of the two lowest-order basic MUFs, MHz. Section 3.1. */
  readonly pathBasicMufMHz: number;
  /** Every control point the sampler was asked for, in the order asked. */
  readonly controlPoints: readonly SampledControlPoint[];
}

export interface UnsupportedBasicMuf {
  readonly kind: "unsupported";
  readonly reason: "out_of_domain" | "no_supported_mode";
  readonly detail: string;
  readonly groundDistanceKm: number;
}

export type BasicMufResult = ResolvedBasicMuf | UnsupportedBasicMuf;

/**
 * The longest hop whose take-off elevation is at least `minElevationRad`, km.
 *
 * `psi = pi/2 - delta - i(delta, hr)` is the half-hop angle of the mirror
 * triangle, so the hop is `2 R psi`. This is `MUFBasic.c`'s `dh` written in
 * this codebase's terms; `hop.ts`'s `maximumHopGroundDistanceKm` is the same
 * quantity at `delta = 0` and is therefore always larger.
 */
export function maxHopForMinElevationKm(
  mirrorHeightKm: number,
  minElevationRad: number = MIN_ELEVATION_DEG * DEG_TO_RAD,
): number {
  const halfHopAngleRad =
    Math.PI / 2 -
    minElevationRad -
    incidenceAngleRad(minElevationRad, mirrorHeightKm);
  return 2 * EARTH_RADIUS_KM * halfHopAngleRad;
}

/**
 * n0: the lowest-order mode, or `null` when the layer supports none.
 *
 * `MUFBasic.c`: the first n (1-based here, 0-based there) whose hop length
 * `D/n` is strictly less than the longest admissible hop.
 */
export function lowestOrderHopCount(
  groundDistanceKm: number,
  mirrorHeightKm: number,
  maxModes: number,
): number | null {
  const longestHopKm = Math.min(
    maxHopForMinElevationKm(mirrorHeightKm),
    MAX_DMAX_KM,
  );
  for (let n = 1; n <= maxModes; n += 1) {
    if (longestHopKm > groundDistanceKm / n) return n;
  }
  return null;
}

/** Equation (4). `Z = 1 - 2 d / dmax`. */
export function cdFactor(hopKm: number, dmaxKm: number): number {
  const Z = 1 - (2 * hopKm) / dmaxKm;
  return (
    0.74 -
    0.591 * Z -
    0.424 * Z ** 2 -
    0.09 * Z ** 3 +
    0.088 * Z ** 4 +
    0.181 * Z ** 5 +
    0.096 * Z ** 6
  );
}

/**
 * Equation (3), the F2-layer basic MUF of one mode at one control point, MHz.
 *
 * `hopGroundDistanceKm` is d = D/n as it really is. Only the Cd argument is
 * clipped to dmax; see the module header for why the gyrofrequency term is
 * not.
 */
export function f2BasicMufMHz(
  state: MufControlPointState,
  hopKm: number,
  dmaxKm: number,
): number {
  const B = mufFactorB(state.m3000F2, state.foF2MHz, state.foEMHz);
  const Cd = cdFactor(Math.min(hopKm, dmaxKm), dmaxKm);
  const C3000 = cdFactor(C3000_HOP_KM, dmaxKm);
  return (
    (1 + (Cd / C3000) * (B - 1)) * state.foF2MHz +
    (state.gyrofrequency300kmMHz / 2) * (1 - hopKm / dmaxKm)
  );
}

/**
 * Equation (1), the E-layer basic MUF of one n-hop mode, MHz.
 *
 * Returns `null` when a hop that long does not reflect from 110 km at all.
 * `MUFBasic.c` caps the hop at 4000 km before taking the geometry; the cap is
 * applied here for the same reason, and is visible in the returned value.
 */
export function eBasicMufMHz(foEMHz: number, hopKm: number): number | null {
  const geometry = hopGeometry({
    groundDistanceKm: Math.min(hopKm, MAX_DMAX_KM),
    hopCount: 1,
    mirrorHeightKm: E_LAYER_MIRROR_HEIGHT_KM,
  });
  if (geometry.kind !== "supported") return null;
  return foEMHz / Math.cos(geometry.incidenceAngle110Rad);
}

/** The path basic MUF and every mode that contributes to it. */
export function basicMuf({ route, sample }: BasicMufInputs): BasicMufResult {
  const D = route.groundDistanceKm;
  if (!Number.isFinite(D) || D <= 0) {
    throw new RangeError(
      `the route has no usable ground distance (${String(D)} km).`,
    );
  }
  if (D >= MAX_SHORT_PATH_KM) {
    return {
      kind: "unsupported",
      reason: "out_of_domain",
      detail:
        `sections 3.3 to 3.5 give the basic MUF for paths up to ` +
        `${String(MAX_SHORT_PATH_KM)} km; this path is ${D.toFixed(1)} km and ` +
        `needs the long-path method of section 5.3, which slice A does not ` +
        `implement.`,
      groundDistanceKm: D,
    };
  }

  const sampled: SampledControlPoint[] = [];
  const at = (site: ControlPointSite): MufControlPointState => {
    const state = sample(site.point, site.label);
    sampled.push({ label: site.label, point: site.point, state });
    return state;
  };

  const midSite = midPointSite(route);
  const midState = at(midSite);

  const mirrorHeightKm = mirrorHeightFromM3000F2(midState.m3000F2);
  const unrestrictedDmaxKm = maximumHopLengthKm(
    midState.m3000F2,
    midState.foF2MHz,
    midState.foEMHz,
  );
  const dmaxKm = basicMufDmaxKm(
    midState.m3000F2,
    midState.foF2MHz,
    midState.foEMHz,
  );

  const f2 = solveF2({ route, at, midState, dmaxKm, mirrorHeightKm });
  const e = solveE({ route, at, midState });

  if (f2 === null && e === null) {
    return {
      kind: "unsupported",
      reason: "no_supported_mode",
      detail:
        `no E or F2 mode of order ${String(MAX_E_MODES)} or ` +
        `${String(MAX_F2_MODES)} respectively reaches ${D.toFixed(1)} km at an ` +
        `elevation of at least ${String(MIN_ELEVATION_DEG)} degrees.`,
      groundDistanceKm: D,
    };
  }

  return {
    kind: "resolved",
    groundDistanceKm: D,
    dmaxKm,
    unrestrictedDmaxKm,
    mirrorHeightKm,
    e,
    f2,
    pathBasicMufMHz: Math.max(
      e?.basicMufMHz ?? Number.NEGATIVE_INFINITY,
      f2?.basicMufMHz ?? Number.NEGATIVE_INFINITY,
    ),
    controlPoints: sampled,
  };
}

interface SolveContext {
  readonly route: ResolvedRoute;
  readonly at: (site: ControlPointSite) => MufControlPointState;
  readonly midState: MufControlPointState;
}

function solveF2(
  context: SolveContext & { dmaxKm: number; mirrorHeightKm: number },
): LayerBasicMuf | null {
  const { route, at, midState, dmaxKm, mirrorHeightKm } = context;
  const D = route.groundDistanceKm;
  const n0 = lowestOrderHopCount(D, mirrorHeightKm, MAX_F2_MODES);
  if (n0 === null) return null;

  const d0 = hopGroundDistanceKm(D, n0);
  const modes: BasicMufMode[] = [];

  // Section 3.5.1.1 and 3.5.2.1: everything at M.
  if (D <= dmaxKm) {
    for (let n = n0; n <= MAX_F2_MODES; n += 1) {
      modes.push({
        layer: "F2",
        hopCount: n,
        hopGroundDistanceKm: D / n,
        basicMufMHz: f2BasicMufMHz(midState, D / n, dmaxKm),
      });
    }
    return {
      lowestOrderHopCount: n0,
      basicMufMHz: modes[0].basicMufMHz,
      modes,
    };
  }

  // Sections 3.5.1.2 and 3.5.2.2: the two Table 1a control points.
  const selection = selectControlPoints({
    route,
    purpose: "basic_muf",
    layer: "F2",
    dmaxKm,
    hopGroundDistanceKm: d0,
  });
  if (selection.kind !== "points") return null;
  const outer = selection.points.map((site) => ({
    state: at(site),
    site,
  }));

  const lowestOrderMufMHz = Math.min(
    ...outer.map(({ state }) => f2BasicMufMHz(state, d0, dmaxKm)),
  );
  modes.push({
    layer: "F2",
    hopCount: n0,
    hopGroundDistanceKm: d0,
    basicMufMHz: lowestOrderMufMHz,
  });

  // Equations (7) and (8), with dmax recalculated at each control point and
  // free of the 4000 km restriction.
  const pointDmaxKm = outer.map(({ state }) =>
    higherOrderModeDmaxKm(state.m3000F2, state.foF2MHz, state.foEMHz),
  );
  for (let n = n0 + 1; n <= MAX_F2_MODES; n += 1) {
    const ratio = Math.min(
      ...outer.map(({ state }, index) => {
        const cpDmax = pointDmaxKm[index];
        const Mn = f2BasicMufMHz(state, D / n, cpDmax);
        const Mn0 = f2BasicMufMHz(state, d0, cpDmax);
        return Mn / Mn0;
      }),
    );
    modes.push({
      layer: "F2",
      hopCount: n,
      hopGroundDistanceKm: D / n,
      basicMufMHz: lowestOrderMufMHz * ratio,
    });
  }

  return { lowestOrderHopCount: n0, basicMufMHz: lowestOrderMufMHz, modes };
}

function solveE(context: SolveContext): LayerBasicMuf | null {
  const { route, at, midState } = context;
  const D = route.groundDistanceKm;
  if (D > E_MODE_MAX_PATH_KM) return null;

  const n0 = lowestOrderHopCount(D, E_LAYER_MIRROR_HEIGHT_KM, MAX_E_MODES);
  if (n0 === null) return null;

  let foEMHz: number;
  if (D <= MID_POINT_ONLY_PATH_KM) {
    foEMHz = midState.foEMHz;
  } else {
    const selection = selectControlPoints({
      route,
      purpose: "basic_muf",
      layer: "E",
    });
    if (selection.kind !== "points") return null;
    foEMHz = basicMufFoEMHz(selection.points.map((site) => at(site).foEMHz));
  }

  const modes: BasicMufMode[] = [];
  for (let n = n0; n <= MAX_E_MODES; n += 1) {
    const basicMufMHz = eBasicMufMHz(foEMHz, D / n);
    if (basicMufMHz === null) continue;
    modes.push({
      layer: "E",
      hopCount: n,
      hopGroundDistanceKm: D / n,
      basicMufMHz,
    });
  }
  if (modes.length === 0) return null;
  return {
    lowestOrderHopCount: modes[0].hopCount,
    basicMufMHz: modes[0].basicMufMHz,
    modes,
  };
}
