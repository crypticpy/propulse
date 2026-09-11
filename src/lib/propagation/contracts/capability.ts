/**
 * PROP-04 model capability contract (#950), implementing M11 provider
 * declarations and M19 capability-based routing.
 *
 * A capability declares exactly what a model can answer: the event, the
 * domain, the horizons, the mechanism families and geometry classes, the
 * frequency range in Hz, the mode profiles, required and optional inputs, the
 * source policy version, and the corrections it owns. A model that declares no
 * heads is a valid no-op capability: it is routed past, not treated as a model
 * that returns zeros.
 */
import { z } from "zod";
import {
  ANTENNA_CLASSES,
  bandIntersectsRange,
  CALIBRATION_REQUIRED_QUANTITIES,
  CAPABILITY_STATE_FOR_ROW_STATUS,
  isKnownBandLabel,
  isProtocolCoverage,
  PERMITTED_GEOMETRY_CLASSES,
  permittedRelayKinds,
  protocolCoverageContainsHz,
  protocolRowServedByRange,
  mandatoryInputsForFamilies,
  RELAY_REQUIRED_GEOMETRY_CLASSES,
  protocolCoverageRows,
  RECEIVER_PARTICIPATION,
  type AntennaClass,
  type GeometryClass,
  type MechanismFamily,
  CAPABILITY_SCHEMA_VERSION,
  CAPABILITY_INPUT_IDS,
  type CapabilityInputId,
  CAPABILITY_STATES,
  CORRECTION_ORDER,
  COVARIANCE_OWNERSHIP,
  GEOMETRY_CLASSES,
  MAX_REQUEST_FREQUENCY_HZ,
  MECHANISM_FAMILIES,
  MIN_REQUEST_FREQUENCY_HZ,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  RECEIVER_CLASSES,
  type ReceiverClass,
  QUANTITY_UNITS,
  ROUTABLE_CAPABILITY_STATES,
  SOURCE_MODES,
  type SourceMode,
  UNCERTAINTY_KINDS,
  VALIDATED_CAPABILITY_STATES,
} from "@/lib/propagation/contracts/enums";
import {
  finite,
  artifactHash,
  identifier,
  parseWith,
  reject,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";
import {
  hasPointValue,
  RESULT_SCHEMA_VERSION,
} from "@/lib/propagation/contracts/result";
import {
  canonicalize,
  type Canonical,
} from "@/lib/propagation/contracts/requestKey";

const frequencyRange = z
  .object({
    minHz: finite.min(MIN_REQUEST_FREQUENCY_HZ).max(MAX_REQUEST_FREQUENCY_HZ),
    maxHz: finite.min(MIN_REQUEST_FREQUENCY_HZ).max(MAX_REQUEST_FREQUENCY_HZ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minHz >= value.maxHz) {
      reject(ctx, ["maxHz"], "Frequency range must satisfy minHz < maxHz");
    }
  });

const capabilityHead = z
  .object({
    quantity: z.enum(PREDICTION_QUANTITIES),
    units: identifier,
    domain: z.enum(PREDICTION_DOMAINS),
    state: z.enum(CAPABILITY_STATES),
    horizons: z.array(z.enum(PREDICTION_HORIZONS)).min(1),
    mechanismFamilies: z.array(z.enum(MECHANISM_FAMILIES)).min(1),
    geometryClasses: z.array(z.enum(GEOMETRY_CLASSES)).min(1),
    /**
     * A01 coverage dimensions. A head qualified for one station population is
     * not eligible for another: supplying `station_pair` says the inputs exist,
     * never that the station is inside the trained or validated population.
     */
    antennaClasses: z.array(z.enum(ANTENNA_CLASSES)).min(1),
    /** Empty exactly when the quantity involves no receive chain (A01). */
    receiverClasses: z.array(z.enum(RECEIVER_CLASSES)),
    frequencyRangeHz: frequencyRange,
    /**
     * M11: which source postures this head can actually be served under. A
     * head trained on live indices cannot answer an offline request, and an
     * offline request that silently received a live answer would be reporting
     * evidence it declared it did not want. An empty list is a gap, not a
     * wildcard, so at least one posture is declared.
     */
    sourceModes: z.array(z.enum(SOURCE_MODES)).min(1),
    /** Derived labels for display; the frequency range is authoritative. */
    bandKeys: z.array(identifier),
    modeProfileIds: z.array(identifier),
    requiredInputs: z.array(z.enum(CAPABILITY_INPUT_IDS)),
    optionalInputs: z.array(z.enum(CAPABILITY_INPUT_IDS)),
    /** Null for a head with no feature pipeline (a physics head). */
    featureSchemaId: identifier.nullable(),
    /** The pinned feature artefact behind featureSchemaId (M19). */
    featureHash: artifactHash.nullable(),
    outputSchemaId: identifier,
    calibrationId: identifier.nullable(),
    uncertaintyKind: z.enum(UNCERTAINTY_KINDS),
    /** M19 internal fallback, declared rather than discovered at runtime. */
    internalFallback: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("none") }).strict(),
        z
          .object({
            kind: z.literal("model"),
            modelId: identifier,
            modelVersion: identifier,
          })
          .strict(),
      ])
      .describe("What this head falls back to when its inputs are ineligible"),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.units !== QUANTITY_UNITS[value.quantity]) {
      reject(
        ctx,
        ["units"],
        `Quantity ${value.quantity} is measured in ${QUANTITY_UNITS[value.quantity]}`,
      );
    }
    if (
      value.uncertaintyKind === "calibrated_predictive_interval" &&
      value.calibrationId === null
    ) {
      reject(
        ctx,
        ["calibrationId"],
        "A calibrated predictive interval requires a calibration identity (M17)",
      );
    }
    value.bandKeys.forEach((band, index) => {
      // A02: the range is authoritative and the labels are display, but a
      // label for a band the head does not reach is a wrong label. Labels the
      // protocol does not define carry no claim and are left alone.
      if (!isKnownBandLabel(band)) return;
      if (bandIntersectsRange(band, value.frequencyRangeHz)) return;
      reject(
        ctx,
        ["bandKeys", index],
        `Band label ${band} lies outside this head's frequency range (A02)`,
      );
    });
    const overlap = value.requiredInputs.filter((input) =>
      value.optionalInputs.includes(input),
    );
    if (overlap.length > 0) {
      reject(
        ctx,
        ["optionalInputs"],
        `Input ${overlap[0]} cannot be both required and optional`,
      );
    }
  });

/** M11 correction descriptor: what it owns, where it sits, what it assumes. */
const correctionDescriptor = z
  .object({
    correctionId: identifier,
    stage: z.enum(CORRECTION_ORDER),
    /** The single total physical quantity this correction claims. */
    ownsQuantityId: identifier,
    mechanism: identifier,
    covarianceOwnership: z.enum(COVARIANCE_OWNERSHIP),
    assumptions: z.array(identifier),
    /** An inactive correction is the identity transform plus a reason. */
    active: z.boolean(),
    inactiveReason: identifier.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const repeated = value.assumptions.find(
      (assumption, index) => value.assumptions.indexOf(assumption) !== index,
    );
    if (repeated !== undefined) {
      reject(
        ctx,
        ["assumptions"],
        `Assumption ${repeated} is declared twice; an assumption holds or it does not (M11)`,
      );
    }
    if (!value.active && value.inactiveReason === null) {
      reject(
        ctx,
        ["inactiveReason"],
        "An inactive correction must name why it is inactive (M11)",
      );
    }
    if (value.active && value.inactiveReason !== null) {
      reject(
        ctx,
        ["inactiveReason"],
        "An active correction cannot carry an inactive reason",
      );
    }
  });

/**
 * The complete coverage tuple a head declares. Two heads of the same quantity
 * and domain are legitimate and common (HF regular E/F SNR and VHF meteor SNR,
 * for example); folding them into one head would advertise the Cartesian
 * product of their frequencies, mechanisms, geometries, horizons and modes.
 * Only an exact repeat of the whole tuple is a duplicate.
 *
 * The rule this enforces is deliberately unconditional: one head per coverage
 * tuple, whatever state each head is in. A declaration that listed the same
 * tuple twice - say `planned` beside `data_limited` - would leave the router
 * choosing between two answers to one question with nothing in the contract to
 * decide by, so the second declaration is refused rather than ranked (M11).
 */
/**
 * The inputs a routable head cannot be routed without: everything the families
 * it advertises need (`MANDATORY_INPUTS_BY_FAMILY`), plus an ephemeris for a
 * direct earth-space or earth-moon-earth geometry, whose third body has to be
 * located whatever family is named (A21).
 */
function mandatoryHeadInputs(head: {
  geometryClasses: readonly GeometryClass[];
  mechanismFamilies: readonly MechanismFamily[];
}): CapabilityInputId[] {
  const required = new Set<CapabilityInputId>(
    mandatoryInputsForFamilies(head.mechanismFamilies),
  );
  if (
    head.geometryClasses.some(
      (geometryClass) =>
        geometryClass === "earth_space" || geometryClass === "earth_moon_earth",
    )
  ) {
    required.add("ephemeris");
  }
  return [...required];
}

function coverageTupleKey(head: {
  quantity: string;
  domain: string;
  horizons: readonly string[];
  mechanismFamilies: readonly string[];
  geometryClasses: readonly string[];
  antennaClasses: readonly string[];
  receiverClasses: readonly string[];
  modeProfileIds: readonly string[];
  frequencyRangeHz: { minHz: number; maxHz: number };
}): string {
  // Structural, not concatenated: any separator character is legal inside an
  // identifier, so ["a","b"] must not collide with ["a+b"]. Sorting and
  // deduplicating first makes the key depend on the set, not on the order or
  // on repeats.
  const set = (values: readonly string[]): string[] =>
    [...new Set(values)].sort();
  return JSON.stringify([
    head.quantity,
    head.domain,
    set(head.horizons),
    set(head.mechanismFamilies),
    set(head.geometryClasses),
    set(head.antennaClasses),
    set(head.receiverClasses),
    set(head.modeProfileIds),
    head.frequencyRangeHz.minHz,
    head.frequencyRangeHz.maxHz,
  ]);
}

export const modelCapabilitySchema = z
  .object({
    schemaVersion: z.literal(CAPABILITY_SCHEMA_VERSION),
    modelId: identifier,
    modelVersion: identifier,
    /** Hashes that pin the trained artefact and its preprocessing (M19). */
    modelHash: artifactHash.nullable(),
    preprocessingHash: artifactHash.nullable(),
    sourcePolicyVersion: identifier,
    /** Empty is legal and meaningful: a no-op capability declares no heads. */
    heads: z.array(capabilityHead),
    corrections: z.array(correctionDescriptor),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenHeads = new Set<string>();
    value.heads.forEach((head, index) => {
      const key = coverageTupleKey(head);
      if (seenHeads.has(key)) {
        reject(
          ctx,
          ["heads", index, "quantity"],
          `Duplicate capability head for coverage tuple ${key}`,
        );
      }
      seenHeads.add(key);
    });
    // M11/M19: an issued prediction has to be traceable to the exact artefact
    // that produced it, so a declaration with any routable head must pin both
    // hashes. A planned-only or no-op declaration has nothing to pin yet.
    const routable = value.heads.some((head) =>
      ROUTABLE_CAPABILITY_STATES.includes(head.state),
    );
    if (routable && value.modelHash === null) {
      reject(
        ctx,
        ["modelHash"],
        "A capability with a routable head must pin its model hash (M11)",
      );
    }
    if (routable && value.preprocessingHash === null) {
      reject(
        ctx,
        ["preprocessingHash"],
        "A capability with a routable head must pin its preprocessing hash (M11)",
      );
    }
    value.heads.forEach((head, index) => {
      // A01 receiver class is a coverage dimension only where a receive chain
      // takes part. Where none does (pass_geometry, A21) the declaration says
      // so by naming no receiver population at all: an empty list is required
      // there and refused everywhere else, so the field never carries a
      // population the quantity could not use.
      const participation = RECEIVER_PARTICIPATION[head.quantity];
      if (participation === "none" && head.receiverClasses.length > 0) {
        reject(
          ctx,
          ["heads", index, "receiverClasses"],
          `A ${head.quantity} head involves no receive chain and names no receiver class (A01, A21)`,
        );
      }
      if (participation !== "none" && head.receiverClasses.length === 0) {
        reject(
          ctx,
          ["heads", index, "receiverClasses"],
          `A ${head.quantity} head is received and must declare its receiver classes (A01)`,
        );
      }
      if (!ROUTABLE_CAPABILITY_STATES.includes(head.state)) return;
      for (const dimension of ROUTING_DIMENSIONS) {
        if (!dimension.gates(head)) continue;
        if (dimension.values(head).length > 0) continue;
        // M19: routing matches this dimension by membership, so an empty list
        // matches no request at all. A head that declares one is advertised as
        // an active capability while being silently routed past, which shows up
        // downstream as an unexplained fallback rather than as a declared gap.
        // A planned or unsupported head may leave it empty: that is the gap.
        reject(
          ctx,
          ["heads", index, dimension.field],
          `A routable head declares at least one ${dimension.field}; an empty list matches no request (M19)`,
        );
      }
      // M19: two routable heads that could both answer one request leave the
      // artefact, uncertainty kind and fallback behaviour of that answer
      // undetermined, because routing has no tie-break between them.
      for (let other = 0; other < index; other += 1) {
        const earlier = value.heads[other];
        if (!ROUTABLE_CAPABILITY_STATES.includes(earlier.state)) continue;
        if (!headsOverlap(earlier, head)) continue;
        reject(
          ctx,
          ["heads", index, "frequencyRangeHz"],
          `Routable heads ${other} and ${index} both answer one request: same ${head.quantity} on ${head.domain}, overlapping frequency ranges and a shared value on every routing dimension (M19)`,
        );
      }
      // M19: a head that names a feature schema is served by a feature
      // pipeline, and that artefact is pinned like the model itself. A head
      // with no feature pipeline leaves both null.
      if (head.featureHash === null) {
        // The result contract refuses every value-bearing head with a null
        // featureHash (M24), so a routable head that pins no feature artefact
        // at all could only ever produce results the parser rejects. A head
        // with no feature pipeline still names the artefact its inputs were
        // assembled by; "no features" is not the same claim as "not recorded".
        reject(
          ctx,
          ["heads", index, "featureHash"],
          head.featureSchemaId === null
            ? "A routable head must pin its feature hash; a head that pins no feature artefact could serve no accepted result (M19, M24)"
            : "A routable head with a feature schema must pin its feature hash (M19)",
        );
      }
      if (VALIDATED_CAPABILITY_STATES.includes(head.state)) {
        // A01: every frozen coverage row is data_limited or experimental and
        // every preregistration is BLOCKED, so no row validates anything yet.
        reject(
          ctx,
          ["heads", index, "state"],
          `The protocol has validated no coverage row, so a head cannot declare state ${head.state} (A01)`,
        );
      }
      if (
        CALIBRATION_REQUIRED_QUANTITIES.includes(head.quantity) &&
        head.calibrationId === null
      ) {
        // The result contract rejects a value-bearing head of this quantity
        // with no calibration identity, so a routable capability without one
        // could only ever produce results the contract refuses (M19/M22).
        reject(
          ctx,
          ["heads", index, "calibrationId"],
          `A routable ${head.quantity} head requires a calibration identity (M22)`,
        );
      }
      for (const input of mandatoryHeadInputs(head)) {
        if (head.requiredInputs.includes(input)) continue;
        // A02/A21/M11: a family that cannot run without an input is not made
        // runnable by a declaration that forgets to ask for it. Routing reads
        // `requiredInputs` against the inputs a request actually carries, so a
        // head that omits one can be dispatched with the input absent and
        // would answer the physics from nothing.
        reject(
          ctx,
          ["heads", index, "requiredInputs"],
          input === "ephemeris"
            ? "A head on an orbital geometry must require an ephemeris (A21, M11)"
            : `A head advertising ${head.mechanismFamilies.join(", ")} must require ${input} (A02, M11)`,
        );
      }
      for (const mechanism of head.mechanismFamilies) {
        // A21/A22: family and geometry name one physical path, so a routable
        // head may not advertise a geometry class its family never takes.
        const permitted = PERMITTED_GEOMETRY_CLASSES[mechanism];
        for (const geometryClass of head.geometryClasses) {
          if (!permitted.includes(geometryClass)) {
            reject(
              ctx,
              ["heads", index, "geometryClasses"],
              `Mechanism family ${mechanism} is not answered on geometry class ${geometryClass} (A21, A22)`,
            );
            continue;
          }
          if (
            RELAY_REQUIRED_GEOMETRY_CLASSES.includes(geometryClass) &&
            permittedRelayKinds(mechanism, geometryClass).length === 0
          ) {
            // The relay leg exists but no relay body satisfies both the
            // geometry and the family, so nothing could ever be routed here:
            // orbital physics over a fixed repeater, or the reverse (A21).
            reject(
              ctx,
              ["heads", index, "geometryClasses"],
              `Mechanism family ${mechanism} admits no relay kind that geometry class ${geometryClass} carries (A21)`,
            );
          }
        }
      }
      for (const horizon of head.horizons) {
        for (const mechanism of head.mechanismFamilies) {
          const claim = {
            event: head.quantity,
            domain: head.domain,
            horizon,
            mechanism,
          };
          if (isProtocolCoverage(claim, head.frequencyRangeHz)) {
            // A01: a row's status is the evidence the protocol froze for it.
            // A head may report that evidence, never the other row's.
            const expected = new Set(
              protocolCoverageRows(claim)
                .filter((row) =>
                  protocolRowServedByRange(row, head.frequencyRangeHz),
                )
                .map((row) => CAPABILITY_STATE_FOR_ROW_STATUS[row.status]),
            );
            const claimsRowEvidence = (
              Object.values(CAPABILITY_STATE_FOR_ROW_STATUS) as string[]
            ).includes(head.state);
            if (claimsRowEvidence && !expected.has(head.state)) {
              reject(
                ctx,
                ["heads", index, "state"],
                `The protocol froze ${head.quantity} on ${head.domain} at ${horizon} via ${mechanism} as ${[
                  ...expected,
                ].join(", ")}, not as ${head.state} (A01)`,
              );
            }
            continue;
          }
          // The frozen protocol defines which claims exist at all: each row
          // carries its own metric, comparator and gates. A routable head
          // outside those rows would be answering a question the validation
          // protocol cannot score (M11/M19). A planned or unsupported head may
          // describe work the protocol has not yet frozen.
          reject(
            ctx,
            ["heads", index, "mechanismFamilies"],
            isProtocolCoverage(claim)
              ? `The protocol froze ${head.quantity} on ${head.domain} at ${horizon} via ${mechanism} only for ${protocolCoverageRows(
                  claim,
                )
                  .map((row) => row.band)
                  .join(", ")}, not for this frequency range`
              : `The protocol defines no ${head.quantity} on ${head.domain} at ${horizon} via ${mechanism}`,
          );
        }
      }
      if (head.outputSchemaId !== RESULT_SCHEMA_VERSION) {
        // A routable head is answered by `parseResult`, which accepts exactly
        // one result schema version. Advertising another is a promise nothing
        // downstream could keep (M19). A planned or unsupported head may name
        // a future schema, which is why this is inside the routable branch.
        reject(
          ctx,
          ["heads", index, "outputSchemaId"],
          `A routable head is answered by ${RESULT_SCHEMA_VERSION}, not ${head.outputSchemaId} (M19)`,
        );
      }
      if (!hasPointValue(head.quantity) && head.uncertaintyKind !== "none") {
        // M17: these quantities report no scalar, so the result contract
        // refuses any numeric interval on them. A routable head promising an
        // interval kind could only produce results the contract rejects.
        reject(
          ctx,
          ["heads", index, "uncertaintyKind"],
          `A routable ${head.quantity} head reports no scalar to bracket and declares uncertainty kind none (M17)`,
        );
      }
      if (head.featureSchemaId === null && head.featureHash !== null) {
        reject(
          ctx,
          ["heads", index, "featureSchemaId"],
          "A feature hash without a feature schema pins nothing (M19)",
        );
      }
    });
    const owners = new Map<string, string>();
    value.corrections.forEach((correction, index) => {
      if (correction.covarianceOwnership !== "owns_total") return;
      const previous = owners.get(correction.ownsQuantityId);
      if (previous !== undefined) {
        reject(
          ctx,
          ["corrections", index, "ownsQuantityId"],
          `Correction ${correction.correctionId} claims ${correction.ownsQuantityId}, already owned by ${previous} (M11)`,
        );
      }
      owners.set(correction.ownsQuantityId, correction.correctionId);
    });
    const stageIndex = (stage: string): number =>
      (CORRECTION_ORDER as readonly string[]).indexOf(stage);
    for (let index = 1; index < value.corrections.length; index += 1) {
      const previous = stageIndex(value.corrections[index - 1].stage);
      const current = stageIndex(value.corrections[index].stage);
      if (current < previous) {
        reject(
          ctx,
          ["corrections", index, "stage"],
          "Corrections must be declared in the immutable correction order (M11)",
        );
      }
    }
  });

/** A validated, frozen model capability declaration. */
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ModelCapabilityHead = ModelCapability["heads"][number];

/** Exactly the request shape routing matches a head against (M19). */
export interface CapabilityQuery {
  quantity: ModelCapabilityHead["quantity"];
  domain: ModelCapabilityHead["domain"];
  horizon: ModelCapabilityHead["horizons"][number];
  frequencyHz: number;
  geometryClass: ModelCapabilityHead["geometryClasses"][number];
  mechanismFamily: ModelCapabilityHead["mechanismFamilies"][number];
  modeProfileId: string;
  /**
   * A01: the station populations this request actually belongs to. The
   * receiving station's chain is always checked; the transmitting station's
   * chain is checked only for a reciprocal quantity, because a directed
   * quantity is measured at one receiver (see `RECEIVER_PARTICIPATION`). Both
   * antenna classes always apply, since the transmit antenna radiates.
   */
  txAntennaClass: AntennaClass;
  rxAntennaClass: AntennaClass;
  txReceiverClass: ReceiverClass;
  rxReceiverClass: ReceiverClass;
  /** M11/M19: the routing/source policy version the request was issued under. */
  policyVersion: string;
  /** The source posture the request was issued under (M11). */
  sourceMode: SourceMode;
  /** The input identifiers the request actually carries (M11/M19). */
  availableInputs: readonly CapabilityInputId[];
}

/**
 * One membership dimension of routing: a list the head declares and the query
 * values that must appear in it.
 *
 * This table is the single definition of "what routing matches on". It is read
 * by `capabilityCovers`, by the rule that a routable head must declare every
 * dimension it will be matched on, and by the rule that two routable heads may
 * not both answer one request. Three rules written by hand would drift apart;
 * one table cannot.
 */
interface RoutingDimension {
  /** The head field, used for the issue path and the message. */
  field:
    | "horizons"
    | "mechanismFamilies"
    | "geometryClasses"
    | "modeProfileIds"
    | "sourceModes"
    | "antennaClasses"
    | "receiverClasses";
  /** The populations the head declares on this dimension. */
  values: (head: ModelCapabilityHead) => readonly string[];
  /** Whether this dimension gates this head's quantity at all. */
  gates: (head: ModelCapabilityHead) => boolean;
  /** The query values that must all be declared; read only when it gates. */
  required: (query: CapabilityQuery) => readonly string[];
}

export const ROUTING_DIMENSIONS: readonly RoutingDimension[] = [
  {
    field: "horizons",
    values: (head) => head.horizons,
    gates: () => true,
    required: (query) => [query.horizon],
  },
  {
    field: "mechanismFamilies",
    values: (head) => head.mechanismFamilies,
    gates: () => true,
    required: (query) => [query.mechanismFamily],
  },
  {
    field: "geometryClasses",
    values: (head) => head.geometryClasses,
    gates: () => true,
    required: (query) => [query.geometryClass],
  },
  {
    field: "modeProfileIds",
    values: (head) => head.modeProfileIds,
    gates: () => true,
    required: (query) => [query.modeProfileId],
  },
  {
    field: "sourceModes",
    values: (head) => head.sourceModes,
    gates: () => true,
    required: (query) => [query.sourceMode],
  },
  {
    field: "antennaClasses",
    values: (head) => head.antennaClasses,
    // The transmit antenna radiates and the receive antenna intercepts for
    // every quantity, so both ends always gate (A01).
    gates: () => true,
    required: (query) => [query.txAntennaClass, query.rxAntennaClass],
  },
  {
    field: "receiverClasses",
    values: (head) => head.receiverClasses,
    // A01/A21: a quantity with no receive chain (pass_geometry) declares no
    // receiver population, and is not made incompatible by that silence.
    gates: (head) => RECEIVER_PARTICIPATION[head.quantity] !== "none",
    required: (query) => [query.rxReceiverClass, query.txReceiverClass],
  },
];

/** The query values a dimension demands of this head, or none when it is silent. */
function dimensionDemands(
  dimension: RoutingDimension,
  head: ModelCapabilityHead,
  query: CapabilityQuery,
): readonly string[] {
  if (!dimension.gates(head)) return [];
  if (
    dimension.field === "receiverClasses" &&
    RECEIVER_PARTICIPATION[head.quantity] === "rx"
  ) {
    // A directed quantity is measured at one receiver, so only the receiving
    // station's chain takes part (M08/M09).
    return [query.rxReceiverClass];
  }
  return dimension.required(query);
}

/** Whether two declared populations could both answer one request. */
function intersects(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.some((value) => right.includes(value));
}

/**
 * Whether two routable heads could both be selected for one request: they
 * answer the same quantity on the same domain, every dimension routing matches
 * on has a value in common, and their frequency ranges overlap. Routing has no
 * tie-break, so such a pair leaves the artefact, uncertainty kind and fallback
 * behaviour of an answer undetermined (M19).
 */
function headsOverlap(
  left: ModelCapabilityHead,
  right: ModelCapabilityHead,
): boolean {
  if (left.quantity !== right.quantity || left.domain !== right.domain) {
    return false;
  }
  if (
    left.frequencyRangeHz.minHz > right.frequencyRangeHz.maxHz ||
    right.frequencyRangeHz.minHz > left.frequencyRangeHz.maxHz
  ) {
    return false;
  }
  return ROUTING_DIMENSIONS.every((dimension) => {
    if (!dimension.gates(left) && !dimension.gates(right)) return true;
    return intersects(dimension.values(left), dimension.values(right));
  });
}

/** Parse an untrusted capability. Fails closed; never throws on data. */
export function parseCapability(
  candidate: unknown,
): ParseOutcome<ModelCapability> {
  return parseWith(modelCapabilitySchema, candidate);
}

/**
 * True when the capability can actually answer this exact request shape.
 *
 * Every dimension the head declares is checked, not just the frequency: the
 * head has to be in a routable state, every membership dimension in
 * `ROUTING_DIMENSIONS` has to contain the request's own value, and the
 * capability has to be declared under the request's own source policy version.
 * A head that lists no mode profiles covers nothing, because an empty
 * declaration is a gap rather than a wildcard. A no-op capability declares no
 * heads and therefore answers nothing.
 *
 * `mechanismFamily` is the family the router already resolved; the request's
 * own "auto" is resolved before this call. Every input the head declares as
 * required must be present in `availableInputs`; optional inputs never gate,
 * because a head may improve on them rather than depend on them.
 */
export function capabilityCovers(
  capability: ModelCapability,
  query: CapabilityQuery,
): boolean {
  const available = new Set<CapabilityInputId>(query.availableInputs);
  // A capability declared under another source policy version is a different
  // routing contract, not a newer spelling of this one (M11/M19).
  if (capability.sourcePolicyVersion !== query.policyVersion) return false;
  return capability.heads.some(
    (head) =>
      ROUTABLE_CAPABILITY_STATES.includes(head.state) &&
      head.quantity === query.quantity &&
      head.domain === query.domain &&
      ROUTING_DIMENSIONS.every((dimension) =>
        dimensionDemands(dimension, head, query).every((value) =>
          dimension.values(head).includes(value),
        ),
      ) &&
      query.frequencyHz >= head.frequencyRangeHz.minHz &&
      query.frequencyHz <= head.frequencyRangeHz.maxHz &&
      // A declared range can span a gap between the constituents of a grouped
      // protocol band (100 MHz lies between 4 m and 2 m). The protocol froze
      // no row there, so nothing may be routed there either.
      protocolCoverageContainsHz(
        {
          event: head.quantity,
          domain: head.domain,
          horizon: query.horizon,
          mechanism: query.mechanismFamily,
        },
        query.frequencyHz,
        // A row on a deferred band label takes its frequencies from this
        // declaration, so the head's own range is what decides the row.
        head.frequencyRangeHz,
      ) &&
      head.requiredInputs.every((input) => available.has(input)),
  );
}

/**
 * The exact projection a capability digest is computed from (M24).
 *
 * Like `requestKeyProjection`, this is an explicit allowlist rather than a
 * serialization of whatever the object happens to carry: the digest is the
 * routing table as it stood when a result was served, so every field that
 * could change a routing decision is listed here by hand and a new field has
 * to be added deliberately.
 */
export function capabilityKeyProjection(
  capability: ModelCapability,
): Record<string, Canonical> {
  return {
    schemaVersion: capability.schemaVersion,
    modelId: capability.modelId,
    modelVersion: capability.modelVersion,
    modelHash: capability.modelHash,
    preprocessingHash: capability.preprocessingHash,
    sourcePolicyVersion: capability.sourcePolicyVersion,
    heads: capability.heads.map((head): Record<string, Canonical> => ({
      quantity: head.quantity,
      units: head.units,
      domain: head.domain,
      state: head.state,
      horizons: [...head.horizons],
      mechanismFamilies: [...head.mechanismFamilies],
      geometryClasses: [...head.geometryClasses],
      antennaClasses: [...head.antennaClasses],
      receiverClasses: [...head.receiverClasses],
      sourceModes: [...head.sourceModes],
      minHz: head.frequencyRangeHz.minHz,
      maxHz: head.frequencyRangeHz.maxHz,
      bandKeys: [...head.bandKeys],
      modeProfileIds: [...head.modeProfileIds],
      requiredInputs: [...head.requiredInputs],
      optionalInputs: [...head.optionalInputs],
      featureSchemaId: head.featureSchemaId,
      featureHash: head.featureHash,
      outputSchemaId: head.outputSchemaId,
      calibrationId: head.calibrationId,
      uncertaintyKind: head.uncertaintyKind,
      internalFallbackKind: head.internalFallback.kind,
      internalFallbackModelId:
        head.internalFallback.kind === "model"
          ? head.internalFallback.modelId
          : null,
      internalFallbackModelVersion:
        head.internalFallback.kind === "model"
          ? head.internalFallback.modelVersion
          : null,
    })),
    corrections: capability.corrections.map(
      (correction): Record<string, Canonical> => ({
        correctionId: correction.correctionId,
        stage: correction.stage,
        ownsQuantityId: correction.ownsQuantityId,
        mechanism: correction.mechanism,
        covarianceOwnership: correction.covarianceOwnership,
        assumptions: [...correction.assumptions],
        active: correction.active,
        inactiveReason: correction.inactiveReason,
      }),
    ),
  };
}

/** The canonical serialization the capability digest is taken of (M24). */
export function capabilityKey(capability: ModelCapability): string {
  return canonicalize(capabilityKeyProjection(capability));
}

/**
 * M24: the digest a result's `provenance.capabilityDigest` carries, so replay
 * can reconstruct the routing table that produced the answer rather than only
 * the model that was picked out of it. The prefix matches the artefact-hash
 * shape the result contract validates.
 */
export async function capabilityDigest(
  capability: ModelCapability,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SubtleCrypto is unavailable; cannot digest a capability");
  }
  const bytes = new TextEncoder().encode(capabilityKey(capability));
  const digest = await subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
