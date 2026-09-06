/**
 * Earth-Moon-Earth (EME) link budget
 *
 * The numbers an EME operator actually plans a night around: two-way path
 * loss and its degradation against the best possible night (perigee), the
 * Moon's declination and the high/low word that goes with it, sky-noise
 * temperature from the Moon's galactic latitude (including the
 * galactic-plane penalty), self-echo Doppler shift, and the mutual moon-up
 * window between the QTH and a DX target (wall spec section 26.10). This is
 * a simplified link-budget model, not the full bistatic radar equation -- it
 * does not need the Moon's physical cross-section, only the geocentric
 * distance `src/lib/utils/moon.ts` already computes (the two-way path is
 * over twice that distance, out and back). Satellite Doppler (`doppler.ts`)
 * is a different geometry (a repeating transponder, not a single
 * reflection) and is not reused here.
 */

import SunCalc from "suncalc";

/** Speed of light, m/s and km/s. */
const C_M_S = 299_792_458;
const C_KM_S = C_M_S / 1000;

/** The three EME bands the wall's segmented control offers. */
export type EmeBand = "2m" | "70cm" | "23cm";

export const EME_BANDS: readonly EmeBand[] = ["2m", "70cm", "23cm"];

/** Nominal EME calling-frequency per band, MHz. */
export const EME_BAND_FREQUENCY_MHZ: Record<EmeBand, number> = {
  "2m": 144,
  "70cm": 432,
  "23cm": 1296,
};

/**
 * Nominal lunar perigee and apogee distance, km -- the closest and farthest
 * the Moon gets across its ~27.5-day anomalistic month. `degradationDb`
 * measures every night against the perigee value, the best case an EME
 * operator can plan for.
 */
export const MOON_PERIGEE_KM = 356_500;
export const MOON_APOGEE_KM = 406_700;

/**
 * Fraction of incident power the Moon's regolith reflects back toward
 * Earth, averaged across the visible disc -- the commonly cited ~7% lunar
 * reflection efficiency EME link budgets use in place of a perfect mirror.
 */
const MOON_REFLECTION_EFFICIENCY = 0.07;
/** -10*log10(0.07) ≈ 11.5 dB of loss the reflection costs on top of free
 * space, matching the wall spec's cited "~7% / -11.6 dB" approximation. */
const REFLECTION_LOSS_DB = -10 * Math.log10(MOON_REFLECTION_EFFICIENCY);

/** One-way free-space path loss (dB), 20*log10(4*pi*d*f/c). */
function freeSpaceLossDb(distanceKm: number, frequencyMHz: number): number {
  const distanceM = distanceKm * 1000;
  const frequencyHz = frequencyMHz * 1_000_000;
  return 20 * Math.log10((4 * Math.PI * distanceM * frequencyHz) / C_M_S);
}

/**
 * Two-way Earth-Moon-Earth path loss (dB) at `band` from the Earth-Moon
 * range (geocentric, per `moon.ts`'s `distanceKm` -- see that module's
 * docblock for why the sub-0.2 dB parallax correction isn't worth making):
 * free-space loss over twice the range (out to the Moon and back) plus the
 * loss the Moon's own reflection efficiency costs. Always positive; larger
 * is worse.
 */
export function pathLossDb(rangeKm: number, band: EmeBand): number {
  return (
    freeSpaceLossDb(2 * rangeKm, EME_BAND_FREQUENCY_MHZ[band]) +
    REFLECTION_LOSS_DB
  );
}

/**
 * Signal degradation (dB) against the best possible night -- the Moon at
 * perigee -- at `band`. Zero at perigee, most negative at apogee.
 * Frequency-independent by construction: the band's own path loss cancels
 * out of the difference, so a lower band is not shown as "less degraded"
 * than a higher one just because its absolute path loss is smaller.
 */
export function degradationDb(rangeKm: number, band: EmeBand): number {
  return pathLossDb(MOON_PERIGEE_KM, band) - pathLossDb(rangeKm, band);
}

/** Declination magnitude at or above which the wall calls the Moon's
 * declination "HIGH": it stays up long enough per pass, and widens the
 * window during which two stations at different latitudes both see it. */
const HIGH_DECLINATION_THRESHOLD_DEG = 15;

/** "HIGH" or "LOW" for the Moon's current declination (wall spec 26.10). */
export function declinationWord(declinationDeg: number): "HIGH" | "LOW" {
  return Math.abs(declinationDeg) >= HIGH_DECLINATION_THRESHOLD_DEG
    ? "HIGH"
    : "LOW";
}

/**
 * Galactic latitude magnitude at or below which the Moon is treated as
 * sitting near the galactic plane for the sky-noise model -- close enough
 * that galactic synchrotron noise dominates the cold-sky baseline.
 */
const GALACTIC_PLANE_LATITUDE_THRESHOLD_DEG = 10;

/** Whether the Moon's galactic latitude places it near the galactic plane. */
export function isNearGalacticPlane(galacticLatitudeDeg: number): boolean {
  return (
    Math.abs(galacticLatitudeDeg) <= GALACTIC_PLANE_LATITUDE_THRESHOLD_DEG
  );
}

/**
 * Cold-sky (away from the galactic plane) galactic noise temperature by
 * band, K. Falls sharply with frequency -- galactic synchrotron noise
 * scales roughly as f^-2.5 above ~20 MHz -- which is why 2 m EME lives or
 * dies by sky noise while 23 cm barely notices it.
 */
const COLD_SKY_TEMP_K: Record<EmeBand, number> = {
  "2m": 120,
  "70cm": 30,
  "23cm": 8,
};

/** Multiplier applied to the cold-sky baseline when the Moon sits near the
 * galactic plane, largest at 2 m where galactic synchrotron noise
 * dominates the receiver's noise floor. */
const GALACTIC_PLANE_MULTIPLIER: Record<EmeBand, number> = {
  "2m": 6,
  "70cm": 3,
  "23cm": 1.5,
};

/** Sky-noise temperature (K) at `band` for a Moon at `galacticLatitudeDeg`. */
export function skyNoiseTempK(
  galacticLatitudeDeg: number,
  band: EmeBand,
): number {
  const base = COLD_SKY_TEMP_K[band];
  return isNearGalacticPlane(galacticLatitudeDeg)
    ? base * GALACTIC_PLANE_MULTIPLIER[band]
    : base;
}

/** "COLD SKY" or "GALACTIC PLANE" for the Moon's current galactic latitude. */
export function skyNoiseWord(
  galacticLatitudeDeg: number,
): "COLD SKY" | "GALACTIC PLANE" {
  return isNearGalacticPlane(galacticLatitudeDeg)
    ? "GALACTIC PLANE"
    : "COLD SKY";
}

/**
 * Self-echo Doppler shift (Hz) at `band` from the topocentric range rate
 * (km/s, negative while approaching). The signal reflects off the Moon and
 * returns to the same station, so the range rate's effect on path length is
 * doubled relative to a one-way link -- compressed on the way out,
 * compressed again on the way back -- unlike a satellite transponder, which
 * only shifts a signal once per hop (`doppler.ts`). Positive while
 * approaching (range rate negative), negative while receding.
 */
export function dopplerShiftHz(rangeRateKmS: number, band: EmeBand): number {
  const frequencyHz = EME_BAND_FREQUENCY_MHZ[band] * 1_000_000;
  return -2 * frequencyHz * (rangeRateKmS / C_KM_S);
}

interface UpInterval {
  start: Date;
  end: Date;
}

function moonAltitudeDeg(at: Date, lat: number, lon: number): number {
  return SunCalc.getMoonPosition(at, lat, lon).altitude * (180 / Math.PI);
}

/**
 * Every interval within `[from, from + windowHours]` during which the Moon
 * is above the horizon at `lat`/`lon`, found by sampling altitude every
 * `stepMinutes` and interpolating each rise/set crossing linearly between
 * the two straddling samples (the Moon's horizon rate is slow enough, well
 * under 1 deg/min, that this lands within a minute or two of the true
 * crossing). Handles the Moon already being up at `from` (an interval open
 * at the start) and still up at the end of the window (an interval open at
 * the end).
 */
function moonUpIntervals(
  lat: number,
  lon: number,
  from: Date,
  windowHours = 24,
  stepMinutes = 5,
): UpInterval[] {
  const stepMs = stepMinutes * 60_000;
  const endTime = from.getTime() + windowHours * 60 * 60_000;
  const intervals: UpInterval[] = [];

  let prevTime = from.getTime();
  let prevAlt = moonAltitudeDeg(new Date(prevTime), lat, lon);
  let openStart: number | null = prevAlt > 0 ? prevTime : null;

  for (let t = prevTime + stepMs; t <= endTime; t += stepMs) {
    const alt = moonAltitudeDeg(new Date(t), lat, lon);
    if (prevAlt <= 0 && alt > 0) {
      const frac = -prevAlt / (alt - prevAlt);
      openStart = prevTime + frac * (t - prevTime);
    } else if (prevAlt > 0 && alt <= 0 && openStart !== null) {
      const frac = prevAlt / (prevAlt - alt);
      intervals.push({
        start: new Date(openStart),
        end: new Date(prevTime + frac * (t - prevTime)),
      });
      openStart = null;
    }
    prevTime = t;
    prevAlt = alt;
  }
  if (openStart !== null) {
    intervals.push({ start: new Date(openStart), end: new Date(endTime) });
  }
  return intervals;
}

/** A period when the Moon is above the horizon at both the QTH and the
 * target at once -- the window an EME QSO between the two is possible. */
export interface MutualEmeWindow {
  start: Date;
  end: Date;
  /** Whether `date` falls inside this window. */
  active: boolean;
}

/**
 * The nearest mutual moon-up window between two stations over the next 24 h:
 * the intersection of each station's own moon-up intervals. Returns the
 * window active right now if there is one, otherwise the next one to start;
 * `null` when the two stations' moon-up windows do not overlap at all in
 * the next 24 h (e.g. a Moon declination and pair of latitudes that put one
 * station's moonrise squarely inside the other's moonset-to-moonrise gap).
 */
export function getMutualMoonWindow(
  qthLat: number,
  qthLon: number,
  targetLat: number,
  targetLon: number,
  date: Date,
): MutualEmeWindow | null {
  const qthWindows = moonUpIntervals(qthLat, qthLon, date);
  const targetWindows = moonUpIntervals(targetLat, targetLon, date);
  const now = date.getTime();

  const overlaps: MutualEmeWindow[] = [];
  for (const a of qthWindows) {
    for (const b of targetWindows) {
      const start = Math.max(a.start.getTime(), b.start.getTime());
      const end = Math.min(a.end.getTime(), b.end.getTime());
      if (start < end) {
        overlaps.push({
          start: new Date(start),
          end: new Date(end),
          active: now >= start && now < end,
        });
      }
    }
  }
  if (overlaps.length === 0) return null;

  const active = overlaps.find((overlap) => overlap.active);
  if (active) return active;

  const upcoming = overlaps
    .filter((overlap) => overlap.start.getTime() >= now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming[0] ?? null;
}
