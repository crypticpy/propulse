/**
 * PROP-04 result contract (#950), implementing M01 typed heads, M07 mode
 * semantics, M02/M11 as-issued evidence and M19 provenance.
 *
 * Each output event is its own type with its own conditioning fields. Network
 * detection, personal decode and completed-QSO probabilities can never be read
 * as the same number, and an unsupported or disabled capability is reported as
 * a typed unavailability with a reason, never as a zero or a NaN.
 */
import { z } from "zod";
import {
  AVAILABILITY_STATES,
  CIRCUIT_SUPPORT_STATES,
  FALLBACK_REASONS,
  INTERVAL_KINDS,
  MECHANISM_FAMILIES,
  POLARIZATIONS,
  POWER_BEARING_SUPPORT_STATES,
  PREDICTION_DOMAINS,
  PREDICTION_QUANTITIES,
  QUANTITY_UNITS,
  REFERENCE_BANDWIDTH_HZ,
  RESULT_SCHEMA_VERSION,
  type FallbackReason,
  type PredictionDomain,
  type PredictionQuantity,
} from "@/lib/propagation/contracts/enums";
import {
  decibelsOrNoPower,
  finite,
  identifier,
  instant,
  instantMs,
  parseWith,
  probability,
  reject,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";

/** M17 uncertainty. An interval always states the semantics it was built on. */
const uncertainty = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }).strict(),
    z
      .object({
        kind: z.enum([
          "native_reference_decile",
          "calibrated_predictive_interval",
          "model_spread",
        ]),
        intervalKind: z.enum(INTERVAL_KINDS),
        /** Nominal coverage of the interval, strictly inside (0, 1). */
        coverageProbability: finite.gt(0).lt(1),
        low: finite,
        high: finite,
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.kind !== "none" && value.low > value.high) {
      reject(ctx, ["low"], "Interval low bound exceeds its high bound");
    }
  })
  .describe("Uncertainty in the same units as the head value");

/** M08 itemised losses. A component is named and never silently folded in. */
const lossComponent = z
  .object({
    componentId: identifier,
    valueDb: finite,
    referencePlane: identifier,
  })
  .strict();

const snr2500Payload = z
  .object({
    support: z.enum(CIRCUIT_SUPPORT_STATES),
    /**
     * M07: a mode that carries no power reports the -Infinity sentinel, and a
     * power-bearing mode reports a finite SNR. Neither direction may be faked
     * with a large negative number or a zero.
     */
    snr2500Db: decibelsOrNoPower,
    referenceBandwidthHz: z.literal(REFERENCE_BANDWIDTH_HZ),
    noiseFloorDbm: finite,
    losses: z.array(lossComponent),
    alreadyIncludedMechanisms: z.array(identifier),
  })
  .strict()
  .superRefine((value, ctx) => {
    const bearsPower = POWER_BEARING_SUPPORT_STATES.includes(value.support);
    const finiteSnr = Number.isFinite(value.snr2500Db);
    if (bearsPower && !finiteSnr) {
      reject(
        ctx,
        ["snr2500Db"],
        `Support ${value.support} carries power and requires a finite SNR2500`,
      );
    }
    if (!bearsPower && finiteSnr) {
      reject(
        ctx,
        ["snr2500Db"],
        `Support ${value.support} contributes no power and requires the -Infinity sentinel`,
      );
    }
  });

const circuitSupportPayload = z
  .object({
    modes: z
      .array(
        z
          .object({
            modeId: identifier,
            mechanism: z.enum(MECHANISM_FAMILIES),
            support: z.enum(CIRCUIT_SUPPORT_STATES),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const networkDetectionPayload = z
  .object({
    probability,
    /** The model's own exposure population; never a personal path (M01). */
    modelEventId: identifier,
    exposureCellId: identifier,
    populationVersion: identifier,
    bucketStartAt: instant,
    bucketEndAt: instant,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (instantMs(value.bucketEndAt) <= instantMs(value.bucketStartAt)) {
      reject(
        ctx,
        ["bucketEndAt"],
        "Detection bucket must have positive length",
      );
    }
  });

const conditionalDecodePayload = z
  .object({
    /** Null until a calibrated decoder response exists (M10). */
    probability: probability.nullable(),
    /** SNR2500 minus the declared threshold; always reportable. */
    marginDb: finite.nullable(),
    decoderId: identifier,
    decoderVersion: identifier,
    observationSeconds: finite.positive(),
    criterionId: identifier,
    thresholdSnr2500Db: finite,
    referenceBandwidthHz: z.literal(REFERENCE_BANDWIDTH_HZ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.probability === null && value.marginDb === null) {
      reject(
        ctx,
        ["marginDb"],
        "An available decode head must report a margin or a calibrated probability",
      );
    }
  });

const completedQsoPayload = z
  .object({
    probability,
    /** M22 successive conditional factors, never independent probabilities. */
    pActivity: probability,
    pLinkGivenActivity: probability,
    pCompletionGivenLink: probability,
    attemptProtocolId: identifier,
  })
  .strict()
  .superRefine((value, ctx) => {
    const chained =
      value.pActivity * value.pLinkGivenActivity * value.pCompletionGivenLink;
    if (Math.abs(chained - value.probability) > 1e-9) {
      reject(
        ctx,
        ["probability"],
        "Completed-QSO probability must equal the product of its conditional factors",
      );
    }
  });

const observedActivityPayload = z
  .object({
    count: z.number().int().nonnegative(),
    intervalStartAt: instant,
    intervalEndAt: instant,
    /** Absent reports are not evidence, so coverage must be declared. */
    sourceCoverageIds: z.array(identifier).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (instantMs(value.intervalEndAt) <= instantMs(value.intervalStartAt)) {
      reject(
        ctx,
        ["intervalEndAt"],
        "Observation interval must have positive length",
      );
    }
  });

const fieldStrengthPayload = z
  .object({
    fieldStrengthDbuvPerM: finite,
    polarization: z.enum(POLARIZATIONS),
    heightMeters: finite.nonnegative(),
    measurementBandwidthHz: finite.positive(),
  })
  .strict();

const usableBurstPayload = z
  .object({
    probability,
    criterionId: identifier,
    intervalStartAt: instant,
    intervalEndAt: instant,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (instantMs(value.intervalEndAt) <= instantMs(value.intervalStartAt)) {
      reject(
        ctx,
        ["intervalEndAt"],
        "Burst interval must have positive length",
      );
    }
  });

const passGeometryPayload = z
  .object({
    aosAt: instant,
    losAt: instant,
    timingUncertaintySeconds: finite.nonnegative(),
    ephemerisAgeSeconds: finite.nonnegative(),
    horizonDeg: finite.min(-90).max(90),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (instantMs(value.losAt) <= instantMs(value.aosAt)) {
      reject(
        ctx,
        ["losAt"],
        "Loss of signal must follow acquisition of signal",
      );
    }
  });

const dopplerPayload = z
  .object({
    dopplerHz: finite,
    transmittedFrequencyHz: finite.positive(),
    /** A21 sign convention: positive range rate means receding. */
    signConvention: z.literal("positive_receding"),
  })
  .strict();

/**
 * The payload type each quantity carries. `PAYLOAD_SCHEMAS` below and this map
 * are the two halves of one contract: adding a quantity without both is a type
 * error, and consumers narrow a head by its quantity rather than casting.
 */
export interface PayloadByQuantity {
  circuit_support: z.infer<typeof circuitSupportPayload>;
  snr2500: z.infer<typeof snr2500Payload>;
  network_detection: z.infer<typeof networkDetectionPayload>;
  observed_activity: z.infer<typeof observedActivityPayload>;
  conditional_decode: z.infer<typeof conditionalDecodePayload>;
  completed_qso: z.infer<typeof completedQsoPayload>;
  field_strength: z.infer<typeof fieldStrengthPayload>;
  usable_burst: z.infer<typeof usableBurstPayload>;
  pass_geometry: z.infer<typeof passGeometryPayload>;
  doppler: z.infer<typeof dopplerPayload>;
}

const PAYLOAD_SCHEMAS: Record<PredictionQuantity, z.ZodTypeAny> = {
  circuit_support: circuitSupportPayload,
  snr2500: snr2500Payload,
  network_detection: networkDetectionPayload,
  observed_activity: observedActivityPayload,
  conditional_decode: conditionalDecodePayload,
  completed_qso: completedQsoPayload,
  field_strength: fieldStrengthPayload,
  usable_burst: usableBurstPayload,
  pass_geometry: passGeometryPayload,
  doppler: dopplerPayload,
};

const UNAVAILABLE_STATES = AVAILABILITY_STATES.filter(
  (state) => state !== "available" && state !== "experimental",
) as unknown as ["unsupported", "missing_input", "unavailable"];

const headState = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.enum(["available", "experimental"]),
      value: z.unknown(),
    })
    .strict(),
  z
    .object({
      availability: z.enum(UNAVAILABLE_STATES),
      /** Why the capability is off. Never a zero and never a NaN. */
      reason: identifier,
    })
    .strict(),
]);

/** Everything a head declares regardless of which event it answers (M01). */
export interface PredictionHeadBase {
  units: string;
  domain: PredictionDomain;
  contextId: string;
  validAt: string;
  effectiveModelId: string;
  effectiveModelVersion: string;
  calibrationId: string | null;
  assumptions: string[];
  fallbackReason: FallbackReason | null;
  uncertainty: z.infer<typeof uncertainty>;
}

/**
 * A head, discriminated by its quantity so `state.value` is the payload that
 * quantity actually carries. An unavailable head has a reason and no value.
 */
export type PredictionHead = {
  [Q in PredictionQuantity]: PredictionHeadBase & {
    quantity: Q;
    state:
      | {
          availability: "available" | "experimental";
          value: PayloadByQuantity[Q];
        }
      | {
          availability: "unsupported" | "missing_input" | "unavailable";
          reason: string;
        };
  };
}[PredictionQuantity];

const predictionHead = z
  .object({
    quantity: z.enum(PREDICTION_QUANTITIES),
    units: identifier,
    domain: z.enum(PREDICTION_DOMAINS),
    contextId: identifier,
    validAt: instant,
    effectiveModelId: identifier,
    effectiveModelVersion: identifier,
    calibrationId: identifier.nullable(),
    assumptions: z.array(identifier),
    fallbackReason: z.enum(FALLBACK_REASONS).nullable(),
    uncertainty,
    state: headState,
  })
  .strict()
  /**
   * The payload is validated by the schema its quantity names, and the parsed
   * payload replaces the raw one so a wire encoding (the "-Infinity" no-power
   * sentinel) is normalized exactly once, here.
   */
  .transform((value, ctx): PredictionHead => {
    if (value.units !== QUANTITY_UNITS[value.quantity]) {
      reject(
        ctx,
        ["units"],
        `Quantity ${value.quantity} is measured in ${QUANTITY_UNITS[value.quantity]}`,
      );
    }
    if (
      value.state.availability !== "available" &&
      value.state.availability !== "experimental"
    ) {
      if (value.uncertainty.kind !== "none") {
        reject(
          ctx,
          ["uncertainty", "kind"],
          "An unavailable head cannot carry an uncertainty interval",
        );
      }
      // The quantity and its payload are checked below; the cast only tells
      // TypeScript that the enum member and its payload belong together.
      return value as PredictionHead;
    }
    const payload = PAYLOAD_SCHEMAS[value.quantity].safeParse(
      value.state.value,
    );
    if (!payload.success) {
      for (const issue of payload.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["state", "value", ...issue.path],
          message: issue.message,
        });
      }
      return z.NEVER;
    }
    if (
      value.quantity === "conditional_decode" &&
      (payload.data as { probability: number | null }).probability !== null &&
      value.calibrationId === null
    ) {
      reject(
        ctx,
        ["calibrationId"],
        "A numeric decode probability requires a calibration identity (M10)",
      );
    }
    if (value.quantity === "completed_qso" && value.calibrationId === null) {
      reject(
        ctx,
        ["calibrationId"],
        "A numeric completed-QSO probability requires a calibration identity (M22)",
      );
    }
    if (
      value.uncertainty.kind === "calibrated_predictive_interval" &&
      value.calibrationId === null
    ) {
      reject(
        ctx,
        ["calibrationId"],
        "A calibrated predictive interval requires a calibration identity (M17)",
      );
    }
    return {
      ...value,
      state: { ...value.state, value: payload.data },
    } as PredictionHead;
  });

/** M02/M11 as-issued evidence. Eligibility is proven, never assumed. */
const evidenceSource = z
  .object({
    sourceId: identifier,
    sourceVersion: identifier,
    observedIntervalEndAt: instant.nullable(),
    publishedAt: instant.nullable(),
    capturedAt: instant.nullable(),
    ageSeconds: finite.nonnegative().nullable(),
    eligible: z.boolean(),
    exclusionReason: identifier.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.eligible && value.exclusionReason !== null) {
      reject(
        ctx,
        ["exclusionReason"],
        "An eligible source cannot also carry an exclusion reason",
      );
    }
    if (!value.eligible && value.exclusionReason === null) {
      reject(
        ctx,
        ["exclusionReason"],
        "An excluded source must name why it was excluded",
      );
    }
    if (
      value.eligible &&
      (value.observedIntervalEndAt === null ||
        value.publishedAt === null ||
        value.capturedAt === null)
    ) {
      reject(
        ctx,
        ["capturedAt"],
        "Unknown availability history is ineligible for as-issued use (M02)",
      );
    }
  });

const provenance = z
  .object({
    requestedModelId: identifier.nullable(),
    requestedModelVersion: identifier.nullable(),
    effectiveModelId: identifier,
    effectiveModelVersion: identifier,
    policyVersion: identifier,
    fallbackReason: z.enum(FALLBACK_REASONS).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.requestedModelId === null) return;
    const same =
      value.requestedModelId === value.effectiveModelId &&
      value.requestedModelVersion === value.effectiveModelVersion;
    if (!same && value.fallbackReason === null) {
      reject(
        ctx,
        ["fallbackReason"],
        "An effective model different from the requested one must name its fallback reason (M19)",
      );
    }
    if (same && value.fallbackReason !== null) {
      reject(
        ctx,
        ["fallbackReason"],
        "The requested model was served; there is no fallback to report",
      );
    }
  });

export const predictionResultSchema = z
  .object({
    schemaVersion: z.literal(RESULT_SCHEMA_VERSION),
    contextId: identifier,
    /** The exact `requestKey` this result answers. */
    requestKey: identifier,
    issuedAt: instant,
    validAt: instant,
    provenance,
    evidence: z.object({ sources: z.array(evidenceSource) }).strict(),
    heads: z.array(predictionHead).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issued = instantMs(value.issuedAt);
    if (instantMs(value.validAt) < issued) {
      reject(ctx, ["validAt"], "validAt must not precede issuedAt (M02)");
    }
    value.evidence.sources.forEach((source, index) => {
      if (!source.eligible) return;
      const stamps: [string, string | null][] = [
        ["observedIntervalEndAt", source.observedIntervalEndAt],
        ["publishedAt", source.publishedAt],
        ["capturedAt", source.capturedAt],
      ];
      for (const [field, stamp] of stamps) {
        if (stamp !== null && instantMs(stamp) > issued) {
          reject(
            ctx,
            ["evidence", "sources", index, field],
            `An eligible source must have ${field} no later than issuedAt (M02)`,
          );
        }
      }
    });
    const seen = new Set<string>();
    value.heads.forEach((head, index) => {
      if (seen.has(head.quantity)) {
        reject(
          ctx,
          ["heads", index, "quantity"],
          `Duplicate head for quantity ${head.quantity}`,
        );
      }
      seen.add(head.quantity);
      if (head.validAt !== value.validAt) {
        reject(
          ctx,
          ["heads", index, "validAt"],
          "A head answers the result's valid time; a different time slice is its own result (M02)",
        );
      }
      if (head.contextId !== value.contextId) {
        reject(
          ctx,
          ["heads", index, "contextId"],
          "A head belongs to the result's context",
        );
      }
      const servedByAnotherModel =
        head.effectiveModelId !== value.provenance.effectiveModelId ||
        head.effectiveModelVersion !== value.provenance.effectiveModelVersion;
      if (servedByAnotherModel && head.fallbackReason === null) {
        reject(
          ctx,
          ["heads", index, "fallbackReason"],
          "A head served by another model must name its own fallback reason (M19)",
        );
      }
    });
  });

/** A validated, frozen prediction result. */
export type PredictionResult = z.infer<typeof predictionResultSchema>;

/** Parse an untrusted result. Fails closed; never throws on data. */
export function parseResult(
  candidate: unknown,
): ParseOutcome<PredictionResult> {
  return parseWith(predictionResultSchema, candidate);
}

/** The single head for a quantity, or undefined when the model omitted it. */
export function findHead<Q extends PredictionQuantity>(
  result: PredictionResult,
  quantity: Q,
): Extract<PredictionHead, { quantity: Q }> | undefined {
  return result.heads.find(
    (head): head is Extract<PredictionHead, { quantity: Q }> =>
      head.quantity === quantity,
  );
}
