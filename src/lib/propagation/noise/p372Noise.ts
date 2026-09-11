/**
 * ITU-R P.372 atmospheric radio noise, and the P.372 combination of noise from
 * several sources.
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
