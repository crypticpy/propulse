/**
 * ITU-R P.372 external radio noise: the atmospheric map, the man-made and
 * galactic curves, and the P.372 combination of noise from several sources.
 *
 * This is a port of the ITU-R Study Group 3 reference implementation
 * (`P372/Src/P372/Noise.c` at commit cd172be56dc04b154e5d2fa91cbaa6ecf5284305
 * of https://github.com/ITU-R-Study-Group-3/ITU-R-HF), which in turn implements
 * the CCIR Report 322 numerical world maps of atmospheric noise via the
 * REC533 routines GENFAM/GENOIS1/ANOIS1/NOISY. The coefficients it reads are
 * vendored as `p372Coefficients.json`; see `p372Coefficients.ts` for provenance,
 * encoding and integrity digests.
 *
 * What this replaces: a `Faa = 100 - 33*log10(f)` curve with flat -10/-5/-5 dB
 * corrections, which had no source and which dominated the power sum across the
 * whole HF range (52 dB at 14 MHz after every correction, against a P.372 value
 * of 36 dB for the same receiver, month and hour). See PROP-02 (#948, #955).
 *
 * Deciles: the reference computes an upper and a lower decile deviation for
 * every component and combines them log-normally (P.372 section 8). Both are
 * carried here, because the combined median depends on them: sigma_T enters
 * `FamT`, and the reported total is `min(FamTu, FamTl)`, the reference's
 * worse-case median. The per-component deciles are also returned so callers can
 * show the spread; nothing in this module discards them silently.
 *
 * The sigma_Du / sigma_Dl / sigma_Fam polynomials (dud parameters 2..4) are
 * decoded but not used, exactly as in the reference: they describe the
 * variability of the deciles themselves and P.372 section 8 does not consume
 * them.
 *
 * Man-made and galactic noise, added for PROP-08 (#954 slice E1), are the other
 * two of the three components equation (45) of P.533-14 needs and Step 2 of
 * Table 1 of P.842-5 names. They are not maps: P.372-17 gives each as a single
 * straight line in log frequency, equation (17) for man-made and equation (15)
 * for galactic, so they are transcribed here as their published constants
 * rather than vendored as an asset. What is NOT published is a man-made decile
 * pair for the quiet rural category, and `manMadeNoiseP372` reports that
 * absence rather than borrowing the rural pair; see its own note.
 *
 * Two different totals, deliberately. The reference itself uses two:
 * `Noise.c:189` reports `FamT = min(FamTu, FamTl)` from the section 8
 * log-normal combination, but `P533/CircuitReliability.c:166` forms the
 * signal-to-noise ratio against the plain power sum of the three medians,
 * 10*log10(10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10)). The two differ by up to
 * about 1 dB. `combineNoiseP372` gives the first and `powerSumMediansP372` the
 * second; the SNR path must use `powerSumMediansP372`, so that our SNR matches
 * the reference's analog goldens (#952, #954). Do not "simplify" them into one.
 */

import {
  dudAt,
  famAt,
  fakabpAt,
  fakpAt,
  getP372Coefficients,
  type P372Coefficients,
} from "./p372Coefficients";

/** Degrees to radians, using the reference implementation's constant. */
const D2R = 0.0174532925;

/** CCIR Report 322 covers 0.01-30 MHz; the map polynomials are fitted 1-30. */
const ATMOSPHERIC_MIN_MHZ = 1;
const ATMOSPHERIC_MAX_MHZ = 30;

/** Decile-to-sigma factor for a log-normal distribution (P.372 section 8). */
const DECILE_SIGMA = 1.282;

/** 10/ln(10): the dB-to-neper constant the reference calls `c`. */
const DB_PER_NEPER = 10 / Math.LN10;

/**
 * Everything the P.372 atmospheric map needs: where the receiver is and when.
 * Fa is a property of the receiving station, not of the path midpoint.
 */
export interface P372ReceiverContext {
  /** Receiver latitude in degrees, positive north. */
  latitude: number;
  /** Receiver longitude in degrees, positive east. */
  longitude: number;
  /** Calendar month, 1 = January. */
  month: number;
  /** UTC hour, 0-23. The local-time block is derived from it and longitude. */
  utcHour: number;
}

/** A noise component: median noise factor and its decile deviations, in dB. */
export interface NoiseComponent {
  /** Fa: median noise factor, dB above kT0b. */
  fa: number;
  /** Du: upper decile deviation, dB. */
  du: number;
  /** Dl: lower decile deviation, dB. */
  dl: number;
}

function isValidContext(
  context: Partial<P372ReceiverContext> | undefined,
): context is P372ReceiverContext {
  if (!context) return false;
  const { latitude, longitude, month, utcHour } = context;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(month) &&
    Number.isFinite(utcHour) &&
    (month as number) >= 1 &&
    (month as number) <= 12
  );
}

/**
 * Fam, Du and Dl for one four-hour time block, at one receiver position and
 * frequency. Port of `GetFamParameters()`.
 */
function getFamParameters(
  coefficients: P372Coefficients,
  month0: number,
  timeBlock: number,
  longitudeRad: number,
  latitudeRad: number,
  frequencyMHz: number,
): NoiseComponent {
  const lm = 29;
  const ln = 15;

  // Longitude series. The map is in geographic east longitude, 0..2*PI, and the
  // series is in half that angle.
  let q =
    longitudeRad < 0 ? (longitudeRad + 2 * Math.PI) / 2 : longitudeRad / 2;
  const zz = new Float64Array(lm);
  for (let j = 0; j < lm; j++) {
    let r = 0;
    for (let k = 0; k < ln; k++) {
      r +=
        Math.sin((k + 1) * q) * fakpAt(coefficients, month0, timeBlock, k, j);
    }
    zz[j] = r + fakpAt(coefficients, month0, timeBlock, 15, j);
  }

  // Latitude series, in colatitude-like coordinates (latitude + 90 degrees).
  q = latitudeRad + Math.PI / 2;
  let r = 0;
  for (let j = 0; j < lm; j++) {
    r += Math.sin((j + 1) * q) * zz[j];
  }
  const fam1MHz =
    r +
    fakabpAt(coefficients, month0, timeBlock, 0) +
    fakabpAt(coefficients, month0, timeBlock, 1) * q;

  // The frequency-variation polynomials are tabulated separately for the two
  // hemispheres; the southern set is the same time block offset by 6.
  const block = latitudeRad < 0 ? timeBlock + 6 : timeBlock;

  // u is the NBS TN 318 frequency variable; u = -0.75 corresponds to 1 MHz,
  // where the map value is defined, and is used to solve for the scale factor.
  const u = [
    -0.75,
    (8 * Math.pow(2, Math.log10(frequencyMHz)) - 11) / 4,
  ] as const;
  let cz = 0;
  let pz = 0;
  let px = 0;
  for (let k = 0; k < 2; k++) {
    pz =
      u[k] * famAt(coefficients, month0, block, 0) +
      famAt(coefficients, month0, block, 1);
    px =
      u[k] * famAt(coefficients, month0, block, 7) +
      famAt(coefficients, month0, block, 8);
    for (let j = 2; j < 7; j++) {
      pz = u[k] * pz + famAt(coefficients, month0, block, j);
      px = u[k] * px + famAt(coefficients, month0, block, j + 7);
    }
    if (k === 0) {
      cz = fam1MHz * (2 - pz) - px;
    }
  }
  const fa = cz * pz + px;

  // Decile polynomials. P.372's decile curves stop at 20 MHz, and the
  // sigma_Fam curve at 10 MHz; the reference clamps the polynomial argument
  // rather than extrapolating, and so does this port.
  let x = Math.log10(frequencyMHz);
  if (frequencyMHz > 20) {
    x = Math.log10(20);
  }
  const v = new Float64Array(5);
  for (let j = 0; j < 5; j++) {
    if (j === 4 && frequencyMHz > 10) {
      x = 1;
    }
    let y = dudAt(coefficients, month0, j, block, 0);
    for (let k = 1; k < 5; k++) {
      y = y * x + dudAt(coefficients, month0, j, block, k);
    }
    v[j] = y;
  }

  return { fa, du: v[0], dl: v[1] };
}

/** Power-domain interpolation between two time blocks, as in the reference. */
function interpolateDb(now: number, adjacent: number, slope: number): number {
  const power =
    Math.pow(10, now / 10) +
    (Math.pow(10, adjacent / 10) - Math.pow(10, now / 10)) * slope;
  return 10 * Math.log10(power);
}

/**
 * ITU-R P.372 atmospheric noise at the receiver, in dB above kT0b.
 *
 * Returns `null` when the receiver context is incomplete. P.372 atmospheric
 * noise is a function of position, month and local time; with no position and
 * no time there is no value to report, and this module will not invent one.
 * Callers must declare what they do with `null` (see `getExternalNoiseFigure`).
 *
 * Frequency handling: the CCIR 322 map and its frequency-variation polynomials
 * are fitted over 1-30 MHz, so the frequency is clamped to that interval.
 * Below 1 MHz the 1 MHz value is returned; above 30 MHz the 30 MHz value is,
 * where the atmospheric term has already fallen to around 0 dB and is 15-20 dB
 * below the galactic floor, so the clamp is not observable in a total.
 */
export function atmosphericNoiseP372(
  context: Partial<P372ReceiverContext> | undefined,
  frequencyMHz: number,
): NoiseComponent | null {
  if (!isValidContext(context) || !Number.isFinite(frequencyMHz)) {
    return null;
  }
  const frequency = Math.min(
    ATMOSPHERIC_MAX_MHZ,
    Math.max(ATMOSPHERIC_MIN_MHZ, frequencyMHz),
  );
  const coefficients = getP372Coefficients();
  const month0 = Math.trunc(context.month) - 1;
  const longitudeRad = context.longitude * D2R;
  const latitudeRad = context.latitude * D2R;

  // Receiver local mean time, from UTC and longitude, rolled into 0..23.
  let localHour =
    Math.trunc(context.utcHour) + Math.trunc(longitudeRad / (15 * D2R));
  if (localHour < 0) {
    localHour += 24;
  } else if (localHour > 23) {
    localHour -= 24;
  }

  // Six four-hour blocks of receiver local mean time; the noise is interpolated
  // in the power domain between the containing block and the next one.
  const nowBlock = Math.trunc(localHour / 4) % 6;
  const adjacentBlock = (nowBlock + 1) % 6;
  const now = getFamParameters(
    coefficients,
    month0,
    nowBlock,
    longitudeRad,
    latitudeRad,
    frequency,
  );
  const adjacent = getFamParameters(
    coefficients,
    month0,
    adjacentBlock,
    longitudeRad,
    latitudeRad,
    frequency,
  );
  const slope = (localHour % 4) / 4;

  return {
    fa: interpolateDb(now.fa, adjacent.fa, slope),
    du: interpolateDb(now.du, adjacent.du, slope),
    dl: interpolateDb(now.dl, adjacent.dl, slope),
  };
}

/**
 * The plain power sum of the component medians, in dB.
 *
 * This is the noise figure the reference uses for signal-to-noise ratio
 * (`P533/CircuitReliability.c:166`): `SNR = PR - (Fsum - 204 + 10*log10(BW))`
 * holds to better than 0.05 dB on all 28 analog golden circuits only with this
 * sum, not with the section 8 `FamT`. It ignores the deciles by construction;
 * use `combineNoiseP372` when the spread is what you want.
 */
export function powerSumMediansP372(
  components: readonly NoiseComponent[],
): number {
  let power = 0;
  for (const component of components) {
    power += Math.pow(10, component.fa / 10);
  }
  return 10 * Math.log10(power);
}

/**
 * Combine noise components per ITU-R P.372 section 8, "The combination of
 * noises from several sources".
 *
 * Each component is treated as log-normal with sigma = D/1.282. The upper and
 * lower decile cases give two candidate medians; the reference returns the
 * smaller (the worse case for a signal-to-noise budget), together with the
 * combined deciles. This is not the same as a power sum of the medians: summing
 * medians overstates the total by roughly 1-2 dB when the components are
 * comparable, because the median of a sum of log-normals is below the sum of
 * their medians.
 */
export function combineNoiseP372(
  components: readonly NoiseComponent[],
): NoiseComponent {
  const c = DB_PER_NEPER;

  const solve = (sigmas: readonly number[]): { fam: number; d: number } => {
    let alpha = 0;
    let beta = 0;
    let gamma = 0;
    for (let i = 0; i < components.length; i++) {
      const sigma = sigmas[i];
      const term = Math.exp(
        components[i].fa / c + (sigma * sigma) / (2 * c * c),
      );
      alpha += term;
      beta += term * term * (Math.exp((sigma / c) * (sigma / c)) - 1);
      gamma += Math.exp(components[i].fa / c);
    }
    const anyWideDecile = sigmas.some((sigma) => sigma * DECILE_SIGMA > 12);
    const sigmaT = anyWideDecile
      ? c * Math.sqrt(2 * Math.log(alpha / gamma))
      : c * Math.sqrt(Math.log(1 + beta / (alpha * alpha)));
    return {
      fam: c * (Math.log(alpha) - (sigmaT * sigmaT) / (2 * c * c)),
      d: DECILE_SIGMA * sigmaT,
    };
  };

  const upper = solve(components.map((n) => n.du / DECILE_SIGMA));
  const lower = solve(components.map((n) => n.dl / DECILE_SIGMA));

  return {
    fa: Math.min(upper.fam, lower.fam),
    du: upper.d,
    dl: lower.d,
  };
}

/**
 * The outdoor man-made noise environments of ITU-R P.372-17, Part 6.
 *
 * `c` and `d` are Table 1, "Values of the constants c and d", and feed
 * equation (17) `Fam = c - d log f` with f in MHz. `du` and `dl` are the
 * "variation with time" column of Table 2, "Values of decile deviations of
 * man-made noise", which is the variability P.842-5 Table 1 Steps 5 and 8 ask
 * Recommendation ITU-R P.372 for.
 *
 * Table 2 has three rows, not four: the quiet rural category (curve D) has a
 * median in Table 1 and no decile pair anywhere in P.372-17, so its deciles are
 * `null` here. Giving it the rural pair would be an invention at the exact
 * place a reader is entitled to a citation, and the deciles are not small: they
 * are 5 to 11 dB, which is the whole width of the P.842 Step 6 and Step 9 root
 * sums.
 *
 * The category is a property of the receiving site, which no model can derive
 * from a coordinate; it is an input.
 */
export const P372_MAN_MADE_ENVIRONMENTS = {
  // P.372-17 Table 1 (curve A) and Table 2 (City).
  city: { c: 76.8, d: 27.7, du: 11.0, dl: 6.7 },
  // P.372-17 Table 1 (curve B) and Table 2 (Residential).
  residential: { c: 72.5, d: 27.7, du: 10.6, dl: 5.3 },
  // P.372-17 Table 1 (curve C) and Table 2 (Rural).
  rural: { c: 67.2, d: 27.7, du: 9.2, dl: 4.6 },
  // P.372-17 Table 1 (curve D). Table 2 has no quiet rural row.
  quiet_rural: { c: 53.6, d: 28.6, du: null, dl: null },
} as const;

/** One of the four outdoor environmental categories of P.372-17 Table 1. */
export type P372ManMadeEnvironment = keyof typeof P372_MAN_MADE_ENVIRONMENTS;

/** A median with a decile pair that may not be published. */
export interface ManMadeNoiseComponent {
  /** Fam from equation (17), dB above kT0b. */
  readonly fa: number;
  /**
   * Table 2's variation with time, or `null` for quiet rural, which P.372-17
   * does not tabulate. A `null` here is not a zero: it is the absence of a
   * published value, and a caller that needs a decile must say so.
   */
  readonly deciles: { readonly du: number; readonly dl: number } | null;
}

/**
 * ITU-R P.372-17 equation (17): man-made noise for one environmental category.
 *
 * Returns `null` for a frequency that is not a positive finite number, because
 * log10 of it is not a number and this module does not return NaN. Equation
 * (17) is stated valid over 0.3 to 250 MHz for curves A to C, which contains
 * the whole 2 to 30 MHz declared domain of the caller, so there is no clamp
 * here and none is needed. Curve D (quiet rural) is annotated in P.372-17 as
 * ionospherically reflected noise observed below fxF2, so above roughly the
 * critical frequency it overstates what is there; that is a property of the
 * published curve and is declared, not corrected.
 */
export function manMadeNoiseP372(
  environment: P372ManMadeEnvironment,
  frequencyMHz: number,
): ManMadeNoiseComponent | null {
  const row = P372_MAN_MADE_ENVIRONMENTS[environment];
  if (row === undefined) return null;
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) return null;
  return {
    // P.372-17 equation (17): Fam = c - d log f, f in MHz.
    fa: row.c - row.d * Math.log10(frequencyMHz),
    deciles:
      row.du === null || row.dl === null ? null : { du: row.du, dl: row.dl },
  };
}

/**
 * ITU-R P.372-17 equation (15): galactic noise, with the 2 dB deciles.
 *
 * "For frequencies up to about 100 MHz, the median noise figure for galactic
 * noise for a vertical antenna, neglecting ionospheric shielding, is given by
 * Fam = 52 - 23 log f", and "the decile variation of both the upper and lower
 * deciles for galactic noise is 2 dB". P.533-14 section 8 repeats the 2 dB as
 * "the combined within-an-hour and day-to-day decile variability of galactic
 * noise", and P.842-5 Table 1 Steps 5 and 8 tabulate it as the literal 2.
 *
 * The same text says galactic noise is not observed below foF2 and is reduced
 * up to about three times foF2. That shielding is not applied here: it is a
 * function of the ionosphere over the receiver, the constant curve is what
 * P.842 Step 2 asks for, and applying half of a correction would be worse than
 * applying none. Returns `null` for a non-positive or non-finite frequency.
 */
export function galacticNoiseP372(frequencyMHz: number): NoiseComponent | null {
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) return null;
  return {
    // P.372-17 equation (15): Fam = 52 - 23 log f, f in MHz.
    fa: 52 - 23 * Math.log10(frequencyMHz),
    // P.372-17 section 4.1: the decile variation both sides is 2 dB.
    du: 2,
    dl: 2,
  };
}
