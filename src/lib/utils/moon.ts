/**
 * Moon Ephemeris
 *
 * Wraps suncalc's moon calculations into a single snapshot: phase, phase
 * name/emoji, rise/set, topocentric altitude/azimuth, geocentric distance,
 * and the next full and new moon instants (found by hourly scan + bisection
 * to the minute). `SunCalc.getMoonPosition`'s `distance` is geocentric --
 * identical for every observer at the same instant, regardless of `lat`/
 * `lon` -- only `altitude`/`azimuth` are truly topocentric. `distanceKm`
 * keeps that geocentric value rather than correcting it for parallax: the
 * correction is at most Earth's radius, under 0.2 dB of two-way EME path
 * loss, well below what this module's other simplifications already cost.
 */

import SunCalc from "suncalc";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const JULIAN_1970 = 2_440_588;
const JULIAN_2000 = 2_451_545;
const EARTH_OBLIQUITY = 23.4397 * DEG_TO_RAD;
const HOUR_MS = 3_600_000;
const MAX_SEARCH_HOURS = 31 * 24;
const BISECTION_ITERATIONS = 12; // 1h / 2^12 ~= 0.88s, well under a minute

/** Earth's mean sidereal rotation rate, rad/s -- the dominant term in the
 * observer's own eastward speed as the Earth turns underneath the Moon. */
const EARTH_ROTATION_RAD_S = 7.2921159e-5;
/** Earth's mean radius, km, paired with `EARTH_ROTATION_RAD_S` to get an
 * observer's rotational speed at a given latitude. */
const EARTH_RADIUS_KM = 6371.0;

/** J2000 north galactic pole, equatorial coordinates, degrees (IAU 1958
 * system): right ascension and declination of the point in Coma Berenices
 * that the Milky Way's rotation axis points toward. */
const GALACTIC_NORTH_POLE_RA_DEG = 192.85948;
const GALACTIC_NORTH_POLE_DEC_DEG = 27.12825;

export interface MoonConditions {
  phase: number;
  illumination: number;
  phaseName: string;
  emoji: string;
  rise: Date | null;
  set: Date | null;
  altitude: number;
  azimuth: number;
  /** Geocentric Earth-Moon distance, km (SunCalc) -- identical for every
   * observer at the same instant, not corrected for parallax. */
  distanceKm: number;
}

export interface MoonSnapshot extends MoonConditions {
  nextFullMoon: Date;
  nextNewMoon: Date;
}

export interface SublunarPoint {
  lat: number;
  lon: number;
}

interface MoonTimes {
  rise: Date | null;
  set: Date | null;
}

const PHASE_EMOJI: Record<string, string> = {
  "New Moon": "\u{1F311}",
  "Waxing Crescent": "\u{1F312}",
  "First Quarter": "\u{1F313}",
  "Waxing Gibbous": "\u{1F314}",
  "Full Moon": "\u{1F315}",
  "Waning Gibbous": "\u{1F316}",
  "Last Quarter": "\u{1F317}",
  "Waning Crescent": "\u{1F318}",
};

/**
 * Map a 0..1 suncalc phase value to one of the 8 conventional phase-name
 * buckets, each centered on its cardinal phase (New=0, First Quarter=0.25,
 * Full=0.5, Last Quarter=0.75) with a width of 1/8.
 */
function getPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.0625 || p >= 0.9375) return "New Moon";
  if (p < 0.1875) return "Waxing Crescent";
  if (p < 0.3125) return "First Quarter";
  if (p < 0.4375) return "Waxing Gibbous";
  if (p < 0.5625) return "Full Moon";
  if (p < 0.6875) return "Waning Gibbous";
  if (p < 0.8125) return "Last Quarter";
  return "Waning Crescent";
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function normalizeLongitude(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function zonedDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Select rise/set events that belong to the QTH's calendar day. SunCalc can
 * anchor only to browser-local or UTC midnight, so scan the adjacent UTC days
 * and retain the roots whose formatted date matches the requested zone.
 */
function getMoonTimesForZone(
  at: Date,
  lat: number,
  lon: number,
  timeZone?: string,
): MoonTimes {
  if (!timeZone) {
    const times = SunCalc.getMoonTimes(at, lat, lon);
    return {
      rise: times.rise instanceof Date ? times.rise : null,
      set: times.set instanceof Date ? times.set : null,
    };
  }

  try {
    const targetDay = zonedDateKey(at, timeZone);
    const utcDay = Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
    );
    let rise: Date | null = null;
    let set: Date | null = null;

    for (const dayOffset of [-1, 0, 1]) {
      const candidateDay = new Date(utcDay + dayOffset * DAY_MS);
      const times = SunCalc.getMoonTimes(candidateDay, lat, lon, true);
      if (
        !rise &&
        times.rise instanceof Date &&
        zonedDateKey(times.rise, timeZone) === targetDay
      ) {
        rise = times.rise;
      }
      if (
        !set &&
        times.set instanceof Date &&
        zonedDateKey(times.set, timeZone) === targetDay
      ) {
        set = times.set;
      }
    }

    return { rise, set };
  } catch {
    // Invalid/unsupported zones retain the historical browser-local behavior.
    const times = SunCalc.getMoonTimes(at, lat, lon);
    return {
      rise: times.rise instanceof Date ? times.rise : null,
      set: times.set instanceof Date ? times.set : null,
    };
  }
}

interface MoonEquatorialPosition {
  rightAscensionRad: number;
  declinationRad: number;
  greenwichSiderealTimeRad: number;
}

/**
 * Geocentric right ascension, declination and Greenwich sidereal time of the
 * Moon at `at`, shared by `getSublunarPoint` (B8) and `getMoonDeclinationDeg`
 * (B21) so the two calculations can never disagree about where the Moon is.
 *
 * The low-order lunar longitude/latitude terms intentionally match SunCalc's
 * moon-position model, which the rest of this module uses.
 */
function moonEquatorialPosition(at: Date): MoonEquatorialPosition {
  const julianDate = at.getTime() / DAY_MS - 0.5 + JULIAN_1970;
  const daysSinceJ2000 = julianDate - JULIAN_2000;

  const meanLongitude =
    (218.316 + 13.176396 * daysSinceJ2000) * DEG_TO_RAD;
  const meanAnomaly = (134.963 + 13.064993 * daysSinceJ2000) * DEG_TO_RAD;
  const meanDistance = (93.272 + 13.22935 * daysSinceJ2000) * DEG_TO_RAD;
  const eclipticLongitude =
    meanLongitude + 6.289 * DEG_TO_RAD * Math.sin(meanAnomaly);
  const eclipticLatitude = 5.128 * DEG_TO_RAD * Math.sin(meanDistance);

  const rightAscensionRad = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(EARTH_OBLIQUITY) -
      Math.tan(eclipticLatitude) * Math.sin(EARTH_OBLIQUITY),
    Math.cos(eclipticLongitude),
  );
  const declinationRad = Math.asin(
    Math.sin(eclipticLatitude) * Math.cos(EARTH_OBLIQUITY) +
      Math.cos(eclipticLatitude) *
        Math.sin(EARTH_OBLIQUITY) *
        Math.sin(eclipticLongitude),
  );
  const greenwichSiderealTimeRad =
    (280.16 + 360.9856235 * daysSinceJ2000) * DEG_TO_RAD;

  return { rightAscensionRad, declinationRad, greenwichSiderealTimeRad };
}

/**
 * Return the geocentric point on Earth directly beneath the Moon.
 *
 * Keeping the same model as `moonEquatorialPosition` means the marker and
 * the pane cannot disagree about where the Moon is; at the returned
 * coordinate SunCalc reports an altitude of approximately 90°.
 */
export function getSublunarPoint(at: Date): SublunarPoint {
  const { rightAscensionRad, declinationRad, greenwichSiderealTimeRad } =
    moonEquatorialPosition(at);

  return {
    lat: declinationRad * RAD_TO_DEG,
    lon: normalizeLongitude(
      (rightAscensionRad - greenwichSiderealTimeRad) * RAD_TO_DEG,
    ),
  };
}

/**
 * Geocentric declination of the Moon in degrees, positive north of the
 * celestial equator (wall spec section 26.10). EME operators read this
 * directly: a high declination keeps the Moon above the horizon longer per
 * pass and widens the window during which two stations at different
 * latitudes can both see it.
 */
export function getMoonDeclinationDeg(at: Date): number {
  return moonEquatorialPosition(at).declinationRad * RAD_TO_DEG;
}

/**
 * Convert equatorial coordinates (right ascension, declination, both
 * radians) to galactic latitude, degrees, via the standard J2000 north
 * galactic pole rotation:
 * `sin(b) = sin(dec)*sin(decNGP) + cos(dec)*cos(decNGP)*cos(ra - raNGP)`.
 * Pulled out of `getMoonGalacticLatitudeDeg` as a pure conversion so it can
 * be tested against known sky positions (the galactic center and the north
 * galactic pole itself) independent of the Moon's own ephemeris.
 */
export function equatorialToGalacticLatitudeDeg(
  raRad: number,
  decRad: number,
): number {
  const raNgpRad = GALACTIC_NORTH_POLE_RA_DEG * DEG_TO_RAD;
  const decNgpRad = GALACTIC_NORTH_POLE_DEC_DEG * DEG_TO_RAD;
  const sinB =
    Math.sin(decRad) * Math.sin(decNgpRad) +
    Math.cos(decRad) * Math.cos(decNgpRad) * Math.cos(raRad - raNgpRad);
  return Math.asin(sinB) * RAD_TO_DEG;
}

/**
 * Galactic latitude of the Moon's current position, degrees -- how far the
 * Moon sits from the Milky Way's own plane right now, replacing a
 * declination-only proxy: two positions can share a declination while
 * sitting at very different galactic latitudes, since the galactic plane is
 * tilted ~63 deg to the celestial equator. `eme.ts`'s sky-noise model reads
 * this directly (small |b| == sitting in front of the galactic plane's
 * synchrotron noise).
 */
export function getMoonGalacticLatitudeDeg(at: Date): number {
  const { rightAscensionRad, declinationRad } = moonEquatorialPosition(at);
  return equatorialToGalacticLatitudeDeg(rightAscensionRad, declinationRad);
}

/**
 * Topocentric range rate of the Moon in km/s at `lat`/`lon`: the geocentric
 * closing rate -- a central finite difference of
 * `SunCalc.getMoonPosition`'s `distance` across `±deltaSeconds` (default
 * 60s) -- plus the observer's own rotational speed projected onto the
 * line of sight. `distance` alone is geocentric (it does not vary with
 * `lat`/`lon`), so its finite difference only ever captures the Moon's
 * orbital radial velocity, at most a few hundredths of a km/s; the
 * dominant EME Doppler term is the ground station's own eastward motion as
 * the Earth turns, up to ~0.46 km/s at the equator, which peaks at
 * moonrise/moonset and crosses zero near transit. That term is
 * `vRot * eastComponent`, where `vRot = EARTH_ROTATION_RAD_S *
 * EARTH_RADIUS_KM * cos(lat)` is the observer's eastward speed and
 * `eastComponent = -sin(azimuth) * cos(altitude)` is the east component of
 * the unit line-of-sight vector (SunCalc's azimuth is radians from south,
 * positive toward west, so `-sin(azimuth)` is positive toward east).
 * Negative while the Moon is approaching (closing distance), positive
 * while it recedes -- the same sign convention `doppler.ts` uses for
 * satellite range rate, so a Doppler shift derived from this reads the
 * same way an operator already expects from the satellite tools.
 */
export function getMoonRangeRateKmS(
  at: Date,
  lat: number,
  lon: number,
  deltaSeconds = 60,
): number {
  const before = SunCalc.getMoonPosition(
    new Date(at.getTime() - deltaSeconds * 1000),
    lat,
    lon,
  ).distance;
  const after = SunCalc.getMoonPosition(
    new Date(at.getTime() + deltaSeconds * 1000),
    lat,
    lon,
  ).distance;
  const geocentricRateKmS = (after - before) / (2 * deltaSeconds);

  const { altitude, azimuth } = SunCalc.getMoonPosition(at, lat, lon);
  const observerSpeedKmS =
    EARTH_ROTATION_RAD_S * EARTH_RADIUS_KM * Math.cos(lat * DEG_TO_RAD);
  const lineOfSightEastComponent = -Math.sin(azimuth) * Math.cos(altitude);

  return geocentricRateKmS - observerSpeedKmS * lineOfSightEastComponent;
}

function phaseAt(date: Date): number {
  return SunCalc.getMoonIllumination(date).phase;
}

/** Smallest half-integer (n + 0.5) strictly greater than `u`. */
function nextHalfInteger(u: number): number {
  const n = Math.ceil(u - 0.5);
  let target = n + 0.5;
  if (target <= u) target += 1;
  return target;
}

/** Smallest integer strictly greater than `u`. */
function nextInteger(u: number): number {
  return Math.floor(u) + 1;
}

/**
 * Bisect within (loTime, hiTime) for the instant the unwrapped phase
 * (continued monotonically from `loRaw`/`loUnwrapped`) crosses `target`.
 */
function bisectCrossing(
  loTime: Date,
  loUnwrapped: number,
  loRaw: number,
  hiTime: Date,
  target: number,
): Date {
  let lo = loTime.getTime();
  let hi = hiTime.getTime();
  let loU = loUnwrapped;
  let loR = loRaw;

  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const midDate = new Date(mid);
    const midRaw = phaseAt(midDate);
    let delta = midRaw - loR;
    if (delta < -0.5) delta += 1;
    const midUnwrapped = loU + delta;

    if (midUnwrapped >= target) {
      hi = mid;
    } else {
      lo = mid;
      loU = midUnwrapped;
      loR = midRaw;
    }
  }

  return new Date(hi);
}

/**
 * Scan forward hourly (up to 31 days) from `start` for the next instant the
 * moon's phase reaches a full moon (unwrapped phase at a half-integer) or a
 * new moon (unwrapped phase at an integer), then refine to the minute.
 */
function findPhaseTarget(start: Date, kind: "full" | "new"): Date {
  let prevTime = start;
  let prevRaw = phaseAt(start);
  let prevUnwrapped = prevRaw;
  const target =
    kind === "full" ? nextHalfInteger(prevUnwrapped) : nextInteger(prevUnwrapped);

  for (let h = 1; h <= MAX_SEARCH_HOURS; h++) {
    const time = new Date(start.getTime() + h * HOUR_MS);
    const raw = phaseAt(time);
    let delta = raw - prevRaw;
    if (delta < -0.5) delta += 1;
    const unwrapped = prevUnwrapped + delta;

    if (unwrapped >= target) {
      return bisectCrossing(prevTime, prevUnwrapped, prevRaw, time, target);
    }

    prevTime = time;
    prevRaw = raw;
    prevUnwrapped = unwrapped;
  }

  // Should be unreachable (a lunar month is ~29.5 days), but return the
  // closest sample found rather than throwing.
  return prevTime;
}

/**
 * Calculate the live lunar values needed by frequently refreshing surfaces.
 * This deliberately excludes the forward phase-event search performed by
 * getMoonSnapshot so map clocks can update without scanning the next month.
 */
export function getMoonConditions(
  at: Date,
  lat: number,
  lon: number,
  timeZone?: string,
): MoonConditions {
  const illumination = SunCalc.getMoonIllumination(at);
  const phaseName = getPhaseName(illumination.phase);

  const moonTimes = getMoonTimesForZone(at, lat, lon, timeZone);
  const rise =
    moonTimes.rise && !Number.isNaN(moonTimes.rise.getTime())
      ? moonTimes.rise
      : null;
  const set =
    moonTimes.set && !Number.isNaN(moonTimes.set.getTime())
      ? moonTimes.set
      : null;

  const position = SunCalc.getMoonPosition(at, lat, lon);
  // suncalc's azimuth is radians from south, westward; convert to compass
  // degrees clockwise from north.
  const azimuth = normalizeAngle(position.azimuth * RAD_TO_DEG + 180);

  return {
    phase: illumination.phase,
    illumination: illumination.fraction,
    phaseName,
    emoji: PHASE_EMOJI[phaseName],
    rise,
    set,
    altitude: position.altitude * RAD_TO_DEG,
    azimuth,
    // Geocentric, per SunCalc -- it does not vary with lat/lon. See the
    // module docblock and getMoonRangeRateKmS for why the range *rate*
    // still needs a topocentric (rotation) correction even though this
    // value doesn't.
    distanceKm: position.distance,
  };
}

export function getMoonSnapshot(at: Date, lat: number, lon: number): MoonSnapshot {
  return {
    ...getMoonConditions(at, lat, lon),
    nextFullMoon: findPhaseTarget(at, "full"),
    nextNewMoon: findPhaseTarget(at, "new"),
  };
}
