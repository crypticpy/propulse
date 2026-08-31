/**
 * Moon Ephemeris
 *
 * Wraps suncalc's moon calculations into a single snapshot: phase, phase
 * name/emoji, rise/set, topocentric position, distance, and the next full
 * and new moon instants (found by hourly scan + bisection to the minute).
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

export interface MoonConditions {
  phase: number;
  illumination: number;
  phaseName: string;
  emoji: string;
  rise: Date | null;
  set: Date | null;
  altitude: number;
  azimuth: number;
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

/**
 * Return the geocentric point on Earth directly beneath the Moon.
 *
 * The low-order lunar longitude/latitude terms intentionally match SunCalc's
 * moon-position model, which the rest of this module uses. Keeping the same
 * model means the marker and the pane cannot disagree about where the Moon is;
 * at the returned coordinate SunCalc reports an altitude of approximately 90°.
 */
export function getSublunarPoint(at: Date): SublunarPoint {
  const julianDate = at.getTime() / DAY_MS - 0.5 + JULIAN_1970;
  const daysSinceJ2000 = julianDate - JULIAN_2000;

  const meanLongitude =
    (218.316 + 13.176396 * daysSinceJ2000) * DEG_TO_RAD;
  const meanAnomaly = (134.963 + 13.064993 * daysSinceJ2000) * DEG_TO_RAD;
  const meanDistance = (93.272 + 13.22935 * daysSinceJ2000) * DEG_TO_RAD;
  const eclipticLongitude =
    meanLongitude + 6.289 * DEG_TO_RAD * Math.sin(meanAnomaly);
  const eclipticLatitude = 5.128 * DEG_TO_RAD * Math.sin(meanDistance);

  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(EARTH_OBLIQUITY) -
      Math.tan(eclipticLatitude) * Math.sin(EARTH_OBLIQUITY),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(
    Math.sin(eclipticLatitude) * Math.cos(EARTH_OBLIQUITY) +
      Math.cos(eclipticLatitude) *
        Math.sin(EARTH_OBLIQUITY) *
        Math.sin(eclipticLongitude),
  );
  const greenwichSiderealTime =
    (280.16 + 360.9856235 * daysSinceJ2000) * DEG_TO_RAD;

  return {
    lat: declination * RAD_TO_DEG,
    lon: normalizeLongitude(
      (rightAscension - greenwichSiderealTime) * RAD_TO_DEG,
    ),
  };
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
): MoonConditions {
  const illumination = SunCalc.getMoonIllumination(at);
  const phaseName = getPhaseName(illumination.phase);

  const moonTimes = SunCalc.getMoonTimes(at, lat, lon);
  const rise =
    moonTimes.rise instanceof Date && !Number.isNaN(moonTimes.rise.getTime())
      ? moonTimes.rise
      : null;
  const set =
    moonTimes.set instanceof Date && !Number.isNaN(moonTimes.set.getTime())
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
