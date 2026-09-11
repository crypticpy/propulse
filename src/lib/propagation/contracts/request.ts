/**
 * PROP-04 request contract (#950), implementing M01 request identity and the
 * A02 all-band extension.
 *
 * The request is frequency-first: `frequencyHz` is the primary key and a band
 * key, when present, is a derived display label only. Nothing here is limited
 * to the eleven catalog band slots, and no band nickname implies physics.
 *
 * `contextId` names the immutable environment/station context and is part of
 * the scientific identity. `viewScopeId` owns UI preference and cancellation
 * only; it is deliberately excluded from `requestKey` so two independent views
 * can share one calculation without joining their scopes (M01).
 */
import { z } from "zod";
import {
  COORDINATE_DATUMS,
  COORDINATE_PRECISION_KINDS,
  GEOMETRY_CLASSES,
  ANTENNA_CLASSES,
  HEIGHT_DATUMS,
  MAX_REQUEST_FREQUENCY_HZ,
  MECHANISM_FAMILIES,
  MIN_REQUEST_FREQUENCY_HZ,
  MODEL_POLICIES,
  POLARIZATIONS,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  type PredictionQuantity,
  RELAY_REQUIRED_GEOMETRY_CLASSES,
  REQUEST_SCHEMA_VERSION,
  RECEIVER_CLASSES,
  ROUTE_LEGS,
  SOURCE_MODES,
} from "@/lib/propagation/contracts/enums";
import {
  finite,
  identifier,
  instant,
  instantMs,
  knownOrUnknown,
  parseWith,
  reject,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";

/** Mechanism families whose result is meaningless without a terrain profile. */
export const TERRAIN_DEPENDENT_FAMILIES = [
  "terrain_troposphere",
  "refractivity_pe",
  "groundwave",
  "ground_sky_coherent",
] as const;

/**
 * Angular tolerance for degenerate great-circle geometry, in radians.
 *
 * 1e-6 rad is about 6.4 m on the Earth's surface (6371 km * 1e-6), which is
 * below the finest coordinate precision this contract records (a GNSS fix,
 * metres). Endpoints closer than that, or that far from exactly antipodal, are
 * degenerate within their own coordinate noise, while any real path stays well
 * outside the tolerance.
 */
const DEGENERATE_GEOMETRY_TOLERANCE_RAD = 1e-6;

/** M06: theta = atan2(|u x v|, u . v), stable at both 0 and pi. */
function angularSeparationRad(
  a: { latitudeDeg: number; longitudeDeg: number },
  b: { latitudeDeg: number; longitudeDeg: number },
): number {
  const toRad = Math.PI / 180;
  const unit = (point: { latitudeDeg: number; longitudeDeg: number }) => {
    const lat = point.latitudeDeg * toRad;
    const lon = point.longitudeDeg * toRad;
    return [
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    ] as const;
  };
  const [ux, uy, uz] = unit(a);
  const [vx, vy, vz] = unit(b);
  const dot = ux * vx + uy * vy + uz * vz;
  const cross = Math.hypot(
    uy * vz - uz * vy,
    uz * vx - ux * vz,
    ux * vy - uy * vx,
  );
  return Math.atan2(cross, dot);
}

const coordinatePrecision = z
  .object({
    kind: z.enum(COORDINATE_PRECISION_KINDS),
    /** One-sigma horizontal uncertainty in metres, or an explicit unknown. */
    horizontalMeters: knownOrUnknown(finite.nonnegative()),
    /** Cell size for `quantized_cell`; never applied to a precise path. */
    cellSizeDeg: finite.positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "quantized_cell" && value.cellSizeDeg === null) {
      reject(
        ctx,
        ["cellSizeDeg"],
        "A quantized_cell coordinate must declare its cell size in degrees",
      );
    }
    if (value.kind !== "quantized_cell" && value.cellSizeDeg !== null) {
      reject(
        ctx,
        ["cellSizeDeg"],
        "Only a quantized_cell coordinate may declare a cell size",
      );
    }
  });

const coordinates = z
  .object({
    latitudeDeg: finite.min(-90).max(90),
    longitudeDeg: finite.min(-180).max(180),
    datum: z.enum(COORDINATE_DATUMS),
    precision: coordinatePrecision,
  })
  .strict();

const antenna = z
  .object({
    /** Registered pattern identity, or an explicit unknown scenario (M08). */
    patternId: knownOrUnknown(identifier),
    gainDbi: knownOrUnknown(finite),
    heightMeters: knownOrUnknown(finite.nonnegative()),
    heightDatum: z.enum(HEIGHT_DATUMS),
    polarization: z.enum(POLARIZATIONS),
    /** A01 coverage dimension: which antenna population this station is in. */
    antennaClass: z.enum(ANTENNA_CLASSES),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.heightMeters.state === "known" &&
      value.heightDatum === "unknown"
    ) {
      reject(
        ctx,
        ["heightDatum"],
        "A known antenna height must name the datum it is measured against",
      );
    }
  });

/** A station as the science sees it: identity, geometry and its unknowns. */
export const stationIdentitySchema = z
  .object({
    /** Stable fingerprint of the station configuration, not a display name. */
    stationId: identifier,
    callsign: identifier.nullable(),
    coordinates,
    antenna,
    /** Delivered power at the antenna input in watts (M08 reference plane). */
    deliveredPowerWatts: knownOrUnknown(finite.positive()),
    feedLossDb: knownOrUnknown(finite.nonnegative()),
    /** Receiver noise assumption identity (M09); unknown stays unknown. */
    noiseAssumptionId: knownOrUnknown(identifier),
    /**
     * A01 coverage dimension: which receive-chain population this station is
     * in. Both ends declare it because M18 evaluates the circuit in both
     * directions, so either station can be the receiving one.
     */
    receiverClass: z.enum(RECEIVER_CLASSES),
  })
  .strict();

export type StationIdentity = z.infer<typeof stationIdentitySchema>;

const requestedModel = z
  .object({
    policy: z.enum(MODEL_POLICIES),
    modelId: identifier.nullable(),
    modelVersion: identifier.nullable(),
    /** Version of the routing/source policy itself (M11/M19). */
    policyVersion: identifier,
  })
  .strict()
  .superRefine((value, ctx) => {
    const named = value.policy === "named";
    if (named && (value.modelId === null || value.modelVersion === null)) {
      reject(
        ctx,
        ["modelId"],
        "A named model policy must carry both modelId and modelVersion",
      );
    }
    if (!named && (value.modelId !== null || value.modelVersion !== null)) {
      reject(
        ctx,
        ["modelId"],
        `Policy ${value.policy} must not name a model; use policy "named"`,
      );
    }
  });

const relayIdentity = z
  .object({
    relayId: identifier,
    ephemerisId: identifier,
    /** Epoch of the element set / ephemeris actually used (A21, A22). */
    ephemerisEpoch: instant,
  })
  .strict();

/**
 * Which events are sampled at an instant and which are defined over an
 * interval, per the protocol event definitions and M02.
 *
 * Instant-valued: `circuit_support`, `snr2500`, `field_strength`, `doppler`
 * and `conditional_decode`. The 24-hour view evaluates
 * `validAt[j] = issuedAt + j * 3600 s` as 24 labelled instantaneous samples,
 * and a decode event's observation duration is a property of the declared mode
 * profile carried in the payload, not an aggregation of the scope.
 *
 * Interval-valued: `network_detection` (the model's own hourly bucket, which
 * M02 keeps as a separate interval-valued head), `observed_activity` (reports
 * within an explicit time interval), `usable_burst` (at least one burst in an
 * exposed interval) and `pass_geometry` (an AOS/LOS span). No instantaneous
 * sample may be relabelled as one of these.
 */
export const INTERVAL_VALUED_QUANTITIES: readonly PredictionQuantity[] = [
  "network_detection",
  "observed_activity",
  "usable_burst",
  "pass_geometry",
];

const requestScope = z
  .object({
    domain: z.enum(PREDICTION_DOMAINS),
    horizon: z.enum(PREDICTION_HORIZONS),
    /**
     * M02: an instantaneous sample is not an hourly opening probability. An
     * interval scope must state its own length.
     */
    aggregation: z.enum(["instantaneous", "interval"]),
    intervalSeconds: finite.positive().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.aggregation === "interval" && value.intervalSeconds === null) {
      reject(
        ctx,
        ["intervalSeconds"],
        "An interval-valued scope must declare intervalSeconds",
      );
    }
    if (
      value.aggregation === "instantaneous" &&
      value.intervalSeconds !== null
    ) {
      reject(
        ctx,
        ["intervalSeconds"],
        "An instantaneous sample must not declare an interval length",
      );
    }
  });

export const predictionRequestSchema = z
  .object({
    schemaVersion: z.literal(REQUEST_SCHEMA_VERSION),
    /** Immutable environment/station context identity (M01). */
    contextId: identifier,
    /** UI ownership only: preference and cancellation, never cache identity. */
    viewScopeId: identifier,
    issuedAt: instant,
    validAt: instant,
    targetEvent: z.enum(PREDICTION_QUANTITIES),
    scope: requestScope,
    /** Primary key. Hz, never MHz, and never clamped into a model's domain. */
    frequencyHz: finite
      .min(MIN_REQUEST_FREQUENCY_HZ)
      .max(MAX_REQUEST_FREQUENCY_HZ),
    /** Derived label only; excluded from the request key. */
    bandKey: identifier.nullable(),
    modeProfileId: identifier,
    route: z
      .object({
        leg: z.enum(ROUTE_LEGS),
        /**
         * M06: the departure tangent is derived uniquely from the endpoints
         * and the leg, so an explicit azimuth is legal only where no tangent
         * exists, that is for coincident or exactly antipodal endpoints. On
         * any ordinary path this field must be null; a caller-supplied value
         * would be a second, conflicting geometry.
         */
        azimuthDeg: finite.min(0).lt(360).nullable(),
      })
      .strict(),
    mechanismPolicy: z
      .object({
        family: z.union([z.enum(MECHANISM_FAMILIES), z.literal("auto")]),
        geometryClass: z.enum(GEOMETRY_CLASSES),
      })
      .strict(),
    terrainProfileId: identifier.nullable(),
    environmentPackId: identifier,
    stationScenarioId: identifier,
    tx: stationIdentitySchema,
    rx: stationIdentitySchema,
    relay: relayIdentity.nullable(),
    requestedModel,
    sourceMode: z.enum(SOURCE_MODES),
  })
  .strict()
  .superRefine((value, ctx) => {
    const intervalValued = INTERVAL_VALUED_QUANTITIES.includes(
      value.targetEvent,
    );
    if (intervalValued && value.scope.aggregation !== "interval") {
      reject(
        ctx,
        ["scope", "aggregation"],
        `Event ${value.targetEvent} is defined over an interval and needs an interval scope`,
      );
    }
    if (!intervalValued && value.scope.aggregation !== "instantaneous") {
      reject(
        ctx,
        ["scope", "aggregation"],
        `Event ${value.targetEvent} is sampled at an instant and cannot carry an interval scope`,
      );
    }
    if (instantMs(value.validAt) < instantMs(value.issuedAt)) {
      reject(
        ctx,
        ["validAt"],
        "validAt must not precede issuedAt (M02 as-issued semantics)",
      );
    }
    const needsRelay = RELAY_REQUIRED_GEOMETRY_CLASSES.includes(
      value.mechanismPolicy.geometryClass,
    );
    if (needsRelay && value.relay === null) {
      reject(
        ctx,
        ["relay"],
        `Geometry class ${value.mechanismPolicy.geometryClass} requires a relay/ephemeris identity`,
      );
    }
    if (!needsRelay && value.relay !== null) {
      reject(
        ctx,
        ["relay"],
        `Geometry class ${value.mechanismPolicy.geometryClass} has no relay leg`,
      );
    }
    if (
      value.relay !== null &&
      instantMs(value.relay.ephemerisEpoch) > instantMs(value.issuedAt)
    ) {
      reject(
        ctx,
        ["relay", "ephemerisEpoch"],
        "An ephemeris epoch after issuedAt is not as-issued (M02)",
      );
    }
    const separation = angularSeparationRad(
      value.tx.coordinates,
      value.rx.coordinates,
    );
    const degenerate =
      separation < DEGENERATE_GEOMETRY_TOLERANCE_RAD ||
      separation > Math.PI - DEGENERATE_GEOMETRY_TOLERANCE_RAD;
    const coincident = separation < DEGENERATE_GEOMETRY_TOLERANCE_RAD;
    const relayed = RELAY_REQUIRED_GEOMETRY_CLASSES.includes(
      value.mechanismPolicy.geometryClass,
    );
    if (coincident && !relayed) {
      // M06: "a zero-distance MUF visualization is not a valid HF circuit
      // request". An explicit azimuth supplies a tangent, not a circuit, so it
      // cannot rescue a surface path of zero length. A relayed geometry is a
      // different matter: its legs go via a third body and stay meaningful
      // when the two ground stations sit together.
      reject(
        ctx,
        ["rx", "coordinates"],
        `Coincident endpoints are a zero-distance circuit, which geometry class ${value.mechanismPolicy.geometryClass} cannot answer (M06)`,
      );
    }
    if (degenerate && value.route.azimuthDeg === null) {
      reject(
        ctx,
        ["route", "azimuthDeg"],
        "Coincident or antipodal endpoints have no derived short or long tangent; an explicit route azimuth is required (M06)",
      );
    }
    if (!degenerate && value.route.azimuthDeg !== null) {
      reject(
        ctx,
        ["route", "azimuthDeg"],
        "An ordinary path derives its tangent from the endpoints and the leg; an explicit route azimuth is only for degenerate endpoints (M06)",
      );
    }
    const family = value.mechanismPolicy.family;
    const terrainDependent = (
      TERRAIN_DEPENDENT_FAMILIES as readonly string[]
    ).includes(family);
    if (terrainDependent && value.terrainProfileId === null) {
      reject(
        ctx,
        ["terrainProfileId"],
        `Mechanism family ${family} requires a terrain profile identity`,
      );
    }
  });

/** A validated, frozen prediction request. */
export type PredictionRequest = z.infer<typeof predictionRequestSchema>;

/** Parse an untrusted request. Fails closed; never throws on data. */
export function parseRequest(
  candidate: unknown,
): ParseOutcome<PredictionRequest> {
  return parseWith(predictionRequestSchema, candidate);
}
