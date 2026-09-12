/**
 * ITU-R P.533-14 section 5.3.1, the upper reference frequency fM of a path
 * longer than 7 000 km (PROP-08, #954 slice D).
 *
 * Section 5.3.1, in full: "To determine fM, predictions are made by dividing
 * the path into the minimum number (nM) of equal length hops (dM) 4 000 km or
 * smaller. The elevation angle is calculated according to equation (13),
 * taking into account the hop length and a fixed height of 300 km. If the
 * elevation angle is lower than 3.0 degrees, one hop is added and the hop
 * length and elevation angle are recalculated until the elevation angle
 * exceeds 3.0 degrees. Next, the positions of both control points are
 * determined from Table 1a). In this case, d0 equals dM, so the control points
 * are located at the half hop length (dM/2) from transmitter and receiver.
 *
 * At both control points foF2, M(3000) and the gyro frequency (fH) are
 * determined according to section 3.4. These values are used to calculate the
 * F2(4000)MUF (f4), F2(Zero)MUF (fz), and the basic MUF (fBM) for the control
 * points:
 *
 *     fBM = fz + (f4 - fz) fD                             MHz          (29)
 *
 * where f4 = 1.1 foF2 M(3000)F2 and fz = foF2 + fH/2. The distance reduction
 * factor (fD) is used to reduce the 4 000 km MUF to the actual hop length. The
 * factor fD varies between 0.0 (for a hop length of 0 km) and 1.0 (for a hop
 * length of 4 000 km).
 *
 *     fD = ((((((C6 dM + C5) dM + C4) dM + C3) dM + C2) dM + C1) dM + C0) dM
 *                                                                      (30)
 *
 * The value fBM is determined separately for the two control points and the
 * lower value is taken as the Basic MUF for the whole path.
 *
 * The value fM is determined separately for the two control points from the
 * product of the K-factor and the basic MUF. The lower value is taken as the
 * operational MUF for the whole path.
 *
 *     fM = K fBM                                          MHz          (31)
 *
 *     K = 1.2 + W (fBM / fBM,noon)
 *             + X [ (fBM,noon / fBM)^(1/3) - 1 ]
 *             + Y [ fBM,min / fBM,noon ]^2                              (32)
 *
 * where fBM,noon is the value of fBM for a time corresponding to local noon
 * and fBM,min is the lowest value of fBM which occurs during 24 hours. W, X
 * and Y are given in Table 3."
 *
 * THE OPERATIONAL STEP HERE IS EQUATION (32), NOT P.1240. Section 3.7 and its
 * P.1240 Table 1 ratio Rop belong to the short-path operational MUF and are
 * `operationalMuf.ts`; section 5.3.1 states its own K-factor and its own
 * Table 3, and the two are different quantities with different inputs. Nothing
 * from `operationalMuf.ts` is used here, deliberately.
 *
 * TWENTY-FOUR HOURS ARE REQUIRED, NOT ONE. Equation (32) needs fBM at local
 * noon and the 24-hour minimum of fBM, so the sampler is asked for each control
 * point at every UTC hour of the prediction's own day. That is 48 ionosphere
 * evaluations for one circuit and it is not avoidable: the recommendation's own
 * K depends on the whole diurnal curve.
 *
 * WHAT IS REUSED RATHER THAN REDONE.
 *
 *  - Equation (13), the elevation, and equation (19), the virtual slant range,
 *    are `hopGeometry()` in `geometry/hop.ts` at the fixed 300 km height this
 *    section names. The slant range is returned here because equation (40)'s
 *    E0 and equation (33)'s fL both need it and it must be one number.
 *  - The route and every point on it are `geometry/route.ts` (contract M06).
 *    No second route is resolved and no polyline is built.
 *  - `ControlPointSite` and the Table 1a labels are `controlPoints.ts`'s. The
 *    two sites are placed directly rather than through `selectControlPoints`,
 *    which reports `not_applicable` beyond 9 000 km because Table 1a's F2 rows
 *    stop where the short-path basic MUF stops. Section 5.3.1 names the same
 *    two points explicitly, "located at the half hop length (dM/2) from
 *    transmitter and receiver", so they are constructed from that sentence.
 *
 * WHERE THE REFERENCE AND THE TEXT DISAGREE, AND WHAT WE DO. The pinned ITU
 * build is cd172be5, `MedianSkywaveFieldStrengthLong.c`.
 *
 *  1. THE MINIMUM ELEVATION IS A LOOP, NOT A SINGLE ADDED HOP. THE TEXT: "If
 *     the elevation angle is lower than 3.0 degrees, one hop is added and the
 *     hop length and elevation angle are recalculated UNTIL THE ELEVATION
 *     ANGLE EXCEEDS 3.0 DEGREES." WE FOLLOW THE TEXT and add hops until the
 *     elevation clears 3.0 degrees. THE REFERENCE adds exactly one hop and
 *     does not re-test. The two readings agree whenever one added hop is
 *     enough, and one added hop is always enough while the starting count
 *     nM = ceil(d/4 000) is 4 or fewer: the longest hop the reference can be
 *     left holding is 4 000 nM/(nM + 1), which first exceeds the 3.0-degree
 *     hop limit of 3 224.51 km at nM = 5. So the two readings can only part
 *     company on a path longer than 16 000 km, and in this corpus it matters
 *     on G25 alone (26 400.16 km): the reference stops at 8 hops of
 *     3 300.02 km, whose elevation is 2.598 degrees and therefore below the
 *     minimum the same sentence sets, and we take 9 hops of 2 933.35 km at
 *     4.657 degrees. G29 at 16 920.26 km starts at nM = 5 and needs the added
 *     hop, but one is enough there and both readings settle on 6. The
 *     divergence that follows is recorded per case in the parity fixture.
 *  2. THE HOUR "CORRESPONDING TO LOCAL NOON". THE TEXT: "fBM,noon: value of
 *     fBM for a time corresponding to local noon." Local solar noon at a
 *     control point of longitude lambda (degrees east) is UTC 12 - lambda/15,
 *     and fBM is held hourly, so the value "for a time corresponding to local
 *     noon" is the one at the nearest whole UTC hour. WE ROUND. THE REFERENCE
 *     truncates that expression toward zero and then subtracts one more hour,
 *     which is its 1-based Fortran hour index leaking through (the same leak
 *     puts `FindfL()` an hour late; see `fL.ts` deviation 2). On a longitude
 *     whose local noon is 18.5 UTC the reference reads 17 UTC, an hour and a
 *     half before local noon, which no reading of the sentence supports.
 *  3. TABLE 3 IS INTERPOLATED ON THE ANGLE FROM THE NORTH-SOUTH AXIS. THE
 *     TEXT: "The azimuth angle of the great-circle path is determined at the
 *     centre of the whole path; this angle is used to linearly interpolate the
 *     angle between the East-West and North-South values." The azimuth is
 *     folded onto the acute angle between the path and the North-South axis,
 *     and that angle drives a linear weight. THE REFERENCE does the same, by a
 *     chain of subtractions that reduces to the same fold. This is not a
 *     deviation and is listed only because the fold is easy to get backwards:
 *     a due-north path takes the North-South row, a due-east path the
 *     East-West row.
 *
 * NO NaN AND NO SILENT CLAMP. Every out-of-domain input yields a labelled
 * `unsupported` record with a reason, never a number. The three reasons are
 * `out_of_domain` (the path is not one section 5.3 applies to, or a sampler
 * answered with a value outside that quantity's own physical domain, such as
 * a non-positive foF2 or M(3000)F2 or a negative gyrofrequency),
 * `no_elevation_solution` (no hop count within the recommendation's own limits
 * clears the 3.0-degree minimum) and `non_finite_result` (every sampled and
 * intermediate value was individually in bounds and the assembled result
 * still carries a non-finite number, which the bounds alone could not see;
 * see `finiteResult.ts`).
 */

import tables from "../assets/p533-fl-tables.json";
import type { ControlPointLabel, ControlPointSite } from "../controlPoints";
import { firstNonFiniteField } from "../finiteResult";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import {
  routeSampleAtFraction,
  EARTH_RADIUS_KM,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";

/**
 * SHA-256 of `assets/p533-fl-tables.json` as committed.
 *
 * The same mechanism `auroralLoss.ts` uses for Table 2: the asset is thirty
 * hand-transcribed numbers and nothing else in the tree would notice one of
 * them changing, so the hash is pinned in code and asserted in the test.
 */
export const FL_TABLES_SHA256 =
  "80f3279bcb52cc94b7d231c71b18fcc6ecddb47c78f8a0e8df53ff45437da9b2";

/** Section 5.3.1's fixed mirror-reflection height for both fM and fL, km. */
export const LONG_PATH_MIRROR_HEIGHT_KM = 300;

/** Section 5.3.1's upper bound on the hop length dM, km. */
export const LONG_PATH_MAX_HOP_KM = 4000;

/** Section 5.3.1's minimum elevation angle, degrees. */
export const LONG_PATH_MIN_ELEVATION_DEG = 3.0;

/** Section 5.3's lower distance bound, km. */
export const LONG_PATH_MIN_DISTANCE_KM = 7000;

/**
 * The longest great-circle route on the declared sphere, km.
 *
 * A circuit that has gone once round the Earth has arrived; a number larger
 * than this is not a path length and section 5.3 has nothing to say about it.
 * The bound is stated because the hop division below and `fL.ts`'s divide by a
 * fixed hop length, so an absurd distance would otherwise become an absurd hop
 * count rather than a labelled refusal.
 */
export const MAX_ROUTE_DISTANCE_KM = 2 * Math.PI * EARTH_RADIUS_KM;

/**
 * Hop counts tried before giving up.
 *
 * A hop of 4 000 km is the recommendation's own maximum and the Earth's
 * circumference on the declared sphere is 40 030 km, so a long route needs at
 * most eleven hops and a route that has been resolved twice around the globe
 * is not a circuit. The bound exists so that a degenerate input cannot spin.
 */
export const LONG_PATH_MAX_HOP_COUNT = 64;

/** Equation (30)'s coefficients, in the order C0..C6 the text lists them. */
export const FD_COEFFICIENTS = [
  29.1996868566837e-6, // C0, equation (30)
  87.4376851991085e-9, // C1, equation (30)
  22.0776941764705e-12, // C2, equation (30)
  102.342990689362e-15, // C3, equation (30)
  -92.4986988833091e-18, // C4, equation (30)
  25.8520201885984e-21, // C5, equation (30)
  -2.4007463749479e-24, // C6, equation (30)
] as const;

/** Equation (32)'s leading constant. */
export const K_CONSTANT = 1.2; // equation (32)

/**
 * Envelope on the sampler's foF2, MHz. NOT a physics limit: a generous margin
 * over the highest foF2 ever observed (around 20 MHz), so a runaway sampler
 * cannot overflow equation (29) into an infinite or NaN fBM.
 */
export const SAMPLED_FOF2_MAX_MHZ = 50;

/**
 * Envelope on the sampler's M(3000)F2, dimensionless. NOT a physics limit:
 * the propagation factor is physically between about 1 and 4.
 */
export const SAMPLED_M3000F2_MAX = 6;

/**
 * Envelope on the sampler's 300 km gyrofrequency, MHz. NOT a physics limit:
 * the terrestrial field gives at most about 1.7 MHz at the surface.
 */
export const SAMPLED_GYROFREQUENCY_MAX_MHZ = 3;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const HOURS_PER_DAY = 24;
const DEGREES_PER_HOUR = 15; // 360 degrees of rotation in 24 hours

/** What the sampler must answer with at one control point at one hour. */
export interface LongPathMufState {
  /** F2-layer critical frequency, MHz. Section 3.4. */
  readonly foF2MHz: number;
  /** F2 propagation factor M(3000)F2, dimensionless. Section 3.4. */
  readonly m3000F2: number;
  /** Electron gyrofrequency at 300 km, MHz. Section 3.4. */
  readonly gyrofrequency300kmMHz: number;
}

/**
 * The ionosphere at one control point at one whole UTC hour of the prediction's
 * own day.
 *
 * Contract M03's injected provider, widened by the hour because equation (32)
 * needs the whole diurnal curve of fBM and not just the prediction's hour.
 */
export type LongPathMufSampler = (
  point: GeodeticPoint,
  label: ControlPointLabel,
  utcHour: number,
) => LongPathMufState;

/** fBM and its equation (29) parts at one control point at one hour. */
export interface LongPathMufHour {
  readonly utcHour: number;
  readonly state: LongPathMufState;
  /** f4 = 1.1 foF2 M(3000)F2, MHz. Equation (29). */
  readonly f4MHz: number;
  /** fz = foF2 + fH/2, MHz. Equation (29). */
  readonly fzMHz: number;
  /** fBM = fz + (f4 - fz) fD, MHz. Equation (29). */
  readonly basicMufMHz: number;
}

export interface LongPathMufControlPoint {
  readonly site: ControlPointSite;
  /** The 24 hours of equation (29), index 0 being 00 UTC. */
  readonly hours: readonly LongPathMufHour[];
  /** fBM at the prediction's own hour, MHz. */
  readonly basicMufMHz: number;
  /** fBM,noon, MHz, and the UTC hour it was read at. See deviation 2. */
  readonly noonBasicMufMHz: number;
  readonly noonUtcHour: number;
  /** fBM,min, the lowest fBM in the 24 hours, MHz. */
  readonly minimumBasicMufMHz: number;
  /** K of equation (32), dimensionless. */
  readonly kFactor: number;
  /** K fBM of equation (31), MHz. */
  readonly operationalMufMHz: number;
}

/** The interpolated Table 3 coefficients actually applied. */
export interface KFactorCoefficients {
  readonly W: number;
  readonly X: number;
  readonly Y: number;
  /** Forward azimuth of the route at its centre, degrees 0..360. */
  readonly midPathAzimuthDeg: number;
  /** The acute angle between the path and the North-South axis, degrees. */
  readonly angleFromNorthSouthDeg: number;
  /** 0 at North-South, 1 at East-West. The weight given the Table 3 E-W row. */
  readonly eastWestWeight: number;
}

export interface ResolvedLongPathMuf {
  readonly kind: "resolved";
  readonly groundDistanceKm: number;
  /** nM, the number of equal hops. */
  readonly hopCount: number;
  /** dM = D / nM, km. */
  readonly hopGroundDistanceKm: number;
  /** Equation (13) at the 300 km height, radians. */
  readonly elevationRad: number;
  readonly elevationDeg: number;
  /** p', equation (19) over the whole path at the 300 km height, km. */
  readonly virtualSlantRangeKm: number;
  /** How many hops were added to clear the 3.0-degree minimum. */
  readonly hopsAddedForElevation: number;
  /** fD of equation (30), dimensionless. */
  readonly distanceReductionFactor: number;
  readonly coefficients: KFactorCoefficients;
  /** T + dM/2 first, R - dM/2 second. */
  readonly controlPoints: readonly [
    LongPathMufControlPoint,
    LongPathMufControlPoint,
  ];
  /** The lower of the two control-point fBM values, MHz. Section 5.3.1. */
  readonly basicMufMHz: number;
  /** The lower of the two K fBM values, MHz. Equation (31). */
  readonly fMMHz: number;
  /** Mean of the two control-point gyrofrequencies, MHz. Equation (39). */
  readonly gyrofrequencyMHz: number;
}

export interface UnsupportedLongPathMuf {
  readonly kind: "unsupported";
  readonly reason:
    | "out_of_domain"
    | "no_elevation_solution"
    | "non_finite_result";
  readonly detail: string;
  readonly groundDistanceKm: number;
}

export type LongPathMufResult = ResolvedLongPathMuf | UnsupportedLongPathMuf;

export interface LongPathMufInputs {
  readonly route: ResolvedRoute;
  /** The prediction's UTC hour. Whole hours only; the table is hourly. */
  readonly utcHour: number;
  readonly sample: LongPathMufSampler;
}

/**
 * fD of equation (30), the distance reduction factor, for a hop of `dMKm`.
 *
 * Written as Horner from C6 down, which is how the recommendation prints it.
 * The text states the range without stating a clamp: "The factor fD varies
 * between 0.0 (for a hop length of 0 km) and 1.0 (for a hop length of 4 000
 * km)". That is a description of the polynomial on its own domain, not a rule
 * to impose, so nothing here clamps it; section 5.3.1 never evaluates it
 * outside 0 to 4 000 km because dM is bounded by construction.
 *
 * AND THE DESCRIPTION IS ONLY APPROXIMATE, WHICH IS WORTH KNOWING BEFORE A
 * CLAMP LOOKS TEMPTING. The published seventh-order polynomial is not monotonic
 * over 0 to 4 000 km: it peaks at 1.00407 near 3 784.5 km, four tenths of a per
 * cent above the stated 1.0, and has fallen back to 0.96596 by 4 000 km. Both
 * numbers are recorded in the unit test. Neither is reachable here: the
 * 3.0-degree minimum elevation caps dM at 3 224.51 km, where fD is 0.92038, so
 * over the hop lengths section 5.3.1 can actually produce the curve rises
 * monotonically from 0 and never reaches 1.
 */
export function distanceReductionFactor(dMKm: number): number {
  const [C0, C1, C2, C3, C4, C5, C6] = FD_COEFFICIENTS;
  return (
    ((((((C6 * dMKm + C5) * dMKm + C4) * dMKm + C3) * dMKm + C2) * dMKm + C1) *
      dMKm +
      C0) *
    dMKm
  );
}

/** f4 = 1.1 foF2 M(3000)F2, MHz. Equation (29). */
export function f2FourThousandMufMHz(state: LongPathMufState): number {
  return 1.1 * state.foF2MHz * state.m3000F2; // equation (29)
}

/** fz = foF2 + fH/2, MHz. Equation (29). */
export function f2ZeroMufMHz(state: LongPathMufState): number {
  return state.foF2MHz + state.gyrofrequency300kmMHz / 2; // equation (29)
}

/** fBM = fz + (f4 - fz) fD, MHz. Equation (29). */
export function longPathBasicMufMHz(
  state: LongPathMufState,
  distanceReduction: number,
): number {
  const f4 = f2FourThousandMufMHz(state);
  const fz = f2ZeroMufMHz(state);
  return fz + (f4 - fz) * distanceReduction; // equation (29)
}

/**
 * K of equation (32).
 *
 * Every division here has a strictly positive denominator on any circuit the
 * caller reaches, because fBM is a sum of positive frequencies; `longPathMuf`
 * rejects a non-positive fBM as `out_of_domain` before calling this, so the
 * cube root and the two ratios cannot produce a NaN or an infinity.
 */
export function kFactor(
  basicMufMHz: number,
  noonBasicMufMHz: number,
  minimumBasicMufMHz: number,
  coefficients: Pick<KFactorCoefficients, "W" | "X" | "Y">,
): number {
  const { W, X, Y } = coefficients;
  return (
    K_CONSTANT +
    W * (basicMufMHz / noonBasicMufMHz) +
    X * (Math.cbrt(noonBasicMufMHz / basicMufMHz) - 1) +
    Y * (minimumBasicMufMHz / noonBasicMufMHz) ** 2
  ); // equation (32)
}

/**
 * Forward azimuth of a resolved route at a fraction of its own length, degrees.
 *
 * The route carries its own great-circle frame, `r(s) = u cos s + q sin s`, so
 * the tangent at `s` is `r'(s) = -u sin s + q cos s` and the azimuth is that
 * tangent read in the local east/north basis. This derives an angle from the
 * frame `resolveRoute()` already produced; it does not resolve a second route,
 * which contract M06 forbids.
 */
export function forwardAzimuthDegAt(
  route: ResolvedRoute,
  fraction: number,
): number {
  const point = routeSampleAtFraction(route, fraction);
  const s = route.arcAngleRad * fraction;
  const sinS = Math.sin(s);
  const cosS = Math.cos(s);
  const tangent = {
    x: -route.origin.x * sinS + route.tangent.x * cosS,
    y: -route.origin.y * sinS + route.tangent.y * cosS,
    z: -route.origin.z * sinS + route.tangent.z * cosS,
  };
  const phi = point.latitudeDeg * DEG_TO_RAD;
  const lambda = point.longitudeDeg * DEG_TO_RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const east = tangent.x * -sinLambda + tangent.y * cosLambda;
  const north =
    tangent.x * (-sinPhi * cosLambda) +
    tangent.y * (-sinPhi * sinLambda) +
    tangent.z * cosPhi;
  return (Math.atan2(east, north) * RAD_TO_DEG + 360) % 360;
}

/**
 * Table 3 interpolated for one mid-path azimuth. See deviation 3 for the fold.
 *
 * The azimuth is reduced modulo 180 degrees, because a great circle has no
 * preferred sense for this purpose, and then reflected about 90 degrees, which
 * leaves the acute angle between the path and the North-South axis. Zero is a
 * meridional path and takes the North-South row whole; 90 degrees is a
 * parallel-following path and takes the East-West row whole.
 */
export function interpolateTable3(
  midPathAzimuthDeg: number,
): KFactorCoefficients {
  const folded = ((midPathAzimuthDeg % 180) + 180) % 180;
  const angleFromNorthSouthDeg = folded <= 90 ? folded : 180 - folded;
  const eastWestWeight = angleFromNorthSouthDeg / 90;
  const ew = tables.table_3.east_west;
  const ns = tables.table_3.north_south;
  const mix = (eastWest: number, northSouth: number): number =>
    northSouth * (1 - eastWestWeight) + eastWest * eastWestWeight;
  return {
    W: mix(ew.W, ns.W), // Table 3
    X: mix(ew.X, ns.X), // Table 3
    Y: mix(ew.Y, ns.Y), // Table 3
    midPathAzimuthDeg,
    angleFromNorthSouthDeg,
    eastWestWeight,
  };
}

/**
 * The UTC hour corresponding to local noon at a longitude. See deviation 2.
 *
 * Local solar noon is UTC `12 - lambda/15` for a longitude `lambda` in degrees
 * east; the hourly table is read at the nearest whole hour to that.
 */
export function localNoonUtcHour(longitudeDeg: number): number {
  const noon = 12 - longitudeDeg / DEGREES_PER_HOUR;
  return ((Math.round(noon) % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

function site(
  route: ResolvedRoute,
  label: ControlPointLabel,
  offsetKm: number,
): ControlPointSite {
  const fraction = offsetKm / route.groundDistanceKm;
  return {
    label,
    offsetKm,
    fraction,
    point: routeSampleAtFraction(route, fraction),
  };
}

function unsupported(
  reason: UnsupportedLongPathMuf["reason"],
  detail: string,
  groundDistanceKm: number,
): UnsupportedLongPathMuf {
  return { kind: "unsupported", reason, detail, groundDistanceKm };
}

/**
 * The hop division of section 5.3.1: the minimum number of equal hops no longer
 * than 4 000 km, then hops added until equation (13) at 300 km exceeds 3.0
 * degrees. See deviation 1 for the loop.
 */
function divideIntoHops(groundDistanceKm: number):
  | {
      readonly kind: "hops";
      readonly hopCount: number;
      readonly hopGroundDistanceKm: number;
      readonly elevationRad: number;
      readonly virtualSlantRangeKm: number;
      readonly hopsAddedForElevation: number;
    }
  | { readonly kind: "none"; readonly detail: string } {
  let hopCount = Math.max(1, Math.ceil(groundDistanceKm / LONG_PATH_MAX_HOP_KM));
  const firstHopCount = hopCount;
  while (hopCount <= LONG_PATH_MAX_HOP_COUNT) {
    const geometry = hopGeometry({
      groundDistanceKm,
      hopCount,
      mirrorHeightKm: LONG_PATH_MIRROR_HEIGHT_KM,
    });
    if (
      geometry.kind === "supported" &&
      geometry.elevationAngleRad > LONG_PATH_MIN_ELEVATION_DEG * DEG_TO_RAD
    ) {
      return {
        kind: "hops",
        hopCount,
        hopGroundDistanceKm: geometry.hopGroundDistanceKm,
        elevationRad: geometry.elevationAngleRad,
        virtualSlantRangeKm: geometry.virtualSlantRangeKm,
        hopsAddedForElevation: hopCount - firstHopCount,
      };
    }
    hopCount += 1;
  }
  return {
    kind: "none",
    detail:
      `no hop count up to ${String(LONG_PATH_MAX_HOP_COUNT)} divides ` +
      `${groundDistanceKm.toFixed(1)} km into equal hops whose equation (13) ` +
      `elevation at ${String(LONG_PATH_MIRROR_HEIGHT_KM)} km exceeds ` +
      `${LONG_PATH_MIN_ELEVATION_DEG.toFixed(1)} degrees.`,
  };
}

/**
 * Every quantity `LongPathMufSampler` may answer with, its own physical
 * domain and how a violation is described.
 *
 * Finiteness alone is not enough: a finite but non-physical value, such as a
 * missing-data sentinel of `m3000F2 = -1`, satisfies `Number.isFinite` and
 * would otherwise reach equation (29) and produce a resolved but corrupted
 * `fBM`. foF2 and M(3000)F2 are physically positive (section 3.4); the
 * gyrofrequency at 300 km is physically non-negative. THE UPPER BOUNDS ARE
 * ENVELOPES, NOT PHYSICS LIMITS: a finite value can still be so large that it
 * is not a physical answer for this quantity and would overflow equation
 * (29) or equation (32) despite satisfying every check above. A sampler
 * returning, for instance, `foF2MHz = Number.MAX_VALUE` is finite and
 * positive and yet turns f4 into an overflowed `fBM`, whose ratio against
 * itself later in the K-factor is `Infinity / Infinity`, a NaN. The envelope
 * closes that path at the boundary these quantities can actually be sampled
 * at, well above anything the ionosphere produces.
 */
const SAMPLED_STATE_BOUNDS: readonly {
  readonly name: keyof LongPathMufState;
  readonly description: string;
  readonly withinBound: (value: number) => boolean;
}[] = [
  {
    name: "foF2MHz",
    description:
      `a finite value greater than 0 and at most ` +
      `${String(SAMPLED_FOF2_MAX_MHZ)} (an envelope; the highest foF2 ever ` +
      `observed is around 20 MHz)`,
    withinBound: (value) => value > 0 && value <= SAMPLED_FOF2_MAX_MHZ,
  },
  {
    name: "m3000F2",
    description:
      `a finite value greater than 0 and at most ` +
      `${String(SAMPLED_M3000F2_MAX)} (an envelope; the propagation factor ` +
      `is physically between about 1 and 4)`,
    withinBound: (value) => value > 0 && value <= SAMPLED_M3000F2_MAX,
  },
  {
    name: "gyrofrequency300kmMHz",
    description:
      `a finite value of 0 or greater and at most ` +
      `${String(SAMPLED_GYROFREQUENCY_MAX_MHZ)} (an envelope; the ` +
      `terrestrial field gives at most about 1.7 MHz at the surface)`,
    withinBound: (value) =>
      value >= 0 && value <= SAMPLED_GYROFREQUENCY_MAX_MHZ,
  },
];

function invalidSampledStateDetail(
  state: LongPathMufState,
  label: ControlPointLabel,
  utcHour: number,
): string | null {
  for (const { name, description, withinBound } of SAMPLED_STATE_BOUNDS) {
    const value = state[name];
    if (!Number.isFinite(value) || !withinBound(value)) {
      return (
        `the sampler answered ${name} = ${String(value)} at ${label} for ` +
        `${String(utcHour).padStart(2, "0")} UTC, which is not ${description}.`
      );
    }
  }
  return null;
}

/**
 * fM, its basic MUF and both control points, for one path longer than 7 000 km.
 *
 * Consumes one already-resolved route (contract M06) and one injected sampler
 * (contract M03). Nothing here fetches anything, and nothing here is cached
 * across circuits.
 */
export function longPathMuf(inputs: LongPathMufInputs): LongPathMufResult {
  const { route, utcHour, sample } = inputs;
  const D = route.groundDistanceKm;

  if (!Number.isFinite(D) || D <= 0) {
    return unsupported(
      "out_of_domain",
      `the route has no usable ground distance (${String(D)} km).`,
      D,
    );
  }
  if (D > MAX_ROUTE_DISTANCE_KM) {
    return unsupported(
      "out_of_domain",
      `the route is ${D.toFixed(1)} km, longer than the ` +
        `${MAX_ROUTE_DISTANCE_KM.toFixed(1)} km circumference of the ` +
        `declared sphere, so it is not a path length.`,
      D,
    );
  }
  if (D < LONG_PATH_MIN_DISTANCE_KM) {
    return unsupported(
      "out_of_domain",
      `section 5.3 applies to paths of at least ` +
        `${String(LONG_PATH_MIN_DISTANCE_KM)} km; this path is ` +
        `${D.toFixed(1)} km, where sections 5.1 and 5.2 apply.`,
      D,
    );
  }
  if (
    !Number.isInteger(utcHour) ||
    utcHour < 0 ||
    utcHour >= HOURS_PER_DAY
  ) {
    return unsupported(
      "out_of_domain",
      `utcHour must be a whole hour 0..23, received ${String(utcHour)}. ` +
        `Equation (32) reads fBM from an hourly table and cannot be asked ` +
        `for a fractional hour without inventing an interpolation the ` +
        `recommendation does not state.`,
      D,
    );
  }

  const division = divideIntoHops(D);
  if (division.kind === "none") {
    return unsupported("no_elevation_solution", division.detail, D);
  }
  const {
    hopCount,
    hopGroundDistanceKm,
    elevationRad,
    virtualSlantRangeKm,
    hopsAddedForElevation,
  } = division;

  const fD = distanceReductionFactor(hopGroundDistanceKm); // equation (30)
  const sites: readonly [ControlPointSite, ControlPointSite] = [
    site(route, "T + d0/2", hopGroundDistanceKm / 2), // Table 1a, d0 = dM
    site(route, "R - d0/2", D - hopGroundDistanceKm / 2), // Table 1a, d0 = dM
  ];
  const coefficients = interpolateTable3(forwardAzimuthDegAt(route, 0.5));

  const points: LongPathMufControlPoint[] = [];
  for (const controlPoint of sites) {
    const hours: LongPathMufHour[] = [];
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      const state = sample(controlPoint.point, controlPoint.label, hour);
      const complaint = invalidSampledStateDetail(state, controlPoint.label, hour);
      if (complaint !== null) {
        return unsupported("out_of_domain", complaint, D);
      }
      hours.push({
        utcHour: hour,
        state,
        f4MHz: f2FourThousandMufMHz(state),
        fzMHz: f2ZeroMufMHz(state),
        basicMufMHz: longPathBasicMufMHz(state, fD),
      });
    }

    const noonUtcHour = localNoonUtcHour(controlPoint.point.longitudeDeg);
    const basicMufMHz = hours[utcHour].basicMufMHz;
    const noonBasicMufMHz = hours[noonUtcHour].basicMufMHz;
    const minimumBasicMufMHz = hours.reduce(
      (lowest, hour) => Math.min(lowest, hour.basicMufMHz),
      Number.POSITIVE_INFINITY,
    );
    // Finite, not just positive: an overflowed fBM (a sampled state so large
    // that equation (29) produced Infinity) is still `> 0` and would
    // otherwise reach the K-factor and divide Infinity by Infinity, a NaN.
    if (
      !(Number.isFinite(basicMufMHz) && basicMufMHz > 0) ||
      !(Number.isFinite(noonBasicMufMHz) && noonBasicMufMHz > 0) ||
      !Number.isFinite(minimumBasicMufMHz)
    ) {
      return unsupported(
        "out_of_domain",
        `fBM at ${controlPoint.label} is ${basicMufMHz.toFixed(3)} MHz at the ` +
          `prediction hour, ${noonBasicMufMHz.toFixed(3)} MHz at local noon ` +
          `and ${minimumBasicMufMHz.toFixed(3)} MHz at its 24-hour minimum; ` +
          `equation (32) divides by the first two and squares a ratio of the ` +
          `third, so each must be finite and the first two must be positive ` +
          `rather than producing an infinite or NaN K-factor.`,
        D,
      );
    }
    const k = kFactor(
      basicMufMHz,
      noonBasicMufMHz,
      minimumBasicMufMHz,
      coefficients,
    );
    points.push({
      site: controlPoint,
      hours,
      basicMufMHz,
      noonBasicMufMHz,
      noonUtcHour,
      minimumBasicMufMHz,
      kFactor: k,
      operationalMufMHz: k * basicMufMHz, // equation (31)
    });
  }

  const [near, far] = points as [
    LongPathMufControlPoint,
    LongPathMufControlPoint,
  ];
  const resolved: ResolvedLongPathMuf = {
    kind: "resolved",
    groundDistanceKm: D,
    hopCount,
    hopGroundDistanceKm,
    elevationRad,
    elevationDeg: elevationRad * RAD_TO_DEG,
    virtualSlantRangeKm,
    hopsAddedForElevation,
    distanceReductionFactor: fD,
    coefficients,
    controlPoints: [near, far],
    basicMufMHz: Math.min(near.basicMufMHz, far.basicMufMHz),
    fMMHz: Math.min(near.operationalMufMHz, far.operationalMufMHz),
    gyrofrequencyMHz:
      (near.hours[utcHour].state.gyrofrequency300kmMHz +
        far.hours[utcHour].state.gyrofrequency300kmMHz) /
      2, // equation (39): "mean of the values ... at both control points"
  };

  // The last check, after every input and intermediate bound above: no
  // resolved fM record leaves this function carrying a non-finite number
  // anywhere in its own tree, whatever combination of in-bounds inputs
  // produced it. See `finiteResult.ts`.
  const nonFinite = firstNonFiniteField(resolved);
  if (nonFinite !== null) {
    return unsupported(
      "non_finite_result",
      `the resolved fM record's ${nonFinite.path} is ` +
        `${String(nonFinite.value)}, not a finite number.`,
      D,
    );
  }
  return resolved;
}
