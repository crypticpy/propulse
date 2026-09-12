/**
 * ITU-R P.533-14 section 5.4, the 7 000 to 9 000 km interpolation (PROP-08,
 * #954 slice D).
 *
 * Section 5.4, in full: "Paths between 7 000 and 9 000 km. In this distance
 * range the median sky-wave field strength Eti is determined by interpolation
 * between values Es and El. Es is the root-sum-squared field strength given by
 * equation (28) and El refers to a composite mode as given by equation (39).
 *
 *     Ei = 100 log10 Xi                             dB(1 uV/m)          (42)
 *
 * with
 *
 *     Xi = Xs + (D - 7 000)/2 000 (Xl - Xs)
 *
 * where Xs = 10^(0.01 Es) and Xl = 10^(0.01 El)."
 *
 * WHAT THIS IS, IN ONE SENTENCE. Equations (28) and (39) are both decibel
 * quantities; equation (42) converts each to a linear quantity on a
 * 100-decibels-per-decade scale, interpolates linearly in distance between
 * them, and converts back. It is not an average of two decibel values and it is
 * not a power sum, and reading it as either gives a different number.
 *
 * THE BOUNDARIES. The recommendation states the range three times and never
 * settles whether the endpoints are inclusive. Section 5.3: "For path distances
 * longer than 9 000 km ... only the method given in section 5.3. For path
 * distances between 7 000 and 9 000 km both methods ... are used." Section 5.4:
 * "Paths between 7 000 and 9 000 km." Section 6: "For distance ranges up to
 * 7 000 km ... For distance ranges beyond 9 000 km ... In the intermediate
 * range 7 000 to 9 000 km." IT DOES NOT MATTER, and this module says why rather
 * than picking a side quietly: equation (42) is continuous at both ends. At
 * D = 7 000 the interpolation weight is 0 and Xi = Xs exactly, so Ei = Es; at
 * D = 9 000 the weight is 1 and Xi = Xl exactly, so Ei = El. The range below is
 * therefore written with both endpoints inside the blend, which yields the same
 * number as either exclusive reading and has no discontinuity anywhere.
 *
 *  - D < 7 000 km: `short_path_only`, and the caller uses Es.
 *  - 7 000 <= D <= 9 000 km: `interpolated`, Ei from equation (42).
 *  - D > 9 000 km: `long_path_only`, and the caller uses El.
 *
 * WHICH FIELD EXISTS IS THE CALLER'S BUSINESS, NOT OURS. Sections 5.2 and 5.3
 * produce Es and El on overlapping but different domains: section 5.2.1 selects
 * modes out to 9 000 km, section 5.3 starts at 7 000 km, and either can decline
 * a circuit for its own reasons. This module takes what the caller has, states
 * what it needed, and returns a labelled `unsupported` record naming the missing
 * side rather than substituting a number for it. NOTHING HERE INVENTS A FIELD
 * STRENGTH AND NOTHING HERE RETURNS NaN.
 *
 * THE SAME EQUATION APPLIES TO POWER. Section 6: "In the intermediate range
 * 7 000 to 9 000 km, the power is determined from equation (42) using the powers
 * corresponding to Es and El." The interpolation is the same function of the
 * same two arguments, so the assembler is exported as `interpolateDb`, a name
 * that does not say "field strength", and the solver applies it to either
 * quantity. The units are the caller's to keep straight: both arguments
 * must be the same kind of decibel.
 *
 * WHERE THE REFERENCE AND THE TEXT DISAGREE, AND WHAT WE DO. The pinned ITU
 * build is cd172be5, `Between7000kmand9000km.c`. NOTHING, on equation (42)
 * itself: the reference computes `Xs`, `Xl`, `Xi` and `Ei` exactly as printed.
 * It runs its routine on a strict `7000 < D < 9000` and therefore reports Es at
 * exactly 7 000 km and El at exactly 9 000 km, which is the same number this
 * module's inclusive range produces at those two points. The one thing it does
 * that this module does not is recompute the path basic MUF from equations (3)
 * to (6) at the Table 1a control points; that is the short-path basic MUF of
 * slice A, it is not part of equation (42), and section 5.4's own sentence
 * about it ("The basic MUF for the path is equal to the lower of the basic MUF
 * values given from equation (3) for the two control points noted in Table
 * 1a)") belongs to whoever assembles the circuit, not to the interpolation.
 */

/** Section 5.4's lower bound, km. */
export const BLEND_MIN_DISTANCE_KM = 7000; // section 5.4, equation (42)

/** Section 5.4's upper bound, km. */
export const BLEND_MAX_DISTANCE_KM = 9000; // section 5.4, equation (42)

/** The span equation (42) divides by, km. */
export const BLEND_SPAN_KM = BLEND_MAX_DISTANCE_KM - BLEND_MIN_DISTANCE_KM;

/** Equation (42)'s decibels per decade of the linear quantity X. */
export const BLEND_DB_PER_DECADE = 100; // equation (42)

export type DistanceBlendRegime =
  | "short_path_only"
  | "interpolated"
  | "long_path_only";

export interface ResolvedDistanceBlend {
  readonly kind: "resolved";
  readonly regime: DistanceBlendRegime;
  readonly groundDistanceKm: number;
  /** Es as supplied, dB. Null where the regime does not use it. */
  readonly shortPathDb: number | null;
  /** El as supplied, dB. Null where the regime does not use it. */
  readonly longPathDb: number | null;
  /** (D - 7 000)/2 000, dimensionless. Null outside the blend. */
  readonly weight: number | null;
  /** Xs = 10^(0.01 Es). Null outside the blend. */
  readonly xShort: number | null;
  /** Xl = 10^(0.01 El). Null outside the blend. */
  readonly xLong: number | null;
  /** Xi of equation (42). Null outside the blend. */
  readonly xInterpolated: number | null;
  /**
   * The circuit's field strength, dB. Ei inside the blend, and the one
   * applicable side outside it.
   */
  readonly fieldStrengthDb: number;
  /** Which of the two equations the answer came from. */
  readonly source: "equation_28" | "equation_39" | "equation_42";
}

export interface UnsupportedDistanceBlend {
  readonly kind: "unsupported";
  readonly reason:
    | "out_of_domain"
    | "short_path_missing"
    | "long_path_missing"
    | "both_missing";
  readonly detail: string;
  readonly regime: DistanceBlendRegime | null;
  readonly groundDistanceKm: number;
}

export type DistanceBlendResult =
  | ResolvedDistanceBlend
  | UnsupportedDistanceBlend;

export interface DistanceBlendInputs {
  readonly groundDistanceKm: number;
  /** Es of equation (28), dB. Absent when section 5.2 produced none. */
  readonly shortPathDb?: number | null;
  /** El of equation (39), dB. Absent when section 5.3 produced none. */
  readonly longPathDb?: number | null;
}

/** Which of section 5.4's three statements a distance falls under. */
export function distanceBlendRegime(
  groundDistanceKm: number,
): DistanceBlendRegime {
  if (groundDistanceKm < BLEND_MIN_DISTANCE_KM) return "short_path_only";
  if (groundDistanceKm > BLEND_MAX_DISTANCE_KM) return "long_path_only";
  return "interpolated";
}

/**
 * Equation (42) as a function of two decibel values and a distance.
 *
 * `shortDb` and `longDb` must be the same kind of decibel as each other; the
 * equation is unit-blind and section 6 applies it to powers as readily as
 * section 5.4 applies it to field strengths. The weight is not clamped, because
 * the only caller that reaches it has already classified the distance.
 */
export function interpolateDb(
  groundDistanceKm: number,
  shortDb: number,
  longDb: number,
): {
  readonly weight: number;
  readonly xShort: number;
  readonly xLong: number;
  readonly xInterpolated: number;
  readonly db: number;
} {
  const weight = (groundDistanceKm - BLEND_MIN_DISTANCE_KM) / BLEND_SPAN_KM;
  const xShort = 10 ** (shortDb / BLEND_DB_PER_DECADE); // Xs, equation (42)
  const xLong = 10 ** (longDb / BLEND_DB_PER_DECADE); // Xl, equation (42)
  const xInterpolated = xShort + weight * (xLong - xShort); // Xi, equation (42)
  return {
    weight,
    xShort,
    xLong,
    xInterpolated,
    db: BLEND_DB_PER_DECADE * Math.log10(xInterpolated), // equation (42)
  };
}

function unsupported(
  reason: UnsupportedDistanceBlend["reason"],
  detail: string,
  regime: DistanceBlendRegime | null,
  groundDistanceKm: number,
): UnsupportedDistanceBlend {
  return { kind: "unsupported", reason, detail, regime, groundDistanceKm };
}

function usable(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The circuit's median field strength across section 5.4's three ranges.
 *
 * Pure: it takes a distance and the two decibel values and knows nothing about
 * how either was produced.
 */
export function distanceBlend(
  inputs: DistanceBlendInputs,
): DistanceBlendResult {
  const { groundDistanceKm: D, shortPathDb, longPathDb } = inputs;

  if (!Number.isFinite(D) || D <= 0) {
    return unsupported(
      "out_of_domain",
      `the path has no usable ground distance (${String(D)} km).`,
      null,
      D,
    );
  }
  const regime = distanceBlendRegime(D);
  const haveShort = usable(shortPathDb);
  const haveLong = usable(longPathDb);

  if (regime === "short_path_only") {
    if (!haveShort) {
      return unsupported(
        "short_path_missing",
        `below ${String(BLEND_MIN_DISTANCE_KM)} km the field strength is Es ` +
          `from equation (28), and none was supplied.`,
        regime,
        D,
      );
    }
    return {
      kind: "resolved",
      regime,
      groundDistanceKm: D,
      shortPathDb,
      longPathDb: haveLong ? longPathDb : null,
      weight: null,
      xShort: null,
      xLong: null,
      xInterpolated: null,
      fieldStrengthDb: shortPathDb,
      source: "equation_28",
    };
  }

  if (regime === "long_path_only") {
    if (!haveLong) {
      return unsupported(
        "long_path_missing",
        `above ${String(BLEND_MAX_DISTANCE_KM)} km the field strength is El ` +
          `from equation (39), and none was supplied.`,
        regime,
        D,
      );
    }
    return {
      kind: "resolved",
      regime,
      groundDistanceKm: D,
      shortPathDb: haveShort ? shortPathDb : null,
      longPathDb,
      weight: null,
      xShort: null,
      xLong: null,
      xInterpolated: null,
      fieldStrengthDb: longPathDb,
      source: "equation_39",
    };
  }

  if (D === BLEND_MIN_DISTANCE_KM) {
    // Equation (42)'s weight is (D - 7 000)/2 000, which is exactly 0 here,
    // so Xi = Xs + 0 (Xl - Xs) = Xs and El never enters the result even
    // though this endpoint is inside the documented inclusive range.
    if (!haveShort) {
      return unsupported(
        "short_path_missing",
        `at ${String(BLEND_MIN_DISTANCE_KM)} km equation (42)'s weight is 0, ` +
          `so Xi = Xs exactly and only Es from equation (28) is needed; none ` +
          `was supplied.`,
        regime,
        D,
      );
    }
    const xShort = 10 ** (shortPathDb / BLEND_DB_PER_DECADE);
    const xLong = haveLong ? 10 ** (longPathDb / BLEND_DB_PER_DECADE) : null;
    return {
      kind: "resolved",
      regime,
      groundDistanceKm: D,
      shortPathDb,
      longPathDb: haveLong ? longPathDb : null,
      weight: 0,
      xShort,
      xLong,
      xInterpolated: xShort,
      fieldStrengthDb: shortPathDb,
      source: "equation_42",
    };
  }

  if (D === BLEND_MAX_DISTANCE_KM) {
    // Equation (42)'s weight is (D - 7 000)/2 000, which is exactly 1 here,
    // so Xi = Xs + 1 (Xl - Xs) = Xl and Es never enters the result even
    // though this endpoint is inside the documented inclusive range.
    if (!haveLong) {
      return unsupported(
        "long_path_missing",
        `at ${String(BLEND_MAX_DISTANCE_KM)} km equation (42)'s weight is 1, ` +
          `so Xi = Xl exactly and only El from equation (39) is needed; none ` +
          `was supplied.`,
        regime,
        D,
      );
    }
    const xLong = 10 ** (longPathDb / BLEND_DB_PER_DECADE);
    const xShort = haveShort ? 10 ** (shortPathDb / BLEND_DB_PER_DECADE) : null;
    return {
      kind: "resolved",
      regime,
      groundDistanceKm: D,
      shortPathDb: haveShort ? shortPathDb : null,
      longPathDb,
      weight: 1,
      xShort,
      xLong,
      xInterpolated: xLong,
      fieldStrengthDb: longPathDb,
      source: "equation_42",
    };
  }

  if (!haveShort && !haveLong) {
    return unsupported(
      "both_missing",
      `equation (42) interpolates between Es and El and neither was supplied.`,
      regime,
      D,
    );
  }
  if (!haveShort) {
    return unsupported(
      "short_path_missing",
      `equation (42) interpolates between Es and El; El was supplied and Es ` +
        `was not, and the recommendation gives no one-sided form. Between ` +
        `${String(BLEND_MIN_DISTANCE_KM)} and ${String(BLEND_MAX_DISTANCE_KM)} ` +
        `km "both methods in sections 5.2 and 5.3 are used".`,
      regime,
      D,
    );
  }
  if (!haveLong) {
    return unsupported(
      "long_path_missing",
      `equation (42) interpolates between Es and El; Es was supplied and El ` +
        `was not, and the recommendation gives no one-sided form. Between ` +
        `${String(BLEND_MIN_DISTANCE_KM)} and ${String(BLEND_MAX_DISTANCE_KM)} ` +
        `km "both methods in sections 5.2 and 5.3 are used".`,
      regime,
      D,
    );
  }

  const blended = interpolateDb(D, shortPathDb, longPathDb);
  if (
    ![blended.xShort, blended.xLong, blended.xInterpolated, blended.db].every(
      Number.isFinite,
    ) ||
    blended.xInterpolated <= 0
  ) {
    return unsupported(
      "out_of_domain",
      "equation (42) did not produce a finite representable blend.",
      regime,
      D,
    );
  }
  return {
    kind: "resolved",
    regime,
    groundDistanceKm: D,
    shortPathDb,
    longPathDb,
    weight: blended.weight,
    xShort: blended.xShort,
    xLong: blended.xLong,
    xInterpolated: blended.xInterpolated,
    fieldStrengthDb: blended.db,
    source: "equation_42",
  };
}
