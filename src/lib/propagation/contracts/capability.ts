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
  type AntennaClass,
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
  UNCERTAINTY_KINDS,
} from "@/lib/propagation/contracts/enums";
import {
  finite,
  identifier,
  parseWith,
  reject,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";

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
    receiverClasses: z.array(z.enum(RECEIVER_CLASSES)).min(1),
    frequencyRangeHz: frequencyRange,
    /** Derived labels for display; the frequency range is authoritative. */
    bandKeys: z.array(identifier),
    modeProfileIds: z.array(identifier),
    requiredInputs: z.array(z.enum(CAPABILITY_INPUT_IDS)),
    optionalInputs: z.array(z.enum(CAPABILITY_INPUT_IDS)),
    featureSchemaId: identifier,
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
 */
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
    modelHash: identifier.nullable(),
    preprocessingHash: identifier.nullable(),
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
 * head has to be in a routable state, and it has to declare the requested
 * mechanism family, mode profile, antenna class at both ends and receiver
 * class, and the capability has to be declared under the request's own source
 * policy version. A head that lists no mode profiles covers
 * nothing, because an empty declaration is a gap rather than a wildcard. A
 * no-op capability declares no heads and therefore answers nothing.
 *
 * `mechanismFamily` is the family the router already resolved; the request's
 * own "auto" is resolved before this call. Every input the head declares as
 * required must be present in `availableInputs`; optional inputs never gate,
 * because a head may improve on them rather than depend on them.
 */
export function capabilityCovers(
  capability: ModelCapability,
  query: {
    quantity: ModelCapabilityHead["quantity"];
    domain: ModelCapabilityHead["domain"];
    horizon: ModelCapabilityHead["horizons"][number];
    frequencyHz: number;
    geometryClass: ModelCapabilityHead["geometryClasses"][number];
    mechanismFamily: ModelCapabilityHead["mechanismFamilies"][number];
    modeProfileId: string;
    /** A01: the station populations this request actually belongs to. */
    txAntennaClass: AntennaClass;
    rxAntennaClass: AntennaClass;
    receiverClass: ReceiverClass;
    /** M11/M19: the routing/source policy version the request was issued under. */
    policyVersion: string;
    /** The input identifiers the request actually carries (M11/M19). */
    availableInputs: readonly CapabilityInputId[];
  },
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
      head.horizons.includes(query.horizon) &&
      head.geometryClasses.includes(query.geometryClass) &&
      head.mechanismFamilies.includes(query.mechanismFamily) &&
      head.modeProfileIds.includes(query.modeProfileId) &&
      head.antennaClasses.includes(query.txAntennaClass) &&
      head.antennaClasses.includes(query.rxAntennaClass) &&
      head.receiverClasses.includes(query.receiverClass) &&
      query.frequencyHz >= head.frequencyRangeHz.minHz &&
      query.frequencyHz <= head.frequencyRangeHz.maxHz &&
      head.requiredInputs.every((input) => available.has(input)),
  );
}
