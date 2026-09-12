/**
 * ITU-R P.533-14 Table 1 control points (PROP-08, #954 slice A).
 *
 * Table 1 of the recommendation is one table in four parts. Each part names
 * the places along the great-circle route at which an ionospheric quantity is
 * to be evaluated, as a function of the path length D, the reflecting layer,
 * and what the quantity is for:
 *
 *   1a) basic MUF and the associated electron gyrofrequency
 *   1b) E-layer screening
 *   1c) ray-path mirror-reflection heights
 *   1d) ionospheric absorption and the associated electron gyrofrequency
 *
 * This module is the single definition of all four. Nothing else in the tree
 * may spell a control-point rule out again: a second copy is a second chance
 * to disagree about a boundary, and the boundaries are where the table does
 * all of its work.
 *
 * TRANSCRIBED FROM THE RECOMMENDATION, verbatim in the comparison operators:
 *
 *   1a) E   0 < D <= 2000            M
 *           2000 < D <= 4000         T + 1000, R - 1000
 *           D > 4000                 (no E modes)
 *       F2  0 < D <= 2000            M
 *           2000 < D <= dmax         M
 *           D > dmax                 T + d0/2, R - d0/2
 *
 *   1b) F2  0 < D <= 2000            M
 *           2000 < D < 9000          T + 1000, R - 1000
 *
 *   1c) F2  0 < D <= dmax            M
 *           dmax < D < 9000          T + d0/2, M, R - d0/2
 *
 *   1d) E   0 < D <= 2000            M
 *           2000 < D <= 4000         T + 1000, M, R - 1000
 *       F2  0 < D <= 2000            M
 *           2000 < D <= dmax         T + 1000, M, R - 1000
 *           dmax < D < 9000          T + 1000, T + d0/2, M, R - d0/2, R - 1000
 *
 * with, in the recommendation's own words, "M: path mid-point, T: transmitter
 * location, R: receiver location, dmax: maximum hop length for F2 mode
 * calculated at the mid-path control point, d0: hop length of lowest-order
 * mode. Distances are quoted in kilometres."
 *
 * WHAT THIS MODULE OWNS.
 *
 *  - `d0 = D / n`, the hop length of the lowest-order mode. It is one
 *    division, and it is here rather than at four call sites so that "the hop
 *    length" cannot come to mean two things.
 *  - The dmax rule. dmax itself is equations (5) and (6), which
 *    `geometry/reflectionHeight.ts` already computes as `maximumHopLengthKm`
 *    and is re-exported here rather than re-derived. The *rule* is the
 *    restriction section 3.5.1.1 puts on it: "for the calculation of the basic
 *    MUF dmax is restricted to be no greater than 4000 km", which section
 *    3.5.2.2 then lifts for the higher-order mode scaling factors, where dmax
 *    "is recalculated at the control point and can be larger than 4000 km".
 *    Both are named functions, so a caller states which one it means.
 *  - The selection rule when a table names two points and the quantity is a
 *    scalar. Section 3.3 for the basic MUF: "foE is evaluated at the control
 *    points noted in Table 1a) and for path lengths of 2000-4000 km the lower
 *    value is selected". Section 4 for screening: "the higher one of the foE
 *    values at the two control points 1000 km from each end of the path". They
 *    point opposite ways, which is exactly why they are two named functions
 *    and not one "combine" with a flag.
 *
 * WHAT IT DOES NOT OWN. It does not fetch ionospheric state, does not choose a
 * mode, and does not know what a MUF is. It converts a route and a purpose
 * into a list of places. Sampling is `routeSampleAtFraction` from
 * `geometry/route.ts`, so a control point on this route is exactly as accurate
 * as every other point drawn on it, and nothing here re-resolves a route
 * (mathematical contract M06).
 *
 * RELATION TO `ionosphere/mirrorHeight.ts`. That leaf already implements Table
 * 1c inline to average the section 5.1 height over its control points. It is
 * not changed by this slice; `controlPoints.test.ts` instead asserts that this
 * module reproduces its choice exactly, so the duplicate has a test holding
 * the two together until a later slice deletes one of them.
 */

import {
  routeSampleAtFraction,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  maximumHopLengthKm,
  MAX_DMAX_KM,
} from "@/lib/propagation/geometry/reflectionHeight";

export { maximumHopLengthKm, MAX_DMAX_KM };

/** The offset, in km from either end, of the "T + 1000" and "R - 1000" points. */
export const END_CONTROL_POINT_OFFSET_KM = 1000;

/** Table 1a's E-mode limit, and section 4's screening limit, km. */
export const E_MODE_MAX_PATH_KM = 4000;

/** Above this the short-path method of sections 2 to 5.2 does not apply, km. */
export const MAX_SHORT_PATH_KM = 9000;

/** Table 1's first breakpoint, km. */
export const MID_POINT_ONLY_PATH_KM = 2000;

export type ControlPointLabel =
  | "M"
  | "T + 1000"
  | "R - 1000"
  | "T + d0/2"
  | "R - d0/2";

/** Which part of Table 1 a selection came from. */
export type ControlPointTable = "1a" | "1b" | "1c" | "1d";

/**
 * What the control points are being selected for. These are the four headings
 * of Table 1, not four convenient groupings: the same path length and the same
 * layer give different points for different purposes, which is the whole
 * reason the recommendation splits the table.
 */
export type ControlPointPurpose =
  | "basic_muf"
  | "e_layer_screening"
  | "reflection_height"
  | "absorption";

export type ControlPointLayer = "E" | "F2";

export interface ControlPointSite {
  readonly label: ControlPointLabel;
  /** Ground distance from the transmitter along the resolved route, km. */
  readonly offsetKm: number;
  /** `offsetKm / D`, the argument `routeSampleAtFraction` was called with. */
  readonly fraction: number;
  readonly point: GeodeticPoint;
}

export interface ControlPointQuery {
  readonly route: ResolvedRoute;
  readonly purpose: ControlPointPurpose;
  readonly layer: ControlPointLayer;
  /**
   * dmax at the mid-path control point, km. Required for every F2 selection,
   * because every F2 row of Table 1 is bounded by it. Which dmax (restricted
   * to 4000 km or not) is the caller's statement of what it is computing; see
   * `basicMufDmaxKm`.
   */
  readonly dmaxKm?: number;
  /**
   * `d0`, the hop length of the lowest-order mode, km. Required only when the
   * selection can name T + d0/2, that is for an F2 path longer than dmax.
   */
  readonly hopGroundDistanceKm?: number;
}

export type ControlPointSelection =
  | {
      readonly kind: "points";
      readonly table: ControlPointTable;
      readonly points: readonly ControlPointSite[];
    }
  | {
      readonly kind: "not_applicable";
      readonly table: ControlPointTable;
      readonly reason: string;
    };

/** `d0 = D / n`, km. Section 3.5.1.1's hop length of an n-hop mode. */
export function hopGroundDistanceKm(
  groundDistanceKm: number,
  hopCount: number,
): number {
  if (!Number.isFinite(groundDistanceKm) || groundDistanceKm <= 0) {
    throw new RangeError(
      `groundDistanceKm must be positive and finite, received ${String(groundDistanceKm)}.`,
    );
  }
  if (!Number.isInteger(hopCount) || hopCount < 1) {
    throw new RangeError(
      `hopCount must be a positive integer, received ${String(hopCount)}.`,
    );
  }
  return groundDistanceKm / hopCount;
}

/**
 * dmax for a basic-MUF calculation, km.
 *
 * Section 3.5.1.1: "For the calculation of the basic MUF dmax is restricted to
 * be no greater than 4000 km."
 */
export function basicMufDmaxKm(
  m3000F2: number,
  foF2MHz: number,
  foEMHz: number,
): number {
  return Math.min(maximumHopLengthKm(m3000F2, foF2MHz, foEMHz), MAX_DMAX_KM);
}

/**
 * dmax for the higher-order mode scaling factors Mn and Mn0, km.
 *
 * Section 3.5.2.2: "For the calculation of Mn and Mn0, the maximum hop
 * distance, dmax, is recalculated at the control point and can be larger than
 * 4000 km." Deliberately a separate name from `basicMufDmaxKm`: the two
 * differ on exactly the paths where the difference matters.
 */
export function higherOrderModeDmaxKm(
  m3000F2: number,
  foF2MHz: number,
  foEMHz: number,
): number {
  return maximumHopLengthKm(m3000F2, foF2MHz, foEMHz);
}

/**
 * Section 3.3's rule: of the two Table 1a foE values on a 2000 to 4000 km
 * path, "the lower value is selected".
 */
export function basicMufFoEMHz(values: readonly number[]): number {
  return reduceFoE(values, Math.min, "basic MUF (section 3.3)");
}

/**
 * Section 4's rule: "the higher one of the foE values at the two control
 * points 1000 km from each end of the path" is taken for the maximum
 * screening frequency. The opposite of `basicMufFoEMHz`, on purpose.
 */
export function screeningFoEMHz(values: readonly number[]): number {
  return reduceFoE(values, Math.max, "E-layer screening (section 4)");
}

function reduceFoE(
  values: readonly number[],
  pick: (a: number, b: number) => number,
  what: string,
): number {
  if (values.length === 0) {
    throw new RangeError(`${what} needs at least one foE value.`);
  }
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `${what} received a non-positive foE value ${String(value)}.`,
      );
    }
  }
  return values.reduce((a, b) => pick(a, b));
}

function siteAt(
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

function requireDmax(query: ControlPointQuery): number {
  const { dmaxKm } = query;
  if (dmaxKm === undefined || !Number.isFinite(dmaxKm) || dmaxKm <= 0) {
    throw new RangeError(
      `every F2 row of Table 1 is bounded by dmax, so dmaxKm is required and ` +
        `must be positive; received ${String(dmaxKm)}.`,
    );
  }
  return dmaxKm;
}

function requireHopDistance(query: ControlPointQuery): number {
  const d0 = query.hopGroundDistanceKm;
  if (d0 === undefined || !Number.isFinite(d0) || d0 <= 0) {
    throw new RangeError(
      `a path longer than dmax names T + d0/2 and R - d0/2, so ` +
        `hopGroundDistanceKm (d0 = D / n0) is required and must be positive; ` +
        `received ${String(d0)}.`,
    );
  }
  return d0;
}

/**
 * The control points Table 1 names for one route, layer and purpose.
 *
 * Returns `not_applicable` rather than an empty list where the table simply
 * has no row: an E mode beyond 4000 km and an F2 mode at or beyond 9000 km are
 * both absences the recommendation states, not oversights to paper over with
 * the mid-point.
 */
export function selectControlPoints(
  query: ControlPointQuery,
): ControlPointSelection {
  const { route, purpose, layer } = query;
  const D = route.groundDistanceKm;
  if (!Number.isFinite(D) || D <= 0) {
    throw new RangeError(
      `the route has no usable ground distance (${String(D)} km).`,
    );
  }
  const mid = (): ControlPointSite => siteAt(route, "M", D / 2);
  const ends = (): ControlPointSite[] => [
    siteAt(route, "T + 1000", END_CONTROL_POINT_OFFSET_KM),
    siteAt(route, "R - 1000", D - END_CONTROL_POINT_OFFSET_KM),
  ];
  const halfHop = (d0: number): [ControlPointSite, ControlPointSite] => [
    siteAt(route, "T + d0/2", d0 / 2),
    siteAt(route, "R - d0/2", D - d0 / 2),
  ];

  switch (purpose) {
    case "basic_muf": {
      const table: ControlPointTable = "1a";
      if (layer === "E") {
        if (D <= MID_POINT_ONLY_PATH_KM) {
          return { kind: "points", table, points: [mid()] };
        }
        if (D <= E_MODE_MAX_PATH_KM) {
          return { kind: "points", table, points: ends() };
        }
        return {
          kind: "not_applicable",
          table,
          reason:
            `Table 1a names no E-mode control point beyond ${String(E_MODE_MAX_PATH_KM)} km; ` +
            `section 2 admits E modes "up to 4 000 km range" only.`,
        };
      }
      if (D >= MAX_SHORT_PATH_KM) {
        return {
          kind: "not_applicable",
          table,
          reason:
            `the basic MUF of sections 3.3 to 3.5 is defined for paths up to ` +
            `${String(MAX_SHORT_PATH_KM)} km; beyond that the long-path method of ` +
            `section 5.3 applies and this slice does not implement it.`,
        };
      }
      if (D <= MID_POINT_ONLY_PATH_KM || D <= requireDmax(query)) {
        return { kind: "points", table, points: [mid()] };
      }
      return {
        kind: "points",
        table,
        points: halfHop(requireHopDistance(query)),
      };
    }

    case "e_layer_screening": {
      const table: ControlPointTable = "1b";
      if (layer !== "F2") {
        return {
          kind: "not_applicable",
          table,
          reason:
            "Table 1b is the screening of F2 modes by the E layer; there is " +
            "no E-mode row.",
        };
      }
      if (D <= MID_POINT_ONLY_PATH_KM) {
        return { kind: "points", table, points: [mid()] };
      }
      if (D < MAX_SHORT_PATH_KM) {
        return { kind: "points", table, points: ends() };
      }
      return {
        kind: "not_applicable",
        table,
        reason:
          `Table 1b stops at ${String(MAX_SHORT_PATH_KM)} km; section 4 considers ` +
          `E-layer screening "for paths up to 4 000 km" in any case.`,
      };
    }

    case "reflection_height": {
      const table: ControlPointTable = "1c";
      if (layer !== "F2") {
        return {
          kind: "not_applicable",
          table,
          reason:
            "Table 1c is the F2 mirror-reflection height; the E-mode mirror " +
            "is fixed at 110 km and has no control-point row.",
        };
      }
      if (D <= requireDmax(query)) {
        return { kind: "points", table, points: [mid()] };
      }
      if (D < MAX_SHORT_PATH_KM) {
        const [near, far] = halfHop(requireHopDistance(query));
        return { kind: "points", table, points: [near, mid(), far] };
      }
      return {
        kind: "not_applicable",
        table,
        reason: `Table 1c stops at ${String(MAX_SHORT_PATH_KM)} km.`,
      };
    }

    case "absorption": {
      const table: ControlPointTable = "1d";
      if (layer === "E") {
        if (D <= MID_POINT_ONLY_PATH_KM) {
          return { kind: "points", table, points: [mid()] };
        }
        if (D <= E_MODE_MAX_PATH_KM) {
          const [near, far] = ends();
          return { kind: "points", table, points: [near, mid(), far] };
        }
        return {
          kind: "not_applicable",
          table,
          reason: `Table 1d names no E-mode row beyond ${String(E_MODE_MAX_PATH_KM)} km.`,
        };
      }
      if (D <= MID_POINT_ONLY_PATH_KM) {
        return { kind: "points", table, points: [mid()] };
      }
      if (D >= MAX_SHORT_PATH_KM) {
        return {
          kind: "not_applicable",
          table,
          reason: `Table 1d stops at ${String(MAX_SHORT_PATH_KM)} km.`,
        };
      }
      const [nearEnd, farEnd] = ends();
      if (D <= requireDmax(query)) {
        return { kind: "points", table, points: [nearEnd, mid(), farEnd] };
      }
      const [nearHop, farHop] = halfHop(requireHopDistance(query));
      return {
        kind: "points",
        table,
        points: [nearEnd, nearHop, mid(), farHop, farEnd],
      };
    }
  }
}
