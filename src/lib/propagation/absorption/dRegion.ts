/**
 * D-region absorption for HF circuits (PROP-03, #949), implementing the
 * mathematical contract's M15 pass accounting over ITU-R P.533-14 section
 * 5.2.2 equations (20) and (21).
 *
 * Conventions and units, stated once:
 *
 *  - Absorption is returned in **decibels of loss**, a positive number. It is
 *    the loss of a whole `n`-hop mode, not of one crossing and not of one hop.
 *  - Frequencies are MHz, angles crossing the boundary are degrees unless the
 *    name ends in `Rad`, latitudes are degrees, months are 0-based.
 *  - Nothing here is rounded or clamped to a presentational range. The only
 *    limits applied are the two the recommendation itself defines: the solar
 *    zenith angle is clipped at 102 degrees and `F(chi)` has a floor of 0.02.
 *  - Two different absorption conventions exist in this codebase and they are
 *    kept apart on purpose. P.533-14 equation (20) is the climatological
 *    skywave term below. NOAA's D-RAP is a *different* quantity with a
 *    different normalisation (one decibel of vertical round trip) and lives in
 *    `dRapAbsorptionDb`. They must never be added together or substituted for
 *    one another; a number from one is meaningless in the other's units.
 *
 * Equation (20), for an `n`-hop mode:
 *
 *      Li = n (1 + 0.0067 SSN) <AT / (f + fL)^2> / cos(i_110)
 *
 * where `<.>` is the mean over the mode's D-region crossings and both `AT` and
 * `fL` are evaluated at each crossing.
 *
 * `AT` is the absorption term of equation (21),
 *
 *      AT = ATnoon(|lat|, month) phi(fv / foE) F(chi) / F(chi_noon)
 *      F(chi) = max(cos(0.881 chi)^p, 0.02),  chi clipped at 102 degrees
 *
 * with `fv = f cos(i_110)` the equivalent vertical-incidence frequency and `p`
 * the diurnal absorption exponent.
 *
 * **Pass accounting.** `AT` is evaluated once per D-region crossing and
 * averaged. An `n`-hop ray crosses the absorbing layer `2n` times, so the
 * caller supplies `2n` crossings taken at the penetration points that
 * `hopGeometry` computes, not one sample at the path midpoint. The `n` factor
 * in equation (20) is the pass multiplier and stays; the average is what makes
 * a circuit whose two ends straddle the terminator come out between the two,
 * which a single midpoint sample cannot express.
 *
 * **Where the coefficients come from.** `fixtures/absorption-model.json` holds
 * Propulse's own fitted forms for `ATnoon`, `phi` and `p`, produced by
 * `ml/propagation_validation/absorption_coefficients.py` from measurements of
 * the pinned ITU reference build. No ITU table or file is reproduced. The same
 * file carries the anchor set those fits are accepted against and the measured
 * fit residuals, which at the time of writing are:
 *
 *      ATnoon                     1.429 % maximum relative error
 *      penetration factor phi     0.025 % maximum relative error
 *      diurnal exponent p         0.024 absolute
 *      equation (20) loss         0.073 dB worst anchor
 *
 * against a declared tolerance of 0.25 dB. The last is an absolute difference
 * of losses on one declared circuit, the R2 audit case of one 3000 km hop at
 * 14 MHz with the mirror at 300 km and SSN 100, because equation (20) already
 * yields decibels: a log ratio of the absorption terms is a different quantity
 * and understates that circuit's 0.0536 dB error as 0.016. `dRegion.test.ts`
 * re-derives all four from the fixture, so these numbers cannot drift out of
 * the doc block.
 *
 * **Declared approximations.** Each is surfaced on the result's `assumptions`
 * rather than hidden:
 *
 *  1. `fL`, the longitudinal gyrofrequency, is the scalar 1.2 MHz only when
 *     neither the crossing nor the mode supplies one. P.533-14 wants
 *     `|fH sin(dip)|` evaluated at 100 km, which is a property of *where each
 *     crossing is*, so `DRegionCrossing.gyrofrequencyMHz` carries it and the
 *     `(f + fL)^2` divide happens inside the per-crossing mean rather than
 *     outside it. With a uniform `fL` that expression is algebraically the
 *     single-scalar form, which `dRegion.test.ts` pins as an identity. The gap
 *     the stand-in leaves is bounded by the spread of `|fH sin(dip)|` over the
 *     globe: at 14 MHz the correction runs from +0.714 dB at the magnetic dip
 *     equator to -0.332 dB at high southern dip, a spread of 1.046 dB.
 *  2. The modified magnetic dip that selects `p`, the `foE` that scales `phi`
 *     and the zenith angles all arrive on the caller's crossings. This module
 *     did not choose their source and asserts nothing about it: the
 *     assumption it emits names the dip values it was handed, and the layer
 *     that picked them (the ray-trace engine, or the climatology provider
 *     behind it) is the one that states where they came from.
 */

import model from "./fixtures/absorption-model.json";

/** Solar zenith angle above which P.533-14 stops varying `F(chi)`, degrees. */
export const ZENITH_CLIP_DEG = 102;

/** Floor of `F(chi)` in equation (21). */
export const F_CHI_FLOOR = 0.02;

/** Declared longitudinal gyrofrequency, MHz. See assumption 1 above. */
export const DEFAULT_GYROFREQUENCY_MHZ = 1.2;

/** Largest absolute latitude the `ATnoon` fit is defined over, degrees. */
export const MAX_ABS_LATITUDE_DEG = 70;

const AT_NOON_CLIP_DEG = 69.99;

/**
 * The stand-in statement, which names how many crossings actually fell back to
 * the declared scalar. A partly supplied mode is the case a single boolean
 * would misreport, so the count is in the sentence.
 */
function flAssumption(standInCrossings: number, passCount: number): string {
  const where =
    standInCrossings === passCount
      ? "every crossing"
      : `${standInCrossings} of ${passCount} crossings`;
  return (
    `Longitudinal gyrofrequency fL is this module's declared ` +
    `${DEFAULT_GYROFREQUENCY_MHZ} MHz scalar at ${where}, used because no ` +
    "value was supplied for them: ITU-R P.533-14 wants |fH sin(dip)| " +
    "evaluated at 100 km."
  );
}

/** Named once so the assumption and the doc block cannot drift apart. */
const FL_SUPPLIED_ASSUMPTION =
  "Longitudinal gyrofrequency fL was supplied by the caller and is applied " +
  "per crossing inside the mean, not as one scalar for the whole mode.";

/**
 * The dip statement is a fact about the inputs this call was given, not about
 * where they came from. Only the layer that chose the dip's source may say
 * what that source is, so this names the values and stops there.
 */
function dipAssumption(crossings: readonly DRegionCrossing[]): string {
  const dips = crossings.map((crossing) => crossing.modifiedDipDeg);
  const lo = Math.min(...dips);
  const hi = Math.max(...dips);
  const named =
    lo === hi
      ? `${lo.toFixed(2)} degrees`
      : `${lo.toFixed(2)} to ${hi.toFixed(2)} degrees`;
  return (
    "The diurnal absorption exponent was selected with the caller-supplied " +
    `modified magnetic dip (${named}). ITU-R P.533-14 specifies the dip at ` +
    "100 km; this module does not evaluate it and makes no claim about the " +
    "height the caller used."
  );
}

/**
 * Evaluate a Chebyshev series of the first kind at `x` in [-1, 1].
 *
 * Clenshaw recurrence, the same algorithm the generator's `chebval` uses, so
 * the TypeScript and Python evaluations agree to the last bit and the measured
 * residual is the residual that ships.
 */
function chebyshevValue(x: number, coefficients: readonly number[]): number {
  const n = coefficients.length;
  if (n === 0) {
    return 0;
  }
  if (n === 1) {
    return coefficients[0];
  }
  if (n === 2) {
    return coefficients[0] + coefficients[1] * x;
  }
  const twoX = 2 * x;
  let c0 = coefficients[n - 2];
  let c1 = coefficients[n - 1];
  for (let i = 3; i <= n; i += 1) {
    const previous = c0;
    c0 = coefficients[n - i] - c1;
    c1 = previous + c1 * twoX;
  }
  return c0 + c1 * x;
}

/**
 * Absorption factor at local noon and R12 = 0, P.533-14 Figure 1.
 *
 * A function of geographic latitude magnitude and season. The nine seasonal
 * curves and the month-to-curve mapping were both measured, not assumed.
 */
export function absorptionFactorAtNoon(
  latitudeDeg: number,
  monthIndex: number,
): number {
  const { monthToSeries, chebyshev } = model.coefficients.atNoon;
  const series = chebyshev[monthToSeries[monthIndex]];
  const x = Math.min(Math.abs(latitudeDeg), AT_NOON_CLIP_DEG);
  return chebyshevValue(x / (MAX_ABS_LATITUDE_DEG / 2) - 1, series);
}

/**
 * Absorption layer penetration factor, P.533-14 Figure 2.
 *
 * `t = fv / foE`. Below 1 the E layer shields the D region and the factor
 * falls away; the plateau just above 1 is the curve's clamp; above the knot it
 * decays linearly to a floor.
 */
export function penetrationFactor(t: number): number {
  const p = model.coefficients.penetration;
  const clamped = Math.max(t, 0);
  if (clamped > p.knot) {
    const tail = p.tailSlope * clamped + p.tailIntercept;
    return Math.min(Math.max(tail, p.floor), p.ceiling);
  }
  if (clamped >= p.plateauLo && clamped <= p.plateauHi) {
    return p.ceiling;
  }
  const segment = clamped < p.plateauLo ? p.segments[0] : p.segments[1];
  const x = (clamped - segment.lo) / ((segment.hi - segment.lo) / 2) - 1;
  const value = chebyshevValue(x, segment.chebyshev);
  return Math.min(Math.max(value, 0), p.ceiling);
}

/**
 * Diurnal absorption exponent `p`, P.533-14 Figure 3.
 *
 * A function of modified magnetic dip magnitude and month. The month index
 * passed here is already hemisphere-corrected by the caller.
 */
export function diurnalAbsorptionExponent(
  modifiedDipDeg: number,
  monthIndex: number,
): number {
  const d = model.coefficients.diurnal;
  const x = Math.min(Math.max(Math.abs(modifiedDipDeg), 0), d.maxModdipDeg);
  const knot = d.knotsDeg[monthIndex];
  const below = x <= knot;
  const u = below
    ? -1 + (2 * x) / knot
    : -1 + (2 * (x - knot)) / (d.maxModdipDeg - knot);
  const branch = d.branches[below ? 0 : 1];
  const width = d.degree + 1;

  let value = 0;
  const harmonics: number[] = [1];
  for (let k = 1; k <= d.harmonics; k += 1) {
    const angle = (2 * Math.PI * k * monthIndex) / 12;
    harmonics.push(Math.cos(angle), Math.sin(angle));
  }
  for (let i = 0; i < harmonics.length; i += 1) {
    value +=
      harmonics[i] *
      chebyshevValue(u, branch.slice(i * width, i * width + width));
  }
  return value;
}

/** `F(chi)` of equation (21), with the 102 degree clip and the 0.02 floor. */
export function solarZenithFactor(zenithAngleDeg: number, p: number): number {
  const chi = (Math.min(zenithAngleDeg, ZENITH_CLIP_DEG) * Math.PI) / 180;
  return Math.max(Math.cos(0.881 * chi) ** p, F_CHI_FLOOR);
}

/** One D-region crossing: where the ray enters or leaves the absorbing layer. */
export interface DRegionCrossing {
  readonly latitudeDeg: number;
  /** 0 = January. */
  readonly monthIndex: number;
  /**
   * Modified magnetic dip magnitude, degrees. Chosen by the caller; see
   * assumption 2. P.533-14 evaluates it at 100 km.
   */
  readonly modifiedDipDeg: number;
  readonly foEMHz: number;
  /** Solar zenith angle at this crossing, degrees. */
  readonly zenithAngleDeg: number;
  /** Solar zenith angle at this crossing's local noon, degrees. */
  readonly zenithNoonAngleDeg: number;
  /**
   * Longitudinal gyrofrequency `|fH sin(dip)|` at this crossing, MHz.
   *
   * Optional. A crossing without one falls back to the mode-wide
   * `DRegionAbsorptionInputs.gyrofrequencyMHz`, and that to this module's
   * declared 1.2 MHz scalar, which is announced in `assumptions`.
   */
  readonly gyrofrequencyMHz?: number;
}

/**
 * Absorption term of equation (21) at one crossing.
 *
 * The hemisphere correction is applied here: south of the equator the seasonal
 * curve that selects `p` is the one six months away.
 */
export function absorptionTerm(
  crossing: DRegionCrossing,
  verticalFrequencyMHz: number,
): number {
  const atNoon = absorptionFactorAtNoon(
    crossing.latitudeDeg,
    crossing.monthIndex,
  );
  const phi = penetrationFactor(verticalFrequencyMHz / crossing.foEMHz);
  const monthIndex =
    crossing.latitudeDeg < 0
      ? (crossing.monthIndex + 6) % 12
      : crossing.monthIndex;
  const p = diurnalAbsorptionExponent(crossing.modifiedDipDeg, monthIndex);
  return (
    (atNoon * phi * solarZenithFactor(crossing.zenithAngleDeg, p)) /
    solarZenithFactor(crossing.zenithNoonAngleDeg, p)
  );
}

export interface DRegionAbsorptionInputs {
  /**
   * The D-region crossings of the whole mode, one per pass.
   *
   * Must be `2 * hopCount` long: an `n`-hop ray enters and leaves the layer
   * once per hop. Supplying fewer is a pass-accounting error, which is the
   * defect this module exists to fix, so it is rejected rather than tolerated.
   */
  readonly crossings: readonly DRegionCrossing[];
  readonly hopCount: number;
  readonly frequencyMHz: number;
  /** Angle of incidence at 110 km, radians, from `hopGeometry`. */
  readonly incidenceAngle110Rad: number;
  /** Smoothed sunspot number. */
  readonly ssn: number;
  /**
   * Longitudinal gyrofrequency for the whole mode, MHz.
   *
   * The default for any crossing that carries none of its own. Absent both
   * here and on every crossing, the declared 1.2 scalar is used and said so.
   */
  readonly gyrofrequencyMHz?: number;
}

export interface DRegionAbsorption {
  /** Loss of the whole `n`-hop mode, dB. Positive. */
  readonly absorptionDb: number;
  /**
   * Mean absorption term over the crossings, dimensionless.
   *
   * Reported for inspection only. Since #1108 the `(f + fL)^2` divide happens
   * inside the mean, so `absorptionDb` is not this number divided by one
   * scalar unless every crossing carried the same `fL`.
   */
  readonly absorptionTerm: number;
  /** Absorption term at each crossing, in the order supplied. */
  readonly perCrossingTerms: readonly number[];
  /**
   * The longitudinal gyrofrequency actually applied at each crossing, MHz, in
   * the order supplied. A reader can see which crossings got the stand-in.
   */
  readonly gyrofrequenciesMHz: readonly number[];
  /** Number of D-region passes, `2 * hopCount`. */
  readonly passCount: number;
  /** Equivalent vertical-incidence frequency, MHz. */
  readonly verticalFrequencyMHz: number;
  readonly assumptions: readonly string[];
}

/**
 * Absorption loss of an `n`-hop mode, ITU-R P.533-14 equation (20).
 *
 * The result is a loss in dB and is not clamped: a genuinely opaque circuit
 * returns a large number, and it is the signal budget's job to decide that the
 * circuit is closed, not this function's job to cap it at an arbitrary 50 dB.
 */
export function dRegionAbsorption(
  inputs: DRegionAbsorptionInputs,
): DRegionAbsorption {
  const {
    crossings,
    hopCount,
    frequencyMHz,
    incidenceAngle110Rad,
    ssn,
    gyrofrequencyMHz: modeGyrofrequencyMHz = DEFAULT_GYROFREQUENCY_MHZ,
  } = inputs;
  // Whether the stand-in was used is a fact about what the caller passed, not
  // about the number's value: a caller that legitimately computes 1.2 MHz was
  // previously told it had supplied nothing.
  const modeFlSupplied = inputs.gyrofrequencyMHz !== undefined;
  const standInCrossings = modeFlSupplied
    ? 0
    : crossings.filter((crossing) => crossing.gyrofrequencyMHz === undefined)
        .length;

  if (!Number.isInteger(hopCount) || hopCount < 1) {
    throw new RangeError(
      `hopCount must be a positive integer, received ${String(hopCount)}.`,
    );
  }
  const passCount = 2 * hopCount;
  if (crossings.length !== passCount) {
    throw new RangeError(
      `a ${hopCount}-hop mode crosses the D region ${String(passCount)} times, ` +
        `but ${String(crossings.length)} crossings were supplied.`,
    );
  }
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }

  const cosIncidence = Math.cos(incidenceAngle110Rad);
  const verticalFrequencyMHz = frequencyMHz * cosIncidence;
  const perCrossingTerms = crossings.map((crossing) =>
    absorptionTerm(crossing, verticalFrequencyMHz),
  );
  const gyrofrequenciesMHz = crossings.map(
    (crossing) => crossing.gyrofrequencyMHz ?? modeGyrofrequencyMHz,
  );
  const meanTerm =
    perCrossingTerms.reduce((total, term) => total + term, 0) / passCount;
  // The divide is inside the mean because fL is a property of where the
  // crossing is: a circuit whose crossings straddle the magnetic dip equator
  // has no single honest fL. With a uniform fL this is exactly the old
  // `meanTerm / (f + fL)^2`, which `dRegion.test.ts` pins as an identity.
  const meanTermOverDivisor =
    perCrossingTerms.reduce(
      (total, term, index) =>
        total + term / (frequencyMHz + gyrofrequenciesMHz[index]) ** 2,
      0,
    ) / passCount;

  const absorptionDb =
    (hopCount * (1 + 0.0067 * ssn) * meanTermOverDivisor) / cosIncidence;

  const dipStatement = dipAssumption(crossings);
  const assumptions =
    standInCrossings === 0
      ? [FL_SUPPLIED_ASSUMPTION, dipStatement]
      : [flAssumption(standInCrossings, crossings.length), dipStatement];

  return {
    absorptionDb,
    absorptionTerm: meanTerm,
    perCrossingTerms,
    gyrofrequenciesMHz,
    passCount,
    verticalFrequencyMHz,
    assumptions,
  };
}

/** Earth radius used by the D-RAP obliquity factor, km. */
const DRAP_EARTH_RADIUS_KM = 6371;

export interface DRapInputs {
  /**
   * Absorption of one *vertical round trip* through the layer, dB.
   *
   * This is NOAA's normalisation: `A(f0)` at the product's reference frequency
   * describes a signal that goes up and comes back down. Half of it is one
   * crossing.
   */
  readonly verticalRoundTripDb: number;
  /** Elevation angle of the ray, radians. */
  readonly elevationAngleRad: number;
  /** Number of D-region crossings, `2 * hopCount`. */
  readonly crossings: number;
  /** Absorbing layer height, km. */
  readonly heightKm?: number;
}

/**
 * Convert a NOAA D-RAP vertical round-trip absorption to a slant path loss.
 *
 *      sec z_D = [1 - (R cos(e) / (R + hD))^2]^(-1/2)
 *      loss    = crossings * (A_vertical_round_trip / 2) * sec z_D
 *
 * Kept as a pure conversion, separate from `dRegionAbsorption`, so the two
 * conventions can never be silently merged. A single hop, which is two
 * crossings, costs exactly one `A_vertical_round_trip * sec z_D`.
 */
export function dRapAbsorptionDb(inputs: DRapInputs): number {
  const {
    verticalRoundTripDb,
    elevationAngleRad,
    crossings,
    heightKm = 90,
  } = inputs;
  const ratio =
    (DRAP_EARTH_RADIUS_KM * Math.cos(elevationAngleRad)) /
    (DRAP_EARTH_RADIUS_KM + heightKm);
  const secant = 1 / Math.sqrt(1 - ratio * ratio);
  return crossings * (verticalRoundTripDb / 2) * secant;
}

/** Frequency scaling of a D-RAP absorption, `A(f) = A(f0) (f0/f)^1.5`. */
export function dRapScaleToFrequency(
  absorptionDb: number,
  referenceFrequencyMHz: number,
  frequencyMHz: number,
): number {
  return absorptionDb * (referenceFrequencyMHz / frequencyMHz) ** 1.5;
}

/** The measured fit residuals this module ships with. */
export const FIT_RESIDUALS = model.residuals;

/** The anchor set the fits are accepted against. */
export const REFERENCE_ANCHORS = model.anchors;
