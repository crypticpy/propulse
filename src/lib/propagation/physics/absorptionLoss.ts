/**
 * Li, the ionospheric absorption loss of ITU-R P.533-14 equations (20) to (23)
 * (PROP-08, #954 slice C).
 *
 * Section 5.2.2 defines the term under equation (18) as
 *
 *     "Li: the absorption loss (dB) for an n-hop mode is given in equation (20)
 *      which is calculated at m penetration points. The penetration points are
 *      determined by assuming a fixed reflection height of 300 km and a
 *      penetration height of 90 km (two penetration points per hop)."
 *
 * and equation (20) as, symbol by symbol,
 *
 *     Li proportional to (1 + 0.0067 R12) sec i
 *          sum over j of  ATnoon_j phi(fv/foE_j) F(chi_j)
 *                         -------------------------------
 *                           (f + fL_j)^2  F(chi_jnoon)
 *
 * with equation (21) `F(chi) = cos^p(0.881 chi)` or 0.02 whichever is greater,
 * equation (22) `fv = f cos i`, equation (23) `fL = |fH sin(I)|`, i the angle
 * of incidence at 110 km, m the number of penetration points, chi the solar
 * zenith angle at the penetration point clipped at 102 degrees, and p the
 * diurnal absorption exponent as a function of the modified magnetic dip at
 * 100 km. Deviation 1 below is about the normalisation of that sum, which is
 * the one part of the equation the extract available to us does not render
 * unambiguously.
 *
 * WHAT THIS MODULE IS. Two things and no more: the geometry that says WHERE the
 * m penetration points are, and the sampling that turns each of them into the
 * crossing record `absorption/dRegion.ts` already consumes. The arithmetic of
 * equations (20) and (21) themselves is `dRegion.ts` and is not reimplemented
 * here; that module was written for PROP-03 (#949) against the same two
 * equations, carries its own fitted ATnoon, phi and p with measured residuals,
 * and is reused unchanged. Nothing in this file edits it or forks it.
 *
 * THE IONOSPHERE ARRIVES THROUGH A SAMPLER, the same shape slice A and slice B
 * use (`ControlPointSampler`, `ModeControlPointSampler`): the caller is handed
 * a point and returns the state there. That keeps contract M03's single
 * injected provider at the edge of the chain and keeps this leaf pure.
 *
 * UNITS. Li is decibels of loss, positive. Frequencies MHz, distances km,
 * angles degrees unless the name ends in `Rad`, month indices 0-based for
 * January to match `dRegion.ts` (slice A's `operationalMuf.ts` is 1-based and
 * the two are converted at the caller, never silently).
 *
 * DEVIATIONS. Numbered, each with the published text and what the pinned ITU
 * reference build cd172be5 does instead.
 *
 *  1. THE NORMALISATION OF EQUATION (20), and this is a reading of an
 *     ambiguous source rather than a departure from a clear one. The extract of
 *     the recommendation available here renders equation (20) with its
 *     fraction bars and any leading factor scrambled by the PDF text layer: the
 *     summation sign, its bounds `j = 1` to `m`, the numerator
 *     `ATnoon_j F(chi_j)`, the denominator `(f + fL_j)^2 F(chi_jnoon)` and the
 *     penetration factor are all legible, but whether a factor of `n/m`, `n` or
 *     nothing multiplies the sum is not. Read with no factor at all the sum
 *     over m = 2n points is exactly twice the value this module returns.
 *     WE IMPLEMENT `Li = n (1 + 0.0067 R12) <AT_j / (f + fL_j)^2> / cos i`,
 *     the mean over the m penetration points times the hop count, for three
 *     reasons stated so a reader can overturn them if the full text says
 *     otherwise. First, ATnoon of Figure 1 is the successor of the CCIR
 *     absorption-index constant, which is calibrated PER HOP (both traversals
 *     of the layer together), so a sum over both of a hop's penetration points
 *     with no normalisation counts each hop twice. Second, the reference
 *     implements exactly this: `PenetrationPoints` returns `ATSum/(2(n))` and
 *     `Li = (n)(1 + 0.0067 SSN) AT / ((f + fL)^2 cos i)`. Third, the magnitude:
 *     on the audit circuit of one 3000 km hop at 14 MHz at local noon this
 *     gives 14.35 dB, and the unnormalised reading gives 28.7 dB, which would
 *     put a 1 kW isotropic 20 m circuit 14 dB below what the band is observed
 *     to do at noon. `absorption/dRegion.ts` already carries this reading and
 *     its 0.073 dB worst-anchor agreement with the reference, and it is not
 *     re-litigated here.
 *  2. THE HEIGHT THE PENETRATION POINTS ARE FOUND AT. THE TEXT: "The
 *     penetration points are determined by assuming a FIXED reflection height
 *     of 300 km and a penetration height of 90 km". THE REFERENCE:
 *     `PenetrationPoints(path, n, hr, fv)` is called with `hr_E` (110 km) for E
 *     modes and `hr_F2` (the mode's own equation (2) height) for F2 modes, so
 *     its penetration points move with the mode and never sit at the 300 km
 *     geometry the text names. WE FOLLOW THE TEXT: the default is 300 km for
 *     every mode of every layer. The effect is on WHERE along the route the
 *     absorption is sampled, not on the absorption formula: a lower assumed
 *     reflection height puts the 90 km crossings closer to the ends of each
 *     hop. `penetrationReflectionHeightKm` is an input so that the parity
 *     fixture can reconstruct the reference's own reading and attribute the
 *     difference instead of burying it in a tolerance.
 *  3. WHERE fL IS EVALUATED. THE TEXT: "fLj: the value of electron
 *     gyrofrequency, about the longitudinal component of the Earth's magnetic
 *     field for a height of 100 km, determined at the J-TH PENETRATION POINT",
 *     inside the sum, squared with f. THE REFERENCE evaluates fL at the Table
 *     1d CONTROL points, takes their arithmetic mean, and divides by
 *     `(f + fL_mean)^2` OUTSIDE the sum. WE FOLLOW THE TEXT. The two differ
 *     whenever the gyrofrequency varies along the path, which it does by more
 *     than a factor of two between the magnetic equator and high dip, and the
 *     divide is nonlinear, so the difference does not vanish on average.
 *  4. THE RAY PATH ABOVE THE BASIC MUF. THE TEXT, after equation (23): "For
 *     frequencies above the basic MUF, the absorption continues to vary with
 *     frequency and is calculated assuming the same ray-paths as those at the
 *     basic MUF." The ray path enters here as one number, the elevation angle,
 *     which fixes i at 110 km and therefore both `sec i` and `fv = f cos i`.
 *     `rayPathElevationRad` is that input, and the caller states which
 *     frequency it solved the elevation at. THE REFERENCE does not implement
 *     the rule at all: it takes the elevation at the equation (2) height, which
 *     has no frequency in it, so there is nothing in its ray path to hold.
 *     `fieldStrengthShort.ts` says what it passes and what it declares when a
 *     caller supplies no basic-MUF ray path.
 *  5. THE HEIGHT THE MODIFIED MAGNETIC DIP IS TAKEN AT. THE TEXT: p is "given
 *     as a function of modified magnetic dip calculated at height of 100 km".
 *     `modifiedDipDegAt` below therefore evaluates the field at 100 km.
 *     `ionosphere/modip.ts` already exports `modifiedDipLatitudeRad`, and it is
 *     deliberately NOT reused: that function is pinned to
 *     `MAP_DIP_HEIGHT_KM = 300` because it is the CCIR numerical map's
 *     coordinate, a different quantity that must stay at 300 km. The magnetic
 *     field model itself is reused, not copied. The reference agrees with the
 *     text here (`moddip = |atan2(CP.dip[HR100km], sqrt(cos(lat)))|`), which is
 *     also where the unusual convention of taking the arctangent of a dip in
 *     RADIANS comes from; `modip.ts` documents that it is what reproduces the
 *     map and it is kept.
 *  6. A HOP THE FIXED 300 KM GEOMETRY CANNOT CLOSE. A mirror at 300 km reaches
 *     3835.8 km in one hop at a grazing elevation of zero, so deviation 2's
 *     fixed height has no ray at all for a longer hop and there are no
 *     penetration points to sample. The recommendation does not mention the
 *     case, and the reference never meets it because of deviation 2. We return
 *     the named result `penetration_geometry_below_horizon` rather than a
 *     silent zero, a clamp or a fallback height: a mode whose absorption cannot
 *     be evaluated must not contribute a made-up power to equation (28).
 *     `fieldStrengthShort.ts` carries the reason through to the caller.
 */

import {
  dRegionAbsorption,
  type DRegionCrossing,
} from "@/lib/propagation/absorption/dRegion";
import {
  hopGeometry,
  incidenceAngleRad,
  ABSORPTION_INCIDENCE_HEIGHT_KM,
  D_REGION_HEIGHT_KM,
} from "@/lib/propagation/geometry/hop";
import {
  magneticField,
  D_REGION_FIELD_HEIGHT_KM,
} from "@/lib/propagation/ionosphere/modip";
import {
  routeSampleAtFraction,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";

/** The reflection height section 5.2.2 fixes the penetration points at, km. */
export const PENETRATION_REFLECTION_HEIGHT_KM = 300;

/** The penetration height section 5.2.2 fixes, km. Re-exported for the record. */
export const PENETRATION_HEIGHT_KM = D_REGION_HEIGHT_KM;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Which end of its hop a penetration point belongs to. */
export type PenetrationEnd = "entry" | "exit";

export interface PenetrationPoint {
  /** 0-based index over the whole mode, in increasing distance order. */
  readonly index: number;
  /** 0-based hop this point belongs to. */
  readonly hopIndex: number;
  readonly end: PenetrationEnd;
  /** Fraction along the resolved route, 0 to 1. */
  readonly fraction: number;
  /** Ground distance from the transmitter along the route, km. */
  readonly offsetKm: number;
  readonly point: GeodeticPoint;
}

export type PenetrationPointsResult =
  | {
      readonly kind: "points";
      readonly points: readonly PenetrationPoint[];
      /** The assumed reflection height the points were found at, km. */
      readonly reflectionHeightKm: number;
      /** Elevation of the assumed ray, radians. NOT the mode's elevation. */
      readonly assumedElevationRad: number;
      /** Ground distance covered below the penetration height per leg, km. */
      readonly dRegionOffsetKm: number;
    }
  | {
      readonly kind: "unsupported";
      readonly reason: "penetration_geometry_below_horizon";
      readonly detail: string;
    };

export interface PenetrationPointsInputs {
  readonly route: ResolvedRoute;
  readonly hopCount: number;
  /** Defaults to the 300 km the recommendation fixes. See deviation 2. */
  readonly reflectionHeightKm?: number;
}

/**
 * The m = 2n penetration points of an n-hop mode, in increasing route order.
 *
 * Section 5.2.2 fixes the geometry that finds them: a reflection height of
 * 300 km and a penetration height of 90 km. `hopGeometry` already solves that
 * pair (its `penetrationFractions` is exactly this list of fractions), so the
 * only work here is running it at the fixed height and turning fractions into
 * points on the resolved route.
 */
export function penetrationPoints(
  inputs: PenetrationPointsInputs,
): PenetrationPointsResult {
  const {
    route,
    hopCount,
    reflectionHeightKm = PENETRATION_REFLECTION_HEIGHT_KM,
  } = inputs;
  const geometry = hopGeometry({
    groundDistanceKm: route.groundDistanceKm,
    hopCount,
    mirrorHeightKm: reflectionHeightKm,
  });
  if (geometry.kind === "unsupported") {
    return {
      kind: "unsupported",
      reason: "penetration_geometry_below_horizon",
      detail:
        `Section 5.2.2 finds the penetration points with a fixed reflection ` +
        `height of ${reflectionHeightKm.toFixed(1)} km, which reaches ` +
        `${geometry.maximumHopGroundDistanceKm.toFixed(1)} km in one hop. ` +
        `This ${hopCount}-hop mode over ` +
        `${route.groundDistanceKm.toFixed(1)} km has hops of ` +
        `${(route.groundDistanceKm / hopCount).toFixed(1)} km, so the assumed ` +
        `ray never reaches the reflection height and the ` +
        `${PENETRATION_HEIGHT_KM} km crossings are undefined.`,
    };
  }
  const points = geometry.penetrationFractions.map((fraction, index) => ({
    index,
    hopIndex: Math.floor(index / 2),
    end: (index % 2 === 0 ? "entry" : "exit") as PenetrationEnd,
    fraction,
    offsetKm: fraction * route.groundDistanceKm,
    point: routeSampleAtFraction(route, fraction),
  }));
  return {
    kind: "points",
    points,
    reflectionHeightKm,
    assumedElevationRad: geometry.elevationAngleRad,
    dRegionOffsetKm: geometry.dRegionOffsetKm,
  };
}

/**
 * Modified magnetic dip at a point, degrees, evaluated at `heightKm`.
 *
 * `moddip = atan(I / sqrt(cos(lat)))` with the dip I in RADIANS. See deviation
 * 5 for the height, for why `modip.ts`'s 300 km map coordinate is not reused,
 * and for the radian convention.
 */
export function modifiedDipDegAt(
  latitudeDeg: number,
  longitudeDeg: number,
  heightKm: number = D_REGION_FIELD_HEIGHT_KM,
): number {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
    throw new RangeError(
      `latitudeDeg and longitudeDeg must be finite, received ` +
        `${String(latitudeDeg)}, ${String(longitudeDeg)}.`,
    );
  }
  if (!Number.isFinite(heightKm) || heightKm <= 0) {
    throw new RangeError(
      `heightKm must be positive and finite, received ${String(heightKm)}.`,
    );
  }
  const latRad = latitudeDeg * DEG_TO_RAD;
  const { dipRad } = magneticField(latRad, longitudeDeg * DEG_TO_RAD, heightKm);
  return Math.atan(dipRad / Math.sqrt(Math.cos(latRad))) * RAD_TO_DEG;
}

/** Everything equation (20) needs to know at one penetration point. */
export interface PenetrationPointState {
  /** foE at the point, MHz, which scales the penetration factor phi. */
  readonly foEMHz: number;
  /** Solar zenith angle at the point at the hour in question, degrees. */
  readonly zenithAngleDeg: number;
  /** Solar zenith angle at the point at ITS OWN local noon, degrees. */
  readonly zenithNoonAngleDeg: number;
  /**
   * fL at the point, MHz: equation (23) at 100 km. Optional only so a caller
   * whose provider cannot answer it inherits `dRegion.ts`'s declared scalar
   * and its announced assumption rather than a silent substitution.
   */
  readonly longitudinalGyrofrequencyMHz?: number;
  /**
   * Modified magnetic dip at the point, degrees. Optional: when the caller
   * does not supply one, `modifiedDipDegAt` evaluates it at 100 km from the
   * field model, which is what the text asks for.
   */
  readonly modifiedDipDeg?: number;
}

export type PenetrationPointSampler = (
  point: PenetrationPoint,
) => PenetrationPointState;

export interface AbsorptionLossInputs {
  readonly route: ResolvedRoute;
  readonly hopCount: number;
  /** f, the operating frequency, MHz. Equation (20) keeps it above the MUF. */
  readonly frequencyMHz: number;
  /** 0-based month index, January is 0. */
  readonly monthIndex: number;
  /** R12, the smoothed sunspot number of equation (20). */
  readonly ssn: number;
  /**
   * Elevation of the MODE's ray, radians, which fixes i at 110 km. See
   * deviation 4 for which frequency the caller should have solved it at.
   */
  readonly rayPathElevationRad: number;
  readonly sample: PenetrationPointSampler;
  /** See deviation 2. Defaults to the 300 km the text fixes. */
  readonly penetrationReflectionHeightKm?: number;
}

export interface AbsorptionLoss {
  readonly kind: "absorption";
  /** Li, dB, equation (20). */
  readonly lossDb: number;
  /** i, the angle of incidence at 110 km, radians. */
  readonly incidenceAngle110Rad: number;
  /** fv = f cos i, MHz, equation (22). */
  readonly verticalFrequencyMHz: number;
  readonly penetrationPoints: readonly PenetrationPoint[];
  /** The crossings handed to `dRegion.ts`, in the same order. */
  readonly crossings: readonly DRegionCrossing[];
  /** Whatever `dRegion.ts` declared about the inputs it was given. */
  readonly assumptions: readonly string[];
}

export type AbsorptionLossResult =
  AbsorptionLoss | Extract<PenetrationPointsResult, { kind: "unsupported" }>;

/**
 * Li for one mode, dB.
 *
 * The angle of incidence at 110 km comes from the mode's own elevation, and
 * the penetration points from the section 5.2.2 fixed geometry. Those are two
 * different rays on purpose: the first is the mode, the second is the
 * recommendation's sampling rule, and conflating them is deviation 2.
 */
export function absorptionLoss(
  inputs: AbsorptionLossInputs,
): AbsorptionLossResult {
  const {
    route,
    hopCount,
    frequencyMHz,
    monthIndex,
    ssn,
    rayPathElevationRad,
    sample,
    penetrationReflectionHeightKm,
  } = inputs;
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError(
      `monthIndex must be an integer 0..11, received ${String(monthIndex)}.`,
    );
  }
  if (!Number.isFinite(rayPathElevationRad) || rayPathElevationRad <= 0) {
    throw new RangeError(
      `rayPathElevationRad must be a positive finite angle, received ` +
        `${String(rayPathElevationRad)}.`,
    );
  }
  // Equation (20) scales the absorption by (1 + 0.0067 R12); R12 is a
  // smoothed sunspot number and is never negative. This leaf is exported
  // directly by `physics/index.ts`, so a caller reaching it without going
  // through `fieldStrengthShort.ts`'s own check must be caught here too.
  if (!Number.isFinite(ssn) || ssn < 0) {
    throw new RangeError(
      `ssn must be finite and non-negative, received ${String(ssn)}.`,
    );
  }

  const located = penetrationPoints({
    route,
    hopCount,
    reflectionHeightKm: penetrationReflectionHeightKm,
  });
  if (located.kind === "unsupported") return located;

  const incidenceAngle110Rad = incidenceAngleRad(
    rayPathElevationRad,
    ABSORPTION_INCIDENCE_HEIGHT_KM,
  );

  const crossings: DRegionCrossing[] = located.points.map((point) => {
    const state = sample(point);
    return {
      latitudeDeg: point.point.latitudeDeg,
      monthIndex,
      modifiedDipDeg:
        state.modifiedDipDeg ??
        modifiedDipDegAt(point.point.latitudeDeg, point.point.longitudeDeg),
      foEMHz: state.foEMHz,
      zenithAngleDeg: state.zenithAngleDeg,
      zenithNoonAngleDeg: state.zenithNoonAngleDeg,
      ...(state.longitudinalGyrofrequencyMHz === undefined
        ? {}
        : { gyrofrequencyMHz: state.longitudinalGyrofrequencyMHz }),
    };
  });

  const absorption = dRegionAbsorption({
    crossings,
    hopCount,
    frequencyMHz,
    incidenceAngle110Rad,
    ssn,
  });

  return {
    kind: "absorption",
    lossDb: absorption.absorptionDb,
    incidenceAngle110Rad,
    verticalFrequencyMHz: absorption.verticalFrequencyMHz,
    penetrationPoints: located.points,
    crossings,
    assumptions: absorption.assumptions,
  };
}
