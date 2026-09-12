/**
 * ITU-R P.533-14 section 5.3.3, the median sky-wave field strength Etl of a
 * path longer than 7 000 km (PROP-08, #954 slice D).
 *
 * Section 5.3.3, in full: "The resultant median field strength Etl is given by:
 *
 *     Etl = E0 [ 1 - (fM + fH)^2 / ( (fM + fH)^2 + (fL + fH)^2 )
 *                    [ (fL + fH)^2 / (f + fH)^2
 *                      + (f + fH)^2 / (fM + fH)^2 ] ]
 *           - 30.0 + Pt + Gtl + Gap - Ly            dB(1 uV/m)          (39)
 *
 * where E0 is the free-space field strength for 3 MW e.i.r.p. In this case:
 *
 *     E0 = 139.6 - 20 log p                         dB(1 uV/m)          (40)
 *
 * where p is calculated using equations (19) and (13) with hr = 300 km, Gtl is
 * the largest value of transmitting antenna gain at the required azimuth in the
 * elevation range 0 degrees to 8 degrees (dB), and Gap the increase in field
 * strength due to focusing at long distances given as:
 *
 *     Gap = 10 log [ D / ( R0 |sin(D/R0)| ) ]       dB                  (41)
 *
 * As Gap from the above formula tends to infinity when D is a multiple of R0,
 * it is limited to the value of 15 dB. Ly: a term similar in concept to Lz. The
 * present recommended value is -0.14 dB. NOTE 1 - It should be noted that the
 * value of Ly is dependent on the elements of the prediction method, so that
 * any changes in those elements should be accompanied by revision of the Ly
 * value. fH: mean of the values of electron gyrofrequency determined at both
 * control points; fM: MUF (see section 5.3.1); fL: LUF (see section 5.3.2)."
 *
 * UNITS AND REFERENCE PLANE, stated once, because contract M08 requires a
 * consumer to be able to name them without inference.
 *
 *  - `El` is dB above 1 microvolt per metre, a FIELD STRENGTH at the receiving
 *    site. It already contains the transmitter power `Pt` in dB(1 kW) and the
 *    transmitting antenna gain `Gtl`. It contains no receiving antenna.
 *  - Free-space spreading (through E0), the long-distance focusing gain Gap and
 *    the "not otherwise included" term Ly are all already inside it. A consumer
 *    adding any of them again is double-counting.
 *  - THERE IS NO MODE HERE AND NO LOSS BUDGET HERE. Section 5.3 exists because
 *    "for paths longer than 7 000 km, calculating all possible modes is
 *    impractical": El is an empirical composite whose only ionospheric inputs
 *    are the two reference frequencies fM and fL and the mean gyrofrequency.
 *    There is no Lb, no absorption term, no auroral term and no above-the-MUF
 *    term to itemise, which is why this module has no counterpart to
 *    `fieldStrengthShort.ts`'s per-mode record. `alreadyIncludedMechanisms`
 *    names what is inside so that a head cannot re-add it.
 *  - Section 6's available receiver power for this range, "equation (43), where
 *    Grw is the largest value of receiving antenna gain at the required azimuth
 *    in the elevation range 0 degrees to 8 degrees", is NOT computed here.
 *    Equation (43) is `fieldStrengthShort.ts`'s and takes a field strength; the
 *    solver applies it to `El` with that Grw. Saying so here rather than
 *    silently omitting it.
 *
 * ANTENNAS ARE THE CALLER'S. `Pt` defaults to 0 dB(1 kW), which is one
 * kilowatt, and `Gtl` to 0 dBi, an isotropic radiator; those are the golden
 * corpus's own assumptions and they are declared on the result. Gtl is a single
 * number and not a pattern callback on purpose: the recommendation asks for the
 * LARGEST gain over a 0 to 8 degree elevation band, which only the owner of the
 * pattern can evaluate. A caller with a real antenna passes the maximum it
 * found; a caller with none passes nothing and gets an isotropic radiator with
 * that fact recorded in `assumptions`.
 *
 * WHERE THE REFERENCE AND THE TEXT DISAGREE, AND WHAT WE DO. The pinned ITU
 * build is cd172be5, `MedianSkywaveFieldStrengthLong.c`. The deviations inside
 * the two reference frequencies are numbered in `longPath/fM.ts` and
 * `longPath/fL.ts` and are not repeated here.
 *
 *  1. Ly IS -0.14 dB. THE TEXT: "Ly: a term similar in concept to Lz. The
 *     present recommended value is -0.14 dB." WE USE -0.14. THE REFERENCE
 *     defines `NOIL -0.17`, which is the P.533-12 value the routine was written
 *     against and which its own file header still cites. Equation (39)
 *     SUBTRACTS Ly, so the reference's number raises El by 0.03 dB relative to
 *     the published one on every long circuit; that offset is systematic, it is
 *     the same on every case, and the parity fixture states it rather than
 *     hiding it inside a tolerance.
 *  2. THE DISTANCE AT WHICH THIS METHOD STARTS. THE TEXT, section 5.3: "For
 *     path distances longer than 9 000 km predictions of median sky-wave field
 *     strength are made using only the method given in section 5.3. For path
 *     distances between 7 000 and 9 000 km both methods in sections 5.2 and 5.3
 *     are used." So El is defined from 7 000 km up and is the whole answer only
 *     beyond 9 000 km. This module computes El for every path of at least
 *     7 000 km and labels which of the two it is with `range`; `distanceBlend.ts`
 *     owns equation (42) and the caller's choice. THE REFERENCE agrees: its own
 *     long-path routine runs for `distance >= 7000`.
 *
 * NO NaN AND NO SILENT CLAMP. The only clamp is the 15 dB limit on Gap, which
 * the text states in the same breath as equation (41) and which exists because
 * equation (41) is genuinely unbounded at D = pi R0. Everything else that could
 * fail returns a labelled `unsupported` record: a path shorter than 7 000 km, a
 * frequency that is not positive, a non-finite antenna or power input, or an
 * unsupported fM or fL.
 */

import {
  longPathMuf,
  type LongPathMufResult,
  type LongPathMufSampler,
  type ResolvedLongPathMuf,
} from "./longPath/fM";
import {
  longPathLuf,
  type LongPathLufResult,
  type ResolvedLongPathLuf,
} from "./longPath/fL";
import {
  EARTH_RADIUS_KM,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";

/** The constant of equation (40), dB. */
export const FREE_SPACE_FIELD_CONSTANT_DB = 139.6; // equation (40)

/** Equation (39)'s conversion from the 3 MW e.i.r.p. reference, dB. */
export const EIRP_REFERENCE_OFFSET_DB = 30.0; // equation (39)

/** The limit section 5.3.3 puts on equation (41), dB. */
export const MAX_FOCUS_GAIN_DB = 15; // section 5.3.3, after equation (41)

/** Ly, dB. See deviation 1. */
export const LY_DB = -0.14; // section 5.3.3, "The present recommended value"

/** Section 5.3's lower distance bound, km. */
export const LONG_PATH_MIN_DISTANCE_KM = 7000; // section 5.3

/** Section 5.3's bound above which this is the only method, km. */
export const LONG_PATH_ONLY_DISTANCE_KM = 9000; // section 5.3

/** Pt when the caller states none: one kilowatt. */
export const DEFAULT_TRANSMITTER_POWER_DB_KW = 0;

/** Gtl when the caller states none: an isotropic radiator. */
export const ISOTROPIC_GAIN_DBI = 0;

/** Which of section 5.3's two distance statements this path falls under. */
export type LongPathRange = "blend_7000_to_9000_km" | "above_9000_km";

/**
 * What is already inside `El`, named so a consumer cannot add it twice.
 *
 * Contract M08's vocabulary, restricted to the mechanisms section 5.3 actually
 * models. `absorption`, `above_muf`, `ground_reflection` and `auroral` are
 * deliberately absent: the composite of equation (39) does not itemise them and
 * claiming it did would be a false statement about the method.
 */
export const LONG_PATH_INCLUDED_MECHANISMS = [
  "free_space",
  "transmitter_power",
  "transmitting_antenna_gain",
  "long_distance_focusing",
  "excess",
] as const;

export type LongPathIncludedMechanism =
  (typeof LONG_PATH_INCLUDED_MECHANISMS)[number];

export interface LongPathFieldStrengthTerms {
  /** E0 of equation (40), dB(1 uV/m). */
  readonly freeSpaceFieldStrengthDbuVPerM: number;
  /** The bracket of equation (39), dimensionless, multiplying E0. */
  readonly frequencyFactor: number;
  /** Gap of equation (41) before the 15 dB limit, dB. */
  readonly focusGainUnlimitedDb: number;
  /** Gap actually applied, dB. */
  readonly focusGainDb: number;
  /** Whether the 15 dB limit bound Gap. */
  readonly focusGainLimited: boolean;
  /** Ly, dB. */
  readonly lyDb: number;
  /** Pt, dB(1 kW). */
  readonly transmitterPowerDbKw: number;
  /** Gtl, dBi. */
  readonly transmitterGainDbi: number;
}

export interface ResolvedLongPathFieldStrength {
  readonly kind: "field_strength";
  readonly groundDistanceKm: number;
  readonly frequencyMHz: number;
  readonly range: LongPathRange;
  /** fM of section 5.3.1, MHz. */
  readonly fMMHz: number;
  /** fL of section 5.3.2, MHz. */
  readonly fLMHz: number;
  /** fH, the mean control-point gyrofrequency, MHz. */
  readonly fHMHz: number;
  /** p', equation (19) at hr = 300 km over the whole path, km. */
  readonly virtualSlantRangeKm: number;
  readonly terms: LongPathFieldStrengthTerms;
  /** Etl of equation (39), dB(1 uV/m). This is the section's own name. */
  readonly etlDbuVPerM: number;
  /** The same number under the name the rest of the method uses for it. */
  readonly fieldStrengthDbuVPerM: number;
  /** The lower of the two control-point fBM values, MHz. Section 5.3.1. */
  readonly basicMufMHz: number;
  readonly muf: ResolvedLongPathMuf;
  readonly luf: ResolvedLongPathLuf;
  readonly alreadyIncludedMechanisms: readonly LongPathIncludedMechanism[];
  readonly assumptions: readonly string[];
}

export interface UnsupportedLongPathFieldStrength {
  readonly kind: "unsupported";
  readonly reason: "out_of_domain" | "muf_unsupported" | "luf_unsupported";
  readonly detail: string;
  readonly groundDistanceKm: number;
  /** The leaf result that declined, when one did. */
  readonly muf: LongPathMufResult | null;
  readonly luf: LongPathLufResult | null;
}

export type LongPathFieldStrength =
  | ResolvedLongPathFieldStrength
  | UnsupportedLongPathFieldStrength;

export interface LongPathFieldStrengthInputs {
  readonly route: ResolvedRoute;
  readonly frequencyMHz: number;
  /** 0-based month index, January is 0. */
  readonly monthIndex: number;
  /** The prediction's UTC hour. Whole hours only. */
  readonly utcHour: number;
  /** R12, equation (33)'s sunspot number. */
  readonly r12: number;
  /** The ionosphere at the two Table 1a control points, 24 hours each. */
  readonly sample: LongPathMufSampler;
  /** Pt, dB(1 kW). Defaults to 0, one kilowatt. */
  readonly transmitterPowerDbKw?: number;
  /**
   * Gtl, dBi: the LARGEST transmitting antenna gain at the path azimuth over
   * the 0 to 8 degree elevation band. Defaults to isotropic.
   */
  readonly transmitterGainDbi?: number;
}

/**
 * E0 of equation (40), the free-space field strength for 3 MW e.i.r.p.
 *
 * `p` is the virtual slant range in km, equation (19) at the 300 km height.
 */
export function freeSpaceFieldStrengthDbuVPerM(
  virtualSlantRangeKm: number,
): number {
  return FREE_SPACE_FIELD_CONSTANT_DB - 20 * Math.log10(virtualSlantRangeKm); // equation (40)
}

/**
 * Gap of equation (41), the long-distance focusing gain, before the 15 dB
 * limit the text states separately.
 *
 * D/R0 is an angle in radians, so a path that has gone once round the globe
 * returns to |sin| near zero and the formula diverges; that is exactly the
 * behaviour the limit exists for, and the divergence is returned here rather
 * than hidden so that `focusGainLimited` can say the limit did something.
 */
export function focusGainUnlimitedDb(groundDistanceKm: number): number {
  const angleRad = groundDistanceKm / EARTH_RADIUS_KM;
  return (
    10 *
    Math.log10(
      groundDistanceKm / (EARTH_RADIUS_KM * Math.abs(Math.sin(angleRad))),
    )
  ); // equation (41)
}

/**
 * The bracket of equation (39): the dimensionless factor multiplying E0.
 *
 * Written out as its own function because it is the part of the equation with
 * no units in it and because both the field strength and any report that wants
 * to show "how far up the passband the frequency sits" read the same number.
 *
 * It is EXACTLY ZERO at f = fM and at f = fL, which is worth knowing because it
 * is not obvious from the printed form and it is the sharpest check on the
 * expression there is. Writing a = (fM + fH)^2, b = (fL + fH)^2 and
 * x = (f + fH)^2, the bracket is b/x + x/a, so at x = a it is (a + b)/a and at
 * x = b it is also (a + b)/a; either way the leading a/(a + b) cancels it to 1
 * and the factor to 0. In between the factor is positive, peaking at the
 * geometric mean x = sqrt(ab) with the value 1 - 2 sqrt(ab)/(a + b); outside
 * the fL..fM window it goes negative, which is how equation (39) makes a
 * circuit worked far off its passband arbitrarily weak.
 */
export function frequencyFactor(inputs: {
  readonly frequencyMHz: number;
  readonly fMMHz: number;
  readonly fLMHz: number;
  readonly fHMHz: number;
}): number {
  const { frequencyMHz: f, fMMHz: fM, fLMHz: fL, fHMHz: fH } = inputs;
  const upper = (fM + fH) ** 2;
  const lower = (fL + fH) ** 2;
  const operating = (f + fH) ** 2;
  const inner = lower / operating + operating / upper; // equation (39)
  return 1 - (upper / (upper + lower)) * inner; // equation (39)
}

/**
 * Equation (39) assembled from terms that have already been computed.
 *
 * Exported separately from `longPathFieldStrength` so that the equation can be
 * evaluated against a stated set of terms without re-deriving them: the parity
 * test uses it to show what the same leaf produces under the reference's own
 * readings of Ly and of which hour fL is taken at, which is the only way to
 * separate a deviation from an error.
 */
export function etlDbuVPerM(inputs: {
  readonly freeSpaceFieldStrengthDbuVPerM: number;
  readonly frequencyFactor: number;
  readonly transmitterPowerDbKw: number;
  readonly transmitterGainDbi: number;
  readonly focusGainDb: number;
  readonly lyDb: number;
}): number {
  return (
    inputs.freeSpaceFieldStrengthDbuVPerM * inputs.frequencyFactor -
    EIRP_REFERENCE_OFFSET_DB +
    inputs.transmitterPowerDbKw +
    inputs.transmitterGainDbi +
    inputs.focusGainDb -
    inputs.lyDb
  ); // equation (39)
}

function unsupported(
  reason: UnsupportedLongPathFieldStrength["reason"],
  detail: string,
  groundDistanceKm: number,
  muf: LongPathMufResult | null = null,
  luf: LongPathLufResult | null = null,
): UnsupportedLongPathFieldStrength {
  return { kind: "unsupported", reason, detail, groundDistanceKm, muf, luf };
}

/**
 * El for one circuit at one frequency, with every intermediate on the record.
 *
 * Consumes one already-resolved route (contract M06) and one injected sampler
 * (contract M03). Nothing here fetches anything.
 */
export function longPathFieldStrength(
  inputs: LongPathFieldStrengthInputs,
): LongPathFieldStrength {
  const {
    route,
    frequencyMHz,
    monthIndex,
    utcHour,
    r12,
    sample,
    transmitterPowerDbKw = DEFAULT_TRANSMITTER_POWER_DB_KW,
    transmitterGainDbi = ISOTROPIC_GAIN_DBI,
  } = inputs;
  const D = route.groundDistanceKm;

  if (!Number.isFinite(D) || D < LONG_PATH_MIN_DISTANCE_KM) {
    return unsupported(
      "out_of_domain",
      `section 5.3 applies to paths of at least ` +
        `${String(LONG_PATH_MIN_DISTANCE_KM)} km; this path is ` +
        `${String(D)} km, where sections 5.1 and 5.2 apply.`,
      D,
    );
  }
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    return unsupported(
      "out_of_domain",
      `the operating frequency must be positive and finite, received ` +
        `${String(frequencyMHz)} MHz; equation (39) divides by (f + fH)^2.`,
      D,
    );
  }
  if (!Number.isFinite(transmitterPowerDbKw)) {
    return unsupported(
      "out_of_domain",
      `Pt must be finite, received ${String(transmitterPowerDbKw)} dB(1 kW).`,
      D,
    );
  }
  if (!Number.isFinite(transmitterGainDbi)) {
    return unsupported(
      "out_of_domain",
      `Gtl must be finite, received ${String(transmitterGainDbi)} dBi.`,
      D,
    );
  }

  const muf = longPathMuf({ route, utcHour, sample });
  if (muf.kind !== "resolved") {
    return unsupported("muf_unsupported", muf.detail, D, muf, null);
  }

  const luf = longPathLuf({
    route,
    monthIndex,
    utcHour,
    r12,
    gyrofrequencyMHz: muf.gyrofrequencyMHz,
    virtualSlantRangeKm: muf.virtualSlantRangeKm,
  });
  if (luf.kind !== "resolved") {
    return unsupported("luf_unsupported", luf.detail, D, muf, luf);
  }

  const unlimited = focusGainUnlimitedDb(D);
  const focusGainLimited = unlimited > MAX_FOCUS_GAIN_DB;
  const focusGainDb = focusGainLimited ? MAX_FOCUS_GAIN_DB : unlimited;
  const e0 = freeSpaceFieldStrengthDbuVPerM(muf.virtualSlantRangeKm);
  const factor = frequencyFactor({
    frequencyMHz,
    fMMHz: muf.fMMHz,
    fLMHz: luf.fLMHz,
    fHMHz: muf.gyrofrequencyMHz,
  });
  const etl = etlDbuVPerM({
    freeSpaceFieldStrengthDbuVPerM: e0,
    frequencyFactor: factor,
    transmitterPowerDbKw,
    transmitterGainDbi,
    focusGainDb,
    lyDb: LY_DB,
  });

  if (![unlimited, focusGainDb, e0, factor, etl].every(Number.isFinite)) {
    return unsupported(
      "out_of_domain",
      "equations (39) to (41) did not produce finite field-strength terms.",
      D,
      muf,
      luf,
    );
  }

  const assumptions: string[] = [];
  if (inputs.transmitterPowerDbKw === undefined) {
    assumptions.push(
      "Pt was not stated, so equation (39) used 0 dB(1 kW), one kilowatt.",
    );
  }
  if (inputs.transmitterGainDbi === undefined) {
    assumptions.push(
      "Gtl was not stated, so equation (39) used an isotropic radiator at " +
        "0 dBi rather than the largest gain over the 0 to 8 degree band.",
    );
  }
  if (focusGainLimited) {
    assumptions.push(
      `Gap from equation (41) was ${unlimited.toFixed(2)} dB and section ` +
        `5.3.3 limits it to ${String(MAX_FOCUS_GAIN_DB)} dB.`,
    );
  }

  return {
    kind: "field_strength",
    groundDistanceKm: D,
    frequencyMHz,
    range:
      D > LONG_PATH_ONLY_DISTANCE_KM
        ? "above_9000_km"
        : "blend_7000_to_9000_km",
    fMMHz: muf.fMMHz,
    fLMHz: luf.fLMHz,
    fHMHz: muf.gyrofrequencyMHz,
    virtualSlantRangeKm: muf.virtualSlantRangeKm,
    terms: {
      freeSpaceFieldStrengthDbuVPerM: e0,
      frequencyFactor: factor,
      focusGainUnlimitedDb: unlimited,
      focusGainDb,
      focusGainLimited,
      lyDb: LY_DB,
      transmitterPowerDbKw,
      transmitterGainDbi,
    },
    etlDbuVPerM: etl,
    fieldStrengthDbuVPerM: etl,
    basicMufMHz: muf.basicMufMHz,
    muf,
    luf,
    alreadyIncludedMechanisms: LONG_PATH_INCLUDED_MECHANISMS,
    assumptions,
  };
}
