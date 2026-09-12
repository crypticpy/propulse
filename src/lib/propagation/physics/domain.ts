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
 *    P.372 does not have: see `ManMadeNoiseSetting`.
 *  - THE POWER BUDGET, when the caller supplies one. `transmitterPowerDbKw`,
 *    `transmitterGainDbi`, `receiverGainDbi` and `otherLossesDb` are optional,
 *    but when present each must be finite: equations (43) and (44) form the
 *    received power from them, and `operationalMuf.ts` throws on a non-finite
 *    e.i.r.p. rather than answer a labelled result on its own. `otherLossesDb`
 *    is additionally refused if negative, because it is a loss.
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
  | "unsupported_frequency_band"
  | "unsupported_coordinates"
  | "unsupported_route_geometry"
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
  AdmittedCircuitRequest | RefusedCircuitRequest;

/**
 * Admit a circuit request, or name the bound it missed.
 *
 * Never throws and never modifies the request. The order of the checks is the
 * order a reader would ask the questions in - where, how far, when, at what
 * frequency, into what receiver - and it matters only in that the first
 * failure is the one reported.
 */
export function circuitDomain(request: CircuitRequest): CircuitDomainResult {
  const endpoints = checkEndpoints(request);
  if (endpoints !== null) return endpoints;

  const route = resolveRoute(request.transmitter, request.receiver, {
    direction: request.pathDirection ?? "short",
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
      `the route is ${String(route.groundDistanceKm)} km; ` +
        `${MODEL_ID} models path lengths above 0 km and up to the ` +
        `${MAX_ROUTE_DISTANCE_KM.toFixed(1)} km circumference of the declared sphere.`,
    );
  }

  if (!isInteger(request.month, MIN_MONTH, MAX_MONTH)) {
    return refuse(
      "unsupported_month",
      `the month is ${String(request.month)}; the CCIR numerical map is a set of ` +
        `monthly coefficient blocks and ${MODEL_ID} reads integer months ` +
        `${String(MIN_MONTH)} to ${String(MAX_MONTH)}.`,
    );
  }
  if (!isInteger(request.utcHour, MIN_UTC_HOUR, MAX_UTC_HOUR)) {
    return refuse(
      "unsupported_utc_hour",
      `the UTC hour is ${String(request.utcHour)}; ${MODEL_ID} reads integer ` +
        `hours ${String(MIN_UTC_HOUR)} to ${String(MAX_UTC_HOUR)}.`,
    );
  }

  if (
    !Number.isFinite(request.frequencyMHz) ||
    request.frequencyMHz < MIN_FREQUENCY_MHZ ||
    request.frequencyMHz > MAX_FREQUENCY_MHZ
  ) {
    return refuse(
      "unsupported_frequency_band",
      `the frequency is ${String(request.frequencyMHz)} MHz; P.533-14 recommends ` +
        `its method "for the prediction of sky-wave propagation at frequencies ` +
        `between 2 and 30 MHz", so the declared domain of ${MODEL_ID} is ` +
        `${String(MIN_FREQUENCY_MHZ)} to ${String(MAX_FREQUENCY_MHZ)} MHz inclusive. ` +
        "The frequency is not clamped into it.",
    );
  }

  if (
    !Number.isFinite(request.r12) ||
    request.r12 < MIN_R12 ||
    request.r12 > MAX_R12_IN_DOMAIN
  ) {
    return refuse(
      "unsupported_solar_index",
      `R12 is ${String(request.r12)}; the CCIR numerical maps are fitted up to ` +
        `R12 ${String(MAX_R12_IN_DOMAIN)}, so the declared domain is ` +
        `${String(MIN_R12)} to ${String(MAX_R12_IN_DOMAIN)}. The provider would clip a ` +
        "higher value and report the clip; answering a question the caller did " +
        "not ask is worse than refusing the one it did.",
    );
  }

  if (!Number.isFinite(request.bandwidthHz) || request.bandwidthHz <= 0) {
    return refuse(
      "unsupported_bandwidth",
      `the noise bandwidth is ${String(request.bandwidthHz)} Hz; equation (45)'s ` +
        "10 log10 b needs a positive finite bandwidth.",
    );
  }

  const powerBudget = checkPowerBudget(request);
  if (powerBudget !== null) return powerBudget;

  const noise = checkManMadeNoise(request.manMadeNoise);
  if (noise !== null) return noise;

  return {
    kind: "admitted",
    route,
    request,
    declaredDomain: DECLARED_DOMAIN,
  };
}

function checkEndpoints(request: CircuitRequest): RefusedCircuitRequest | null {
  const ends: readonly (readonly [string, GeodeticPoint])[] = [
    ["transmitter", request.transmitter],
    ["receiver", request.receiver],
  ];
  for (const [name, point] of ends) {
    if (
      !Number.isFinite(point.latitudeDeg) ||
      !Number.isFinite(point.longitudeDeg) ||
      Math.abs(point.latitudeDeg) > 90 ||
      Math.abs(point.longitudeDeg) > 360
    ) {
      return refuse(
        "unsupported_coordinates",
        `the ${name} is at ${String(point.latitudeDeg)}, ${String(point.longitudeDeg)}; ` +
          "a terrestrial endpoint has a finite latitude in [-90, 90] and a " +
          "finite longitude in [-360, 360] degrees.",
      );
    }
  }
  return null;
}

/**
 * The four optional fields of the power budget, none of which solveCircuit's
 * own leaves check: `operationalMuf.ts` throws `eirpDbW must be finite` and
 * `fieldStrengthShort.ts`'s equations (43) and (44) would carry a NaN or an
 * infinity through the whole loss budget rather than fail loudly. A request
 * this module admits must never reach either, so the check is here instead.
 */
function checkPowerBudget(
  request: CircuitRequest,
): RefusedCircuitRequest | null {
  const fields: readonly (readonly [string, number | undefined, string])[] = [
    ["the transmitter power", request.transmitterPowerDbKw, "dB(1 kW)"],
    ["the transmitter gain", request.transmitterGainDbi, "dBi"],
    ["the receiver gain", request.receiverGainDbi, "dBi"],
    ["the other losses", request.otherLossesDb, "dB"],
  ];
  for (const [name, value, unit] of fields) {
    if (value === undefined) continue;
    if (!Number.isFinite(value)) {
      return refuse(
        "unsupported_power_budget",
        `${name} is ${String(value)} ${unit}; equations (43) and (44) of ` +
          `P.533-14 need a finite power budget, so ${MODEL_ID} refuses the ` +
          "request rather than letting solveCircuit fail on one it should " +
          "never have admitted.",
      );
    }
  }
  if (request.otherLossesDb !== undefined && request.otherLossesDb < 0) {
    return refuse(
      "unsupported_power_budget",
      `the other losses are ${String(request.otherLossesDb)} dB; ` +
        "otherLossesDb is a loss added to the budget by equation (44), so it " +
        "cannot be negative.",
    );
  }
  return null;
}

function checkManMadeNoise(
  setting: ManMadeNoiseSetting,
): RefusedCircuitRequest | null {
  if (setting === null || typeof setting !== "object") {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise setting is ${String(setting)}; it must be one of ` +
        "category, explicit or unavailable.",
    );
  }
  if (setting.kind === "unavailable") {
    // Not a refusal. The caller has said it has no figure, which is a fact
    // about the receiver, not a malformed request; the solver labels the
    // columns that needed one.
    return null;
  }
  if (setting.kind === "explicit") {
    const numbers: readonly (readonly [string, number | undefined])[] = [
      ["c, Fam at 1 MHz", setting.famAt1MHzDb],
      ["the slope d", setting.slopeDbPerDecade],
      ["the upper decile", setting.upperDecileDb],
      ["the lower decile", setting.lowerDecileDb],
    ];
    for (const [name, value] of numbers) {
      if (value !== undefined && !Number.isFinite(value)) {
        return refuse(
          "unsupported_noise_environment",
          `the explicit man-made noise setting gives ${name} as ` +
            `${String(value)} dB; P.372-17 equation (17) needs finite values.`,
        );
      }
    }
    if (!Number.isFinite(setting.famAt1MHzDb)) {
      return refuse(
        "unsupported_noise_environment",
        `the explicit man-made noise figure is ${String(setting.famAt1MHzDb)} dB; ` +
          "P.372-17 equation (17) needs a finite c, the value of Fam at 1 MHz.",
      );
    }
    return null;
  }
  if (setting.kind !== "category") {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise setting kind is ` +
        `"${String((setting as { kind: unknown }).kind)}"; it must be one of ` +
        "category, explicit or unavailable.",
    );
  }
  if (
    !(MAN_MADE_NOISE_CATEGORIES as readonly string[]).includes(setting.category)
  ) {
    return refuse(
      "unsupported_noise_environment",
      `the man-made noise category is "${String(setting.category)}"; ` +
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
