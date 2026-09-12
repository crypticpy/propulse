/**
 * ITU-R P.533-14 section 3.7, the path operational MUF (PROP-08, #954 slice A).
 *
 * "The path operational MUF is the greater of the operational MUF for F2 modes
 * and the operational MUF for E modes. The relationship between the
 * operational and basic MUFs will depend on the systems and antenna
 * characteristics and on the path length geographic and other considerations,
 * and should be determined from practical experience of the circuit
 * performance. Where this experience is not available, for F2 modes, the
 * operational MUF = basic MUF . Rop where Rop is given in Table 1 to
 * Recommendation ITU-R P.1240; for E modes the operational MUF is equal to the
 * basic MUF."
 *
 * And, for the deciles: "An estimate of the operational MUF exceeded for 10%
 * and 90% of the days is determined by multiplying the median operational MUF
 * by the appropriate factors given in Recommendation ITU-R P.1239, Tables 2
 * and 3, in the case of the F modes. In the case of E modes the appropriate
 * factors are 1.05 and 0.95 respectively."
 *
 * WHAT IS AND IS NOT AVAILABLE HERE. The Rop table is transcribed in
 * `assets/p1240-rop.json` with its provenance and the limits of that
 * provenance. The P.1239 Tables 2 and 3 decile factors are NOT: issue #1102
 * is building that asset and its evaluator in parallel and will land
 * `foF2DecileFactors` on the ionosphere provider. Until then an F2 decile is
 * an explicit `unavailable` with a reason, never a number. The seam is the
 * `mufDecileFactors` input: pass the factors when #1102 lands and the same
 * code returns them. The E-mode factors 1.05 and 0.95 are constants of the
 * recommendation, not a default standing in for something missing, so they are
 * not overridable and E deciles are available today.
 *
 * There is no "or 1.0 for now". A 90% operational MUF quoted at the median
 * would be indistinguishable at the call site from a real one, which is the
 * whole failure this shape exists to prevent.
 *
 * DAY AND NIGHT. The recommendation names the day/night distinction Rop is
 * indexed by and does not define it. Two named classifiers are offered and the
 * caller states which it used:
 *
 *  - `dayOrNightFromSolarZenith` is the physical reading: day while the sun is
 *    above the horizon at the mid-path control point, at the same 90.833
 *    degree refracted horizon the provider's sunrise and sunset use.
 *  - `dayOrNightFromUtcSunTimes` reproduces the ITU reference implementation.
 *    `MUFOperational.c` compares `path->CP[MP].ltime`, which `SolarParameters`
 *    sets to the plain UTC hour, against `Sun.lsr` and `Sun.lss`, which are
 *    sunrise and sunset as UTC hours wrapped into 0..24 by `fmod`. When a
 *    location's sunset falls after 00 UTC the wrap puts `lss` below `lsr`, the
 *    test `ltime < lss && ltime > lsr` can no longer be satisfied, and every
 *    hour of that day is classified NIGHT. Golden case G02 (Austin to Dallas,
 *    July, 18 UTC, local solar noon) is exactly that: the sun is 13 degrees
 *    from the zenith and the reference charges the night-time Rop of 1.20
 *    instead of the daytime 1.10. The two classifiers therefore disagree, the
 *    parity fixtures use this one because it is the oracle, and a product
 *    caller should use the other one.
 *
 * Units: MHz. Nothing is rounded.
 */

import type {
  BasicMufMode,
  LayerBasicMuf,
  ResolvedBasicMuf,
} from "./basicMuf";
import ropTable from "./assets/p1240-rop.json";

export type MufSeason = "winter" | "equinox" | "summer";
export type DayOrNight = "day" | "night";
export type EirpBand = "le_30_dbw" | "gt_30_dbw";

/** The EIRP the P.1240 Table 1 rows are split at, dBW. */
export const EIRP_BAND_BOUNDARY_DBW = 30;

/**
 * The refracted horizon the sunrise and sunset hour angle is taken at,
 * degrees of solar zenith. The same constant `ionosphere/solar.ts` uses, so
 * the two classifiers below agree about where the horizon is.
 */
export const SUNRISE_ZENITH_DEG = 90.833;

/** Section 3.6: "In the case of E modes the appropriate factors for the
 * interdecile range are 1.05 and 0.95, respectively." */
export const E_MODE_DECILE_FACTORS: DecileFactors = Object.freeze({
  upper: 1.05,
  lower: 0.95,
});

export interface DecileFactors {
  /** delta_l, the MUF(90)/MUF(50) ratio. Below 1. */
  readonly lower: number;
  /** delta_u, the MUF(10)/MUF(50) ratio. Above 1. */
  readonly upper: number;
}

export type DecileValue =
  | { readonly known: true; readonly valueMHz: number }
  | { readonly known: false; readonly reason: string };

const F2_DECILES_UNAVAILABLE =
  "the ITU-R P.1239 Tables 2 and 3 decile factors for F2 modes are not " +
  "implemented yet (issue #1102); pass mufDecileFactors once they are, " +
  "rather than reading the median as if it were a decile";

export interface OperationalMufMode extends BasicMufMode {
  /** The Rop applied. Exactly 1 for E modes, by section 3.7. */
  readonly ropFactor: number;
  readonly operationalMufMHz: number;
  /** OPMUF(10), the highest probable frequency. */
  readonly operationalMuf10MHz: DecileValue;
  /** OPMUF(90), the optimum working frequency. */
  readonly operationalMuf90MHz: DecileValue;
}

export interface OperationalMufInputs {
  readonly basicMuf: ResolvedBasicMuf;
  readonly season: MufSeason;
  readonly dayOrNight: DayOrNight;
  /** Equivalent isotropically radiated power of the circuit, dBW. */
  readonly eirpDbW: number;
  /**
   * delta_l and delta_u for the F2 modes, from ITU-R P.1239 Tables 2 and 3.
   * Omit while #1102 is unlanded: the F2 deciles then come back as
   * `known: false` with a reason instead of an invented number.
   */
  readonly mufDecileFactors?: DecileFactors;
}

export interface OperationalMufResult {
  readonly season: MufSeason;
  readonly dayOrNight: DayOrNight;
  readonly eirpBand: EirpBand;
  /** The Rop the F2 modes were multiplied by. */
  readonly ropFactor: number;
  readonly modes: readonly OperationalMufMode[];
  readonly pathOperationalMufMHz: number;
  readonly pathOperationalMuf10MHz: DecileValue;
  readonly pathOperationalMuf90MHz: DecileValue;
}

/** Which row of P.1240 Table 1 an EIRP falls in. */
export function eirpBand(eirpDbW: number): EirpBand {
  if (!Number.isFinite(eirpDbW)) {
    throw new RangeError(
      `eirpDbW must be finite, received ${String(eirpDbW)}.`,
    );
  }
  return eirpDbW <= EIRP_BAND_BOUNDARY_DBW ? "le_30_dbw" : "gt_30_dbw";
}

/**
 * The season Rop is indexed by, at the path mid-point.
 *
 * November to February is winter in the northern hemisphere and at the
 * equator, May to August is summer, and March, April, September and October
 * are equinox; south of the equator winter and summer are exchanged.
 */
export function p533Season(
  midpointLatitudeDeg: number,
  month: number,
): MufSeason {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(
      `month must be an integer 1..12, received ${String(month)}.`,
    );
  }
  if (!Number.isFinite(midpointLatitudeDeg)) {
    throw new RangeError(
      `midpointLatitudeDeg must be finite, received ${String(midpointLatitudeDeg)}.`,
    );
  }
  const northern =
    month === 11 || month === 12 || month === 1 || month === 2
      ? "winter"
      : month >= 5 && month <= 8
        ? "summer"
        : "equinox";
  if (midpointLatitudeDeg >= 0 || northern === "equinox") return northern;
  return northern === "winter" ? "summer" : "winter";
}

/** Day while the sun is above the refracted horizon at the control point. */
export function dayOrNightFromSolarZenith(
  zenithAngleDeg: number,
): DayOrNight {
  return zenithAngleDeg < SUNRISE_ZENITH_DEG ? "day" : "night";
}

/**
 * The ITU reference implementation's own test, wrap and all.
 *
 * Kept because it is the oracle the golden cases were produced with; see the
 * module header for the case it gets wrong and why it is not the default.
 */
export function dayOrNightFromUtcSunTimes(times: {
  readonly hourUtc: number;
  readonly sunriseUtcHours: number;
  readonly sunsetUtcHours: number;
}): DayOrNight {
  const { hourUtc, sunriseUtcHours, sunsetUtcHours } = times;
  return hourUtc < sunsetUtcHours && hourUtc > sunriseUtcHours
    ? "day"
    : "night";
}

/** Rop from ITU-R P.1240 Table 1. */
export function ropFactor(
  band: EirpBand,
  season: MufSeason,
  dayOrNight: DayOrNight,
): number {
  return ropTable.rop[band][season][dayOrNight];
}

function decile(
  medianMHz: number,
  factors: DecileFactors | undefined,
  which: "lower" | "upper",
): DecileValue {
  if (factors === undefined) {
    return { known: false, reason: F2_DECILES_UNAVAILABLE };
  }
  return { known: true, valueMHz: medianMHz * factors[which] };
}

function applyLayer(
  layer: LayerBasicMuf | null,
  rop: number,
  factors: DecileFactors | undefined,
): OperationalMufMode[] {
  if (layer === null) return [];
  return layer.modes.map((mode) => {
    const operationalMufMHz = mode.basicMufMHz * rop;
    return {
      ...mode,
      ropFactor: rop,
      operationalMufMHz,
      operationalMuf10MHz: decile(operationalMufMHz, factors, "upper"),
      operationalMuf90MHz: decile(operationalMufMHz, factors, "lower"),
    };
  });
}

/** Reduce a decile across modes: the largest, or unknown if any is unknown. */
function maxDecile(
  values: readonly DecileValue[],
  which: "OPMUF(10)" | "OPMUF(90)",
): DecileValue {
  if (values.length === 0) {
    return { known: false, reason: `no mode contributes a ${which}` };
  }
  const missing = values.find((value) => !value.known);
  if (missing !== undefined && !missing.known) {
    // The path value is a maximum over modes. One unknown term makes the
    // maximum unknown: the largest of the known ones is a lower bound, not
    // the answer, and returning it would quietly understate the path.
    return {
      known: false,
      reason: `${which} is unknown for at least one mode: ${missing.reason}`,
    };
  }
  return {
    known: true,
    valueMHz: Math.max(
      ...values.map((value) => (value.known ? value.valueMHz : 0)),
    ),
  };
}

/** The path operational MUF and every mode's, section 3.7. */
export function operationalMuf(
  inputs: OperationalMufInputs,
): OperationalMufResult {
  const { basicMuf, season, dayOrNight, eirpDbW, mufDecileFactors } = inputs;
  const band = eirpBand(eirpDbW);
  const rop = ropFactor(band, season, dayOrNight);

  const modes = [
    // Section 3.7: "for E modes the operational MUF is equal to the basic
    // MUF", which is Rop = 1 exactly, and the E deciles are the
    // recommendation's own 1.05 and 0.95.
    ...applyLayer(basicMuf.e, 1, E_MODE_DECILE_FACTORS),
    ...applyLayer(basicMuf.f2, rop, mufDecileFactors),
  ];

  if (modes.length === 0) {
    throw new RangeError(
      "a resolved basic MUF with neither an E nor an F2 layer cannot exist; " +
        "basicMuf() returns an unsupported result in that case.",
    );
  }

  return {
    season,
    dayOrNight,
    eirpBand: band,
    ropFactor: rop,
    modes,
    pathOperationalMufMHz: Math.max(
      ...modes.map((mode) => mode.operationalMufMHz),
    ),
    pathOperationalMuf10MHz: maxDecile(
      modes.map((mode) => mode.operationalMuf10MHz),
      "OPMUF(10)",
    ),
    pathOperationalMuf90MHz: maxDecile(
      modes.map((mode) => mode.operationalMuf90MHz),
      "OPMUF(90)",
    ),
  };
}
