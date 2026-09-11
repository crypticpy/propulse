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
  CAPABILITY_SCHEMA_VERSION,
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
  QUANTITY_UNITS,
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
    frequencyRangeHz: frequencyRange,
    /** Derived labels for display; the frequency range is authoritative. */
    bandKeys: z.array(identifier),
    modeProfileIds: z.array(identifier),
    requiredInputs: z.array(identifier),
    optionalInputs: z.array(identifier),
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
      const key = `${head.quantity}|${head.domain}`;
      if (seenHeads.has(key)) {
        reject(
          ctx,
          ["heads", index, "quantity"],
          `Duplicate capability head for ${key}`,
        );
      }
      seenHeads.add(key);
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

/** Parse an untrusted capability. Fails closed; never throws on data. */
export function parseCapability(
  candidate: unknown,
): ParseOutcome<ModelCapability> {
  return parseWith(modelCapabilitySchema, candidate);
}

/**
 * True when the capability can answer this exact request shape. A no-op
 * capability answers nothing and is routed past without producing a number.
 */
export function capabilityCovers(
  capability: ModelCapability,
  query: {
    quantity: ModelCapabilityHead["quantity"];
    domain: ModelCapabilityHead["domain"];
    horizon: ModelCapabilityHead["horizons"][number];
    frequencyHz: number;
    geometryClass: ModelCapabilityHead["geometryClasses"][number];
  },
): boolean {
  return capability.heads.some(
    (head) =>
      head.quantity === query.quantity &&
      head.domain === query.domain &&
      head.horizons.includes(query.horizon) &&
      head.geometryClasses.includes(query.geometryClass) &&
      query.frequencyHz >= head.frequencyRangeHz.minHz &&
      query.frequencyHz <= head.frequencyRangeHz.maxHz,
  );
}
