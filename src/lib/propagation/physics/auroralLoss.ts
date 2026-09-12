/**
 * Lh, the auroral and other signal losses of ITU-R P.533-14 Table 2
 * (PROP-08, #954 slice C).
 *
 * Section 5.2.2 defines the term under equation (18), in full:
 *
 *     "Lh: factor to allow for auroral and other signal losses, given in
 *      Table 2. Each value is evaluated in terms of the geomagnetic latitude
 *      Gn (N or S of equator) and local time t for an Earth-centred dipole
 *      with pole at 78.5 degrees N, 68.2 degrees W: mean values for the
 *      control points of Table 1d) are taken.
 *      In the Northern Hemisphere, winter is taken as December-February,
 *      equinox as March-May and September-November and summer as June-August.
 *      In the Southern Hemisphere, the months for winter and summer are
 *      interchanged.
 *      For Gn < 42.5 degrees, Lh = 0 dB"
 *
 * Table 2 itself is two parts, "a) Transmission ranges less than or equal to
 * 2 500 km" and "b) Transmission ranges greater than 2 500 km", each three
 * seasonal blocks of eight geomagnetic-latitude rows by eight mid-path
 * local-time columns. The 384 values are transcribed in
 * `assets/p533-table2-lh.json` with their provenance; this module is the rules
 * that index them.
 *
 * SO THERE ARE FIVE INDEPENDENT LOOKUPS AND EVERY ONE OF THEM IS A PLACE TO BE
 * WRONG, which is why each is its own exported function with its own test:
 * the distance regime, the season, the mid-path local-time band, the
 * geomagnetic-latitude band, and the mean over the Table 1d control points.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not choose the control points: Table
 * 1d is `controlPoints.ts` and the caller passes the points it returned. It
 * does not compute a local time from a route either; `midPathLocalTimeHours`
 * converts one UTC hour and one longitude and the caller says which longitude.
 *
 * UNITS. Lh is a loss in decibels, a positive number or zero. Latitudes and
 * longitudes are degrees, east and north positive. The local time is hours in
 * [0, 24), a real number rather than an integer; see deviation 2.
 *
 * DEVIATIONS. Numbered, each with the published text and what the pinned ITU
 * reference build cd172be5 does instead.
 *
 *  1. WHAT "TRANSMISSION RANGE" MEANS. THE TEXT names the two parts of Table 2
 *     "Transmission ranges less than or equal to 2 500 km" and "greater than
 *     2 500 km" and defines the phrase nowhere in the recommendation. Two
 *     readings are available: the ground distance D of the circuit, or the hop
 *     length d = D/n of the mode Lh is being computed for. THE REFERENCE reads
 *     it as the hop length: `FindLh(CP, dh, mpltime, month)` is called with
 *     `dh = path->distance/(n+1.0)` and indexes `txrange` on `dh <= 2500.0`.
 *     WE FOLLOW THE REFERENCE HERE, and this is the one place in this slice
 *     where we do, because the recommendation does not settle it and the
 *     reference is an independent implementation by the authors of the
 *     recommendation. The reading is recorded in the result as
 *     `distanceRegime` and the caller names the distance it passed, so a
 *     consumer can see which table half was read. The alternative is not
 *     hypothetical: on a 3000 km path the 1F2 mode has a 3000 km hop and reads
 *     part b) under either reading, while the 2F2 mode has a 1500 km hop and
 *     reads part a) under ours and part b) under the other. The two halves of
 *     Table 2 differ by as much as 13.7 dB, at 67.5 to 72.5 degrees, 07 to 10
 *     local time, equinox, where part a) is 21.4 dB and part b) is 7.7 dB, so
 *     this is a real choice and not a rounding.
 *  2. WHAT THE MID-PATH LOCAL TIME IS. THE TEXT gives the table the column
 *     heading "Mid-path local time, t" and its bands as half-open intervals on
 *     t ("01 <= t < 04"), with no statement that t is an integer and no
 *     equation-of-time correction (section 5.2.2 mentions the equation of time
 *     only for the solar zenith angle of equation (20)). We therefore take t as
 *     the local mean time, `UTC + longitude/15` hours wrapped into [0, 24), a
 *     real number, and band it on the published intervals directly.
 *     THE REFERENCE computes `tz = (int)(lng/(15.0*D2R))` and
 *     `mpltime = (int)fmod(path->CP[MP].ltime + tz, 24)` where
 *     `CalculateCPParameters.c` line 649 sets `here->ltime = hour`, the UTC
 *     hour. That is three separate truncations: the time zone is truncated
 *     toward zero rather than rounded (so a control point at 70 degrees W gets
 *     -4 where its local mean time is -4.67 hours), the sum is truncated to an
 *     integer hour, and `fmod` of a negative sum stays negative, which its
 *     band ladder catches in the final `(22 <= hour) || (hour < 1)` branch and
 *     reads as the 22-to-01 band whatever the real local time was. The
 *     consequence is a band boundary that can sit up to an hour away from the
 *     text's, which moves Lh by one table cell where it matters.
 *  3. WHICH HEMISPHERE SELECTS THE SEASON. THE TEXT says "In the Northern
 *     Hemisphere, winter is taken as December-February ... In the Southern
 *     Hemisphere, the months for winter and summer are interchanged" without
 *     saying whose hemisphere, in a paragraph whose subject is the value at a
 *     control point. We read it as the hemisphere OF THE CONTROL POINT the
 *     value is being evaluated at, so a circuit crossing the equator can read
 *     a winter cell at one end and a summer cell at the other. THE REFERENCE
 *     agrees: `WhatSeasonforLh(CP.L, month)` takes the control point's own
 *     latitude, with the equator counted as northern. This is a reading rather
 *     than a deviation, and it is numbered because a reader checking this
 *     module against the text will otherwise have to rediscover that the
 *     alternative (the path mid-point's hemisphere for every point, which is
 *     what `operationalMuf.ts` does for the P.1240 season) was considered.
 */

import type { GeodeticPoint } from "@/lib/propagation/geometry/route";

import table from "./assets/p533-table2-lh.json";

/**
 * SHA-256 of `assets/p533-table2-lh.json` as committed.
 *
 * `auroralLoss.test.ts` recomputes it from the file, so an edit to a
 * transcribed value that does not also edit this constant fails the suite.
 * That is the whole mechanism: the table is 384 hand-transcribed numbers and
 * nothing else in the tree would notice one of them changing.
 */
export const TABLE_2_SHA256 =
  "391fb332660273c0ff726745590cc8a48601632b68c89d692dd99b7ba34de060";

/** The Earth-centred dipole pole Table 2's geomagnetic latitude is taken about. */
export const GEOMAGNETIC_POLE_LATITUDE_DEG = 78.5;
export const GEOMAGNETIC_POLE_LONGITUDE_DEG = -68.2;

/** "For Gn < 42.5 degrees, Lh = 0 dB". */
export const AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG = 42.5;

/** The boundary between the two parts of Table 2, km. See deviation 1. */
export const AURORAL_RANGE_BOUNDARY_KM = 2500;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const HOURS_PER_DEGREE = 1 / 15;

/** Which part of Table 2 a mode reads. */
export type AuroralDistanceRegime = "le_2500_km" | "gt_2500_km";

/** Table 2's three seasonal blocks. */
export type AuroralSeason = "winter" | "equinox" | "summer";

/**
 * Geomagnetic latitude Gn about the Earth-centred dipole at 78.5 N, 68.2 W,
 * degrees, signed north positive.
 *
 * `sin(Gn) = sin(lat) sin(latP) + cos(lat) cos(latP) cos(lng - lngP)`, the
 * dipole latitude of a point. Table 2 is indexed on |Gn|, which is what "the
 * geomagnetic latitude Gn (N or S of equator)" says, and `lhLatitudeBandIndex`
 * takes the magnitude; the signed value is returned because a report that
 * shows an auroral loss should be able to say which auroral zone caused it.
 */
export function geomagneticLatitudeDeg(
  latitudeDeg: number,
  longitudeDeg: number,
): number {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
    throw new RangeError(
      `latitudeDeg and longitudeDeg must be finite, received ` +
        `${String(latitudeDeg)}, ${String(longitudeDeg)}.`,
    );
  }
  const lat = latitudeDeg * DEG_TO_RAD;
  const poleLat = GEOMAGNETIC_POLE_LATITUDE_DEG * DEG_TO_RAD;
  const deltaLng = (longitudeDeg - GEOMAGNETIC_POLE_LONGITUDE_DEG) * DEG_TO_RAD;
  const sinGn =
    Math.sin(lat) * Math.sin(poleLat) +
    Math.cos(lat) * Math.cos(poleLat) * Math.cos(deltaLng);
  // asin of a value a rounding step outside [-1, 1] is NaN, and a NaN
  // geomagnetic latitude silently reads the equatorial band. The clamp is on
  // the unit circle, not on the physics.
  return Math.asin(Math.min(1, Math.max(-1, sinGn))) * RAD_TO_DEG;
}

/**
 * The local mean time at a longitude, hours in [0, 24).
 *
 * `UTC + longitude/15`, wrapped. See deviation 2 for why it is a real number
 * and for the three truncations the reference applies to the same quantity.
 */
export function midPathLocalTimeHours(
  utcHours: number,
  longitudeDeg: number,
): number {
  if (!Number.isFinite(utcHours) || !Number.isFinite(longitudeDeg)) {
    throw new RangeError(
      `utcHours and longitudeDeg must be finite, received ` +
        `${String(utcHours)}, ${String(longitudeDeg)}.`,
    );
  }
  const local = utcHours + longitudeDeg * HOURS_PER_DEGREE;
  return ((local % 24) + 24) % 24;
}

/**
 * Table 2's season at one point, for one calendar month.
 *
 * "In the Northern Hemisphere, winter is taken as December-February, equinox
 * as March-May and September-November and summer as June-August. In the
 * Southern Hemisphere, the months for winter and summer are interchanged."
 * The equator is read as northern, which is the reference's reading of a text
 * that does not say; on the equator Gn is about 12 degrees and Lh is zero
 * there under the 42.5 degree floor, so the choice has no effect on any value
 * this module can return. See deviation 3 for whose hemisphere it is.
 */
export function lhSeason(latitudeDeg: number, month: number): AuroralSeason {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(
      `month must be an integer 1..12, received ${String(month)}.`,
    );
  }
  if (!Number.isFinite(latitudeDeg)) {
    throw new RangeError(
      `latitudeDeg must be finite, received ${String(latitudeDeg)}.`,
    );
  }
  const northern: AuroralSeason =
    month === 12 || month === 1 || month === 2
      ? "winter"
      : month >= 6 && month <= 8
        ? "summer"
        : "equinox";
  if (latitudeDeg >= 0 || northern === "equinox") return northern;
  return northern === "winter" ? "summer" : "winter";
}

/**
 * Column index of Table 2 for a mid-path local time, 0 to 7.
 *
 * The published bands are 01-04, 04-07, 07-10, 10-13, 13-16, 16-19, 19-22 and
 * 22-01, each half-open on the left. The last wraps midnight, so a time under
 * 01 belongs to it.
 */
export function lhTimeBandIndex(localTimeHours: number): number {
  if (!Number.isFinite(localTimeHours)) {
    throw new RangeError(
      `localTimeHours must be finite, received ${String(localTimeHours)}.`,
    );
  }
  const t = ((localTimeHours % 24) + 24) % 24;
  if (t < 1) return 7;
  const index = Math.floor((t - 1) / 3);
  // t is under 24 and at least 1, so the floor is 0..7 and the last band is
  // 22 <= t < 25 in the asset, which is 22 <= t < 24 here plus the t < 1 wrap.
  return Math.min(index, 7);
}

/**
 * Row index of Table 2 for a geomagnetic latitude, 0 to 7, or `null` below
 * 42.5 degrees where "Lh = 0 dB".
 *
 * Row 0 is "77.5 <= Gn" and has no upper bound; every other row is
 * `from <= |Gn| < to` in 5 degree steps down to 42.5.
 */
export function lhLatitudeBandIndex(
  geomagneticLatitudeDeg: number,
): number | null {
  if (!Number.isFinite(geomagneticLatitudeDeg)) {
    throw new RangeError(
      `geomagneticLatitudeDeg must be finite, received ` +
        `${String(geomagneticLatitudeDeg)}.`,
    );
  }
  const gn = Math.abs(geomagneticLatitudeDeg);
  if (gn < AURORAL_MIN_GEOMAGNETIC_LATITUDE_DEG) return null;
  if (gn >= 77.5) return 0;
  // Row k covers `77.5 - 5k <= |Gn| < 77.5 - 5(k - 1)`, so the distance below
  // 77.5 falls in `(5(k-1), 5k]` and the index is that distance rounded up. It
  // is a ceiling and not a floor because the bands are closed at the bottom:
  // exactly 72.5 degrees is row 1, not row 2. Every band edge is a half
  // degree and every difference a whole multiple of 5, so the division is
  // exact in binary and the ceiling does not slip at an edge;
  // `auroralLoss.test.ts` sweeps it against the band table in the asset.
  return Math.ceil((77.5 - gn) / 5);
}

/** Which part of Table 2 a transmission range reads. See deviation 1. */
export function lhDistanceRegime(
  transmissionRangeKm: number,
): AuroralDistanceRegime {
  if (!Number.isFinite(transmissionRangeKm) || transmissionRangeKm <= 0) {
    throw new RangeError(
      `transmissionRangeKm must be positive and finite, received ` +
        `${String(transmissionRangeKm)}.`,
    );
  }
  return transmissionRangeKm <= AURORAL_RANGE_BOUNDARY_KM
    ? "le_2500_km"
    : "gt_2500_km";
}

export interface AuroralLossPointInputs {
  readonly point: GeodeticPoint;
  /** Calendar month, 1 to 12. */
  readonly month: number;
  /** t, the MID-PATH local time, hours. The same value at every point. */
  readonly midPathLocalTimeHours: number;
  readonly transmissionRangeKm: number;
}

export interface AuroralLossAtPoint {
  readonly lossDb: number;
  readonly geomagneticLatitudeDeg: number;
  readonly season: AuroralSeason;
  readonly distanceRegime: AuroralDistanceRegime;
  readonly timeBandIndex: number;
  /** `null` below 42.5 degrees, where the recommendation states Lh = 0 dB. */
  readonly latitudeBandIndex: number | null;
}

/** Lh at one control point, dB. Zero below 42.5 degrees geomagnetic. */
export function auroralLossAtPoint(
  inputs: AuroralLossPointInputs,
): AuroralLossAtPoint {
  const {
    point,
    month,
    midPathLocalTimeHours: t,
    transmissionRangeKm,
  } = inputs;
  const gn = geomagneticLatitudeDeg(point.latitudeDeg, point.longitudeDeg);
  const season = lhSeason(point.latitudeDeg, month);
  const distanceRegime = lhDistanceRegime(transmissionRangeKm);
  const timeBandIndex = lhTimeBandIndex(t);
  const latitudeBandIndex = lhLatitudeBandIndex(gn);
  const lossDb =
    latitudeBandIndex === null
      ? 0
      : table.lh[distanceRegime][season][latitudeBandIndex][timeBandIndex];
  return {
    lossDb,
    geomagneticLatitudeDeg: gn,
    season,
    distanceRegime,
    timeBandIndex,
    latitudeBandIndex,
  };
}

/** One Table 1d control point, with the label a report shows it under. */
export interface AuroralLossPoint {
  readonly label: string;
  readonly point: GeodeticPoint;
}

export interface AuroralLossInputs {
  /**
   * The Table 1d control points of this mode, from `selectControlPoints` with
   * purpose `absorption`. At least one; the mean is over exactly these.
   */
  readonly points: readonly AuroralLossPoint[];
  /** Calendar month, 1 to 12. */
  readonly month: number;
  readonly midPathLocalTimeHours: number;
  /** See deviation 1: the mode's hop length d = D/n. */
  readonly transmissionRangeKm: number;
}

export interface AuroralLoss {
  /** Lh, dB: "mean values for the control points of Table 1d) are taken". */
  readonly lossDb: number;
  readonly perPoint: readonly (AuroralLossAtPoint & {
    readonly label: string;
  })[];
  readonly distanceRegime: AuroralDistanceRegime;
  readonly midPathLocalTimeHours: number;
  readonly timeBandIndex: number;
}

/**
 * Lh for one mode, dB: the mean of Table 2 over the Table 1d control points.
 *
 * A point below 42.5 degrees geomagnetic contributes a zero to the mean rather
 * than dropping out of it. That is what "mean values for the control points of
 * Table 1d) are taken" says with the "For Gn < 42.5 degrees, Lh = 0 dB" line
 * beside it, and it is what the reference does (`FindLh` returns 0.0 and the
 * caller divides by the full count), and it matters: a circuit with one end in
 * the auroral zone and the rest of it at mid-latitude gets a fraction of the
 * auroral loss, not all of it.
 */
export function auroralLoss(inputs: AuroralLossInputs): AuroralLoss {
  const {
    points,
    month,
    midPathLocalTimeHours: t,
    transmissionRangeKm,
  } = inputs;
  if (points.length === 0) {
    throw new RangeError(
      "Lh is the mean over the Table 1d control points, so at least one " +
        "control point is required.",
    );
  }
  const perPoint = points.map((site) => ({
    label: site.label,
    ...auroralLossAtPoint({
      point: site.point,
      month,
      midPathLocalTimeHours: t,
      transmissionRangeKm,
    }),
  }));
  const lossDb =
    perPoint.reduce((total, entry) => total + entry.lossDb, 0) /
    perPoint.length;
  return {
    lossDb,
    perPoint,
    distanceRegime: lhDistanceRegime(transmissionRangeKm),
    midPathLocalTimeHours: ((t % 24) + 24) % 24,
    timeBandIndex: lhTimeBandIndex(t),
  };
}
