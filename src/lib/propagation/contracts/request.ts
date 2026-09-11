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
  PERMITTED_GEOMETRY_CLASSES,
  PERMITTED_RELAY_KINDS,
  RELAY_REQUIRED_GEOMETRY_CLASSES,
  REQUEST_SCHEMA_VERSION,
  RECEIVER_CLASSES,
  ROUTE_LEGS,
  SOURCE_MODES,
} from "@/lib/propagation/contracts/enums";
import {
  canonicalCoordinates,
  finite,
  identifier,
  instant,
  instantMs,
  knownOrUnknown,
  parseWith,
  reject,
  type Known,
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
 * Earth radius for the declared spherical adapter (M06).
 */
const EARTH_RADIUS_M = 6371000;

/**
 * Floating-point guard, not a physical tolerance. `atan2(|u x v|, u . v)` on
 * exactly antipodal unit vectors returns pi only up to rounding, so the
 * antipodal test needs a few ulps of slack even when neither endpoint declares
 * any position uncertainty. 1e-9 rad is about 6 mm on the surface.
 */
const NUMERIC_GUARD_RAD = 1e-9;
/**
 * The guard for the exact-antipode test, in radians of the angle still
 * separating the endpoints from a half turn. `atan2(|u x v|, u . v)` is linear
 * in that residual near pi, so this is a true angular scale and not a squared
 * one: 1e-12 rad is about 6 micrometres on the surface, far below any
 * coordinate a caller can express, while still absorbing the few ulps the
 * trigonometry costs. (A guard on `u . v + 1` would not do: the dot product
 * varies quadratically near pi, so 1e-9 there admits about 285 m.)
 */
const ANTIPODAL_GUARD_RAD = 1e-12;

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

/**
 * M06 degeneracy, decided against the declared coordinates rather than a fixed
 * cutoff. A surveyed one-metre path is a real path and must not be discarded
 * as degenerate, while two endpoints that sit inside their own declared
 * position uncertainty cannot be told apart at all.
 *
 * The rule: when neither endpoint declares a horizontal uncertainty, only
 * exactly identical effective coordinates are coincident. When either declares
 * one, the tolerance is the combined one-sigma radius converted to radians,
 * `(sigma_tx + sigma_rx) / R`. The same tolerance applies around pi for the
 * antipodal branch. Separation comes from the stable `atan2` form, so nothing
 * divides by a near-zero chord.
 */
function declaredUncertaintyMeters(point: {
  precision: { horizontalMeters: Known<number> };
}): number {
  return point.precision.horizontalMeters.state === "known"
    ? point.precision.horizontalMeters.value
    : 0;
}

function degeneracyToleranceRad(
  a: { precision: { horizontalMeters: Known<number> } },
  b: { precision: { horizontalMeters: Known<number> } },
): number {
  return (
    (declaredUncertaintyMeters(a) + declaredUncertaintyMeters(b)) /
    EARTH_RADIUS_M
  );
}

/**
 * Exactly opposite points, decided on the declared coordinates rather than on
 * a distance. Only here is the short/long distinction meaningless, so only
 * here may a request omit its leg.
 *
 * The guard covers the trigonometry of the comparison, nothing else; declared
 * position uncertainty deliberately plays no part.
 */
function isExactlyAntipodal(
  a: { latitudeDeg: number; longitudeDeg: number },
  b: { latitudeDeg: number; longitudeDeg: number },
): boolean {
  // The stable separation of the two canonical positions is a half turn.
  // Measuring the angle rather than the longitudes also catches the two
  // geographic poles, whose canonical longitude is 0 at both ends.
  const separation = angularSeparationRad(
    canonicalCoordinates(a),
    canonicalCoordinates(b),
  );
  return Math.PI - separation <= ANTIPODAL_GUARD_RAD;
}

/**
 * Opposite to within the summed declared position uncertainty, but not
 * exactly. The two legs then differ by an amount the declared precision cannot
 * resolve, so neither the short/long choice nor a derived tangent is decidable
 * and the request is refused rather than answered on a guess (M06).
 */
function isAmbiguouslyAntipodal(
  a: {
    latitudeDeg: number;
    longitudeDeg: number;
    precision: { horizontalMeters: Known<number> };
  },
  b: {
    latitudeDeg: number;
    longitudeDeg: number;
    precision: { horizontalMeters: Known<number> };
  },
): boolean {
  if (isExactlyAntipodal(a, b)) return false;
  const tolerance = Math.max(degeneracyToleranceRad(a, b), NUMERIC_GUARD_RAD);
  return angularSeparationRad(a, b) >= Math.PI - tolerance;
}

function isCoincident(
  a: {
    latitudeDeg: number;
    longitudeDeg: number;
    precision: { horizontalMeters: Known<number> };
  },
  b: {
    latitudeDeg: number;
    longitudeDeg: number;
    precision: { horizontalMeters: Known<number> };
  },
): boolean {
  const tolerance = degeneracyToleranceRad(a, b);
  if (sameCoordinates(a, b)) return true;
  return tolerance > 0 && angularSeparationRad(a, b) <= tolerance;
}

/**
 * Same point on the sphere under the shared canonical spelling: the
 * antimeridian written either way, and either pole under any meridian.
 */
function sameCoordinates(
  a: { latitudeDeg: number; longitudeDeg: number },
  b: { latitudeDeg: number; longitudeDeg: number },
): boolean {
  const left = canonicalCoordinates(a);
  const right = canonicalCoordinates(b);
  return (
    left.latitudeDeg === right.latitudeDeg &&
    left.longitudeDeg === right.longitudeDeg
  );
}

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

/**
 * A21: a relay is either an orbiting body, whose geometry comes from a dated
 * element set, or a fixed installation, whose geometry comes from a surveyed
 * position. A ground repeater has no ephemeris and must never be made to
 * invent one, so the two cases are separate variants rather than one shape
 * with nullable fields.
 */
const relayIdentity = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("orbital"),
      relayId: identifier,
      ephemerisId: identifier,
      /** Epoch of the element set / ephemeris actually used (A21, A22). */
      ephemerisEpoch: instant,
    })
    .strict(),
  z
    .object({
      kind: z.literal("fixed"),
      relayId: identifier,
      /** Surveyed position of the installation, with its own precision. */
      coordinates,
      /**
       * Height above the declared datum, in the same known/unknown shape the
       * antenna schema uses, so a number is never reported against an unknown
       * reference (A21).
       */
      heightMeters: knownOrUnknown(finite.nonnegative()),
      heightDatum: z.enum(HEIGHT_DATUMS),
      /** Configuration identity the geometry depends on (A21). */
      configurationId: identifier,
    })
    .strict(),
]);

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
    /**
     * The route is shaped by the geometry. A direct path is one great circle
     * and the caller chooses the short or the long way round it. A relayed
     * path (A21/A22) has no single great circle at all: its legs are fixed by
     * the relay's position, so there is nothing to choose and nothing to
     * declare, and the relayed shape carries neither field.
     */
    route: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("direct"),
          /**
           * M06: the short and the long way round are different paths, except
           * for exactly antipodal endpoints, where both legs are pi * R and
           * the explicit azimuth alone selects the semicircle. There the leg
           * is null, so two requests that differ only in a meaningless leg
           * label cannot split the cache.
           */
          leg: z.enum(ROUTE_LEGS).nullable(),
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
      z.object({ kind: z.literal("relayed") }).strict(),
    ]),
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
      !PERMITTED_RELAY_KINDS[value.mechanismPolicy.geometryClass].includes(
        value.relay.kind,
      )
    ) {
      reject(
        ctx,
        ["relay", "kind"],
        `Geometry class ${value.mechanismPolicy.geometryClass} does not admit a ${value.relay.kind} relay`,
      );
    }
    if (
      value.relay !== null &&
      value.relay.kind === "orbital" &&
      instantMs(value.relay.ephemerisEpoch) > instantMs(value.issuedAt)
    ) {
      reject(
        ctx,
        ["relay", "ephemerisEpoch"],
        "An ephemeris epoch after issuedAt is not as-issued (M02)",
      );
    }
    const coincident = isCoincident(value.tx.coordinates, value.rx.coordinates);
    const antipodal = isExactlyAntipodal(
      value.tx.coordinates,
      value.rx.coordinates,
    );
    const ambiguous = isAmbiguouslyAntipodal(
      value.tx.coordinates,
      value.rx.coordinates,
    );
    const degenerate = coincident || antipodal;
    const relayed = RELAY_REQUIRED_GEOMETRY_CLASSES.includes(
      value.mechanismPolicy.geometryClass,
    );
    if (relayed) {
      // A21: a relayed request has no single great-circle tangent to derive or
      // to be told. Each leg's bearing comes from the relay identity, so there
      // is no leg to choose and no azimuth to declare, and the
      // coincident/antipodal rules below apply only to a direct path.
      if (value.route.kind !== "relayed") {
        reject(
          ctx,
          ["route", "kind"],
          `Geometry class ${value.mechanismPolicy.geometryClass} has no single great circle, so it takes the relayed route shape (A21)`,
        );
      }
      if (
        value.relay !== null &&
        value.relay.kind === "fixed" &&
        value.relay.heightMeters.state === "known" &&
        value.relay.heightDatum === "unknown"
      ) {
        reject(
          ctx,
          ["relay", "heightDatum"],
          "A known relay height must name the datum it is measured against",
        );
      }
      if (value.relay !== null && value.relay.kind === "fixed") {
        const legs: [
          string,
          {
            latitudeDeg: number;
            longitudeDeg: number;
            precision: { horizontalMeters: Known<number> };
          },
        ][] = [
          ["tx", value.tx.coordinates],
          ["rx", value.rx.coordinates],
        ];
        for (const [end, endpoint] of legs) {
          if (isCoincident(value.relay.coordinates, endpoint)) {
            reject(
              ctx,
              ["relay", "coordinates"],
              `A fixed relay coincident with the ${end} station is a zero-length leg (M06, A21)`,
            );
          }
          // M06: an antipodal leg has no unique tangent either, and the
          // relayed route shape carries no azimuth that could supply one.
          if (
            isExactlyAntipodal(value.relay.coordinates, endpoint) ||
            isAmbiguouslyAntipodal(value.relay.coordinates, endpoint)
          ) {
            reject(
              ctx,
              ["relay", "coordinates"],
              `A fixed relay antipodal to the ${end} station has no unique leg tangent (M06, A21)`,
            );
          }
        }
      }
    }
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
    if (!relayed && value.route.kind !== "direct") {
      reject(
        ctx,
        ["route", "kind"],
        `Geometry class ${value.mechanismPolicy.geometryClass} is one great circle and must declare its short or long leg (M06)`,
      );
    }
    if (ambiguous && !relayed) {
      reject(
        ctx,
        ["rx", "coordinates"],
        "These endpoints are antipodal to within their declared position uncertainty, which cannot resolve the short from the long route (M06)",
      );
    }
    if (value.route.kind === "direct" && !relayed) {
      // M06: both legs of an antipodal pair are the same half-circumference,
      // so the leg label carries no geometry and the azimuth below carries it
      // all. Any other direct path must choose a leg.
      if (antipodal && value.route.leg !== null) {
        reject(
          ctx,
          ["route", "leg"],
          "Antipodal endpoints have two equal legs; the azimuth selects the path and the leg is null (M06)",
        );
      }
      if (!antipodal && value.route.leg === null) {
        reject(
          ctx,
          ["route", "leg"],
          "A direct path must declare the short or the long leg (M06)",
        );
      }
    }
    if (
      value.route.kind === "direct" &&
      !relayed &&
      degenerate &&
      value.route.azimuthDeg === null
    ) {
      reject(
        ctx,
        ["route", "azimuthDeg"],
        "Coincident or antipodal endpoints have no derived short or long tangent; an explicit route azimuth is required (M06)",
      );
    }
    if (
      value.route.kind === "direct" &&
      !relayed &&
      !degenerate &&
      value.route.azimuthDeg !== null
    ) {
      reject(
        ctx,
        ["route", "azimuthDeg"],
        "An ordinary path derives its tangent from the endpoints and the leg; an explicit route azimuth is only for degenerate endpoints (M06)",
      );
    }
    const family = value.mechanismPolicy.family;
    if (
      family !== "auto" &&
      !PERMITTED_GEOMETRY_CLASSES[family].includes(
        value.mechanismPolicy.geometryClass,
      )
    ) {
      reject(
        ctx,
        ["mechanismPolicy", "geometryClass"],
        `Mechanism family ${family} is not requested on geometry class ${value.mechanismPolicy.geometryClass} (A21, A22)`,
      );
    }
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
