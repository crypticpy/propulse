/**
 * ITU-R P.1239-3 foF2 within-the-month decile factors (PROP-07b, #1102).
 *
 * Tables 2 and 3 of P.1239-3 give two dimensionless multipliers of the monthly
 * median foF2: the lower decile factor (the value exceeded on 90% of the days
 * of the month) and the upper decile factor (exceeded on 10%). This module
 * reads them and nothing else. Turning them into MUF(90) and MUF(10), or into
 * the section 3.6 probability of propagation support, is circuit work and
 * belongs to #954; a factor is not a forecast.
 *
 * THE INTERPOLATION RULE, and why this one:
 *
 *  - **Latitude and hour: bilinear over the 5-degree by 1-hour cell**, by the
 *    ITU-R P.1144 bilinear formula. This is what the ITU reference
 *    implementation does (`FindfoF2var` in `MUFVariability.c`, which calls
 *    `BilinearInterpolation`), and the two axes are sampled from continuous
 *    quantities, so interpolating them is the reading the table intends.
 *  - **Latitude is folded to its absolute value**, so a southern point reads
 *    the same row as its northern mirror. The reference folds the same way
 *    (`lat = fabs(lat / (5 * D2R))`). The hemisphere is not lost: it selects
 *    the season below.
 *  - **The hour axis wraps**, so 23.5 h blends hour 23 with hour 00. The
 *    reference wraps the same way (`if (hourU > 23) hourU = 0`). Any finite
 *    hour is first folded into [0, 24).
 *  - **Season and R12 range are selected, never interpolated.** They are
 *    categorical axes of the published table (three seasons, three solar
 *    ranges) and P.1239 offers no rule for blending between them; the
 *    reference selects too. A blend would invent numbers the recommendation
 *    does not contain, and the seams it would smooth are real features of the
 *    tabulation, not artefacts.
 *  - **Season from month and hemisphere** is the reference's `WhatSeason`
 *    (`InitializePath.c`): north of the equator, and on it, November through
 *    February is winter, March, April, September and October are equinox, and
 *    May through August is summer; south of the equator winter and summer
 *    swap. Note that winter is four months including November, which is the
 *    reference rule and not a three-month meteorological season.
 *  - **R12 range** is the reference's three-way split: below 50, 50 to 100
 *    inclusive at both ends, and above 100.
 *
 * ONE DELIBERATE DEVIATION FROM THE REFERENCE BINARY. The table's own column
 * axis is local time, and this accessor takes local time. The ITU reference
 * passes `path->CP[MP].ltime` into `FindfoF2var`, and `CalculateCPParameters.c`
 * assigns `here->ltime = hour`, the UTC hour, at the end of the routine that
 * computes it, so the reference binary reads the table at UTC. Reproducing a
 * native dump therefore means handing this function the UTC hour. Following
 * the recommendation rather than the binary is the choice made here, and it is
 * named rather than absorbed, because the two agree only on the zero meridian.
 */

import {
  DECILE_ASSET_SHA256,
  HOUR_COLUMNS,
  LATITUDE_ROWS,
  decileFactorIndex,
  loadDecileFactorAsset,
  type DecileByteSource,
  type DecileFactorTable,
} from "./assets/decileLoader";
import {
  IonosphereQueryError,
  known,
  unknown,
  type ArtifactHash,
  type Known,
} from "./types";

/** The three seasons of P.1239 Tables 2 and 3, in the asset's axis order. */
export const FOF2_SEASONS = ["winter", "equinox", "summer"] as const;
export type FoF2Season = (typeof FOF2_SEASONS)[number];

/** The three solar-activity ranges of the table, in the asset's axis order. */
export const R12_RANGES = ["below-50", "50-to-100", "above-100"] as const;
export type R12Range = (typeof R12_RANGES)[number];

/** Degrees of latitude between tabulated rows. */
export const LATITUDE_STEP_DEG = 5;

const DECILE_INDEX = { lower: 0, upper: 1 } as const;

export interface DecileFactorQuery {
  /** Calendar month, 1 for January through 12 for December. */
  readonly month: number;
  /** Degrees north, -90 to 90. The sign selects the hemisphere's season. */
  readonly latitudeDeg: number;
  /**
   * Local time at the point, in hours. Any finite value is folded into
   * [0, 24); see the deviation note in the module header before passing UTC.
   */
  readonly localTimeHours: number;
  /** The 12-month smoothed sunspot number, non-negative. */
  readonly r12: number;
}

export interface FoF2DecileFactors {
  /** Multiplier of the monthly median foF2 exceeded on 90% of days. */
  readonly lower: number;
  /** Multiplier of the monthly median foF2 exceeded on 10% of days. */
  readonly upper: number;
  readonly season: FoF2Season;
  readonly r12Range: R12Range;
  /** The rule named in the module header, carried so a trace can record it. */
  readonly interpolation: "bilinear-latitude-hour-selected-season-r12";
  readonly artifactHash: ArtifactHash;
}

/**
 * The season index the reference's `WhatSeason` would pick.
 *
 * The equator counts as northern, as it does in the reference (`L.lat >= 0`).
 */
export function foF2Season(month: number, latitudeDeg: number): FoF2Season {
  const northern = latitudeDeg >= 0;
  if (month === 11 || month === 12 || month === 1 || month === 2) {
    return northern ? "winter" : "summer";
  }
  if (month === 3 || month === 4 || month === 9 || month === 10) {
    return "equinox";
  }
  return northern ? "summer" : "winter";
}

/** The reference's three-way solar split: `<50`, `50..100` inclusive, `>100`. */
export function r12Range(r12: number): R12Range {
  if (r12 < 50) return "below-50";
  if (r12 <= 100) return "50-to-100";
  return "above-100";
}

function validate(query: DecileFactorQuery): void {
  const { month, latitudeDeg, localTimeHours, r12 } = query;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new IonosphereQueryError(
      "month",
      month,
      "must be an integer month number, 1 through 12",
    );
  }
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new IonosphereQueryError(
      "latitudeDeg",
      latitudeDeg,
      "must be a finite latitude within -90..90",
    );
  }
  if (!Number.isFinite(localTimeHours)) {
    throw new IonosphereQueryError(
      "localTimeHours",
      localTimeHours,
      "must be finite; it is folded into 0..24 but cannot be NaN or infinite",
    );
  }
  if (!Number.isFinite(r12) || r12 < 0) {
    throw new IonosphereQueryError(
      "r12",
      r12,
      "must be a finite non-negative smoothed sunspot number",
    );
  }
}

/** P.1144 bilinear interpolation, the reference's argument order. */
function bilinear(
  lowerLeft: number,
  lowerRight: number,
  upperLeft: number,
  upperRight: number,
  row: number,
  column: number,
): number {
  return (
    lowerLeft * (1 - row) * (1 - column) +
    upperLeft * row * (1 - column) +
    lowerRight * (1 - row) * column +
    upperRight * row * column
  );
}

/**
 * Read one decile from a loaded table. Pure, and assumes a validated query.
 */
function readDecile(
  table: DecileFactorTable,
  decile: 0 | 1,
  season: FoF2Season,
  range: R12Range,
  latitudeDeg: number,
  hours: number,
): number {
  const seasonIndex = FOF2_SEASONS.indexOf(season);
  const rangeIndex = R12_RANGES.indexOf(range);

  const row = Math.abs(latitudeDeg) / LATITUDE_STEP_DEG;
  const rowLow = Math.floor(row);
  // At exactly 90 degrees `row` is 18 and both bounds land on the last row.
  const rowHigh = Math.min(Math.ceil(row), LATITUDE_ROWS - 1);
  const rowFraction = row - rowLow;

  const hour = ((hours % HOUR_COLUMNS) + HOUR_COLUMNS) % HOUR_COLUMNS;
  const columnLow = Math.floor(hour);
  const columnHigh = Math.ceil(hour) % HOUR_COLUMNS;
  const columnFraction = hour - columnLow;

  const at = (rowIndex: number, columnIndex: number): number =>
    table.factors[
      decileFactorIndex(decile, seasonIndex, rangeIndex, rowIndex, columnIndex)
    ];

  return bilinear(
    at(rowLow, columnLow),
    at(rowLow, columnHigh),
    at(rowHigh, columnLow),
    at(rowHigh, columnHigh),
    rowFraction,
    columnFraction,
  );
}

/**
 * The lower and upper decile factors for one point, month and local hour.
 *
 * Pure and synchronous, over a table the caller has already loaded. Throws
 * `IonosphereQueryError` on a malformed query, which is a caller's bug, and
 * nothing else: an asset that failed to load never reaches this function.
 */
export function foF2DecileFactorsFrom(
  table: DecileFactorTable,
  query: DecileFactorQuery,
): FoF2DecileFactors {
  validate(query);
  const season = foF2Season(query.month, query.latitudeDeg);
  const range = r12Range(query.r12);
  return Object.freeze({
    lower: readDecile(
      table,
      DECILE_INDEX.lower,
      season,
      range,
      query.latitudeDeg,
      query.localTimeHours,
    ),
    upper: readDecile(
      table,
      DECILE_INDEX.upper,
      season,
      range,
      query.latitudeDeg,
      query.localTimeHours,
    ),
    season,
    r12Range: range,
    interpolation: "bilinear-latitude-hour-selected-season-r12",
    artifactHash: table.artifactHash,
  });
}

/**
 * The decile factors, loading and verifying the asset on first use.
 *
 * Never rejects on an asset problem: a missing, truncated or tampered file
 * comes back as `unknown` with the reason, so the provider can report the
 * quantity unavailable instead of a number nobody checked. A malformed query
 * still throws, because that is the caller's own mistake and hiding it would
 * return a decile factor for a point the caller did not ask about.
 */
export async function resolveFoF2DecileFactors(
  query: DecileFactorQuery,
  byteSource?: DecileByteSource,
): Promise<Known<FoF2DecileFactors>> {
  validate(query);
  let table: DecileFactorTable;
  try {
    table = await loadDecileFactorAsset(byteSource);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unknown(
      `ITU-R P.1239-3 decile factors are unavailable: ${detail} ` +
        `(expected ${DECILE_ASSET_SHA256})`,
    );
  }
  return known(foF2DecileFactorsFrom(table, query));
}
