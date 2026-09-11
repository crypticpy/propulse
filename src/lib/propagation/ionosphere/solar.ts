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
const DAY_OF_YEAR = Object.freeze([
  0, 31, 59, 90, 120, 152, 181, 212, 243, 273, 304, 334,
] as const);

/**
 * The phase day the reference reads the solar model at, per month.
 *
 * `SolarParameters()` is called with `d = DAY_OF_YEAR[month] + 15 + hour / 24`,
 * so these are the model's twelve anchors and they are what enhanced mode must
 * land on for the two modes to agree. They are *not* quite the calendar 15th:
 * the reference's cumulative table holds 152 days before June where the
 * calendar has 151, so June's median is read at day 167, which is 16 June.
 * Reproduced, not corrected - the same policy as the mirrored interpolation
 * fractions and the southern polar-winter sign. Reference mode is the parity
 * oracle for the ITU executable, and enhanced mode is defined as the continuous
 * reading of the same model, so a tidier June here would only make the two
 * modes disagree with each other and with the goldens.
 *
 * Frozen because it is exported: a module-level array every consumer shares is
 * a channel between them, and an edit here would move the model's anchors for
 * the whole process.
 */
export const MONTH_PHASE_DAY = Object.freeze(
  DAY_OF_YEAR.map((dayOfYear) => dayOfYear + 15),
);

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
 * The model's own year length in days, `360 / DEGREES_PER_DAY` = 365.2322.
 *
 * Everything the reference derives from the day number is a function of an
 * angle that advances by `DEGREES_PER_DAY` per day, so this is the period of
 * the whole solar model. It is still needed for one thing: the December
 * anchor that brackets early January has to be placed one period below its own
 * phase day (and the January anchor that brackets late December one period
 * above), or the mapping across the year wrap would run backwards. It is not a
 * scale factor for the calendar year - see `yearPhase` in `provider.ts` for
 * why a uniform scaling moves the anchors it is supposed to preserve.
 *
 * The period is exact for the declination and for the anomaly terms. The
 * equation of time's fold of `epsilon` into +-90 degrees is only single-valued
 * over one turn, so the phase must stay inside the reference's own window of
 * roughly 1 to 366 days, which the anchor mapping keeps it in.
 */
export const MODEL_YEAR_DAYS = 360 / DEGREES_PER_DAY;

/**
 * @param latitudeRad geographic latitude, radians
 * @param longitudeRad geographic longitude, radians, positive east
 * @param monthIndex 0 = January
 * @param utcHours UTC hour, may be fractional in `enhanced` mode
 * @param phaseDay orbital phase in days, fractional, including the time of day;
 *   defaults to the reference's 15th-of-month anchor plus the hour fraction
 */
export function solarParameters(
  latitudeRad: number,
  longitudeRad: number,
  monthIndex: number,
  utcHours: number,
  phaseDay = DAY_OF_YEAR[monthIndex] + 15 + utcHours / 24.0,
): SolarParameters {
  const longitudeHours = longitudeRad / (15.0 * D2R);
  const timeZone = Math.trunc(longitudeHours);
  const localTime = utcHours + timeZone;

  const d = phaseDay;

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
