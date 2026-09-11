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
  bandContainsHz,
  MANDATORY_INPUTS_BY_FAMILY,
  sharedMandatoryInputs,
  type CapabilityInputId,
  COORDINATE_DATUMS,
  COORDINATE_PRECISION_KINDS,
  GEOMETRY_CLASSES,
  type GeometryClass,
  INTERVAL_VALUED_QUANTITIES,
  isKnownBandLabel,
  ANTENNA_CLASSES,
  HEIGHT_DATUMS,
  MAX_REQUEST_FREQUENCY_HZ,
  MECHANISM_FAMILIES,
  type MechanismFamily,
  MIN_REQUEST_FREQUENCY_HZ,
  MODEL_POLICIES,
  POLARIZATIONS,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  PERMITTED_GEOMETRY_CLASSES,
  PERMITTED_RELAY_KINDS,
  PERMITTED_RELAY_KINDS_BY_MECHANISM,
  protocolCoverageContainsHz,
  type RelayKind,
  RELAY_REQUIRED_GEOMETRY_CLASSES,
  REQUEST_SCHEMA_VERSION,
  RECEIVER_CLASSES,
  ROUTE_LEGS,
  SCATTER_BASES,
  SCATTER_BASIS_BY_MECHANISM,
  SOURCE_MODES,
  UNREPRESENTABLE_MECHANISM_FAMILIES,
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

/**
 * Mechanism families whose result is meaningless without a terrain profile.
 * This is the terrain slice of `MANDATORY_INPUTS_BY_FAMILY`, kept as a named
 * export because it reads as physics; the rules are driven from the table.
 */
export const TERRAIN_DEPENDENT_FAMILIES = MECHANISM_FAMILIES.filter((family) =>
  MANDATORY_INPUTS_BY_FAMILY[family].includes("terrain_profile"),
);

/** How each mandatory input is named to a caller who did not supply it. */
const MANDATORY_INPUT_LABELS: Record<CapabilityInputId, string> = {
  station_pair: "a station pair",
  mode_profile: "a mode profile",
  noise_assumption: "a noise assumption",
  environment_pack: "an environment pack identity",
  terrain_profile: "a terrain profile identity",
  ephemeris: "an orbital relay identity",
  smoothed_solar_index: "a smoothed solar index",
  observed_solar_index: "an observed solar index",
  eligible_foF2_observations: "eligible foF2 observations",
  eligible_absorption_observations: "eligible absorption observations",
  eligible_radio_observations: "eligible radio observations",
  network_exposure_context: "a network exposure context",
  snr2500: "an SNR2500",
  decoder_response_calibration: "a decoder response calibration",
};

/** Where a missing mandatory input is reported on the request. */
const REQUEST_INPUT_PATHS: Record<CapabilityInputId, (string | number)[]> = {
  station_pair: ["tx"],
  mode_profile: ["modeProfileId"],
  noise_assumption: ["noiseAssumptionId"],
  environment_pack: ["environmentPackId"],
  terrain_profile: ["terrainProfileId"],
  ephemeris: ["relay"],
  smoothed_solar_index: ["scope"],
  observed_solar_index: ["scope"],
  eligible_foF2_observations: ["scope"],
  eligible_absorption_observations: ["scope"],
  eligible_radio_observations: ["scope"],
  network_exposure_context: ["scope"],
  snr2500: ["targetEvent"],
  decoder_response_calibration: ["targetEvent"],
};

/**
 * Whether the request itself carries an input a family cannot run without.
 *
 * Only the inputs a request can express are answerable here: the terrain
 * profile it names and the orbital relay identity it supplies. Everything else
 * is either a field every request carries or a service-side artefact, and is
 * checked against the capability declaration instead (M11/M19).
 */
function requestCarriesInput(
  value: {
    terrainProfileId: string | null;
    relay: { kind: RelayKind } | null;
  },
  input: CapabilityInputId,
): boolean {
  if (input === "terrain_profile") return value.terrainProfileId !== null;
  if (input === "ephemeris") {
    return value.relay !== null && value.relay.kind === "orbital";
  }
  return true;
}

/**
 * The concrete families an "auto" policy could still resolve to, given the
 * geometry the caller fixed and the relay body it supplied.
 *
 * "auto" delegates the choice of family, never the geometry: the caller has
 * already said the path is a two-leg relay or a great circle, and has already
 * named the relay. A resolution therefore has to exist inside those two
 * constraints, or the request is unanswerable however the router chooses
 * (A21, A22).
 */
function candidateFamilies(
  geometryClass: GeometryClass,
  relayKind: RelayKind | null,
): MechanismFamily[] {
  return MECHANISM_FAMILIES.filter(
    (candidate) =>
      PERMITTED_GEOMETRY_CLASSES[candidate].includes(geometryClass) &&
      (relayKind === null ||
        PERMITTED_RELAY_KINDS_BY_MECHANISM[candidate].includes(relayKind)),
  );
}

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
  .strict()
  .superRefine((value, ctx) => {
    // M06: a surveyed or GNSS position is a metre-level claim, and a metre is
    // only a metre against a named reference ellipsoid. Leaving the datum
    // unknown there would let a decametre-scale frame offset masquerade as
    // precision the coordinate does not have.
    if (
      value.datum === "unknown" &&
      (value.precision.kind === "surveyed" || value.precision.kind === "gnss")
    ) {
      reject(
        ctx,
        ["datum"],
        `A ${value.precision.kind} coordinate must name the geodetic datum it is expressed in (M06)`,
      );
    }
  })
  /**
   * M06: the parsed coordinate is the canonical spelling, so every consumer -
   * geometry here, the key projection in `requestKey.ts`, and anything
   * downstream - reads the same numbers. The wire still accepts +180 and -0.
   */
  .transform((value) => ({
    ...value,
    ...canonicalCoordinates(value),
  }));

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
type GeoPoint = {
  latitudeDeg: number;
  longitudeDeg: number;
  precision: {
    kind: string;
    horizontalMeters: Known<number>;
    cellSizeDeg: number | null;
  };
};

/**
 * The one-sigma horizontal radius a coordinate actually carries.
 *
 * A `quantized_cell` coordinate is not the point it prints: it names a cell,
 * and every point inside that cell produced the same wire value. Its radius is
 * therefore at least half the cell diagonal at the endpoint's latitude, where
 * the along-parallel side shrinks by cos(lat):
 * `(cellSizeDeg * pi/180 * R / 2) * sqrt(1 + cos^2(lat))`. A declared
 * `horizontalMeters` larger than that still wins, since a producer may know
 * its position is worse than the grid it was rounded onto.
 */
function declaredUncertaintyMeters(point: GeoPoint): number | null {
  const declared =
    point.precision.horizontalMeters.state === "known"
      ? point.precision.horizontalMeters.value
      : null;
  if (
    point.precision.kind !== "quantized_cell" ||
    point.precision.cellSizeDeg === null
  ) {
    return declared;
  }
  return Math.max(
    declared ?? 0,
    cellHalfDiagonalMeters(point.latitudeDeg, point.precision.cellSizeDeg),
  );
}

/** Half the diagonal of a `cellSizeDeg` cell at this latitude, in metres. */
function cellHalfDiagonalMeters(
  latitudeDeg: number,
  cellSizeDeg: number,
): number {
  const latRad = (latitudeDeg * Math.PI) / 180;
  const cellSideMeters = ((cellSizeDeg * Math.PI) / 180) * EARTH_RADIUS_M;
  return (
    (cellSideMeters / 2) * Math.sqrt(1 + Math.cos(latRad) * Math.cos(latRad))
  );
}

/**
 * M06: a coordinate whose horizontal uncertainty is `unknown` is not a
 * coordinate known to the metre - it is a coordinate whose producer has said
 * it cannot say. Reading the missing number as zero would let two endpoints a
 * few metres apart, or a pair a few metres from antipodal, be resolved into a
 * unique route out of precision nobody claimed.
 *
 * What the declaration does bound is the coarsest position it could be: a
 * `maidenhead_grid` coordinate with no stated sigma may be a two-character
 * field, 10 degrees of latitude by 20 of longitude, and that is the coarsest
 * quantization this contract's precision kinds admit at all. So an unstated
 * uncertainty is treated as that field's half-diagonal rather than as zero. A
 * producer that knows better says so: `horizontalMeters` may be declared
 * `known` with any value, including a metre-level one, and the declared number
 * is then what the geometry uses.
 *
 * A `quantized_cell` coordinate is exempt: it states its own cell size, which
 * is a stated bound rather than a missing one.
 */
const UNSTATED_PRECISION_LATITUDE_DEG = 10;
const UNSTATED_PRECISION_LONGITUDE_DEG = 20;

function unstatedUncertaintyMeters(point: GeoPoint): number {
  const latRad = (point.latitudeDeg * Math.PI) / 180;
  const metresPerDeg = (Math.PI / 180) * EARTH_RADIUS_M;
  const latSide = UNSTATED_PRECISION_LATITUDE_DEG * metresPerDeg;
  const lonSide =
    UNSTATED_PRECISION_LONGITUDE_DEG * metresPerDeg * Math.cos(latRad);
  return Math.hypot(latSide, lonSide) / 2;
}

/** Whether this endpoint leaves its horizontal uncertainty unstated (M06). */
function hasUnstatedPrecision(point: GeoPoint): boolean {
  return declaredUncertaintyMeters(point) === null;
}

/** The one-sigma radius the geometry uses: declared, or the unstated floor. */
function effectiveUncertaintyMeters(point: GeoPoint): number {
  return declaredUncertaintyMeters(point) ?? unstatedUncertaintyMeters(point);
}

function degeneracyToleranceRad(a: GeoPoint, b: GeoPoint): number {
  return (
    (effectiveUncertaintyMeters(a) + effectiveUncertaintyMeters(b)) /
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
function isAmbiguouslyAntipodal(a: GeoPoint, b: GeoPoint): boolean {
  if (isExactlyAntipodal(a, b)) return false;
  const tolerance = Math.max(degeneracyToleranceRad(a, b), NUMERIC_GUARD_RAD);
  return angularSeparationRad(a, b) >= Math.PI - tolerance;
}

function isCoincident(a: GeoPoint, b: GeoPoint): boolean {
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
 * Re-exported from the enums table, where the capability contract reads it
 * too: the interval quantities and the interval lengths a head was qualified
 * for are one question (M02, M19).
 */
export { INTERVAL_VALUED_QUANTITIES };

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
          /**
           * The frame is stated rather than assumed, exactly as
           * `dopplerPayload.signConvention` states its sign: a bearing is
           * meaningless without one, and magnetic, grid and back bearings are
           * all plausible readings of a bare number (M06).
           */
          azimuthDeg: finite
            .min(0)
            .lt(360)
            .nullable()
            .describe(
              "true bearing in degrees measured clockwise from true north at the transmitting station",
            ),
        })
        .strict(),
      /**
       * A19/A20: a bistatic scatter circuit is two legs, terminal -> scattering
       * region -> terminal, not one great circle travelled the short or the
       * long way. There is no leg to choose and no single departure tangent to
       * declare, so this shape carries neither; what it does carry is the
       * basis on which the scattering region is located, which is part of the
       * event and therefore part of the key.
       */
      z
        .object({
          kind: z.literal("scatter"),
          basis: z.enum(SCATTER_BASES),
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
    } else if (
      value.relay !== null &&
      value.mechanismPolicy.family !== "auto" &&
      !PERMITTED_RELAY_KINDS_BY_MECHANISM[
        value.mechanismPolicy.family
      ].includes(value.relay.kind)
    ) {
      // Geometry alone would let satellite physics run over a fixed ground
      // repeater, or a two-leg repeater circuit claim an ephemeris (A21).
      reject(
        ctx,
        ["relay", "kind"],
        `Mechanism family ${value.mechanismPolicy.family} is not served by a relay of kind ${value.relay.kind} (A21)`,
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
    // M06: two positions can only be differenced inside one geodetic frame.
    // A metre-level endpoint in an unnamed frame and one in WGS 84 differ by
    // whatever the frames differ by, which no declared precision covers.
    const referenceDatum = value.tx.coordinates.datum;
    const framed: [string, string[], string][] = [
      ["rx", ["rx", "coordinates", "datum"], value.rx.coordinates.datum],
    ];
    if (value.relay !== null && value.relay.kind === "fixed") {
      framed.push([
        "relay",
        ["relay", "coordinates", "datum"],
        value.relay.coordinates.datum,
      ]);
    }
    for (const [end, path, datum] of framed) {
      if (datum === referenceDatum) continue;
      reject(
        ctx,
        path,
        `The ${end} coordinate is declared in datum ${datum} and the tx coordinate in ${referenceDatum}; one circuit is one geodetic frame (M06)`,
      );
    }
    // A02: the band key is a display label, but a label naming a band that
    // does not contain the request frequency is a wrong label, not a free one.
    // Labels the protocol does not define carry no claim and are left alone.
    if (
      value.bandKey !== null &&
      isKnownBandLabel(value.bandKey) &&
      !bandContainsHz(value.bandKey, value.frequencyHz)
    ) {
      reject(
        ctx,
        ["bandKey"],
        `Band label ${value.bandKey} does not contain ${value.frequencyHz} Hz (A02)`,
      );
    }
    // M06: with an unstated uncertainty the degeneracy tests run on the
    // unstated floor, so a refusal there is a refusal to invent precision
    // rather than a statement that the two endpoints are close.
    const unstated =
      hasUnstatedPrecision(value.tx.coordinates) ||
      hasUnstatedPrecision(value.rx.coordinates);
    const unstatedAdvice =
      "neither endpoint declares its horizontal uncertainty, so the coarsest position this contract admits is what separates them; declare horizontalMeters to ask for a finer path (M06)";
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
    // A19/A20: a scattering circuit is its own route shape, neither a single
    // great circle nor a relayed pair of legs fixed by a declared body.
    const scatter = value.mechanismPolicy.geometryClass === "bistatic_scatter";
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
        const legs: [string, GeoPoint][] = [
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
        unstated && !sameCoordinates(value.tx.coordinates, value.rx.coordinates)
          ? ["rx", "coordinates", "precision", "horizontalMeters"]
          : ["rx", "coordinates"],
        unstated && !sameCoordinates(value.tx.coordinates, value.rx.coordinates)
          ? `These endpoints cannot be told apart from coincident: ${unstatedAdvice}`
          : `Coincident endpoints are a zero-distance circuit, which geometry class ${value.mechanismPolicy.geometryClass} cannot answer (M06)`,
      );
    }
    if (!relayed && !scatter && value.route.kind !== "direct") {
      reject(
        ctx,
        ["route", "kind"],
        `Geometry class ${value.mechanismPolicy.geometryClass} is one great circle and must declare its short or long leg (M06)`,
      );
    }
    if (scatter) {
      if (value.route.kind !== "scatter") {
        reject(
          ctx,
          ["route", "kind"],
          "Geometry class bistatic_scatter is two legs through a scattering region, not one great circle travelled short or long, so it takes the scatter route shape (A19, A20)",
        );
      } else {
        if (value.route.basis === "target") {
          // The decision of record: the row stays in the frozen protocol, the
          // request that would exercise it cannot be written down yet.
          reject(
            ctx,
            ["route", "basis"],
            "A target-basis scatter is answered against a discrete moving scatterer, and this schema version carries no target identity or trajectory to place it at validAt; the request cannot be represented (A19)",
          );
        }
        if (antipodal) {
          // Two antipodal terminals lie on infinitely many great circles, so
          // "the plane of the terminal great circle" names no plane at all.
          reject(
            ctx,
            ["rx", "coordinates"],
            "Antipodal endpoints lie on no single great circle, so a great_circle_plane scattering region cannot be placed (M06, A19)",
          );
        }
      }
    }
    if (ambiguous && !relayed) {
      reject(
        ctx,
        unstated
          ? ["rx", "coordinates", "precision", "horizontalMeters"]
          : ["rx", "coordinates"],
        unstated
          ? `These endpoints cannot be told apart from antipodal: ${unstatedAdvice}`
          : "These endpoints are antipodal to within their declared position uncertainty, which cannot resolve the short from the long route (M06)",
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
    const geometryClass = value.mechanismPolicy.geometryClass;
    const relayKind = value.relay === null ? null : value.relay.kind;
    if (
      family !== "auto" &&
      UNREPRESENTABLE_MECHANISM_FAMILIES.includes(family)
    ) {
      reject(
        ctx,
        ["mechanismPolicy", "family"],
        `Mechanism family ${family} scatters from a discrete moving target, and this schema version carries no target identity or trajectory to represent it; the request cannot be answered on terminal geometry alone (A19)`,
      );
    }
    // A19/A20: family and basis are two names for one geometry. Aurora, meteor
    // and rain scatter take their volume in the plane of the terminal great
    // circle; an aircraft is a target. A request that pairs them freely would
    // place the scattering region somewhere the named family never puts it.
    if (
      value.route.kind === "scatter" &&
      family !== "auto" &&
      SCATTER_BASIS_BY_MECHANISM[family] !== value.route.basis
    ) {
      reject(
        ctx,
        ["route", "basis"],
        SCATTER_BASIS_BY_MECHANISM[family] === null
          ? `Mechanism family ${family} does not scatter and takes no scatter basis (A19)`
          : `Mechanism family ${family} locates its scattering region on basis ${SCATTER_BASIS_BY_MECHANISM[family]}, not ${value.route.basis} (A19, A20)`,
      );
    }
    if (
      family !== "auto" &&
      !PERMITTED_GEOMETRY_CLASSES[family].includes(geometryClass)
    ) {
      reject(
        ctx,
        ["mechanismPolicy", "geometryClass"],
        `Mechanism family ${family} is not requested on geometry class ${geometryClass} (A21, A22)`,
      );
    }
    // "auto" is a request for the router to choose, not a request to skip the
    // physics: a policy no family could satisfy is refused here rather than
    // failing at routing time with no contract to point at (A21).
    const candidates = candidateFamilies(geometryClass, relayKind);
    if (family === "auto" && candidates.length === 0) {
      reject(
        ctx,
        relayKind === null
          ? ["mechanismPolicy", "geometryClass"]
          : ["relay", "kind"],
        relayKind === null
          ? `No mechanism family is requested on geometry class ${geometryClass}, so an auto policy cannot resolve (A21, A22)`
          : `No mechanism family on geometry class ${geometryClass} is served by a relay of kind ${relayKind}, so an auto policy cannot resolve (A21)`,
      );
    }
    /**
     * The families this request could still be answered by: exactly one when
     * the caller named it, every surviving candidate when it said "auto".
     */
    const scatterBasis =
      value.route.kind === "scatter" ? value.route.basis : null;
    const resolvable: MechanismFamily[] =
      family === "auto"
        ? candidates.filter(
            (candidate) =>
              // A family the request schema cannot express is not a family the
              // router may quietly resolve "auto" onto.
              !UNREPRESENTABLE_MECHANISM_FAMILIES.includes(candidate) &&
              (scatterBasis === null ||
                SCATTER_BASIS_BY_MECHANISM[candidate] === scatterBasis),
          )
        : [family];
    if (family === "auto" && candidates.length > 0 && resolvable.length === 0) {
      reject(
        ctx,
        scatterBasis === null
          ? ["mechanismPolicy", "geometryClass"]
          : ["route", "basis"],
        `No mechanism family this request could resolve to is representable in this schema version on geometry class ${geometryClass} (A19)`,
      );
    }
    // M11: the frozen protocol says which claims exist. A request for a
    // (event, domain, horizon, family) the protocol never froze, or one at a
    // frequency inside a gap between a grouped band's constituents, has no row
    // to be scored against and no capability head that could legally serve it.
    const servable = resolvable.filter((candidate) =>
      protocolCoverageContainsHz(
        {
          event: value.targetEvent,
          domain: value.scope.domain,
          horizon: value.scope.horizon,
          mechanism: candidate,
        },
        value.frequencyHz,
      ),
    );
    if (resolvable.length > 0 && servable.length === 0) {
      reject(
        ctx,
        ["targetEvent"],
        `The protocol defines no ${value.targetEvent} on ${value.scope.domain} at ${value.scope.horizon} via ${family} at ${value.frequencyHz} Hz (M11)`,
      );
      return;
    }
    /**
     * The inputs the families that could actually answer this request cannot
     * run without (`MANDATORY_INPUTS_BY_FAMILY`).
     *
     * For "auto" the set is narrowed twice before it is read: to the families
     * the geometry and relay admit, and then to the families the protocol
     * actually froze for this event, domain, horizon and frequency. Reading it
     * off the geometry alone would let an unrelated family that the protocol
     * never froze here excuse the caller from an input the only family that
     * could serve the request cannot run without.
     */
    for (const input of sharedMandatoryInputs(servable)) {
      if (requestCarriesInput(value, input)) continue;
      reject(
        ctx,
        REQUEST_INPUT_PATHS[input],
        family === "auto"
          ? `Every mechanism family that could serve geometry class ${geometryClass} at ${value.frequencyHz} Hz requires ${MANDATORY_INPUT_LABELS[input]} (A02)`
          : `Mechanism family ${family} requires ${MANDATORY_INPUT_LABELS[input]}`,
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
