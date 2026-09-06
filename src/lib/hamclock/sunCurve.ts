/**
 * Sun curve: hourly elevation and azimuth samples, the three twilight
 * windows, the day-length trend and polar day/night detection, all for the
 * Sun report (wall spec section 26.8). Everything here is computed with
 * SunCalc, the same library `SunMoonReport.tsx` and `greyline.ts` already use
 * for sunrise, sunset and the grey-line window, so nothing this module
 * produces can disagree with the rest of the wall.
 */

import SunCalc from "suncalc";

const RAD_TO_DEG = 180 / Math.PI;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One hourly sample of the sun's position, 0-23 UTC on the reference day. */
export interface SunCurvePoint {
  hour: number;
  at: Date;
  /** Degrees above the horizon; negative is below. */
  elevationDeg: number;
  /** Compass bearing, degrees clockwise from north. */
  azimuthDeg: number;
}

export type TwilightPhase = "civil" | "nautical" | "astronomical";

/**
 * The full span, morning boundary to evening boundary, during which the sun
 * sits above the phase's altitude threshold (civil -6°, nautical -12°,
 * astronomical -18°). Each window nests inside the next: civil is the
 * narrowest (closest to sunrise/sunset), astronomical the widest — the
 * report layers them in that order to draw three visibly distinct bands.
 */
export interface TwilightWindow {
  phase: TwilightPhase;
  start: Date | null;
  end: Date | null;
}

export interface SunDayState {
  /** The sun never sets today at this latitude. */
  polarDay: boolean;
  /** The sun never rises today at this latitude. */
  polarNight: boolean;
  /** The next date this polar state ends, or null if none was found within
   * the search horizon (only reachable at latitudes far outside the polar
   * circles, which never enter a polar state to begin with). */
  nextTransition: Date | null;
}

export interface SunCurve {
  points: SunCurvePoint[];
  rise: Date | null;
  set: Date | null;
  noon: Date | null;
  dayLengthMin: number | null;
  /** Signed minutes versus yesterday's day length; null when either day
   * lacks a length (polar day or night on either side). */
  dayLengthDeltaMin: number | null;
  twilights: TwilightWindow[];
  dayState: SunDayState;
}

/** How many days forward to search for a polar day/night to end. A bit over
 * half a year guarantees a season change if one exists at this latitude. */
const POLAR_SEARCH_DAYS = 190;

function validDate(value: Date | undefined): Date | null {
  return value && !Number.isNaN(value.getTime()) ? value : null;
}

function dayLengthMinutes(rise: Date | null, set: Date | null): number | null {
  if (!rise || !set) return null;
  const minutes = (set.getTime() - rise.getTime()) / 60_000;
  return minutes > 0 ? minutes : null;
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Sample the sun's elevation and azimuth once per UTC hour across the day
 * containing `date`, alongside rise/set/noon, the three twilight windows and
 * the day-length delta versus yesterday. Polar day and night are detected
 * from the absence of a rise or set combined with the sign of the sun's
 * altitude, and `nextTransition` walks forward a day at a time (capped at
 * `POLAR_SEARCH_DAYS`) to find when a rise or set returns.
 */
export function getSunCurve(lat: number, lon: number, date: Date): SunCurve {
  const dayStart = utcMidnight(date);

  const points: SunCurvePoint[] = Array.from({ length: 24 }, (_, hour) => {
    const at = new Date(dayStart.getTime() + hour * 60 * 60 * 1000);
    const position = SunCalc.getPosition(at, lat, lon);
    return {
      hour,
      at,
      elevationDeg: position.altitude * RAD_TO_DEG,
      // suncalc's azimuth is radians from south, westward; convert to
      // compass bearing the same way `moon.ts` does for the moon.
      azimuthDeg: (((position.azimuth * RAD_TO_DEG + 180) % 360) + 360) % 360,
    };
  });

  const today = SunCalc.getTimes(date, lat, lon);
  const yesterday = SunCalc.getTimes(
    new Date(date.getTime() - DAY_MS),
    lat,
    lon,
  );

  const rise = validDate(today.sunrise);
  const set = validDate(today.sunset);
  const noon = validDate(today.solarNoon);

  const dayLengthMin = dayLengthMinutes(rise, set);
  const yesterdayLengthMin = dayLengthMinutes(
    validDate(yesterday.sunrise),
    validDate(yesterday.sunset),
  );
  const dayLengthDeltaMin =
    dayLengthMin !== null && yesterdayLengthMin !== null
      ? dayLengthMin - yesterdayLengthMin
      : null;

  const twilights: TwilightWindow[] = [
    {
      phase: "civil",
      start: validDate(today.dawn),
      end: validDate(today.dusk),
    },
    {
      phase: "nautical",
      start: validDate(today.nauticalDawn),
      end: validDate(today.nauticalDusk),
    },
    {
      phase: "astronomical",
      start: validDate(today.nightEnd),
      end: validDate(today.night),
    },
  ];

  const polar = rise === null && set === null;
  const noonAltitude = SunCalc.getPosition(
    noon ?? new Date(dayStart.getTime() + 12 * 60 * 60 * 1000),
    lat,
    lon,
  ).altitude;
  const polarDay = polar && noonAltitude > 0;
  const polarNight = polar && !polarDay;

  let nextTransition: Date | null = null;
  if (polar) {
    for (let i = 1; i <= POLAR_SEARCH_DAYS; i++) {
      const probe = new Date(dayStart.getTime() + i * DAY_MS);
      const probeTimes = SunCalc.getTimes(probe, lat, lon);
      if (validDate(probeTimes.sunrise) || validDate(probeTimes.sunset)) {
        nextTransition = probe;
        break;
      }
    }
  }

  return {
    points,
    rise,
    set,
    noon,
    dayLengthMin,
    dayLengthDeltaMin,
    twilights,
    dayState: { polarDay, polarNight, nextTransition },
  };
}

export interface NextSunEvent {
  type: "sunrise" | "sunset";
  at: Date;
}

/**
 * The next sunrise or sunset at this location after `now`, checked across
 * today and tomorrow so a call made late in the UTC day still finds one.
 * Shared by `SunTile.tsx` and `SunReport.tsx` so the tile's countdown and the
 * report's hero can never name a different next event.
 */
export function getNextSunEvent(
  lat: number,
  lon: number,
  now: Date,
): NextSunEvent | null {
  const today = SunCalc.getTimes(now, lat, lon);
  const tomorrow = SunCalc.getTimes(new Date(now.getTime() + DAY_MS), lat, lon);
  const candidates = (
    [
      { type: "sunrise" as const, at: validDate(today.sunrise) },
      { type: "sunset" as const, at: validDate(today.sunset) },
      { type: "sunrise" as const, at: validDate(tomorrow.sunrise) },
      { type: "sunset" as const, at: validDate(tomorrow.sunset) },
    ] as { type: "sunrise" | "sunset"; at: Date | null }[]
  ).filter(
    (event): event is NextSunEvent =>
      event.at !== null && event.at.getTime() > now.getTime(),
  );
  return candidates.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;
}
