/**
 * Solar geometry as ITU-R P.533-14 computes it.
 *
 * A port of `SolarParameters()` in `P533/Src/P533/CalculateCPParameters.c`
 * (commit cd172be56dc04b154e5d2fa91cbaa6ecf5284305). This is not a
 * general-purpose solar position routine and must not be substituted for one:
 * `FindfoE()` consumes these exact values, including their approximations, and
 * foE parity with the ITU executable depends on reproducing them.
 *
 * Two properties of the reference are load-bearing and are kept:
 *
 *  - It evaluates the 15th of the month, always. P.533 is a monthly-median
 *    model; there is no day field in its path structure. `enhanced` mode
 *    interpolates *between* month anchors rather than pretending the reference
 *    accepts a day.
 *  - Its time-zone term `(int)(longitude_deg / 15)` truncates toward zero, so
 *    the local-time offset is a whole number of hours and jumps at every 15th
 *    meridian. The jump cancels out of the hour angle (`toffset` subtracts the
 *    same truncated term back off), which is why it is safe to keep, but it
 *    does not cancel out of `ltime`, so it must be reproduced, not tidied.
 */

import { D2R, R2D } from "./modip";

/** Day of year of the first of each month (non-leap), as the reference has it. */
const DAY_OF_YEAR = [
  0, 31, 59, 90, 120, 152, 181, 212, 243, 273, 304, 334,
] as const;

/** Day of year of the 15th of each month: the reference's monthly anchors. */
export const MONTH_ANCHOR_DAY_OF_YEAR = [
  15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349,
] as const;

const DEGREES_PER_DAY = 0.98565327;
const MINUTES_PER_DEGREE = 3.98891967;
const AXIAL_TILT_SIN = Math.sin(23.45 * D2R);
const AXIAL_TILT_COS = Math.cos(23.45 * D2R);
/** Value of the true-anomaly angle on 21 March. */
const NU_AT_EQUINOX = 78.746118 * D2R;
/** Orbital eccentricity shape factor used by the reference. */
const ECCENTRICITY = 0.016713;
/** Solar elevation of -0.833 degrees: refraction plus the solar semi-diameter. */
const SUNRISE_ZENITH_DEG = 90.833;

export interface SolarParameters {
  /** Solar zenith angle, radians, always positive. */
  readonly zenithAngleRad: number;
  /** Solar declination, radians. */
  readonly declinationRad: number;
  /** Hour angle, radians. */
  readonly hourAngleRad: number;
  /** Equation of time, minutes. */
  readonly equationOfTimeMinutes: number;
  /** Local sunrise, sunset and solar noon as UTC fractional hours. */
  readonly sunriseUtcHours: number;
  readonly sunsetUtcHours: number;
  readonly solarNoonUtcHours: number;
}

/**
 * @param latitudeRad geographic latitude, radians
 * @param longitudeRad geographic longitude, radians, positive east
 * @param monthIndex 0 = January
 * @param utcHours UTC hour, may be fractional in `enhanced` mode
 * @param dayOfYear day of year; defaults to the reference's 15th-of-month anchor
 */
export function solarParameters(
  latitudeRad: number,
  longitudeRad: number,
  monthIndex: number,
  utcHours: number,
  dayOfYear = DAY_OF_YEAR[monthIndex] + 15,
): SolarParameters {
  const longitudeHours = longitudeRad / (15.0 * D2R);
  const timeZone = Math.trunc(longitudeHours);
  const localTime = utcHours + timeZone;

  const d = dayOfYear + utcHours / 24.0;

  // Mean and true anomaly of the Earth's orbit, measured from the perihelion,
  // which the reference places on 2 January.
  const lambda = DEGREES_PER_DAY * D2R * (d - 2);
  const nu = lambda + 1.915169 * D2R * Math.sin(lambda);

  // Mean sun angle measured from the vernal equinox, folded into +-90 degrees.
  let epsilon = DEGREES_PER_DAY * D2R * (d - 80);
  if (epsilon >= 270 * D2R) {
    epsilon -= 2.0 * Math.PI;
  } else if (epsilon >= 90 * D2R) {
    epsilon -= Math.PI;
  }
  const beta = Math.atan(AXIAL_TILT_COS * Math.tan(epsilon));

  const equationOfTimeMinutes =
    MINUTES_PER_DEGREE * (epsilon - beta + (lambda - nu)) * R2D;

  const declinationRad = Math.asin(
    AXIAL_TILT_SIN *
      Math.sin(
        Math.sin(DEGREES_PER_DAY * (d - 2) * D2R) * ECCENTRICITY +
          DEGREES_PER_DAY * (d - 2) * D2R -
          NU_AT_EQUINOX,
      ),
  );

  const offsetMinutes =
    (longitudeHours - timeZone) * 60.0 + equationOfTimeMinutes;
  const trueSolarTimeMinutes = localTime * 60 + offsetMinutes;
  const hourAngleRad = (trueSolarTimeMinutes / 4.0 - 180) * D2R;

  const sunriseHourAngleRad = Math.acos(
    Math.cos(SUNRISE_ZENITH_DEG * D2R) /
      (Math.cos(latitudeRad) * Math.cos(declinationRad)) -
      Math.tan(latitudeRad) * Math.tan(declinationRad),
  );

  let cosZenith =
    Math.sin(latitudeRad) * Math.sin(declinationRad) +
    Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  if (Math.abs(cosZenith) > 1.0) cosZenith = cosZenith >= 0 ? 1.0 : -1.0;

  const wrap = (hours: number) => ((hours % 24) + 24) % 24;

  return {
    zenithAngleRad: Math.acos(cosZenith),
    declinationRad,
    hourAngleRad,
    equationOfTimeMinutes,
    sunriseUtcHours: wrap(
      (720.0 +
        (-longitudeRad - sunriseHourAngleRad) * R2D * 4.0 -
        equationOfTimeMinutes) /
        60.0,
    ),
    sunsetUtcHours: wrap(
      (720.0 +
        (-longitudeRad + sunriseHourAngleRad) * R2D * 4.0 -
        equationOfTimeMinutes) /
        60.0,
    ),
    solarNoonUtcHours: wrap(
      (720.0 + -longitudeRad * R2D * 4.0 - equationOfTimeMinutes) / 60.0,
    ),
  };
}
