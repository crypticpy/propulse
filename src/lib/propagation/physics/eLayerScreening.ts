/**
 * ITU-R P.533-14 section 4, the E-layer maximum screening frequency fs
 * (PROP-08, #954 slice B).
 *
 * An F2 mode has to pass through the E layer twice. Below a certain frequency
 * the E layer reflects the ray instead of passing it, so the F2 mode never
 * happens. That frequency is fs, and section 4 gives it in two equations:
 *
 *   (11)  fs = 1.05 foE sec i
 *   (12)  i  = arcsin( R0 cos(delta_F) / (R0 + hr) )
 *
 * with, in the recommendation's own words, "i: angle of incidence at height
 * hr = 110 km; R0: radius of the Earth, 6 371 km; delta_F: elevation angle for
 * the F2-layer mode (determined from equation (13))".
 *
 * WHICH foE. Section 4: "The foE value at the path mid-point (for paths up to
 * 2 000 km), or the higher one of the foE values at the two control points
 * 1 000 km from each end of the path (for paths longer than 2 000 km), is
 * taken for the calculation of the maximum screening frequency." Those are
 * Table 1b's control points, and `controlPoints.ts` owns both the selection
 * and the higher-of-two rule (`screeningFoEMHz`, deliberately the opposite of
 * the lower-of-two `basicMufFoEMHz` that section 3.3 asks for). Neither is
 * restated here.
 *
 * WHICH ELEVATION. Not the mode's own elevation angle. `delta_F` is equation
 * (13) evaluated at the *section 5.1* mirror height of this hop, the long
 * G/J/U formula in `geometry/reflectionHeight.ts`, which is a different height
 * from the equation (2) height the mode's reported elevation uses. See
 * `modeTypes.ts` for the evidence that the two are genuinely different in the
 * reference and why. This module takes the elevation as an argument and does
 * not choose it; `modeSet.ts` does.
 *
 * WHAT HAPPENS BEYOND 4000 km. Section 4's first sentence: "E-layer screening
 * of F2 modes is considered for paths up to 4 000 km (see Table 1b)." Beyond
 * that there is no fs, and therefore no screening: every F2 mode passes the
 * section 5.2.1 screening criterion because the criterion is never applied.
 * This module says so with a `not_evaluated` result rather than returning a
 * number. The reference reaches the same outcome by a different route -
 * `ELayerScreeningFrequency()` returns immediately above 4000 km and leaves
 * `Md_F2[].fs` at the 0.0 `InitializePath()` wrote, which compares below every
 * operating frequency - and that initialised zero is visible in the golden
 * cases as `DMhr = 0` on every path over 4000 km. Zero is not a screening
 * frequency; `null` is the honest spelling of the same fact.
 *
 * Table 1b's own upper bound is 9000 km, wider than section 4's 4000 km. The
 * narrower one governs, because Table 1b is only ever read on section 4's
 * behalf.
 *
 * Units: MHz, km, radians.
 */

import { incidenceAngleRad } from "@/lib/propagation/geometry/hop";
import { E_LAYER_MIRROR_HEIGHT_KM, type ControlPointSampler } from "./basicMuf";
import {
  screeningFoEMHz,
  selectControlPoints,
  E_MODE_MAX_PATH_KM,
  type ControlPointSite,
} from "./controlPoints";
import type { ResolvedRoute } from "@/lib/propagation/geometry/route";

/** Equation (11)'s leading factor. */
export const E_LAYER_SCREENING_FACTOR = 1.05;

/**
 * The longest path section 4 evaluates screening on, km.
 *
 * The same 4000 km as Table 1a's E-mode limit, and deliberately the same
 * constant rather than a second 4000 written here: they are the same statement
 * about how far a single E-layer reflection is worth considering.
 */
export const E_SCREENING_MAX_PATH_KM = E_MODE_MAX_PATH_KM;

/**
 * Equation (12): the angle of incidence at 110 km of a ray leaving at
 * `f2ElevationRad`, radians.
 *
 * `incidenceAngleRad` in `geometry/hop.ts` is exactly arcsin(R0 cos delta /
 * (R0 + h)), so equation (12) is that function at h = 110 km and nothing else.
 * It is spelled out as its own name because equation (12) and equation (20)
 * are both "the incidence angle at 110 km" for different purposes, and a
 * reader chasing one should not have to satisfy themselves it is not the
 * other.
 */
export function screeningIncidenceAngleRad(f2ElevationRad: number): number {
  return incidenceAngleRad(f2ElevationRad, E_LAYER_MIRROR_HEIGHT_KM);
}

/**
 * Equation (11): fs = 1.05 foE sec i, MHz.
 *
 * `f2ElevationRad` is the F2 mode's elevation at its section 5.1 mirror
 * height, equation (13). At vertical incidence (delta = pi/2) i is zero and fs
 * is 1.05 foE; at grazing incidence sec i grows without bound, which is the
 * physical statement that a nearly horizontal ray meets the E layer nearly
 * along it and is stopped at almost any frequency.
 */
export function screeningFrequencyMHz(
  foEMHz: number,
  f2ElevationRad: number,
): number {
  if (!Number.isFinite(foEMHz) || foEMHz <= 0) {
    throw new RangeError(
      `foE must be positive and finite, received ${String(foEMHz)}.`,
    );
  }
  if (!Number.isFinite(f2ElevationRad)) {
    throw new RangeError(
      `the F2 elevation angle must be finite, received ${String(f2ElevationRad)}.`,
    );
  }
  return (
    (E_LAYER_SCREENING_FACTOR * foEMHz) /
    Math.cos(screeningIncidenceAngleRad(f2ElevationRad))
  );
}

/**
 * Section 5.2.1's screening criterion, as a predicate.
 *
 * The recommendation selects the F2 modes "which have an E-layer maximum
 * screening frequency ... which is less than the operating frequency", so the
 * mode survives on `fs < f` and is screened on `f <= fs`. The boundary matters
 * at exactly one frequency and it is written the way the text is, not the way
 * that makes a comparison symmetric.
 *
 * `fsMHz` of `null` means section 4 was not evaluated on this path, which is
 * not screening: the answer is `false`.
 */
export function isScreened(
  fsMHz: number | null,
  operatingFrequencyMHz: number,
): boolean {
  if (fsMHz === null) return false;
  return operatingFrequencyMHz <= fsMHz;
}

export interface EvaluatedScreeningFoE {
  readonly kind: "evaluated";
  /** The foE section 4 takes, MHz. */
  readonly foEMHz: number;
  /** The Table 1b control points it came from, in the order sampled. */
  readonly points: readonly ControlPointSite[];
  /** Every foE seen, aligned with `points`, MHz. */
  readonly sampledFoEMHz: readonly number[];
}

export interface NotEvaluatedScreeningFoE {
  readonly kind: "not_evaluated";
  readonly reason: "path_beyond_4000_km";
  readonly detail: string;
}

export type PathScreeningFoE = EvaluatedScreeningFoE | NotEvaluatedScreeningFoE;

export interface PathScreeningFoEInputs {
  readonly route: ResolvedRoute;
  readonly sample: ControlPointSampler;
}

/**
 * The one foE section 4 uses for a whole path, with the control points it came
 * from.
 *
 * One call per path, not one per mode: the foE does not depend on the mode,
 * only the incidence angle does. The reference makes the same selection twice
 * (once into a local it then ignores, once inside the mode loop) and gets the
 * same answer both times; there is no reason to sample the ionosphere six
 * times over for it.
 */
export function pathScreeningFoE({
  route,
  sample,
}: PathScreeningFoEInputs): PathScreeningFoE {
  const D = route.groundDistanceKm;
  if (!Number.isFinite(D) || D <= 0) {
    throw new RangeError(
      `the route has no usable ground distance (${String(D)} km).`,
    );
  }
  if (D > E_SCREENING_MAX_PATH_KM) {
    return {
      kind: "not_evaluated",
      reason: "path_beyond_4000_km",
      detail:
        `section 4 considers E-layer screening of F2 modes "for paths up to ` +
        `${String(E_SCREENING_MAX_PATH_KM)} km"; this path is ` +
        `${D.toFixed(1)} km, so no mode on it has a screening frequency and ` +
        `none of them is screened.`,
      // Matching the reference's outcome, which leaves fs at its initialised
      // 0.0 above 4000 km so that every mode passes the section 5.2.1 test.
    };
  }

  const selection = selectControlPoints({
    route,
    purpose: "e_layer_screening",
    layer: "F2",
  });
  /* c8 ignore next 5 -- Table 1b has a row for every path at or under 4000 km,
     so the guard is unreachable; it is here because `selectControlPoints`
     returns a union and silently treating `not_applicable` as "no screening"
     would be exactly the wrong failure. */
  if (selection.kind !== "points") {
    throw new Error(
      `Table 1b named no control point for a ${D.toFixed(1)} km path: ${selection.reason}`,
    );
  }

  const sampledFoEMHz = selection.points.map(
    (site) => sample(site.point, site.label).foEMHz,
  );
  return {
    kind: "evaluated",
    foEMHz: screeningFoEMHz(sampledFoEMHz),
    points: selection.points,
    sampledFoEMHz,
  };
}
