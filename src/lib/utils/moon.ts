/**
 * Moon Ephemeris
 *
 * Wraps suncalc's moon calculations into a single snapshot: phase, phase
 * name/emoji, rise/set, topocentric position, distance, and the next full
 * and new moon instants (found by hourly scan + bisection to the minute).
 */

import SunCalc from "suncalc";

const RAD_TO_DEG = 180 / Math.PI;
const HOUR_MS = 3_600_000;
const MAX_SEARCH_HOURS = 31 * 24;
const BISECTION_ITERATIONS = 12; // 1h / 2^12 ~= 0.88s, well under a minute

export interface MoonSnapshot {
  phase: number;
  illumination: number;
  phaseName: string;
  emoji: string;
  rise: Date | null;
  set: Date | null;
  altitude: number;
  azimuth: number;
  distanceKm: number;
  nextFullMoon: Date;
  nextNewMoon: Date;
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

export function getMoonSnapshot(at: Date, lat: number, lon: number): MoonSnapshot {
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
    nextFullMoon: findPhaseTarget(at, "full"),
    nextNewMoon: findPhaseTarget(at, "new"),
  };
}
