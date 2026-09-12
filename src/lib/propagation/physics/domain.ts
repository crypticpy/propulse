/**
 * The declared domain of `propulse-physics-v1` (PROP-08, #954 slice E1).
 *
 * One request in, one admission or one named refusal out. Nothing here throws
 * and nothing here clamps: a request outside the domain comes back labelled,
 * with the bound it missed and the declared interval printed beside it, so a
 * caller can say what happened without guessing. That is mathematical contract
 * M03's "declared domain" clause and the reason this is a module of its own
 * rather than a handful of guards inside the solver.
 *
 * WHAT THE DOMAIN IS, AND WHERE EACH BOUND COMES FROM.
 *
 *  - FREQUENCY, 2 to 30 MHz inclusive. P.533-14's own recommends 1: "that the
 *    information contained in Annex 1 should be used for the prediction of
 *    sky-wave propagation at frequencies between 2 and 30 MHz". Outside it the
 *    recommendation makes no claim, so neither do we: `unsupported_frequency_band`.
 *    THE FREQUENCY IS NEVER CLAMPED. `noise/p372Noise.ts` does clamp its own
 *    frequency to the CCIR 322 map's 1 to 30 MHz fit, and says so; that clamp
 *    is inside a component of the answer, this bound is on the question.
 *  - ROUTE, a terrestrial great circle between two distinct, non-antipodal
 *    points on the declared sphere. `geometry/route.ts` resolves it, and this
 *    module resolves it ONCE and hands the result on, which is contract M06:
 *    every leaf downstream reads the same arc, azimuth and length.
 *    `pathDirection`, when given, must be exactly one of `PATH_DIRECTIONS`.
 *    A value outside that set is refused rather than defaulted, because
 *    `resolveRoute` would otherwise choose the short-path geometry for it
 *    while the invalid value is still copied into `route.direction`, leaving
 *    the label and the geometry disagreeing about which path was taken.
 *  - PATH LENGTH, up to the circumference of the declared sphere. Beyond that
 *    a "distance" is not a path, and `longPath/fM.ts` says the same with the
 *    same constant. There is no lower bound but the one the route itself
 *    imposes, because a short path is a short path.
 *  - MONTH 1 to 12 and UTC HOUR 0 to 23, both integers. The CCIR numerical map
 *    is a set of monthly coefficient blocks read at an integer UTC hour; a
 *    fractional month is not a coefficient block, and rounding one silently
 *    would move the answer by up to half a month of solar cycle.
 *  - R12, 0 to 160. The upper bound is `MAX_R12`, the ceiling the CCIR maps
 *    were fitted to; the provider clips above it and reports the clip, but a
 *    clip the caller never asked for is a silent answer to a different
 *    question, so the request is refused here instead.
 *  - NOISE BANDWIDTH, positive and finite. Equation (45)'s 10 log b has no
 *    value at zero and the contract's `snr2500` normalisation divides by it.
 *  - MAN-MADE NOISE, one of the four outdoor environmental categories
 *    ITU-R P.372-17 Table 1 publishes, or a figure the caller measured, or
 *    the declared absence of either. A request may not name a category
 *    P.372 does not have: see `ManMadeNoiseSetting`. An explicit figure's
 *    `famAt1MHzDb`, `slopeDbPerDecade`, `upperDecileDb` and `lowerDecileDb`
 *    are each bounded to the range ITU-R P.372's own tables span
 *    (`MIN_NOISE_FIGURE_DB` to `MAX_NOISE_FIGURE_DB`, `MAX_NOISE_SLOPE_DB_PER_DECADE`,
 *    `MAX_DECILE_DEVIATION_DB`), so a caller-supplied figure cannot carry an
 *    unphysical magnitude into `signalDeciles.ts`'s noise sum. The two decile
 *    fields must additionally be non-negative: they are magnitudes, and
 *    `signalDeciles.ts`'s `snrDecileDeviations` applies them directionally
 *    (`fa - dl` for the lower decile, `fa + du` for the upper), so a negative
 *    value would move the noise the wrong way and produce a plausible but
 *    wrong SNR decile. An `unavailable` setting's `reason` must be a
 *    non-empty string, because the solver labels the noise-dependent columns
 *    with it.
 *  - THE POWER BUDGET, when the caller supplies one. `transmitterPowerDbKw`,
 *    `transmitterGainDbi`, `receiverGainDbi` and `otherLossesDb` are optional,
 *    but when present each must be finite and within a physical bound
 *    (`MIN_TRANSMITTER_POWER_DB_KW`/`MAX_TRANSMITTER_POWER_DB_KW`,
 *    `MIN_ANTENNA_GAIN_DBI`/`MAX_ANTENNA_GAIN_DBI`,
 *    `MIN_OTHER_LOSSES_DB`/`MAX_OTHER_LOSSES_DB`): equations (43) and (44)
 *    form the received power from them, and `operationalMuf.ts` throws on a
 *    non-finite e.i.r.p. rather than answer a labelled result on its own; an
 *    unbounded finite value would instead pass that check and overflow a
 *    later power sum that is not itself in log-shifted form. `otherLossesDb`
 *    is additionally refused if negative, because it is a loss.
 *  - THE REQUEST ITSELF must be an object: `null`, `undefined`, or a
 *    primitive is refused as `malformed_request` before any field of it is
 *    read.
 *
 * WHAT THE DOMAIN IS NOT. The layers. `propulse-physics-v1` is P.533-14's
 * regular E and F2 layers and nothing else: no F1, no sporadic E, no ground
 * wave, no meteor or auroral scatter, no trans-equatorial or chordal mode.
 * Those are not rejectable inputs - no request asks for them - so they are
 * declared rather than refused: `DECLARED_DOMAIN.layers` names what is
 * modelled and `UNMODELLED_MECHANISMS` names what is not, and the solver puts
 * both on every result so that a report can say which mechanisms were in the
 * budget. A circuit that is in fact carried by sporadic E will still be
 * answered, with a P.533-14 E and F2 answer, and the declaration is what tells
 * the reader so.
 */

import {
  resolveRoute,
  type GeodeticPoint,
  type ResolvedRoute,
  type RouteDirection,
} from "@/lib/propagation/geometry/route";
import { MAX_R12 } from "@/lib/propagation/ionosphere/numericalMap";
import { MAX_ROUTE_DISTANCE_KM } from "./longPath/fM";

/** P.533-14, recommends 1: "at frequencies between 2 and 30 MHz". */
export const MIN_FREQUENCY_MHZ = 2;
/** P.533-14, recommends 1: "at frequencies between 2 and 30 MHz". */
export const MAX_FREQUENCY_MHZ = 30;

/** The CCIR numerical map is a monthly coefficient set, months 1 to 12. */
export const MIN_MONTH = 1;
export const MAX_MONTH = 12;

/** The map is read at an integer UTC hour, 0 to 23. */
export const MIN_UTC_HOUR = 0;
export const MAX_UTC_HOUR = 23;

/** R12 is a smoothed sunspot number and cannot be negative. */
export const MIN_R12 = 0;
/** `ionosphere/numericalMap.ts` MAX_R12: the ceiling the CCIR maps were fitted to. */
export const MAX_R12_IN_DOMAIN = MAX_R12;

/**
 * Power budget bounds, dB. Wide enough for any real HF station, so a
 * caller-supplied value cannot carry through equations (43) and (44) into
 * `fieldStrengthShort.ts`'s and `fieldStrengthLong.ts`'s power sums (which
 * are not all in the overflow-safe log-shifted form `signalDeciles.ts` uses)
 * and overflow one. `transmitterPowerDbKw` is dB above 1 kW; a guidance
 * range of -60 to 90 dBW for real transmitters shifts by -30 dB to this unit.
 */
export const MIN_TRANSMITTER_POWER_DB_KW = -90;
export const MAX_TRANSMITTER_POWER_DB_KW = 60;
/** No real antenna's boresight gain falls outside dBi [-60, 60]. */
export const MIN_ANTENNA_GAIN_DBI = -60;
export const MAX_ANTENNA_GAIN_DBI = 60;
/** `otherLossesDb` is a caller-supplied extra fixed loss; a loss cannot be negative, and this is generous headroom above any real HF path loss component. */
export const MIN_OTHER_LOSSES_DB = 0;
export const MAX_OTHER_LOSSES_DB = 300;

/**
 * Man-made noise bounds, dB. ITU-R P.372's noise figure Fa, referenced to
 * kT0b, spans roughly this range across its HF tables; a value outside it is
 * not a figure P.372 would publish.
 */
export const MIN_NOISE_FIGURE_DB = -30;
export const MAX_NOISE_FIGURE_DB = 250;
/** P.372's published decile deviations are single- or double-digit dB; this is generous. */
export const MAX_DECILE_DEVIATION_DB = 60;
/** P.372-17 Table 1 publishes 27.7 for curves A to C; generous margin for a caller-supplied override of equation (17)'s d. */
export const MAX_NOISE_SLOPE_DB_PER_DECADE = 100;

/**
 * The path directions `geometry/route.ts` resolves a route in.
 *
 * Tied to the imported `RouteDirection` type with a `satisfies Record<...>`
 * membership map rather than re-declared as a plain literal, so the two
 * cannot drift: a third direction added to `route.ts` fails this file's
 * typecheck until it is named here too, and a name here that `route.ts`
 * does not recognise fails the same way.
 */
const PATH_DIRECTION_MEMBERSHIP = {
  short: true,
  long: true,
} as const satisfies Record<RouteDirection, true>;

export const PATH_DIRECTIONS = Object.keys(
  PATH_DIRECTION_MEMBERSHIP,
) as readonly RouteDirection[];

/**
 * The man-made noise environment categories, which are exactly the four rows
 * of ITU-R P.372-17 Table 1 that are outdoor environments.
 *
 * P.372-17 Part 6 gives Fam = c - d log10 f (equation (17)) for city (curve A),
 * residential (curve B), rural (curve C) and quiet rural (curve D); curve E of
 * the same table is galactic noise, which is not an environment and is added to
 * every circuit regardless. The category is a property of the receiving site
 * that no model can derive from a coordinate, so it is an input.
 *
 * There is no "quiet" and no "noisy" here. Both names appear in HF prediction
 * software, including the ITU reference build this repository uses as a parity
 * oracle, and neither is in P.372-17. Admitting them would mean shipping two
 * unsourced constants behind the same interface as four sourced ones, so a
 * caller that has one of them declares it with `kind: "unavailable"` and gets
 * an answer whose noise-dependent columns are labelled rather than guessed.
 */
export const MAN_MADE_NOISE_CATEGORIES = [
  "city",
  "residential",
  "rural",
  "quiet_rural",
] as const;

export type ManMadeNoiseCategory = (typeof MAN_MADE_NOISE_CATEGORIES)[number];

/**
 * What the receiver's man-made noise is.
 *
 * Three cases, and the third is the point. `category` is one of P.372-17's
 * published environments. `explicit` is a figure the caller measured or was
 * given, stated at 1 MHz because that is equation (17)'s own c, and carried
 * along the published slope unless the caller supplies its own.
 * `unavailable` is the honest answer when neither exists: the solver then
 * answers the MUF and field-strength questions and labels every noise-dependent
 * one, instead of substituting a category the caller did not choose.
 */
export type ManMadeNoiseSetting =
  | { readonly kind: "category"; readonly category: ManMadeNoiseCategory }
  | {
      readonly kind: "explicit";
      /** `c` of P.372-17 equation (17): Fam at 1 MHz, dB above kT0b. */
      readonly famAt1MHzDb: number;
      /** P.372-17 equation (17)'s d. Defaults to 27.7, the value Table 1 shares across curves A to C. */
      readonly slopeDbPerDecade?: number;
      /** Upper decile deviation with time, dB. Omitted means not known. */
      readonly upperDecileDb?: number;
      /** Lower decile deviation with time, dB. Omitted means not known. */
      readonly lowerDecileDb?: number;
    }
  | {
      readonly kind: "unavailable";
      /** Why there is no man-made noise figure for this receiver. */
      readonly reason: string;
    };

/** The layers `propulse-physics-v1` models. */
export const MODELLED_LAYERS = ["E", "F2"] as const;

/**
 * Mechanisms P.533-14's sky-wave method does not model, named so that a
 * consumer can say what is missing rather than infer it from a number.
 *
 * Not refusals: no field of a circuit request selects one. They are on the
 * declaration because a 3 MHz 300 km circuit answered by E and F2 alone is a
 * different claim from one answered by ground wave, and a reader is entitled
 * to know which claim was made.
 */
export const UNMODELLED_MECHANISMS = [
  "ground_wave",
  "sporadic_e",
  "f1_layer",
  "meteor_scatter",
  "auroral_scatter",
  "trans_equatorial",
  "chordal_and_ducted",
] as const;

export type UnmodelledMechanism = (typeof UNMODELLED_MECHANISMS)[number];

/** The declared domain, as data, so a refusal can print it. */
export interface DeclaredDomain {
  readonly modelId: string;
  readonly frequencyMHz: { readonly min: number; readonly max: number };
  readonly month: { readonly min: number; readonly max: number };
  readonly utcHour: { readonly min: number; readonly max: number };
  readonly r12: { readonly min: number; readonly max: number };
  readonly groundDistanceKm: { readonly min: number; readonly max: number };
  readonly layers: readonly (typeof MODELLED_LAYERS)[number][];
  readonly unmodelledMechanisms: readonly UnmodelledMechanism[];
  readonly routeGeometry: string;
}

/** The model identity contract M03 names for the TypeScript leaves. */
export const MODEL_ID = "propulse-physics-v1";

export const DECLARED_DOMAIN: DeclaredDomain = Object.freeze({
  modelId: MODEL_ID,
  frequencyMHz: Object.freeze({
    min: MIN_FREQUENCY_MHZ,
    max: MAX_FREQUENCY_MHZ,
  }),
  month: Object.freeze({ min: MIN_MONTH, max: MAX_MONTH }),
  utcHour: Object.freeze({ min: MIN_UTC_HOUR, max: MAX_UTC_HOUR }),
  r12: Object.freeze({ min: MIN_R12, max: MAX_R12_IN_DOMAIN }),
  groundDistanceKm: Object.freeze({ min: 0, max: MAX_ROUTE_DISTANCE_KM }),
  layers: Object.freeze([...MODELLED_LAYERS]),
  unmodelledMechanisms: Object.freeze([...UNMODELLED_MECHANISMS]),
  routeGeometry:
    "terrestrial great circle on the declared sphere between two distinct, " +
    "non-antipodal points; short or long path chosen by the request",
});

/** A circuit request, before anything has been checked. */
export interface CircuitRequest {
  readonly transmitter: GeodeticPoint;
  readonly receiver: GeodeticPoint;
  /** The operating frequency, MHz. */
  readonly frequencyMHz: number;
  /** Calendar month, 1 to 12. */
  readonly month: number;
  /** UTC hour, 0 to 23. */
  readonly utcHour: number;
  /** The smoothed sunspot number R12, in the CCIR series. */
  readonly r12: number;
  /** The receiver's noise bandwidth b, Hz. Equation (45)'s 10 log b. */
  readonly bandwidthHz: number;
  /** The receiver's man-made noise environment, P.372 section 5. */
  readonly manMadeNoise: ManMadeNoiseSetting;
  /** Which way round the great circle. Defaults to the short path. */
  readonly pathDirection?: RouteDirection;
  /** Transmitter power, dB above 1 kW. Defaults to the leaf's own default. */
  readonly transmitterPowerDbKw?: number;
  /** Transmitter gain in the mode's direction, dBi. Defaults to isotropic. */
  readonly transmitterGainDbi?: number;
  /** Receiver gain in the mode's direction, dBi. Defaults to isotropic. */
  readonly receiverGainDbi?: number;
  /** Any further fixed loss the caller wants in the budget, dB. */
  readonly otherLossesDb?: number;
}

/** Which bound a request missed. */
export type CircuitDomainReason =
  /** The request itself is not an object: `null`, `undefined`, or a primitive. */
  | "malformed_request"
  | "unsupported_frequency_band"
  | "unsupported_coordinates"
  | "unsupported_route_geometry"
  | "unsupported_path_direction"
  | "unsupported_path_length"
  | "unsupported_month"
  | "unsupported_utc_hour"
  | "unsupported_solar_index"
  | "unsupported_bandwidth"
  | "unsupported_power_budget"
  | "unsupported_noise_environment";

export interface AdmittedCircuitRequest {
  readonly kind: "admitted";
  /**
   * The route, resolved exactly once (contract M06). Every leaf the solver
   * runs reads this object; none of them resolves a route of its own.
   */
  readonly route: ResolvedRoute;
  readonly request: CircuitRequest;
  readonly declaredDomain: DeclaredDomain;
}

export interface RefusedCircuitRequest {
  readonly kind: "out_of_domain";
  readonly reason: CircuitDomainReason;
  /** What was asked for and what the domain is, in one sentence. */
  readonly detail: string;
  readonly declaredDomain: DeclaredDomain;
}

export type CircuitDomainResult =
  | AdmittedCircuitRequest
  | RefusedCircuitRequest;

/**
 * Admit a circuit request, or name the bound it missed.
 *
 * Never throws and never modifies the request. The order of the checks is the
 * order a reader would ask the questions in - where, how far, when, at what
 * frequency, into what receiver - and it matters only in that the first
 * failure is the one reported.
 */
export function circuitDomain(request: CircuitRequest): CircuitDomainResult {
  if (!isPlainObject(request)) {
    return refuse(
      "malformed_request",
      `the request is ${describeValue(request)}; a circuit request must be an ` +
        "object naming a transmitter, a receiver, a frequency, and the " +
        "rest of the fields this function checks below.",
    );
  }

  // Every field below is read off `request` exactly once, into a local, and
  // every check and every refusal message below reads the local rather than
  // going back to `request`. A second independent read of the same field can
  // return a different value from a getter or a Proxy, which is the shape of
  // bug this guards against: a value that was validated is not necessarily
  // the value that gets used, or the value that ends up in the admitted
  // record F7 builds below.
  const transmitter = request.transmitter;
  const receiver = request.receiver;
  const endpoints = checkEndpoints(transmitter, receiver);
  if (endpoints !== null) return endpoints;

  const pathDirection = request.pathDirection;
  const pathDirectionRefusal = checkPathDirection(pathDirection);
  if (pathDirectionRefusal !== null) return pathDirectionRefusal;

  const route = resolveRoute(transmitter, receiver, {
    direction: pathDirection ?? "short",
  });
  if (route.kind !== "resolved") {
    return refuse(
      "unsupported_route_geometry",
      `the two endpoints have no unique great circle (${route.reason}): ${route.detail}`,
    );
  }
  if (
    !Number.isFinite(route.groundDistanceKm) ||
    route.groundDistanceKm <= 0 ||
    route.groundDistanceKm > MAX_ROUTE_DISTANCE_KM
  ) {
    return refuse(
      "unsupported_path_length",
      `the route is ${describeValue(route.groundDistanceKm)} km; ` +
        `${MODEL_ID} models path lengths above 0 km and up to the ` +
        `${MAX_ROUTE_DISTANCE_KM.toFixed(1)} km circumference of the declared sphere.`,
    );
  }

  const month = request.month;
  if (!isInteger(month, MIN_MONTH, MAX_MONTH)) {
    return refuse(
      "unsupported_month",
      `the month is ${describeValue(month)}; the CCIR numerical map is a set of ` +
        `monthly coefficient blocks and ${MODEL_ID} reads integer months ` +
        `${describeValue(MIN_MONTH)} to ${describeValue(MAX_MONTH)}.`,
    );
  }
  const utcHour = request.utcHour;
  if (!isInteger(utcHour, MIN_UTC_HOUR, MAX_UTC_HOUR)) {
    return refuse(
      "unsupported_utc_hour",
      `the UTC hour is ${describeValue(utcHour)}; ${MODEL_ID} reads integer ` +
        `hours ${describeValue(MIN_UTC_HOUR)} to ${describeValue(MAX_UTC_HOUR)}.`,
    );
  }

  const frequencyMHz = request.frequencyMHz;
  if (
    !Number.isFinite(frequencyMHz) ||
    frequencyMHz < MIN_FREQUENCY_MHZ ||
    frequencyMHz > MAX_FREQUENCY_MHZ
  ) {
    return refuse(
      "unsupported_frequency_band",
      `the frequency is ${describeValue(frequencyMHz)} MHz; P.533-14 recommends ` +
        `its method "for the prediction of sky-wave propagation at frequencies ` +
        `between 2 and 30 MHz", so the declared domain of ${MODEL_ID} is ` +
        `${describeValue(MIN_FREQUENCY_MHZ)} to ${describeValue(MAX_FREQUENCY_MHZ)} MHz inclusive. ` +
        "The frequency is not clamped into it.",
    );
  }

  const r12 = request.r12;
  if (!Number.isFinite(r12) || r12 < MIN_R12 || r12 > MAX_R12_IN_DOMAIN) {
    return refuse(
      "unsupported_solar_index",
      `R12 is ${describeValue(r12)}; the CCIR numerical maps are fitted up to ` +
        `R12 ${describeValue(MAX_R12_IN_DOMAIN)}, so the declared domain is ` +
        `${describeValue(MIN_R12)} to ${describeValue(MAX_R12_IN_DOMAIN)}. The provider would clip a ` +
        "higher value and report the clip; answering a question the caller did " +
        "not ask is worse than refusing the one it did.",
    );
  }

  // No upper bound: bandwidthHz enters only as equation (45)'s 10 log10 b,
  // which is finite for every positive finite double, so there is no
  // magnitude a ceiling would protect against.
  const bandwidthHz = request.bandwidthHz;
  if (!Number.isFinite(bandwidthHz) || bandwidthHz <= 0) {
    return refuse(
      "unsupported_bandwidth",
      `the noise bandwidth is ${describeValue(bandwidthHz)} Hz; equation (45)'s ` +
        "10 log10 b needs a positive finite bandwidth.",
    );
  }

  const transmitterPowerDbKw = request.transmitterPowerDbKw;
  const transmitterGainDbi = request.transmitterGainDbi;
  const receiverGainDbi = request.receiverGainDbi;
  const otherLossesDb = request.otherLossesDb;
  const powerBudget = checkPowerBudget({
    transmitterPowerDbKw,
    transmitterGainDbi,
    receiverGainDbi,
    otherLossesDb,
  });
  if (powerBudget !== null) return powerBudget;

  const manMadeNoise = request.manMadeNoise;
  const noise = checkManMadeNoise(manMadeNoise);
  if (noise !== null) return noise;

  // The admitted record is a frozen, field-by-field copy of what was
  // checked above, not the caller's own object (F7): every check ran
  // against the object's state at check time, and the validated-ness of a
  // request is not a property of the request. A caller that mutates its
  // own object after admission must not be able to change what the solver
  // reads. The nested endpoint and noise objects are copied too, for the
  // same reason.
  const admittedRequest: CircuitRequest = Object.freeze({
    transmitter: { ...transmitter },
    receiver: { ...receiver },
    frequencyMHz,
    month,
    utcHour,
    r12,
    bandwidthHz,
    manMadeNoise: { ...manMadeNoise } as ManMadeNoiseSetting,
    pathDirection,
    transmitterPowerDbKw,
    transmitterGainDbi,
    receiverGainDbi,
    otherLossesDb,
  });

  return {
    kind: "admitted",
    route,
    request: admittedRequest,
    declaredDomain: DECLARED_DOMAIN,
  };
}

function checkEndpoints(
  transmitter: GeodeticPoint,
  receiver: GeodeticPoint,
): RefusedCircuitRequest | null {
  const ends: readonly (readonly [string, GeodeticPoint])[] = [
    ["transmitter", transmitter],
    ["receiver", receiver],
  ];
  for (const [name, point] of ends) {
    if (!isPlainObject(point)) {
      return refuse(
        "unsupported_coordinates",
        `the ${name} is ${describeValue(point)}; a terrestrial endpoint must be an ` +
          "object with a finite latitude and longitude.",
      );
    }
    if (
      !Number.isFinite(point.latitudeDeg) ||
      !Number.isFinite(point.longitudeDeg) ||
      Math.abs(point.latitudeDeg) > 90 ||
      Math.abs(point.longitudeDeg) > 360
    ) {
      return refuse(
        "unsupported_coordinates",
        `the ${name} is at ${describeValue(point.latitudeDeg)}, ${describeValue(point.longitudeDeg)}; ` +
          "a terrestrial endpoint has a finite latitude in [-90, 90] and a " +
          "finite longitude in [-360, 360] degrees.",
      );
    }
  }
  return null;
}

/**
 * `pathDirection` is optional, and when it is a request from untyped JSON it
 * may name a typo such as `"lng"` rather than `"long"`. `resolveRoute` only
 * recognises the literal `"long"`; anything else, including a near-miss
 * spelling or the wrong case, gets short-path geometry while the invalid
 * value is still copied into `route.direction`, so the admitted route's
 * label and its geometry would disagree. Refused here, before the route is
 * ever resolved.
 */
function checkPathDirection(
  pathDirection: RouteDirection | undefined,
): RefusedCircuitRequest | null {
  if (pathDirection === undefined) return null;
  if (!(PATH_DIRECTIONS as readonly string[]).includes(pathDirection)) {
    return refuse(
      "unsupported_path_direction",
      `the path direction is "${describeValue(pathDirection)}"; geometry/route.ts ` +
        `resolves a route as one of ${PATH_DIRECTIONS.join(", ")}.`,
    );
  }
  return null;
}

/** The four optional fields of the power budget, already read once off the request. */
interface PowerBudgetFields {
  readonly transmitterPowerDbKw: number | undefined;
  readonly transmitterGainDbi: number | undefined;
  readonly receiverGainDbi: number | undefined;
  readonly otherLossesDb: number | undefined;
}

/**
 * The four optional fields of the power budget, none of which solveCircuit's
 * own leaves check: `operationalMuf.ts` throws `eirpDbW must be finite` and
 * `fieldStrengthShort.ts`'s equations (43) and (44) would carry a NaN or an
 * infinity through the whole loss budget rather than fail loudly. A request
 * this module admits must never reach either, so the check is here instead.
 *
 * Takes the already-read local values rather than the request itself, so
 * that a field already read once by the caller (`circuitDomain`) is not read
 * a second time off `request` here.
 */
function checkPowerBudget(
  fields: PowerBudgetFields,
): RefusedCircuitRequest | null {
  const {
    transmitterPowerDbKw,
    transmitterGainDbi,
    receiverGainDbi,
    otherLossesDb,
  } = fields;
  const finiteChecks: readonly (readonly [
    string,
    number | undefined,
    string,
  ])[] = [
    ["the transmitter power", transmitterPowerDbKw, "dB(1 kW)"],
    ["the transmitter gain", transmitterGainDbi, "dBi"],
    ["the receiver gain", receiverGainDbi, "dBi"],
    ["the other losses", otherLossesDb, "dB"],
  ];
  for (const [name, value, unit] of finiteChecks) {
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      return refuse(
        "unsupported_power_budget",
        `${name} is ${describeValue(value)} ${unit}; equations (43) and (44) of ` +
          `P.533-14 need a finite power budget, so ${MODEL_ID} refuses the ` +
          "request rather than letting solveCircuit fail on one it should " +
          "never have admitted.",
      );
    }
  }
  if (otherLossesDb !== undefined && otherLossesDb < 0) {
    return refuse(
      "unsupported_power_budget",
      `the other losses are ${describeValue(otherLossesDb)} dB; ` +
        "otherLossesDb is a loss added to the budget by equation (44), so it " +
        "cannot be negative.",
    );
  }

  const bounds: readonly (readonly [
    string,
    number | undefined,
    string,
    number,
    number,
  ])[] = [
    [
      "the transmitter power",
      transmitterPowerDbKw,
      "dB(1 kW)",
      MIN_TRANSMITTER_POWER_DB_KW,
      MAX_TRANSMITTER_POWER_DB_KW,
    ],
    [
      "the transmitter gain",
      transmitterGainDbi,
      "dBi",
      MIN_ANTENNA_GAIN_DBI,
      MAX_ANTENNA_GAIN_DBI,
    ],
    [
      "the receiver gain",
      receiverGainDbi,
      "dBi",
      MIN_ANTENNA_GAIN_DBI,
      MAX_ANTENNA_GAIN_DBI,
    ],
    [
      "the other losses",
      otherLossesDb,
      "dB",
      MIN_OTHER_LOSSES_DB,
      MAX_OTHER_LOSSES_DB,
    ],
  ];
  for (const [name, value, unit, min, max] of bounds) {
    if (value === undefined) continue;
    if (value < min || value > max) {
      return refuse(
        "unsupported_power_budget",
        `${name} is ${describeValue(value)} ${unit}; ${MODEL_ID} bounds it to ` +
          `${describeValue(min)} to ${describeValue(max)} ${unit}, a range wide enough ` +
          "for any real station, so a value outside it is refused rather " +
          "than carried into a downstream power sum that assumes a " +
          "physical input.",
      );
    }
  }
  return null;
}

function checkManMadeNoise(
  setting: ManMadeNoiseSetting,
): RefusedCircuitRequest | null {
  if (!isPlainObject(setting)) {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise setting is ${describeValue(setting)}; it must be one of ` +
        "category, explicit or unavailable.",
    );
  }
  if (setting.kind === "unavailable") {
    if (typeof setting.reason !== "string" || setting.reason.length === 0) {
      return refuse(
        "unsupported_noise_environment",
        `the unavailable man-made noise setting gives reason as ` +
          `${describeValue(setting.reason)}; a caller declaring the figure ` +
          "unavailable must say why, as a non-empty string, so the solver " +
          "can label the noise-dependent columns with it.",
      );
    }
    // Not otherwise a refusal. The caller has said it has no figure, which
    // is a fact about the receiver, not a malformed request; the solver
    // labels the columns that needed one.
    return null;
  }
  if (setting.kind === "explicit") {
    const finiteFields: readonly (readonly [string, number | undefined])[] = [
      ["c, Fam at 1 MHz", setting.famAt1MHzDb],
      ["the slope d", setting.slopeDbPerDecade],
      ["the upper decile", setting.upperDecileDb],
      ["the lower decile", setting.lowerDecileDb],
    ];
    for (const [name, value] of finiteFields) {
      if (value === undefined) continue;
      if (!Number.isFinite(value)) {
        return refuse(
          "unsupported_noise_environment",
          `the explicit man-made noise setting gives ${name} as ` +
            `${describeValue(value)} dB; P.372-17 equation (17) needs finite values.`,
        );
      }
    }

    const deciles: readonly (readonly [string, number | undefined])[] = [
      ["the upper decile", setting.upperDecileDb],
      ["the lower decile", setting.lowerDecileDb],
    ];
    for (const [name, value] of deciles) {
      if (value === undefined) continue;
      if (value < 0) {
        return refuse(
          "unsupported_noise_environment",
          `${name} is ${describeValue(value)} dB; P.842-5's decile deviations are ` +
            "non-negative magnitudes that signalDeciles.ts's " +
            "snrDecileDeviations applies directionally (fa - dl for the " +
            "lower decile, fa + du for the upper), so a negative value would " +
            "move the noise the wrong way and yield a plausible but wrong " +
            "SNR decile.",
        );
      }
      if (value > MAX_DECILE_DEVIATION_DB) {
        return refuse(
          "unsupported_noise_environment",
          `${name} is ${describeValue(value)} dB; ITU-R P.372's published decile ` +
            `deviations are single- or double-digit dB, so ${MODEL_ID} ` +
            `bounds it to 0 to ${describeValue(MAX_DECILE_DEVIATION_DB)} dB, wide ` +
            "enough for any real receiver, so a value outside it is refused " +
            "rather than carried unbounded into signalDeciles.ts's noise sum.",
        );
      }
    }

    if (
      setting.slopeDbPerDecade !== undefined &&
      (setting.slopeDbPerDecade < 0 ||
        setting.slopeDbPerDecade > MAX_NOISE_SLOPE_DB_PER_DECADE)
    ) {
      return refuse(
        "unsupported_noise_environment",
        `the slope d is ${describeValue(setting.slopeDbPerDecade)} dB/decade; ` +
          "P.372-17 Table 1 publishes 27.7 for curves A to C, so " +
          `${MODEL_ID} bounds a caller-supplied slope to 0 to ` +
          `${describeValue(MAX_NOISE_SLOPE_DB_PER_DECADE)} dB/decade, wide enough ` +
          "for any real curve, so a value outside it is refused rather " +
          "than carried unbounded into equation (17)'s Fam.",
      );
    }

    if (
      !Number.isFinite(setting.famAt1MHzDb) ||
      setting.famAt1MHzDb < MIN_NOISE_FIGURE_DB ||
      setting.famAt1MHzDb > MAX_NOISE_FIGURE_DB
    ) {
      return refuse(
        "unsupported_noise_environment",
        `the explicit man-made noise figure is ${describeValue(setting.famAt1MHzDb)} dB; ` +
          "P.372-17 equation (17) needs a finite c, the value of Fam at 1 MHz, " +
          `and ${MODEL_ID} bounds it to ${describeValue(MIN_NOISE_FIGURE_DB)} to ` +
          `${describeValue(MAX_NOISE_FIGURE_DB)} dB, the range ITU-R P.372's noise ` +
          "figure tables span above kT0b.",
      );
    }
    return null;
  }
  if (setting.kind !== "category") {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise setting kind is ` +
        `"${describeValue((setting as { kind: unknown }).kind)}"; it must be one of ` +
        "category, explicit or unavailable.",
    );
  }
  if (
    !(MAN_MADE_NOISE_CATEGORIES as readonly string[]).includes(setting.category)
  ) {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise category is "${describeValue(setting.category)}"; ` +
        "ITU-R P.372-17 Table 1 names " +
        `${MAN_MADE_NOISE_CATEGORIES.join(", ")}. A category from outside that ` +
        "table has no published c and d, so it is refused rather than mapped " +
        'onto a neighbour; pass { kind: "unavailable" } instead.',
    );
  }
  return null;
}

function isInteger(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * True when a property read on `value` is safe: not `null`, `undefined`, or
 * a primitive such as a number, string, or array element accessed as if it
 * were a record. Used before every dereference of a caller-supplied
 * container, so a malformed request is refused instead of throwing.
 */
function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuse(
  reason: CircuitDomainReason,
  detail: string,
): RefusedCircuitRequest {
  return {
    kind: "out_of_domain",
    reason,
    detail,
    declaredDomain: DECLARED_DOMAIN,
  };
}

/** Format boundary diagnostics without invoking caller-controlled coercion. */
function describeValue(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return Array.isArray(value) ? "[array]" : "[object]";
  }
  return String(value);
}
