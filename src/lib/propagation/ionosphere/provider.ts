/**
 * The shared ionospheric climatology provider (PROP-07, #953).
 *
 * One source of truth for foF2, M(3000)F2, foE and NmF2, built on the CCIR
 * numerical map that ITU-R P.533-14 uses, proved against the ITU's own data
 * files, and honest about everything it does not model.
 *
 * ADOPTED MODEL: ITU-R P.533-14 monthly median climatology, with the CCIR
 * (not URSI) coefficient set, because parity is against P.533 and P.533 uses
 * CCIR. Every emitted state names it.
 *
 * WHAT THIS DOES NOT MODEL, and why it says so instead of guessing:
 *
 *  - `foF1` and `hmF2`. P.533-14 computes neither. `grep -r 'foF1\|hmF2'` over
 *    the reference's `P533/Src` returns nothing. The usual substitutes
 *    (Ducharme for foF1, Shimazaki/Bilitza for hmF2) are different models with
 *    different validity domains; importing one here would make this provider a
 *    hybrid that could not honestly claim P.533 conformance. A consumer that
 *    needs them must bring its own source contract.
 *  - `foEs`. Sporadic E in P.533 is a separate statistical model, not a
 *    function of this map.
 *  - D-region electron density and collision frequency. P.533 handles
 *    non-deviative absorption with an empirical loss term and never forms a
 *    profile.
 *  - Mirror reflection height. It is a circuit quantity, not a climatology
 *    quantity: it depends on the operating frequency and the hop distance as
 *    well as on M(3000)F2 and foF2/foE. It also cannot be ported from the
 *    reference as written. `ELayerScreeningFrequency.c` evaluates
 *    `G = -2.102 xr^4 + 19.50 xr^3 - 63.15 xr^2 - 44.73`, which is P.533-14
 *    section 5.1 with the `+ 90.87 xr` term dropped: at the branch limit
 *    xr = 3.7 the published polynomial gives 20.8 against the constant 19.25
 *    used above 3.7, while the reference's version gives -315.4. The circuit
 *    leaf that adopts this must decide between parity and the published
 *    formula; this leaf will not make that choice silently on its behalf.
 *    The reference's own values are recorded in
 *    `fixtures/reference-parity.json` for that work.
 *
 * WHICH MODE TO USE. `enhanced`, unless you are reproducing an ITU golden.
 * Both modes read the same coefficients, but `reference` reaches them the way
 * ITU-R P.533-14's reference implementation does, through a 1.5-degree grid
 * whose interpolation fractions are mirrored in three of the four quadrants;
 * see the worked example in `gridNeighbourhood`. That costs up to 0.1 MHz of
 * foF2 in the western hemisphere and 0.19 MHz near the equatorial anomaly.
 * `enhanced` evaluates the numerical map at the requested point and time, which
 * needs no grid at all, and agrees with `reference` wherever `reference` is
 * right: at grid nodes the two are identical to 1e-7 MHz.
 *
 * DETERMINISM. The code is pure: no clock, no randomness, no locale, no
 * network at solve time. Bitwise identity across engines is not achievable
 * through `Math.sin`/`Math.pow`, which are permitted a 1-ulp spread, so
 * identity is defined as `ionosphereStateDigest`: SHA-256 over the state
 * rounded to declared precisions. That digest is what a cache key should use.
 */

import manifest from "./assets/manifest.json";
import {
  loadNumericalMapAsset,
  type AssetByteSource,
  type CoefficientBlock,
  type NumericalMapAsset,
} from "./assets/loader";
import { foE } from "./foE";
import { D2R, magneticField, R2D } from "./modip";
import {
  bilinearInterpolation,
  blendBySolarIndex,
  evaluateMap,
  FOF2_TIME_TERMS,
  geographicFunctions,
  gridNeighbourhood,
  gridNodeCoordinatesRad,
  M3000F2_TIME_TERMS,
  MAX_R12,
  referenceMapHour,
  timeTerms,
  type GridNode,
} from "./numericalMap";
import { solarParameters } from "./solar";
import {
  canonicalCoordinates,
  deepFreeze,
  known,
  IonosphereAssetError,
  nmF2FromFoF2,
  parseInstant,
  type ArtifactHash,
  type CapabilityState,
  type IonosphereQuantity,
  type IonosphereQuery,
  type IonosphereState,
} from "./types";

export const PROVIDER_ID = "ccir-numerical-map";
export const PROVIDER_VERSION = "1.0.0";

/**
 * SILSO version 2.0 sunspot numbers are about 1.43 times the classic series the
 * CCIR maps were fitted against. R12 in P.533 means the classic series, so the
 * bundled climatology is divided by this before use. The factor is applied
 * explicitly and reported, never folded into the table.
 */
const SILSO_V2_TO_CLASSIC = 1.43;

const ADOPTED_MODEL_ASSUMPTION =
  "Adopted model: ITU-R P.533-14 monthly median climatology over the CCIR " +
  "numerical map (ITU-R P.1239 Annex 1), coefficient set " +
  `${manifest.asset.sha256}.`;

export const CAPABILITIES: Readonly<
  Record<IonosphereQuantity, CapabilityState>
> = Object.freeze({
  foF2: { status: "supported", note: "CCIR numerical map, MHz" },
  m3000F2: { status: "supported", note: "CCIR numerical map, dimensionless" },
  foE: { status: "supported", note: "ITU-R P.1239-2 section 3, MHz" },
  nmF2: {
    status: "supported",
    note: "derived from foF2 by NmF2 = (foF2 / 8.98e-6)^2, electrons per m^3",
  },
  mirrorReflectionHeight: {
    status: "unsupported",
    reason:
      "circuit quantity, not climatology: it depends on the operating " +
      "frequency and hop distance. The ITU reference implementation also " +
      "drops the +90.87*xr term from the P.533-14 section 5.1 G polynomial, " +
      "so parity and the published formula disagree. Owned by the circuit leaf.",
  },
  foF1: {
    status: "unsupported",
    reason:
      "ITU-R P.533-14, the model adopted here, does not compute an F1 layer. " +
      "Supplying a Ducharme foF1 would silently mix models.",
  },
  hmF2: {
    status: "unsupported",
    reason:
      "ITU-R P.533-14, the model adopted here, does not compute hmF2. The " +
      "Shimazaki/Bilitza relation is a different model with a different " +
      "validity domain.",
  },
  foEs: {
    status: "unsupported",
    reason:
      "sporadic E is a separate statistical model in P.533 and is not a " +
      "function of the CCIR numerical map.",
  },
  dRegionElectronDensity: {
    status: "unsupported",
    reason:
      "P.533-14 models non-deviative absorption with an empirical loss term " +
      "and never forms a D-region profile.",
  },
  collisionFrequency: {
    status: "unsupported",
    reason:
      "P.533-14 models non-deviative absorption with an empirical loss term " +
      "and never forms a collision-frequency profile.",
  },
});

export interface IonosphereProvider {
  readonly id: string;
  readonly version: string;
  readonly artifactHash: ArtifactHash;
  readonly capabilities: Readonly<Record<IonosphereQuantity, CapabilityState>>;
  /** Pure. Throws only when the query itself is malformed. */
  state(query: IonosphereQuery): IonosphereState;
}

interface TimePoint {
  readonly year: number;
  readonly monthIndex: number;
  readonly dayOfYear: number;
  readonly utcHours: number;
}

/** Midnight UTC of a calendar date, safe for years below 100. */
function utcDay(year: number, monthIndex: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/** 1 on 1 January. Leap-aware, because it is derived from the calendar. */
function dayOfYearOf(year: number, monthIndex: number, day: number): number {
  const elapsed = utcDay(year, monthIndex, day) - utcDay(year, 0, 1);
  return Math.round(elapsed / 86_400_000) + 1;
}

function daysInYear(year: number): number {
  return dayOfYearOf(year, 11, 31);
}

function timePoint(instant: Date): TimePoint {
  const startOfYear = utcDay(instant.getUTCFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((instant.getTime() - startOfYear) / 86_400_000) + 1;
  const utcHours =
    instant.getUTCHours() +
    instant.getUTCMinutes() / 60 +
    instant.getUTCSeconds() / 3600 +
    instant.getUTCMilliseconds() / 3_600_000;
  return {
    year: instant.getUTCFullYear(),
    monthIndex: instant.getUTCMonth(),
    dayOfYear,
    utcHours,
  };
}

/**
 * The two monthly anchors that bracket a day of year, and the weight of the
 * later one.
 *
 * The anchors are the calendar 15th of each month of `year`, not a fixed table.
 * In a leap year every anchor after February moves by a day, so a fixed table
 * would put the enhanced-mode weight at 1/31 instead of 0 on the calendar
 * anchor and the two modes would stop meeting there. The December-to-January
 * wrap spans 15 December of `year` to 15 January of `year + 1` using the real
 * length of `year`, so the weight reaches 1 exactly at the seam instead of
 * overshooting and falling back a day at midnight.
 */
export function monthAnchorBracket(
  dayOfYear: number,
  year: number,
): {
  earlier: number;
  later: number;
  weight: number;
} {
  const anchors = Array.from({ length: 12 }, (_, month) =>
    dayOfYearOf(year, month, 15),
  );
  if (dayOfYear < anchors[0]) {
    // Between 15 December of the previous year and 15 January, in this year's
    // day numbering, so the previous December anchor is a negative day.
    const previousDecember =
      dayOfYearOf(year - 1, 11, 15) - daysInYear(year - 1);
    const span = anchors[0] - previousDecember;
    return {
      earlier: 11,
      later: 0,
      weight: (dayOfYear - previousDecember) / span,
    };
  }
  for (let month = 0; month < 11; month += 1) {
    if (dayOfYear < anchors[month + 1]) {
      const span = anchors[month + 1] - anchors[month];
      return {
        earlier: month,
        later: month + 1,
        weight: (dayOfYear - anchors[month]) / span,
      };
    }
  }
  const nextJanuary = daysInYear(year) + dayOfYearOf(year + 1, 0, 15);
  const span = nextJanuary - anchors[11];
  return { earlier: 11, later: 0, weight: (dayOfYear - anchors[11]) / span };
}

/** foF2 and M(3000)F2 from one month's coefficients at one point and hour. */
function evaluateMonth(
  levels: readonly [CoefficientBlock, CoefficientBlock],
  latitudeRad: number,
  longitudeRad: number,
  mapHour: number,
  r12: number,
): { foF2MHz: number; m3000F2: number } {
  const foF2Geo = geographicFunctions(latitudeRad, longitudeRad, "foF2");
  const m3000Geo = geographicFunctions(latitudeRad, longitudeRad, "m3000F2");
  const foF2Time = timeTerms(mapHour, FOF2_TIME_TERMS);
  const m3000Time = timeTerms(mapHour, M3000F2_TIME_TERMS);
  return {
    foF2MHz: blendBySolarIndex(
      evaluateMap(levels[0].foF2, foF2Geo, foF2Time),
      evaluateMap(levels[1].foF2, foF2Geo, foF2Time),
      r12,
    ),
    m3000F2: blendBySolarIndex(
      evaluateMap(levels[0].m3000F2, m3000Geo, m3000Time),
      evaluateMap(levels[1].m3000F2, m3000Geo, m3000Time),
      r12,
    ),
  };
}

/**
 * P.533's own path: bilinear interpolation of the 1.5-degree grid, with the
 * reference's quadrant-dependent neighbour ordering and edge rules. The four
 * node values are evaluated from the numerical map rather than read from a
 * 134 MB float32 grid; the two agree to 1.0e-4 MHz over all 16,796,736 nodes.
 */
function evaluateReferenceGrid(
  levels: readonly [CoefficientBlock, CoefficientBlock],
  latitudeRad: number,
  longitudeRad: number,
  mapHour: number,
  r12: number,
): { foF2MHz: number; m3000F2: number } {
  const neighbourhood = gridNeighbourhood(latitudeRad, longitudeRad);
  const at = (node: GridNode) => {
    const { latitudeRad: lat, longitudeRad: lon } =
      gridNodeCoordinatesRad(node);
    return evaluateMonth(levels, lat, lon, mapHour, r12);
  };
  const ll = at(neighbourhood.ll);
  const lr = at(neighbourhood.lr);
  const ul = at(neighbourhood.ul);
  const ur = at(neighbourhood.ur);
  const { fracK, fracJ } = neighbourhood;
  return {
    foF2MHz: bilinearInterpolation(
      ll.foF2MHz,
      lr.foF2MHz,
      ul.foF2MHz,
      ur.foF2MHz,
      fracK,
      fracJ,
    ),
    m3000F2: bilinearInterpolation(
      ll.m3000F2,
      lr.m3000F2,
      ul.m3000F2,
      ur.m3000F2,
      fracK,
      fracJ,
    ),
  };
}

interface ResolvedSolarIndex {
  r12: number;
  requestedR12: number;
  clipped: boolean;
  source: "caller" | "bundled-climatology";
  assumption: string | null;
}

function resolveSolarIndex(query: IonosphereQuery): ResolvedSolarIndex {
  if (query.r12.known) {
    const requested = query.r12.value;
    if (!Number.isFinite(requested) || requested < 0) {
      throw new RangeError(
        `r12 must be a finite non-negative number, got ${requested}`,
      );
    }
    return {
      r12: Math.min(requested, MAX_R12),
      requestedR12: requested,
      clipped: requested > MAX_R12,
      source: "caller",
      assumption: null,
    };
  }
  const table = manifest.solar_index_climatology;
  const latest = table.months[table.months.length - 1];
  const requested = latest.smoothed_sn_v2 / SILSO_V2_TO_CLASSIC;
  return {
    r12: Math.min(requested, MAX_R12),
    requestedR12: requested,
    clipped: requested > MAX_R12,
    source: "bundled-climatology",
    assumption:
      `R12 was not supplied (${query.r12.reason}); substituted ` +
      `${requested.toFixed(1)} from the bundled ${table.series}, last defined ` +
      `month ${latest.year}-${String(latest.month).padStart(2, "0")} ` +
      `(${latest.smoothed_sn_v2} divided by ${SILSO_V2_TO_CLASSIC} to convert ` +
      `the version 2.0 scale to the classic R12 the CCIR maps were fitted ` +
      `against), captured ${table.captured_at}.`,
  };
}

function buildState(
  asset: NumericalMapAsset,
  query: IonosphereQuery,
): IonosphereState {
  const instant = parseInstant(query.validAt);
  if (instant === null) {
    throw new RangeError(
      `validAt "${query.validAt}" is not an instant with an explicit offset and ` +
        "at most three fractional-second digits",
    );
  }
  const { latitude, longitude } = query.coordinates;
  const latitudeRad = latitude * D2R;
  const longitudeRad = longitude * D2R;
  const { year, monthIndex, dayOfYear, utcHours } = timePoint(instant);
  // The month blend must move with the clock, not in daily steps, or enhanced
  // mode would be discontinuous at every midnight instead of only looking it.
  const fractionalDayOfYear = dayOfYear + utcHours / 24;
  const solarIndex = resolveSolarIndex(query);
  const assumptions: string[] = [ADOPTED_MODEL_ASSUMPTION];
  if (solarIndex.assumption !== null) assumptions.push(solarIndex.assumption);
  if (solarIndex.clipped) {
    assumptions.push(
      `R12 ${solarIndex.requestedR12.toFixed(1)} exceeds the model ceiling of ` +
        `${MAX_R12} and was clipped; P.1239's linear-in-R12 assumption is not ` +
        "supported by the fitted maps above it.",
    );
  }

  let foF2MHz: number;
  let m3000F2: number;
  let solar: ReturnType<typeof solarParameters>;
  let foEResult: ReturnType<typeof foE>;

  if (query.mode === "reference") {
    const referenceHour = Math.floor(utcHours);
    const mapHour = referenceMapHour(referenceHour);
    ({ foF2MHz, m3000F2 } = evaluateReferenceGrid(
      asset.blocks[monthIndex],
      latitudeRad,
      longitudeRad,
      mapHour,
      solarIndex.r12,
    ));
    solar = solarParameters(
      latitudeRad,
      longitudeRad,
      monthIndex,
      referenceHour,
    );
    foEResult = foE({
      latitudeRad,
      monthIndex,
      utcHours: referenceHour,
      r12: solarIndex.r12,
      solar,
      clock: "reference",
    });
    assumptions.push(
      "Reference mode: month is taken as its 15th, the UTC hour is truncated, " +
        "and the map is read through P.533's 1.5-degree bilinear grid. The " +
        "result is discontinuous at month and hour boundaries because P.533 is.",
      "Reference mode reproduces the ITU implementation's mirrored " +
        "interpolation fractions outside the north-east quadrant, worth up to " +
        "0.1 MHz of foF2 in the western hemisphere. Use enhanced mode unless " +
        "you are reproducing an ITU golden.",
      "The ITU grid is hour-ending: slot i holds the map at UT = i + 1, so the " +
        `F2 map is evaluated at UT ${mapHour} for UTC hour ${referenceHour}, ` +
        "while the solar geometry uses the UTC hour itself. That one-hour " +
        "offset is the reference's, reproduced for parity.",
    );
  } else {
    const { earlier, later, weight } = monthAnchorBracket(
      fractionalDayOfYear,
      year,
    );
    const mapHour = referenceMapHour(utcHours);
    const a = evaluateMonth(
      asset.blocks[earlier],
      latitudeRad,
      longitudeRad,
      mapHour,
      solarIndex.r12,
    );
    const b = evaluateMonth(
      asset.blocks[later],
      latitudeRad,
      longitudeRad,
      mapHour,
      solarIndex.r12,
    );
    const mix = (low: number, high: number) => low + (high - low) * weight;
    foF2MHz = mix(a.foF2MHz, b.foF2MHz);
    m3000F2 = mix(a.m3000F2, b.m3000F2);
    solar = solarParameters(
      latitudeRad,
      longitudeRad,
      monthIndex,
      utcHours,
      dayOfYear,
    );
    // foE depends on the month only through the polar-winter branch, so the
    // same two-anchor blend keeps it continuous across the seam.
    const foEArgs = {
      latitudeRad,
      utcHours,
      r12: solarIndex.r12,
      solar,
      clock: "continuous",
    } as const;
    const foEEarlier = foE({ ...foEArgs, monthIndex: earlier });
    const foELater = foE({ ...foEArgs, monthIndex: later });
    foEResult = {
      foEMHz: mix(foEEarlier.foEMHz, foELater.foEMHz),
      branch: weight < 0.5 ? foEEarlier.branch : foELater.branch,
      flooredAtNightMinimum:
        foEEarlier.flooredAtNightMinimum && foELater.flooredAtNightMinimum,
    };
    assumptions.push(
      "Enhanced mode: the same numerical map evaluated continuously in UTC and " +
        `interpolated between the calendar 15th of month ${earlier + 1} ` +
        `(day ${dayOfYearOf(year, earlier, 15)} of ${year}) and month ` +
        `${later + 1}, the anchors of P.533's own monthly medians. ` +
        "Positive physical values are interpolated, never logarithms or " +
        "category labels. It agrees with reference mode at every " +
        "grid node on an anchor day and integer hour.",
    );
  }

  if (!Number.isFinite(foF2MHz) || foF2MHz <= 0) {
    throw new IonosphereAssetError(
      manifest.asset.served_at,
      `numerical map produced a non-physical foF2 of ${foF2MHz}`,
    );
  }

  const field = magneticField(latitudeRad, longitudeRad, 300);

  return deepFreeze({
    providerId: PROVIDER_ID,
    providerVersion: PROVIDER_VERSION,
    artifactHash: asset.artifactHash,
    mode: query.mode,
    coordinates: query.coordinates,
    validAt: query.validAt,
    foF2MHz,
    m3000F2,
    foEMHz: foEResult.foEMHz,
    nmF2PerM3: nmF2FromFoF2(foF2MHz),
    solarIndex: {
      r12: solarIndex.r12,
      requestedR12: solarIndex.requestedR12,
      clipped: solarIndex.clipped,
      source: solarIndex.source,
    },
    solar: {
      zenithAngleDeg: solar.zenithAngleRad * R2D,
      declinationDeg: solar.declinationRad * R2D,
      hourAngleDeg: solar.hourAngleRad * R2D,
      equationOfTimeMinutes: solar.equationOfTimeMinutes,
      sunriseUtcHours: solar.sunriseUtcHours,
      sunsetUtcHours: solar.sunsetUtcHours,
      solarNoonUtcHours: solar.solarNoonUtcHours,
    },
    magneticDip300kmDeg: field.dipRad * R2D,
    gyrofrequency300kmMHz: field.gyrofrequencyMHz,
    assumptions,
  });
}

/**
 * Build the provider. Resolving the asset is the only asynchronous step; once
 * it resolves, `state()` is synchronous and pure.
 */
export async function createCcirIonosphereProvider(
  byteSource?: AssetByteSource,
): Promise<IonosphereProvider> {
  const asset = privateCopy(await loadNumericalMapAsset(byteSource));
  return Object.freeze({
    id: PROVIDER_ID,
    version: PROVIDER_VERSION,
    artifactHash: asset.artifactHash,
    capabilities: CAPABILITIES,
    state: (query: IonosphereQuery) => buildState(asset, query),
  });
}

/**
 * Take the provider's own copy of the coefficients.
 *
 * The loader hands out read-only views, but a caller holding the asset can cast
 * that away, and the loader caches one asset for every provider. A provider that
 * closed over the shared arrays could therefore have its coefficients rewritten
 * after the digest was checked. 274 kB per provider buys the guarantee that a
 * state is a function of the artifact hash it reports.
 */
function privateCopy(asset: NumericalMapAsset): NumericalMapAsset {
  const copyBlock = (block: CoefficientBlock): CoefficientBlock =>
    Object.freeze({
      foF2: Float64Array.from(block.foF2),
      m3000F2: Float64Array.from(block.m3000F2),
    });
  return Object.freeze({
    artifactHash: asset.artifactHash,
    blocks: Object.freeze(
      asset.blocks.map((levels) =>
        Object.freeze([copyBlock(levels[0]), copyBlock(levels[1])] as const),
      ),
    ),
  });
}

/** Precisions the determinism digest rounds to, chosen well inside model error. */
const DIGEST_PRECISION = 1e-6;

function quantise(value: number): string {
  if (!Number.isFinite(value)) return "nan";
  return (Math.round(value / DIGEST_PRECISION) * DIGEST_PRECISION).toFixed(6);
}

/**
 * The identity of a state, and the only thing a cache key should be built from.
 *
 * `Math.sin` and `Math.pow` are permitted a 1-ulp spread between engines, so
 * two correct implementations can return states that differ in the last bit.
 * Rounding to 1e-6 (MHz, or dimensionless) before digesting makes the identity
 * stable across engines while staying four orders of magnitude finer than the
 * model's own uncertainty.
 */
export async function ionosphereStateDigest(
  state: IonosphereState,
): Promise<ArtifactHash> {
  const canonical = [
    state.providerId,
    state.providerVersion,
    state.artifactHash,
    state.mode,
    state.coordinates.latitude.toFixed(6),
    state.coordinates.longitude.toFixed(6),
    state.validAt,
    quantise(state.foF2MHz),
    quantise(state.m3000F2),
    quantise(state.foEMHz),
    quantise(state.solarIndex.r12),
    state.solarIndex.source,
  ].join("|");
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new IonosphereAssetError(
      manifest.asset.served_at,
      "WebCrypto SubtleCrypto is unavailable, so a state digest cannot be formed",
    );
  }
  const digest = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

/**
 * The single query whose digest pins cross-environment determinism, and the
 * digest it must produce.
 *
 * `provider.test.ts` runs under node and `numericalMap.test.ts` under jsdom;
 * both assert this literal for this query. Keeping the pair here, rather than
 * importing one test file from the other, means neither environment can borrow
 * the other's answer: if two JavaScript engines ever produce different states,
 * exactly one of the two assertions fails and the failure names the
 * environment.
 *
 * Regenerate the digest only when the coefficient asset or a declared precision
 * changes, and say which in the commit message.
 */
export const DETERMINISM_PROBE_QUERY: IonosphereQuery = Object.freeze({
  coordinates: canonicalCoordinates(30, 60),
  validAt: "2026-04-15T09:00:00Z",
  r12: known(80),
  mode: "reference",
});

export const DETERMINISM_PROBE_DIGEST: ArtifactHash =
  "sha256:d6062fb1354c1f78a877b8beea1d070ed759a9d55453f570adb8c31b900dacb5";

const registry = new Map<string, IonosphereProvider>();

/**
 * Extension point for an alternative climatology (IRI, an assimilative
 * nowcast). Nothing registered here inherits this provider's standards claim:
 * every state names the model that produced it.
 */
export function registerIonosphereProvider(provider: IonosphereProvider): void {
  registry.set(provider.id, provider);
}

export function getIonosphereProvider(
  id: string,
): IonosphereProvider | undefined {
  return registry.get(id);
}

export function clearIonosphereProviders(): void {
  registry.clear();
}
