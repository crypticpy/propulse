/**
 * The decile deviations of ITU-R P.533-14 section 8, by way of ITU-R P.842-5.
 *
 * Section 8 of P.533-14 does not tabulate anything itself. It says where each
 * number comes from and hands the reader on:
 *
 *   "In the absence of other data, signal fading allowances may be taken as
 *   those adopted by WARC HFBC-87 with a short-term upper decile deviation of
 *   5 dB and a lower decile deviation of 8 dB. For long-term signal fading the
 *   decile deviations are taken as a function of the ratio of operating
 *   frequency to the path basic MUF as given in Table 2 of Recommendation
 *   ITU-R P.842."
 *
 * and, for the noise side, "the decile deviations of noise power arising from
 * day-to-day variability are taken from Recommendation ITU-R P.372", with
 * galactic variability "taken as 2 dB". Equation (46) then combines the lower
 * signal deciles and the upper noise decile into one root sum of squares.
 *
 * P.842-5's Table 1 is the same arithmetic written out as a procedure, and it
 * is the form this module implements because it is the form that produces the
 * two quantities the golden corpus publishes, DuSN and DlSN:
 *
 *   Step 4:  DuSd from Table 2 using basic MUF for the path;   DuSh = 5
 *   Step 5:  DlA, DlM from P.372;                              DlG  = 2
 *   Step 6:  DuSN = root sum square of DuSd, DuSh and
 *            10 log10[ (10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10))
 *                    / (10^((FaA-DlA)/10) + 10^((FaM-DlM)/10) + 10^((FaG-DlG)/10)) ]
 *   Step 7:  DlSd from Table 2 using basic MUF for the path;   DlSh = 8
 *   Step 8:  DuA, DuM from P.372;                              DuG  = 2
 *   Step 9:  DlSN = root sum square of DlSd, DlSh and
 *            10 log10[ (10^((FaA+DuA)/10) + 10^((FaM+DuM)/10) + 10^((FaG+DuG)/10))
 *                    / (10^(FaA/10) + 10^(FaM/10) + 10^(FaG/10)) ]
 *
 * Note which way round Steps 6 and 9 run. The UPPER decile of the ratio uses
 * the LOWER decile of the noise, because a signal-to-noise ratio is large when
 * the noise is small; the two logarithms are the amount by which the total
 * noise moves when each component moves to its own decile, which is not the
 * decile of any one component and is always smaller than the largest of them.
 * Getting this backwards is a sign error of up to several dB that no test on a
 * single component can catch, so `signalDeciles.test.ts` pins the direction.
 *
 * Step 10 (the required signal-to-noise ratio) is a user input and Step 11
 * (basic circuit reliability) is out of scope for this slice: BCR is reported
 * as an unimplemented capability, not approximated. Nothing here computes it.
 *
 * WHAT IS PINNED AND WHERE. Table 2 of P.842-5 is
 * `assets/p842-table2-signal-deciles.json`, transcribed from the published
 * recommendation, digest-pinned by `P842_TABLE_2_SHA256` below and re-derived
 * by this module's test. The two within-the-hour literals are in this file,
 * because they are literals of Table 1 and not of Table 2.
 *
 * DEVIATION 1: HOW A ROW OF TABLE 2 IS CHOSEN.
 * Table 2's row labels are a bare list of ratios whose two ends are printed as
 * inequalities, "<= 0.80" and ">= 5.00"; the eight between them are printed as
 * bare numbers. Read as isolated points the table is undefined almost
 * everywhere, so the labels must denote bands, and the only reading under which
 * the two printed inequalities are consistent with the eight bare numbers is
 * that each label is the UPPER bound of a half-open band: the row used is the
 * first whose label is greater than or equal to the ratio, and the ">= 5.00"
 * row carries everything above 4.0. Two alternatives were considered and
 * rejected: nearest tabulated point, which would make the "<= 0.80" label
 * describe ratios up to 0.9 and contradict its own inequality; and linear
 * interpolation between rows, which the recommendation never asks for and which
 * would smooth away the deliberate non-monotonicity around 1.2 to 1.4, where
 * the deciles peak because the operating frequency is sitting on the MUF. The
 * reading taken here is also the one the pinned ITU reference build applies,
 * which is evidence about the authors' intent and is not the reason for it.
 *
 * DEVIATION 2: WHERE THE 60 DEGREE TEST IS APPLIED.
 * Table 2's footnote (1) says the high-latitude block is used "if any point on
 * that part of the great circle ... which lies between control points located
 * 1 000 km from each end of the path, reaches a geomagnetic latitude of 60
 * degrees or more". "Any point" is every point of that span, and this module
 * tests every point of it, exactly: in geomagnetic coordinates the dipole
 * transform is a rotation, so `sin(Gn)` along a great circle is
 * `A cos(theta) + B sin(theta)`, a single sinusoid in arc angle whose extrema
 * are at `atan2(B, A)` and half a turn from it. Checking the two ends of the
 * span and whichever extrema fall inside it is therefore not a sample: it is
 * the maximum. The pinned reference tests three points only (mid-path and the
 * two 1 000 km control points), which can miss a crossing between them; that
 * difference is a declared divergence of this module, not an error in it.
 *
 * DEVIATION 3: PATHS SHORTER THAN 2 000 KM.
 * On such a path the two control points footnote (1) names have crossed, so the
 * span it describes is empty and the footnote selects nothing. As the path
 * shortens to 2 000 km that span closes on the single mid-path point, so the
 * mid-path point is what this module tests below 2 000 km: it is the limit of
 * the recommendation's own span, and it is symmetric in the two terminals. The
 * pinned reference instead skips the test entirely below 2 000 km and always
 * takes the "< 60" block, which on a short auroral circuit understates the
 * lower decile by up to 4 dB. Declared, with its effect measured, in the
 * circuit parity fixture.
 *
 * DEVIATION 4: |Gn|, NOT Gn.
 * `scanFootnoteSpan` tests the magnitude of the geomagnetic latitude, and the
 * pinned reference (`CircuitReliability.c:180-186`) tests the signed value, so
 * the reference never selects the ">= 60" block on a path whose footnote span
 * is entirely in the southern geomagnetic hemisphere. Our reading is the
 * correct one: the auroral zone footnote (1) describes is symmetric about the
 * geomagnetic equator, and P.533-14's other high-latitude tests (section 5.2.1
 * screening among them) are stated on |lat|, never on a signed one. This
 * deviation is UNEXERCISED on the golden corpus: the most negative signed
 * geomagnetic latitude reached anywhere on any case's footnote span is -52.93
 * degrees, on G19, well short of the 60 degree threshold either sign of the
 * test would need to disagree on.
 */

import {
  routeSample,
  type ResolvedRoute,
  EARTH_RADIUS_KM,
} from "@/lib/propagation/geometry/route";
import type { NoiseComponent } from "@/lib/propagation/noise/p372Noise";
import {
  geomagneticLatitudeDeg,
  GEOMAGNETIC_POLE_LATITUDE_DEG,
  GEOMAGNETIC_POLE_LONGITUDE_DEG,
} from "./auroralLoss";
import table2 from "./assets/p842-table2-signal-deciles.json";

/**
 * sha256 of `assets/p842-table2-signal-deciles.json`.
 *
 * `signalDeciles.test.ts` recomputes it from the file on disk. An edit to the
 * table without an edit to this constant fails the suite, which is the point:
 * a transcribed table with no digest is a table nobody can tell has changed.
 */
export const P842_TABLE_2_SHA256 =
  "6d297d55f6f3187560cdd580b48a8a598cef8dce21e95dfab8e9ca10de2ae4a6";

/** P.842-5 Table 1, Step 4: "Signal upper decile deviation (within-the-hour)". */
export const WITHIN_HOUR_UPPER_DECILE_DB = 5;
/** P.842-5 Table 1, Step 7: "Signal lower decile deviation (within-the-hour)". */
export const WITHIN_HOUR_LOWER_DECILE_DB = 8;

/** Table 2 footnote (1)'s threshold, degrees of geomagnetic latitude. */
export const HIGH_LATITUDE_THRESHOLD_DEG = 60;

/** Table 2 footnote (1)'s inset from each terminal, km. */
export const FOOTNOTE_CONTROL_POINT_INSET_KM = 1000;

/** Below this the footnote's span is empty; see deviation 3. */
export const FOOTNOTE_MINIMUM_PATH_KM = 2 * FOOTNOTE_CONTROL_POINT_INSET_KM;

const DEG_TO_RAD = Math.PI / 180;

/** Which block of Table 2 a path reads. */
export type GeomagneticBlock = "below_60_deg" | "at_or_above_60_deg";

/** The highest geomagnetic latitude the footnote's span reaches. */
export interface FootnoteScan {
  readonly block: GeomagneticBlock;
  /** |Gn| at its largest over the span, degrees. */
  readonly peakAbsGeomagneticLatitudeDeg: number;
  /** Where that peak is, km from the transmitter along the route. */
  readonly peakAtKm: number;
  /** The span actually tested, km from the transmitter. */
  readonly spanKm: { readonly from: number; readonly to: number };
  /** True when the span degenerated to the mid-path point (deviation 3). */
  readonly spanIsMidPathOnly: boolean;
}

/** The day-to-day signal deciles of Table 2, with the row they came from. */
export interface SignalDayToDayDeciles {
  readonly kind: "resolved";
  /** DuSd, P.842-5 Table 1 Step 4, dB. */
  readonly upperDb: number;
  /** DlSd, P.842-5 Table 1 Step 7, dB. */
  readonly lowerDb: number;
  /** f / basic MUF, the quantity Table 2 is indexed on. */
  readonly frequencyToBasicMufRatio: number;
  /** The published label of the row used. */
  readonly rowLabel: string;
  readonly rowIndex: number;
  readonly footnote: FootnoteScan;
}

export type SignalDecilesUnsupportedReason =
  "basic_muf_unavailable" | "frequency_unavailable";

export interface SignalDecilesUnsupported {
  readonly kind: "unsupported";
  readonly reason: SignalDecilesUnsupportedReason;
  readonly detail: string;
}

export type SignalDayToDayDecilesResult =
  SignalDayToDayDeciles | SignalDecilesUnsupported;

export interface SignalDecilesInputs {
  readonly route: ResolvedRoute;
  /** The operating frequency, MHz. */
  readonly frequencyMHz: number;
  /** The path basic MUF, MHz. Table 1 Steps 4 and 7: "for the path". */
  readonly pathBasicMufMHz: number;
}

/**
 * Table 2 of P.842-5: the day-to-day decile deviations of the wanted signal.
 *
 * Never throws and never clamps. A basic MUF that is not a positive finite
 * number has no ratio to look up, and that is reported rather than replaced.
 */
export function signalDayToDayDeciles(
  inputs: SignalDecilesInputs,
): SignalDayToDayDecilesResult {
  const { route, frequencyMHz, pathBasicMufMHz } = inputs;
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    return {
      kind: "unsupported",
      reason: "frequency_unavailable",
      detail:
        `the operating frequency is ${String(frequencyMHz)} MHz; Table 2 of ` +
        "ITU-R P.842-5 is indexed on transmitting frequency over basic MUF, " +
        "which needs a positive finite frequency.",
    };
  }
  if (!Number.isFinite(pathBasicMufMHz) || pathBasicMufMHz <= 0) {
    return {
      kind: "unsupported",
      reason: "basic_muf_unavailable",
      detail:
        `the path basic MUF is ${String(pathBasicMufMHz)} MHz; Table 2 of ` +
        "ITU-R P.842-5 is indexed on transmitting frequency over basic MUF, " +
        "so with no basic MUF there is no row to read.",
    };
  }

  const ratio = frequencyMHz / pathBasicMufMHz;
  const rowIndex = table2RowIndex(ratio);
  const footnote = scanFootnoteSpan(route);
  const block = table2.deviations_db[footnote.block];

  return {
    kind: "resolved",
    upperDb: block.upper_decile[rowIndex],
    lowerDb: block.lower_decile[rowIndex],
    frequencyToBasicMufRatio: ratio,
    rowLabel: table2.frequency_ratio_row_labels[rowIndex],
    rowIndex,
    footnote,
  };
}

/**
 * The row of Table 2 a ratio reads. See deviation 1 for why it is the first
 * row whose published label is at or above the ratio.
 */
export function table2RowIndex(ratio: number): number {
  const bounds = table2.frequency_ratio_upper_bounds;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (ratio <= bounds[i]) return i;
  }
  return bounds.length - 1;
}

/**
 * Footnote (1)'s test, over the whole span and exactly. See deviation 2.
 *
 * `sin(Gn(theta)) = A cos(theta) + B sin(theta)` where A and B are the
 * projections of the route's origin and tangent onto the dipole axis, so the
 * extrema of |sin(Gn)| along the arc are at `atan2(B, A)` and half a turn from
 * it. Those, plus the two ends of the span, are every place the maximum can be.
 */
export function scanFootnoteSpan(route: ResolvedRoute): FootnoteScan {
  const distanceKm = route.groundDistanceKm;
  const spanIsMidPathOnly = distanceKm < FOOTNOTE_MINIMUM_PATH_KM;
  const fromKm = spanIsMidPathOnly
    ? distanceKm / 2
    : FOOTNOTE_CONTROL_POINT_INSET_KM;
  const toKm = spanIsMidPathOnly
    ? distanceKm / 2
    : distanceKm - FOOTNOTE_CONTROL_POINT_INSET_KM;

  const poleLat = GEOMAGNETIC_POLE_LATITUDE_DEG * DEG_TO_RAD;
  const poleLng = GEOMAGNETIC_POLE_LONGITUDE_DEG * DEG_TO_RAD;
  const pole = {
    x: Math.cos(poleLat) * Math.cos(poleLng),
    y: Math.cos(poleLat) * Math.sin(poleLng),
    z: Math.sin(poleLat),
  };
  const a =
    route.origin.x * pole.x + route.origin.y * pole.y + route.origin.z * pole.z;
  const b =
    route.tangent.x * pole.x +
    route.tangent.y * pole.y +
    route.tangent.z * pole.z;

  const fromRad = fromKm / EARTH_RADIUS_KM;
  const toRad = toKm / EARTH_RADIUS_KM;
  const candidatesKm = [fromKm, toKm];
  if (a !== 0 || b !== 0) {
    const phi = Math.atan2(b, a);
    // The maximum is at phi and the minimum half a turn away; both matter
    // because Table 2 is indexed on |Gn| (deviation 4). Walk both families
    // into the span.
    for (const base of [phi, phi + Math.PI]) {
      for (let k = -2; k <= 2; k++) {
        const theta = base + k * 2 * Math.PI;
        if (theta >= fromRad && theta <= toRad) {
          candidatesKm.push(theta * EARTH_RADIUS_KM);
        }
      }
    }
  }

  let peakAbs = -1;
  let peakAtKm = fromKm;
  for (const sKm of candidatesKm) {
    const point = routeSample(route, sKm);
    const abs = Math.abs(
      geomagneticLatitudeDeg(point.latitudeDeg, point.longitudeDeg),
    );
    if (abs > peakAbs) {
      peakAbs = abs;
      peakAtKm = sKm;
    }
  }

  return {
    block:
      peakAbs >= HIGH_LATITUDE_THRESHOLD_DEG
        ? "at_or_above_60_deg"
        : "below_60_deg",
    peakAbsGeomagneticLatitudeDeg: peakAbs,
    peakAtKm,
    spanKm: { from: fromKm, to: toKm },
    spanIsMidPathOnly,
  };
}

/** The three noise components P.842-5 Table 1 Step 2 names, in its own order. */
export interface NoiseTriplet {
  /** FaA, DuA, DlA: atmospheric. */
  readonly atmospheric: NoiseComponent;
  /** FaM, DuM, DlM: man-made. */
  readonly manMade: NoiseComponent;
  /** FaG, DuG, DlG: galactic. */
  readonly galactic: NoiseComponent;
}

/** DuSN and DlSN, with the noise term of each shown separately. */
export interface SnrDecileDeviations {
  /** DuSN, P.842-5 Table 1 Step 6, dB. */
  readonly upperDb: number;
  /** DlSN, P.842-5 Table 1 Step 9, dB. */
  readonly lowerDb: number;
  /** The Step 6 logarithm on its own: how far the total noise falls, dB. */
  readonly noiseLowerTermDb: number;
  /** The Step 9 logarithm on its own: how far the total noise rises, dB. */
  readonly noiseUpperTermDb: number;
}

/**
 * P.842-5 Table 1 Steps 6 and 9: the deciles of the signal-to-noise ratio.
 *
 * `signal` carries DuSd and DlSd from Table 2; the within-the-hour 5 and 8 are
 * added here because they are the same table's literals. Returns finite numbers
 * for any finite input: every term is a root of a sum of squares.
 */
export function snrDecileDeviations(
  signal: { readonly upperDb: number; readonly lowerDb: number },
  noise: NoiseTriplet,
): SnrDecileDeviations {
  const components = [noise.atmospheric, noise.manMade, noise.galactic];
  const median = powerSum(components.map((c) => c.fa));
  // Step 6: each component at its own LOWER decile, so the total noise falls.
  const atLowerDecile = powerSum(components.map((c) => c.fa - c.dl));
  // Step 9: each component at its own UPPER decile, so the total noise rises.
  const atUpperDecile = powerSum(components.map((c) => c.fa + c.du));

  const noiseLowerTermDb = 10 * Math.log10(median / atLowerDecile);
  const noiseUpperTermDb = 10 * Math.log10(atUpperDecile / median);

  return {
    upperDb: rootSumSquare([
      signal.upperDb,
      WITHIN_HOUR_UPPER_DECILE_DB,
      noiseLowerTermDb,
    ]),
    lowerDb: rootSumSquare([
      signal.lowerDb,
      WITHIN_HOUR_LOWER_DECILE_DB,
      noiseUpperTermDb,
    ]),
    noiseLowerTermDb,
    noiseUpperTermDb,
  };
}

function powerSum(dbValues: readonly number[]): number {
  let total = 0;
  for (const db of dbValues) total += Math.pow(10, db / 10);
  return total;
}

function rootSumSquare(terms: readonly number[]): number {
  let total = 0;
  for (const term of terms) total += term * term;
  return Math.sqrt(total);
}
