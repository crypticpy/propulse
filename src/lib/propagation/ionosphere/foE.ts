/**
 * E-layer critical frequency, ITU-R P.1239-2 section 3 as implemented by
 * `FindfoE()` in `P533/Src/P533/CalculateCPParameters.c`.
 *
 *   foE^4 = A * B * C * D
 *
 * A solar activity, B seasonal, C latitudinal, D time-of-day, with a floor at
 * `(0.004 * (1 + 0.021 * phi12)^2)^0.25` for the night side.
 *
 * Three behaviours of the reference are reproduced deliberately, and each is
 * flagged where it occurs, because each is a place where a "cleaner"
 * implementation would stop matching the ITU executable:
 *
 *  1. `phi12`, the monthly mean 10.7 cm flux, is *derived from R12* by
 *     P.1239-2 equation (2). It is not a measurement and must not be replaced
 *     by an observed F10.7: the constants of A were fitted against this
 *     derivation.
 *  2. The night branch advances the clock by one hour before comparing against
 *     sunset, matching the hour-ending convention of the F2 grid.
 *  3. The southern polar-winter test is `latitude < 72.5622 degrees`, not
 *     `latitude < -72.5622 degrees`. As written it selects the polar-winter
 *     formula for every latitude below +72.5622 in May, June and July, which is
 *     almost the whole globe. This looks like a sign error in the reference. It
 *     is kept because parity with P.533-14 is the requirement and because the
 *     branch only applies when the sun is already below the horizon, where the
 *     two candidate expressions are the arguments of a `max()` in every other
 *     month anyway. It is surfaced to the caller as an assumption string rather
 *     than hidden.
 */

import { D2R, R2D } from "./modip";
import { MAX_R12 } from "./numericalMap";
import type { SolarParameters } from "./solar";

/** ITU-R P.1239-2 equation (2): monthly mean 10.7 cm flux from R12. */
export function phi12FromR12(r12: number): number {
  const clipped = Math.min(r12, MAX_R12);
  return 63.7 + 0.728 * clipped + 0.00089 * clipped ** 2;
}

export interface FoEInputs {
  readonly latitudeRad: number;
  /** 0 = January. */
  readonly monthIndex: number;
  /** UTC hour, 0..23. The reference indexes hourly and this branch is hourly. */
  readonly utcHours: number;
  readonly r12: number;
  readonly solar: SolarParameters;
}

/** Result of the P.1239-2 foE calculation, with the branch actually taken. */
export interface FoEResult {
  readonly foEMHz: number;
  /**
   * Which time-of-day branch produced `D`. Exposed so a seam test can assert
   * the branch as well as the value, and so callers can explain a number.
   */
  readonly branch: "day" | "twilight" | "night" | "polar-winter";
  /** True when the night-time floor, not `A*B*C*D`, set the result. */
  readonly flooredAtNightMinimum: boolean;
}

export function foE(inputs: FoEInputs): FoEResult {
  const { latitudeRad, monthIndex, utcHours, solar } = inputs;
  const r12 = Math.min(inputs.r12, MAX_R12);
  const absLat = Math.abs(latitudeRad);

  // A: solar activity factor.
  const phi = phi12FromR12(r12);
  const a = 1.0 + 0.0094 * (phi - 66.0);

  // B: seasonal factor.
  const m =
    absLat < 32.0 * D2R
      ? -1.93 + 1.92 * Math.cos(latitudeRad)
      : 0.11 - 0.49 * Math.cos(latitudeRad);
  const latMinusDecl = latitudeRad - solar.declinationRad;
  const n = Math.abs(latMinusDecl) < 80.0 * D2R ? latMinusDecl : 80.0 * D2R;
  const b = Math.cos(n) ** m;

  // C: main latitude factor.
  const x = absLat < 32.0 * D2R ? 23.0 : 92.0;
  const y = absLat < 32.0 * D2R ? 116.0 : 35.0;
  const c = x + y * Math.cos(latitudeRad);

  // D: time-of-day factor.
  const p = absLat <= 12.0 * D2R ? 1.31 : 1.2;
  const sza = solar.zenithAngleRad;
  let d: number;
  let branch: FoEResult["branch"];
  if (sza <= 73.0 * D2R) {
    branch = "day";
    d = Math.cos(sza) ** p;
  } else if (sza < Math.PI / 2.0) {
    branch = "twilight";
    // Continuous at 73 degrees only to the size of dsza itself, which is
    // 0.049 degrees there: the reference has a small real kink at this seam.
    const dsza = 6.27e-13 * (sza * R2D - 50.0) ** 8 * D2R;
    d = Math.cos(sza - dsza) ** p;
  } else {
    const clock = (Math.floor(utcHours) + 1) % 24;
    const { sunriseUtcHours: lsr, sunsetUtcHours: lss } = solar;
    let hoursAfterSunset: number;
    if (lss >= lsr && clock >= lss && clock >= lsr) {
      hoursAfterSunset = clock - lss;
    } else if (lss < lsr && clock >= lss && clock < lsr) {
      hoursAfterSunset = clock - lss;
    } else if (lss >= lsr && clock < lss && clock < lsr) {
      hoursAfterSunset = 24.0 - lss + clock;
    } else {
      // Also the polar day/night case: `lsr`/`lss` are NaN there because the
      // sunrise hour angle has no solution, every comparison above is false,
      // and the reference lands here with h = 0.
      hoursAfterSunset = 0.0;
    }

    const northernPolarWinter =
      latitudeRad > 72.5622 * D2R &&
      (monthIndex === 10 || monthIndex === 11 || monthIndex === 0);
    // See item 3 in the module header: the reference's southern test has no
    // minus sign. Reproduced, not corrected.
    const southernPolarWinter =
      latitudeRad < 72.5622 * D2R &&
      (monthIndex === 4 || monthIndex === 5 || monthIndex === 6);
    const decay = 0.072 ** p * Math.exp(25.2 - 0.28 * sza * R2D);
    if (northernPolarWinter || southernPolarWinter) {
      branch = "polar-winter";
      d = decay;
    } else {
      branch = "night";
      d = Math.max(0.072 ** p * Math.exp(-1.4 * hoursAfterSunset), decay);
    }
  }

  const modelled = (a * b * c * d) ** 0.25;
  const floor = (0.004 * (1.0 + 0.021 * phi) ** 2) ** 0.25;
  return {
    foEMHz: Math.max(modelled, floor),
    branch,
    flooredAtNightMinimum: floor > modelled,
  };
}
