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
  DOMAIN_GEOMETRY_CLASSES,
  isProtocolCoverage,
  isProtocolGeometry,
  ORBITAL_RELAY_BODIES_BY_MECHANISM,
  PERMITTED_GEOMETRY_CLASSES,
  PERMITTED_RELAY_KINDS_BY_MECHANISM,
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
  INTERVAL_VALUED_QUANTITIES,
  UNREPRESENTABLE_MECHANISM_FAMILIES,
  MAX_REQUEST_FREQUENCY_HZ,
  MECHANISM_FAMILIES,
  MIN_REQUEST_FREQUENCY_HZ,
  MODEL_KINDS,
  MODEL_KINDS_BY_POLICY,
  type ModelKind,
  type ModelPolicy,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  RECEIVER_CLASSES,
  type ReceiverClass,
  QUANTITY_UNITS,
  ROUTABLE_CAPABILITY_STATES,
  SOURCE_MODES,
  type SourceMode,
  SCATTER_BASIS_BY_MECHANISM,
  UNCERTAINTY_KINDS,
  VALIDATED_CAPABILITY_STATES,
} from "@/lib/propagation/contracts/enums";
import {
  finite,
  artifactHash,
  identifier,
  instantMs,
  parseWith,
  reject,
  type ContractIssue,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";
import {
  hasPointValue,
  parseResult,
  payloadCarrierFields,
  RESULT_SCHEMA_VERSION,
  type PredictionHead,
  type PredictionResult,
} from "@/lib/propagation/contracts/result";
import type { PredictionRequest } from "@/lib/propagation/contracts/request";
import {
  canonicalize,
  requestKeyDigest,
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

/**
 * M02/M19: the interval lengths an interval-valued head was qualified for,
 * inclusive at both ends. An hourly detection probability and a one-second one
 * are different events, not two resolutions of one event, so a head answers
 * only the lengths it declares and routing matches the request's own
 * `scope.intervalSeconds` against this range.
 */
const intervalSecondsRange = z
  .object({
    minSeconds: finite.positive(),
    maxSeconds: finite.positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minSeconds > value.maxSeconds) {
      reject(
        ctx,
        ["maxSeconds"],
        "An interval range must satisfy minSeconds <= maxSeconds",
      );
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
     * Null exactly when the quantity is sampled at an instant: there is no
     * interval to qualify. Interval-valued quantities declare the range they
     * answer (M02).
     */
    intervalSecondsRange: intervalSecondsRange.nullable(),
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
    // M02: an instantaneous quantity has no interval to be qualified for, and
    // a head that declared one would be advertising a length routing could
    // never send it. A gap declaration for an interval quantity may leave the
    // range null; a routable one may not (see the routable branch below).
    if (
      !INTERVAL_VALUED_QUANTITIES.includes(value.quantity) &&
      value.intervalSecondsRange !== null
    ) {
      reject(
        ctx,
        ["intervalSecondsRange"],
        `Quantity ${value.quantity} is sampled at an instant and declares no interval range (M02)`,
      );
    }
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
  intervalSecondsRange: { minSeconds: number; maxSeconds: number } | null;
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
    head.intervalSecondsRange === null
      ? null
      : [
          head.intervalSecondsRange.minSeconds,
          head.intervalSecondsRange.maxSeconds,
        ],
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
    /**
     * M11/M19: what the model is made of. A request may ask for physics only,
     * and "physics" is not something a router can read off a model id, so the
     * declaration says it and routing matches on it like any other dimension.
     */
    modelKind: z.enum(MODEL_KINDS),
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
        if (dimension.values(head, value).length > 0) continue;
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
      const unrepresentable = head.mechanismFamilies.filter((family) =>
        UNREPRESENTABLE_MECHANISM_FAMILIES.includes(family),
      );
      if (unrepresentable.length > 0) {
        // A19: the request contract cannot express a request for these
        // families, so nothing could ever be routed here. The frozen protocol
        // still carries the row; this is where the row is made unclaimable.
        reject(
          ctx,
          ["heads", index, "mechanismFamilies"],
          `No request can be written for mechanism family ${unrepresentable.join(", ")} in this schema version, so a routable head cannot advertise it (A19)`,
        );
      }
      if (
        INTERVAL_VALUED_QUANTITIES.includes(head.quantity) &&
        head.intervalSecondsRange === null
      ) {
        // M02/M19: the request declares the length of the interval it is
        // asking about, and a head that does not say which lengths it was
        // qualified for would be routed for a one-second probability as
        // readily as for an hourly one - a different event, same head.
        reject(
          ctx,
          ["heads", index, "intervalSecondsRange"],
          `A routable ${head.quantity} head is defined over an interval and declares the interval lengths it answers (M02, M19)`,
        );
      }
      // M19: two routable heads that could both answer one request leave the
      // artefact, uncertainty kind and fallback behaviour of that answer
      // undetermined, because routing has no tie-break between them.
      for (let other = 0; other < index; other += 1) {
        const earlier = value.heads[other];
        if (!ROUTABLE_CAPABILITY_STATES.includes(earlier.state)) continue;
        if (!headsOverlap(earlier, head, value)) continue;
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
      for (const geometryClass of head.geometryClasses) {
        // M11/A21: the head's domain is the population the frozen rows were
        // taken over, and that population has a geometry. A head that
        // advertises another one would route requests onto rows that say
        // nothing about the path it actually answers.
        if (isProtocolGeometry(head.domain, geometryClass)) continue;
        reject(
          ctx,
          ["heads", index, "geometryClasses"],
          `The protocol serves domain ${head.domain} on ${DOMAIN_GEOMETRY_CLASSES[
            head.domain
          ].join(", ")}, not on geometry class ${geometryClass} (M11, A21)`,
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
  /**
   * M02: the length of the interval the request asks about, and null for an
   * instantaneous sample. It is a routing dimension because it is part of the
   * event: `scope.intervalSeconds` and this field are the same number.
   */
  intervalSeconds: number | null;
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
  /**
   * M11/M19: the model policy the request was issued under. `physics_only` is
   * a routing constraint, not a preference: a learned model may not answer it.
   */
  modelPolicy: ModelPolicy;
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
/** The declaration-level facts a routing dimension may read (M11, M19). */
interface DeclaredModelKind {
  modelKind: ModelKind;
}

interface RoutingDimension {
  /** The head field, used for the issue path and the message. */
  field:
    | "horizons"
    | "mechanismFamilies"
    | "geometryClasses"
    | "modeProfileIds"
    | "sourceModes"
    | "antennaClasses"
    | "receiverClasses"
    | "modelKind";
  /**
   * The populations the head declares on this dimension. Most live on the head;
   * the model kind is a property of the whole declaration, which is why the
   * declaration it belongs to is passed alongside.
   */
  values: (
    head: ModelCapabilityHead,
    declaration: DeclaredModelKind,
  ) => readonly string[];
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
    field: "modelKind",
    values: (_head, declaration) => [declaration.modelKind],
    gates: () => true,
    // The declaration names exactly one kind, so a policy that admits the whole
    // vocabulary demands nothing and a policy that narrows demands the one kind
    // it admits. `MODEL_KINDS_BY_POLICY` is the only place that distinction is
    // written down.
    required: (query) => {
      const admitted = MODEL_KINDS_BY_POLICY[query.modelPolicy];
      return admitted.length === MODEL_KINDS.length ? [] : admitted;
    },
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

/**
 * The routing dimensions that are ranges rather than sets: the head declares
 * an interval of numbers and the query carries one number that has to fall
 * inside it. Kept beside `ROUTING_DIMENSIONS` and read by the same three
 * rules, so the containment test in `capabilityCovers` and the overlap test
 * between two routable heads cannot drift apart.
 *
 * A `null` range means the dimension is silent for this head, and a `null`
 * demand means the request carries no such number; the two only match each
 * other, so an interval request never lands on an instantaneous head and an
 * instantaneous request never lands on an interval one.
 */
interface RangeRoutingDimension {
  field: "frequencyRangeHz" | "intervalSecondsRange";
  range: (head: ModelCapabilityHead) => { min: number; max: number } | null;
  demand: (query: CapabilityQuery) => number | null;
}

export const RANGE_ROUTING_DIMENSIONS: readonly RangeRoutingDimension[] = [
  {
    field: "frequencyRangeHz",
    range: (head) => ({
      min: head.frequencyRangeHz.minHz,
      max: head.frequencyRangeHz.maxHz,
    }),
    demand: (query) => query.frequencyHz,
  },
  {
    field: "intervalSecondsRange",
    range: (head) =>
      head.intervalSecondsRange === null
        ? null
        : {
            min: head.intervalSecondsRange.minSeconds,
            max: head.intervalSecondsRange.maxSeconds,
          },
    demand: (query) => query.intervalSeconds,
  },
];

/** Whether this head answers the number the query carries on this dimension. */
function rangeCovers(
  dimension: RangeRoutingDimension,
  head: ModelCapabilityHead,
  query: CapabilityQuery,
): boolean {
  const range = dimension.range(head);
  const demand = dimension.demand(query);
  if (range === null || demand === null)
    return range === null && demand === null;
  return demand >= range.min && demand <= range.max;
}

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
  declaration: DeclaredModelKind,
): boolean {
  if (left.quantity !== right.quantity || left.domain !== right.domain) {
    return false;
  }
  const rangesMeet = RANGE_ROUTING_DIMENSIONS.every((dimension) => {
    const here = dimension.range(left);
    const there = dimension.range(right);
    if (here === null || there === null) return here === null && there === null;
    return here.min <= there.max && there.min <= here.max;
  });
  if (!rangesMeet) return false;
  return ROUTING_DIMENSIONS.every((dimension) => {
    if (!dimension.gates(left) && !dimension.gates(right)) return true;
    return intersects(
      dimension.values(left, declaration),
      dimension.values(right, declaration),
    );
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
          dimension.values(head, capability).includes(value),
        ),
      ) &&
      RANGE_ROUTING_DIMENSIONS.every((dimension) =>
        rangeCovers(dimension, head, query),
      ) &&
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
      minIntervalSeconds: head.intervalSecondsRange?.minSeconds ?? null,
      maxIntervalSeconds: head.intervalSecondsRange?.maxSeconds ?? null,
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

/**
 * The result side of the routing table (M01, M11, M19).
 *
 * `parseResult` can only see the result. It cannot recover the request behind
 * the opaque `requestKey` digest, so every dimension routing decided on -- the
 * frequency above all -- is unchecked there: a correctly keyed 100 MHz result
 * may carry a value-bearing HF head and pass, because the four-field coverage
 * tuple exists at HF. Binding is therefore a separate pass that takes the
 * request as well, and it is driven by the same dimension tables routing uses
 * (`ROUTING_DIMENSIONS`, `RANGE_ROUTING_DIMENSIONS`) so a dimension added to
 * routing later cannot be silently left unbound: `capability.test.ts` fails if
 * a routing dimension has neither a binding nor a stated exemption.
 *
 * A dimension is bound either on the head that answers `targetEvent` (domain,
 * horizon, family, geometry, relay kind, interval: the row the request asked
 * for) or on every value-bearing head (the protocol row at the requested
 * frequency and the payload carrier: a companion head is still an answer
 * served at that frequency, and the protocol must define it there).
 *
 * Each row also declares whether it binds an unavailable target head. A
 * declared gap is attributed to a request population, so domain, horizon,
 * family, geometry, relay kind and interval are checked on an unsupported,
 * missing-input or unavailable target head too; only the checks that read a
 * value are skipped, because there is none to read.
 */
type BindingField =
  | RoutingDimension["field"]
  | RangeRoutingDimension["field"]
  | "domain"
  | "scatterBasis"
  | "relayKinds"
  | "payloadFrequency";

interface ResultBinding {
  field: BindingField;
  /** "target" answers `targetEvent`; "served" is every value-bearing head. */
  appliesTo: "target" | "served";
  /**
   * Whether the dimension still binds when the target head is unsupported,
   * missing an input or unavailable. A declared gap is attributed to a request
   * population, so a gap copied from another route or another interval length
   * is a misattribution even though it reports no value; only the checks that
   * read a value (the protocol row at the requested frequency, the payload
   * carrier) have nothing to read.
   */
  onUnavailableTarget: boolean;
  /** Why a result cannot carry this dimension at all, or null when bound. */
  exemption: string | null;
  /** The head field a violation is reported on. */
  path: string | ((head: PredictionHead) => string);
  /** The violation reason, or null when the head satisfies the request. */
  check:
    | ((head: PredictionHead, request: PredictionRequest) => string | null)
    | null;
}

export const RESULT_BINDINGS: readonly ResultBinding[] = [
  {
    field: "domain",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "domain",
    check: (head, request) =>
      head.domain === request.scope.domain
        ? null
        : `A head answering ${request.targetEvent} answers the requested domain ${request.scope.domain}, not ${head.domain} (M11)`,
  },
  {
    field: "horizons",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "horizon",
    check: (head, request) =>
      head.horizon === request.scope.horizon
        ? null
        : `A head answering ${request.targetEvent} answers the requested horizon ${request.scope.horizon}, not ${head.horizon} (M11)`,
  },
  {
    field: "mechanismFamilies",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "mechanismFamily",
    check: (head, request) => {
      const family = request.mechanismPolicy.family;
      // "auto" delegates the choice to the router, and the frequency binding
      // below still requires the family it chose to be on a frozen row.
      if (family === "auto" || head.mechanismFamily === family) return null;
      return `The request named mechanism family ${family} and the head answers ${head.mechanismFamily} (M11, M19)`;
    },
  },
  {
    field: "geometryClasses",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "mechanismFamily",
    check: (head, request) => {
      const geometryClass = request.mechanismPolicy.geometryClass;
      if (
        !(
          PERMITTED_GEOMETRY_CLASSES[head.mechanismFamily] as readonly string[]
        ).includes(geometryClass)
      ) {
        return `Mechanism family ${head.mechanismFamily} is not answered on the requested geometry class ${geometryClass} (A21, A22)`;
      }
      return isProtocolGeometry(head.domain, geometryClass)
        ? null
        : `The protocol serves domain ${head.domain} on ${DOMAIN_GEOMETRY_CLASSES[head.domain].join(", ")}, not on the requested geometry class ${geometryClass} (M11, A21)`;
    },
  },
  {
    field: "scatterBasis",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "mechanismFamily",
    check: (head, request) => {
      if (request.route.kind !== "scatter") return null;
      const basis = SCATTER_BASIS_BY_MECHANISM[head.mechanismFamily];
      return basis === request.route.basis
        ? null
        : `The request locates its scattering region on the ${request.route.basis} basis and ${head.mechanismFamily} scatters on ${basis ?? "no scatter basis"} (A19, A20)`;
    },
  },
  {
    field: "modelKind",
    appliesTo: "target",
    onUnavailableTarget: true,
    exemption: null,
    path: "effectiveModelKind",
    check: (head, request) => {
      // M11/M19: physics_only is a constraint on what may answer, not a
      // preference. The head names what produced it, because the capability
      // digest beside it is opaque and this pass is offline.
      const admitted = MODEL_KINDS_BY_POLICY[
        request.requestedModel.policy
      ] as readonly string[];
      return admitted.includes(head.effectiveModelKind)
        ? null
        : `Model policy ${request.requestedModel.policy} admits ${admitted.join(", ")}, and this head was produced by a ${head.effectiveModelKind} model (M11, M19)`;
    },
  },
  {
    field: "relayKinds",
    appliesTo: "target",
    onUnavailableTarget: true,
    exemption: null,
    path: "mechanismFamily",
    check: (head, request) => {
      // A21/A22: the request side applies this to a named family, but a
      // request that asked for "auto" leaves the router free, and geometry
      // alone does not pin the family: two_leg_relay admits both a fixed
      // ground repeater and a transponder, so a satellite head could answer a
      // fixed relay and a terrestrial relay head an orbiting one. The relay
      // the caller actually supplied decides which family may answer.
      const permitted = PERMITTED_RELAY_KINDS_BY_MECHANISM[
        head.mechanismFamily
      ] as readonly string[];
      if (request.relay === null) {
        return permitted.length === 0
          ? null
          : `Mechanism family ${head.mechanismFamily} answers over a relay leg and the request carries none (A21, A22)`;
      }
      if (!permitted.includes(request.relay.kind)) {
        return `Mechanism family ${head.mechanismFamily} is not served by a relay of kind ${request.relay.kind}; it admits ${permitted.length === 0 ? "no relay at all" : permitted.join(", ")} (A21, A22)`;
      }
      if (request.relay.kind !== "orbital") return null;
      // A21/A22: an element set parses the same for the Moon and for a
      // cubesat, so the family that answers has to be the one whose physics
      // the named body is: eme is lunar and satellite is not.
      const bodies = ORBITAL_RELAY_BODIES_BY_MECHANISM[
        head.mechanismFamily
      ] as readonly string[];
      return bodies.includes(request.relay.body)
        ? null
        : `Mechanism family ${head.mechanismFamily} is relayed by ${bodies.length === 0 ? "no orbiting body" : bodies.join(", ")}, not by the ${request.relay.body} the request named (A21, A22)`;
    },
  },
  {
    field: "intervalSecondsRange",
    onUnavailableTarget: true,
    appliesTo: "target",
    exemption: null,
    path: "intervalSeconds",
    check: (head, request) =>
      head.intervalSeconds === request.scope.intervalSeconds
        ? null
        : `A head answering ${request.targetEvent} answers the requested interval ${request.scope.intervalSeconds ?? "none"}, not ${head.intervalSeconds ?? "none"} (M02, M19)`,
  },
  {
    field: "frequencyRangeHz",
    onUnavailableTarget: false,
    appliesTo: "served",
    exemption: null,
    path: "mechanismFamily",
    check: (head, request) =>
      protocolCoverageContainsHz(
        {
          event: head.quantity,
          domain: head.domain,
          horizon: head.horizon,
          mechanism: head.mechanismFamily,
        },
        request.frequencyHz,
      )
        ? null
        : `The protocol defines no ${head.quantity} on ${head.domain} at ${head.horizon} via ${head.mechanismFamily} at ${request.frequencyHz} Hz (M11)`,
  },
  {
    field: "payloadFrequency",
    appliesTo: "served",
    onUnavailableTarget: false,
    exemption: null,
    path: (head) =>
      payloadCarrierFields(head.quantity).length === 0
        ? "state.value"
        : `state.value.${payloadCarrierFields(head.quantity)[0]}`,
    check: (head, request) => {
      // M02/M11: a payload carrier is the frequency the calculation was
      // performed at. Doppler is proportional to it, so a 432 MHz carrier
      // answers a different calculation from the 145.95 MHz one requested
      // even though the protocol row and the digest both check out.
      if (!("value" in head.state)) return null;
      const payload = head.state.value as Record<string, unknown>;
      for (const field of payloadCarrierFields(head.quantity)) {
        const carrier = payload[field];
        if (typeof carrier !== "number" || carrier === request.frequencyHz) {
          continue;
        }
        return `A ${head.quantity} head answers the requested carrier ${request.frequencyHz} Hz, not ${carrier} Hz (M02, M11)`;
      }
      return null;
    },
  },
  {
    field: "modeProfileIds",
    onUnavailableTarget: false,
    appliesTo: "served",
    exemption:
      "A head carries the mode ids it evaluated, not the profile that selected them; the profile enters the request key and the capability head declares it.",
    path: "quantity",
    check: null,
  },
  {
    field: "sourceModes",
    onUnavailableTarget: false,
    appliesTo: "served",
    exemption:
      "A result records the sources it used, not the posture it was issued under; the as-issued evidence rules bound every posture alike.",
    path: "quantity",
    check: null,
  },
  {
    field: "antennaClasses",
    onUnavailableTarget: false,
    appliesTo: "served",
    exemption:
      "A result carries no station description; the stations enter the request key and the context identity the result echoes.",
    path: "quantity",
    check: null,
  },
  {
    field: "receiverClasses",
    onUnavailableTarget: false,
    appliesTo: "served",
    exemption:
      "A result carries no receive chain description; the receiver classes enter the request key and the context identity the result echoes.",
    path: "quantity",
    check: null,
  },
];

/** The value-bearing states; an unavailable head answers no dimension. */
const SERVED_STATES: readonly string[] = ["available", "experimental"];

/**
 * Every way a result can fail to be an answer to this request (M01, M11, M19).
 *
 * The result must already be structurally valid: run `parseResult` first, or
 * use `parseResultForRequest`, which does both.
 */
export async function bindResult(
  result: PredictionResult,
  request: PredictionRequest,
): Promise<ContractIssue[]> {
  const issues: ContractIssue[] = [];
  const add = (path: string, reason: string) => issues.push({ path, reason });

  // M01: the digest is the identity of the request, so a result that names
  // another request is not an answer to this one however well it parses.
  const digest = await requestKeyDigest(request);
  if (result.requestKey !== digest) {
    add("requestKey", `This result answers request key ${digest} (M01)`);
  }
  if (result.contextId !== request.contextId) {
    add(
      "contextId",
      `This result answers context ${request.contextId} (M01, M11)`,
    );
  }
  // M02: the answer is for the instant that was asked about, and it cannot
  // have been issued before the question.
  if (instantMs(result.validAt) !== instantMs(request.validAt)) {
    add("validAt", `This result is valid at ${request.validAt} (M02)`);
  }
  if (instantMs(result.issuedAt) < instantMs(request.issuedAt)) {
    add(
      "issuedAt",
      "A result cannot be issued before the request it answers (M02)",
    );
  }
  // M19: the model preference and the policy the request was issued under are
  // what the provenance reports on, so they are the request's, not a copy.
  if (result.provenance.requestedModelId !== request.requestedModel.modelId) {
    add(
      "provenance.requestedModelId",
      `This request asked for model ${request.requestedModel.modelId ?? "none"} (M19)`,
    );
  }
  if (
    result.provenance.requestedModelVersion !==
    request.requestedModel.modelVersion
  ) {
    add(
      "provenance.requestedModelVersion",
      `This request asked for model version ${request.requestedModel.modelVersion ?? "none"} (M19)`,
    );
  }
  if (
    result.provenance.policyVersion !== request.requestedModel.policyVersion
  ) {
    add(
      "provenance.policyVersion",
      `This request was issued under policy version ${request.requestedModel.policyVersion} (M19)`,
    );
  }
  const targetIndex = result.heads.findIndex(
    (head) => head.quantity === request.targetEvent,
  );
  if (targetIndex === -1) {
    add(
      "heads",
      `This result carries no ${request.targetEvent} head, which is the event the request asked for (M01)`,
    );
  }
  result.heads.forEach((head, index) => {
    const isTarget = index === targetIndex;
    const served = SERVED_STATES.includes(head.state.availability);
    for (const binding of RESULT_BINDINGS) {
      if (binding.check === null) continue;
      if (binding.appliesTo === "target" && !isTarget) continue;
      // An unavailable head answers no dimension of its own, but the head that
      // answers `targetEvent` still carries the identity of the request the
      // gap is attributed to: a gap copied from another route or interval is a
      // misattribution. Only the checks that read a value are skipped.
      if (!served && !(isTarget && binding.onUnavailableTarget)) continue;
      const reason = binding.check(head, request);
      if (reason === null) continue;
      const path =
        typeof binding.path === "string" ? binding.path : binding.path(head);
      add(`heads[${index}].${path}`, reason);
    }
  });
  return issues;
}

/**
 * Parse a result and bind it to the request it claims to answer (M01, M11).
 *
 * This is the entry point an experiment must use. `parseResult` establishes
 * that a result is internally consistent; only this one establishes that it is
 * an answer to a particular question, because the routed dimensions -- the
 * frequency first -- live in the request and the result names it by an opaque
 * digest. It is asynchronous because the request key digest is.
 */
export async function parseResultForRequest(
  candidate: unknown,
  request: PredictionRequest,
): Promise<ParseOutcome<PredictionResult>> {
  const parsed = parseResult(candidate);
  if (!parsed.ok) return parsed;
  const issues = await bindResult(parsed.value, request);
  return issues.length === 0 ? parsed : { ok: false, issues };
}
