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
  CALIBRATION_REQUIRED_QUANTITIES,
  CIRCUIT_SUPPORT_STATES,
  FALLBACK_REASONS,
  HEIGHT_DATUMS,
  INTERVAL_KINDS,
  INTERVAL_VALUED_QUANTITIES,
  isProtocolCoverage,
  MECHANISM_FAMILIES,
  POLARIZATIONS,
  POWER_BEARING_SUPPORT_STATES,
  PREDICTION_DOMAINS,
  PREDICTION_HORIZONS,
  PREDICTION_QUANTITIES,
  QUANTITY_UNITS,
  REFERENCE_BANDWIDTH_HZ,
  REQUESTED_MODEL_FALLBACK_REASONS,
  RESULT_SCHEMA_VERSION,
  type FallbackReason,
  type MechanismFamily,
  type PredictionDomain,
  type PredictionHorizon,
  type PredictionQuantity,
  type QuantityUnit,
} from "@/lib/propagation/contracts/enums";
import {
  artifactHash,
  decibelsOrNoPower,
  finite,
  identifier,
  instant,
  instantMs,
  NO_POWER_DB,
  parseWith,
  probability,
  reject,
  requestKeyDigestText,
  type ParseOutcome,
} from "@/lib/propagation/contracts/validation";

/**
 * The one result schema version `parseResult` accepts, re-exported so a
 * capability declaration can be checked against the parser's own literal
 * rather than against a copy of the string (M19).
 */
export { RESULT_SCHEMA_VERSION };

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
    /**
     * M09: a noise floor is a level at a plane. Stated without one it cannot
     * be subtracted from a signal level that was computed at another plane,
     * and the difference would silently absorb the feed loss between them.
     */
    noiseFloorReferencePlane: identifier,
    losses: z.array(lossComponent),
    alreadyIncludedMechanisms: z.array(identifier),
  })
  .strict()
  .superRefine((value, ctx) => {
    const alreadyIncluded = new Set(value.alreadyIncludedMechanisms);
    const seenComponents = new Set<string>();
    value.losses.forEach((loss, index) => {
      // M08: one itemised component, one number. A repeated id leaves a
      // consumer summing the budget twice or picking whichever it read last.
      if (seenComponents.has(loss.componentId)) {
        reject(
          ctx,
          ["losses", index, "componentId"],
          `Loss component ${loss.componentId} is itemised twice (M08)`,
        );
      }
      seenComponents.add(loss.componentId);
      // M08: a mechanism is itemised or it is already inside the reference
      // total. Declaring both double-counts it by exactly its own value.
      if (alreadyIncluded.has(loss.componentId)) {
        reject(
          ctx,
          ["losses", index, "componentId"],
          `Loss component ${loss.componentId} is itemised and also declared already included in the reference total (M08)`,
        );
      }
      // M09: every itemised loss in one budget is measured between the same
      // two planes, or the sum is not a loss between any pair of planes.
      if (loss.referencePlane !== value.losses[0].referencePlane) {
        reject(
          ctx,
          ["losses", index, "referencePlane"],
          `Loss component ${loss.componentId} is stated at reference plane ${loss.referencePlane}, not at the head's plane ${value.losses[0].referencePlane} (M09)`,
        );
      }
    });
    value.alreadyIncludedMechanisms.forEach((mechanism, index) => {
      if (value.alreadyIncludedMechanisms.indexOf(mechanism) === index) return;
      reject(
        ctx,
        ["alreadyIncludedMechanisms", index],
        `Mechanism ${mechanism} is declared already included twice (M08)`,
      );
    });
    if (
      value.losses.length > 0 &&
      value.losses[0].referencePlane !== value.noiseFloorReferencePlane
    ) {
      reject(
        ctx,
        ["noiseFloorReferencePlane"],
        `The noise floor is stated at ${value.noiseFloorReferencePlane} and the losses at ${value.losses[0].referencePlane}; an SNR is a ratio at one plane (M09)`,
      );
    }
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
  .strict()
  .superRefine((value, ctx) => {
    // One mode on one mechanism has one support state (M07). Two entries for
    // the same identity would let a consumer pick whichever it read last.
    const seen = new Set<string>();
    value.modes.forEach((mode, index) => {
      const identity = JSON.stringify([mode.modeId, mode.mechanism]);
      if (seen.has(identity)) {
        reject(
          ctx,
          ["modes", index, "modeId"],
          `Duplicate mode identity ${mode.modeId} on mechanism ${mode.mechanism}`,
        );
      }
      seen.add(identity);
    });
  });

const networkDetectionPayload = z
  .object({
    probability,
    /** The model's own exposure population; never a personal path (M01). */
    modelEventId: identifier,
    exposureCellId: identifier,
    populationVersion: identifier,
    /**
     * The window the detection probability is about. This is the one class of
     * instant in a result that may run past `issuedAt`: it is the forecast
     * horizon itself, not something the model claims to have observed (M02).
     */
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
    /**
     * The interval actually observed. Both ends are in the past as issued: the
     * result-level rule rejects an end after `issuedAt`, and the start precedes
     * the end, so neither can carry a report the result did not have (M02).
     */
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
    /**
     * A02: a field strength is quoted at a height, and a height is only a
     * height against a named reference. Ground wave at 10 m above local
     * terrain and 10 m above mean sea level are different measurements.
     */
    heightDatum: z.enum(HEIGHT_DATUMS),
    measurementBandwidthHz: finite.positive(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // This payload exists only on a value-bearing head, so an unknown datum
    // here is a reported number against no reference at all.
    if (value.heightDatum === "unknown") {
      reject(
        ctx,
        ["heightDatum"],
        "A reported field strength must name the datum its height is measured against (A02)",
      );
    }
  });

const usableBurstPayload = z
  .object({
    probability,
    criterionId: identifier,
    /**
     * The exposure window the burst probability is conditioned on. Like the
     * detection bucket this is a forecast horizon and may follow `issuedAt`;
     * the head is a statement about that window, not a report from it (M02).
     */
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
    /**
     * The predicted pass. A pass that had already ended at `issuedAt` would be
     * of no use to anyone, so these instants are expected to follow it: they
     * are the forecast, propagated from an ephemeris whose own age is reported
     * beside them (A21, M02).
     */
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

/**
 * The scalar a head's uncertainty interval is about, per quantity, or null for
 * a head whose payload is not one number (circuit support is a list of modes,
 * pass geometry is a span). M17: an interval is stated in the head's own units
 * and must bracket the value it accompanies.
 */
const POINT_VALUES: Record<
  PredictionQuantity,
  ((payload: never) => number | null) | null
> = {
  circuit_support: null,
  pass_geometry: null,
  snr2500: (payload: PayloadByQuantity["snr2500"]) => payload.snr2500Db,
  network_detection: (payload: PayloadByQuantity["network_detection"]) =>
    payload.probability,
  observed_activity: (payload: PayloadByQuantity["observed_activity"]) =>
    payload.count,
  conditional_decode: (payload: PayloadByQuantity["conditional_decode"]) =>
    payload.probability,
  completed_qso: (payload: PayloadByQuantity["completed_qso"]) =>
    payload.probability,
  field_strength: (payload: PayloadByQuantity["field_strength"]) =>
    payload.fieldStrengthDbuvPerM,
  usable_burst: (payload: PayloadByQuantity["usable_burst"]) =>
    payload.probability,
  doppler: (payload: PayloadByQuantity["doppler"]) => payload.dopplerHz,
} as Record<PredictionQuantity, ((payload: never) => number | null) | null>;

function pointValue(
  quantity: PredictionQuantity,
  payload: unknown,
): number | null {
  const read = POINT_VALUES[quantity];
  return read === null ? null : read(payload as never);
}

/**
 * Whether a quantity reports a scalar an interval could bracket at all. The
 * capability side reads this same function so a declaration can never promise
 * an interval kind no accepted result could honor.
 */
export function hasPointValue(quantity: PredictionQuantity): boolean {
  return POINT_VALUES[quantity] !== null;
}

/**
 * M17: the domain a reported value and its uncertainty interval live in, one
 * entry per unit rather than per quantity. The domain is a property of the
 * unit: every probability-valued head is bounded by [0, 1] and every count is
 * bounded below by zero whatever event it counts, so a table keyed by unit
 * cannot drift between two quantities that report the same kind of number.
 * `null` is "no bound on that side", not "unchecked".
 */
interface ValueDomain {
  min: number | null;
  max: number | null;
  /** How the bound reads in a rejection reason. */
  text: string;
}

const UNIT_DOMAINS: Record<QuantityUnit, ValueDomain> = {
  boolean: { min: null, max: null, text: "no numeric domain" },
  dB: { min: null, max: null, text: "(-infinity, infinity)" },
  dBuV_per_m: { min: null, max: null, text: "(-infinity, infinity)" },
  Hz: { min: null, max: null, text: "(-infinity, infinity)" },
  count: { min: 0, max: null, text: "[0, infinity)" },
  probability: { min: 0, max: 1, text: "[0, 1]" },
  seconds: { min: 0, max: null, text: "[0, infinity)" },
};

/**
 * M02/M19: the window an interval-valued head answers, and how that window has
 * to relate to the interval length the head echoes from the request.
 *
 * A detection bucket, an observation interval and a burst exposure window *are*
 * the requested interval, so their length equals it exactly: a 900-second
 * request answered with an hour-long bucket is a probability for a different
 * event. A predicted pass is different in kind: the request names the window
 * that was searched and the pass is the geometry found inside it, so the pass
 * is required to fit within the window rather than to fill it (A21).
 */
interface IntervalWindow {
  start: string;
  end: string;
  relation: "equals" | "within";
  noun: string;
}

const INTERVAL_WINDOWS: Record<PredictionQuantity, IntervalWindow | null> = {
  circuit_support: null,
  snr2500: null,
  conditional_decode: null,
  completed_qso: null,
  field_strength: null,
  doppler: null,
  network_detection: {
    start: "bucketStartAt",
    end: "bucketEndAt",
    relation: "equals",
    noun: "detection bucket",
  },
  observed_activity: {
    start: "intervalStartAt",
    end: "intervalEndAt",
    relation: "equals",
    noun: "observation interval",
  },
  usable_burst: {
    start: "intervalStartAt",
    end: "intervalEndAt",
    relation: "equals",
    noun: "burst exposure window",
  },
  pass_geometry: {
    start: "aosAt",
    end: "losAt",
    relation: "within",
    noun: "predicted pass",
  },
};

/**
 * `intervalSeconds` is seconds while the window ends are milliseconds, so an
 * echo of 0.1 s must not fail on the binary representation of 100.000000001 ms.
 */
const INTERVAL_MATCH_TOLERANCE_SECONDS = 1e-6;

/** The length of a head's own window, or null if its payload has none. */
function windowSeconds(
  quantity: PredictionQuantity,
  payload: unknown,
): number | null {
  const window = INTERVAL_WINDOWS[quantity];
  if (window === null) return null;
  const fields = payload as Record<string, string>;
  return (
    (instantMs(fields[window.end]) - instantMs(fields[window.start])) / 1000
  );
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
  horizon: PredictionHorizon;
  mechanismFamily: MechanismFamily;
  intervalSeconds: number | null;
  contextId: string;
  validAt: string;
  effectiveModelId: string;
  effectiveModelVersion: string;
  modelHash: string | null;
  preprocessingHash: string | null;
  featureHash: string | null;
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
    /**
     * M11: the coverage row this head answers is (quantity, domain, horizon,
     * mechanism family). A head that named only the first two would be
     * unscoreable: the protocol froze different metrics, comparators and gates
     * for the climatology row and the forecast row of one quantity.
     */
    horizon: z.enum(PREDICTION_HORIZONS),
    mechanismFamily: z.enum(MECHANISM_FAMILIES),
    /**
     * M02/M19: the request interval this head answers, echoed into the result.
     *
     * Routing already matches `scope.intervalSeconds` against the interval
     * lengths a capability head declares, but `requestKey` is an opaque digest:
     * a parser holding only the result cannot recover the length that was asked
     * for. The echo is the binding, and the rules below tie it to the head's own
     * window, so a one-hour bucket can no longer be returned for a 900-second
     * detection request. Null on an instantaneous quantity, which has no
     * interval to answer.
     */
    intervalSeconds: finite.positive().nullable(),
    contextId: identifier,
    /**
     * The time this head is about. It equals the result's own `validAt`, which
     * is at or after `issuedAt`: a prediction is for now or for later, so this
     * instant is the one field on a head that is meant to follow issuance
     * (M02).
     */
    validAt: instant,
    effectiveModelId: identifier,
    effectiveModelVersion: identifier,
    /**
     * M24: the exact artefacts this head was produced by, so the answer can be
     * replayed rather than merely attributed. A model id and version name a
     * lineage; only the digests pin the bytes. Required on a head that carries
     * a value (it was routed and served); an unavailable head produced nothing
     * and may leave them null.
     */
    modelHash: artifactHash.nullable(),
    preprocessingHash: artifactHash.nullable(),
    featureHash: artifactHash.nullable(),
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
    value.assumptions.forEach((assumption, index) => {
      if (value.assumptions.indexOf(assumption) === index) return;
      reject(
        ctx,
        ["assumptions", index],
        `Assumption ${assumption} is declared twice; an assumption holds or it does not (M11)`,
      );
    });
    if (value.units !== QUANTITY_UNITS[value.quantity]) {
      reject(
        ctx,
        ["units"],
        `Quantity ${value.quantity} is measured in ${QUANTITY_UNITS[value.quantity]}`,
      );
    }
    /**
     * The echo is a statement about the request, not about a value, so it is
     * required on an unavailable head too: a declared gap is a gap for the
     * interval that was asked for.
     */
    const intervalValued = INTERVAL_VALUED_QUANTITIES.includes(value.quantity);
    if (intervalValued && value.intervalSeconds === null) {
      reject(
        ctx,
        ["intervalSeconds"],
        `Quantity ${value.quantity} is defined over an interval and must echo the interval length it answers (M02, M19)`,
      );
    }
    if (!intervalValued && value.intervalSeconds !== null) {
      reject(
        ctx,
        ["intervalSeconds"],
        `Quantity ${value.quantity} is sampled at an instant and answers no interval length (M02)`,
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
    const window = INTERVAL_WINDOWS[value.quantity];
    const length = windowSeconds(value.quantity, payload.data);
    if (window !== null && length !== null && value.intervalSeconds !== null) {
      const echoed = value.intervalSeconds;
      const short = length < echoed - INTERVAL_MATCH_TOLERANCE_SECONDS;
      const long = length > echoed + INTERVAL_MATCH_TOLERANCE_SECONDS;
      if (window.relation === "equals" && (short || long)) {
        reject(
          ctx,
          ["state", "value", window.end],
          `The ${window.noun} is ${length} s long and answers a request for ${echoed} s; an interval-valued head answers the interval it was asked for (M02, M19)`,
        );
      }
      if (window.relation === "within" && long) {
        reject(
          ctx,
          ["state", "value", window.end],
          `The ${window.noun} is ${length} s long and does not fit in the ${echoed} s window it answers (A21, M02)`,
        );
      }
    }
    if (value.uncertainty.kind !== "none" && !hasPointValue(value.quantity)) {
      // M17 describes uncertainty around a reported value. circuit_support and
      // pass_geometry report a set of per-mode or per-pass verdicts and no
      // scalar, and the contract defines no per-mode interval for them, so a
      // numeric interval here would be uninterpretable: they report kind
      // "none".
      reject(
        ctx,
        ["uncertainty", "kind"],
        `A ${value.quantity} head reports no scalar to bracket, so it carries no uncertainty interval (M17)`,
      );
    }
    if (value.uncertainty.kind !== "none") {
      const { low, high } = value.uncertainty;
      /**
       * M17: an interval is quantiles of the reported value, so it lives in the
       * same domain that value does. A probability below zero or a count of
       * minus ten is not a bound on anything the head could have reported.
       */
      const units = QUANTITY_UNITS[value.quantity];
      const domain = UNIT_DOMAINS[units];
      if (
        (domain.min !== null && low < domain.min) ||
        (domain.max !== null && high > domain.max)
      ) {
        const belowMin = domain.min !== null && low < domain.min;
        reject(
          ctx,
          ["uncertainty", belowMin ? "low" : "high"],
          `A ${units} interval lies inside ${domain.text} (M17)`,
        );
      }
      const point = pointValue(value.quantity, payload.data);
      if (point !== null && point === NO_POWER_DB) {
        // M07: the no-power sentinel is not a number an interval can be drawn
        // around. Such a head reports uncertainty kind "none".
        reject(
          ctx,
          ["uncertainty", "kind"],
          "A no-power head carries no uncertainty interval (M07)",
        );
      } else if (point !== null && (point < low || point > high)) {
        // M17: an interval that does not contain its own point value is not
        // an interval for that value, whatever the quantity.
        reject(
          ctx,
          ["uncertainty", point < low ? "low" : "high"],
          "An uncertainty interval must bracket the reported value",
        );
      }
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
    // M10: until a calibrated decoder response exists the head reports a dB
    // margin and nothing else, so there is no probability for an interval to
    // be about. An uncalibrated decode head therefore carries kind "none".
    if (
      value.quantity === "conditional_decode" &&
      (payload.data as { probability: number | null }).probability === null &&
      value.uncertainty.kind !== "none"
    ) {
      reject(
        ctx,
        ["uncertainty", "kind"],
        "An uncalibrated decode head reports a margin, not an interval (M10)",
      );
    }
    if (
      CALIBRATION_REQUIRED_QUANTITIES.includes(value.quantity) &&
      value.calibrationId === null
    ) {
      reject(
        ctx,
        ["calibrationId"],
        `A value-bearing ${value.quantity} head requires a calibration identity (M22)`,
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
    /**
     * The availability history of this source. On an eligible source all three
     * are required to be no later than `issuedAt` (the result-level rule): a
     * product observed, published or captured after issuance could not have
     * been used. An excluded entry is a census of what was considered and may
     * carry a later stamp, which is exactly how "a revised product exists and
     * was not substituted for the issued context" is recorded (M02, M24).
     */
    observedIntervalEndAt: instant.nullable(),
    publishedAt: instant.nullable(),
    capturedAt: instant.nullable(),
    ageSeconds: finite.nonnegative().nullable(),
    eligible: z.boolean(),
    exclusionReason: identifier.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // M24 / protocol `replay.revisions`: "Immutable source versions with
    // SHA-256; no later revised product replacing an earlier issued context."
    // A timestamp or a product name is not immutable and cannot be replayed.
    const pinned = /^sha256:[0-9a-f]{64}$/.test(value.sourceVersion);
    if (value.eligible && !pinned) {
      reject(
        ctx,
        ["sourceVersion"],
        "An eligible source pins its version as a sha256 digest (M24)",
      );
    }
    if (!value.eligible && !pinned && value.sourceVersion !== "unknown") {
      reject(
        ctx,
        ["sourceVersion"],
        'An excluded source names its pinned sha256 digest or "unknown" (M24)',
      );
    }
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
    /**
     * M24: the digest of the capability declaration that served this result.
     * Replay needs the routing table as it stood, not only the model that was
     * picked out of it.
     */
    capabilityDigest: artifactHash,
    fallbackReason: z.enum(FALLBACK_REASONS).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // A model preference is an id *and* a version; half of one is not a
    // preference the service can honour or report a fallback against.
    if (
      (value.requestedModelId === null) !==
      (value.requestedModelVersion === null)
    ) {
      reject(
        ctx,
        ["requestedModelVersion"],
        "A requested model must carry both an id and a version, or neither",
      );
      return;
    }
    if (value.requestedModelId === null) {
      // M19: these reasons are all statements about a model the caller asked
      // for. With no request there is nothing they could be reporting, and a
      // consumer reading one would infer a preference that never existed.
      if (
        value.fallbackReason !== null &&
        REQUESTED_MODEL_FALLBACK_REASONS.includes(value.fallbackReason)
      ) {
        reject(
          ctx,
          ["fallbackReason"],
          `Fallback reason ${value.fallbackReason} reports on a requested model, but no model was requested (M19)`,
        );
      }
      return;
    }
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

/** `ageSeconds` is whole seconds; the timestamps carry milliseconds. */
const AGE_TOLERANCE_SECONDS = 1;

/** States that carry a payload rather than a reason (M01 availability). */
const VALUE_BEARING_STATES: readonly string[] = ["available", "experimental"];

/**
 * M10: `margin_dB = SNR2500 - threshold2500`. When one result carries both an
 * available SNR head and an available decode head from the same model, the
 * margin is that subtraction and nothing else, so the two heads are checked
 * against each other. A tolerance of 1e-6 dB is a rounding allowance, not a
 * modelling allowance: the same model produced both numbers.
 *
 * The check is skipped when either head is unavailable, when the decode head
 * came from another model (its own threshold and its own SNR), and when the
 * mode carries no power, because the -Infinity sentinel has no finite margin.
 */
const DECODE_MARGIN_TOLERANCE_DB = 1e-6;

function crossCheckDecodeMargin(
  heads: readonly PredictionHead[],
  ctx: z.RefinementCtx,
): void {
  const decodeIndex = heads.findIndex(
    (head) => head.quantity === "conditional_decode",
  );
  if (decodeIndex < 0) return;
  const decode = heads[decodeIndex] as Extract<
    PredictionHead,
    { quantity: "conditional_decode" }
  >;
  const snr = heads.find((head) => head.quantity === "snr2500") as
    Extract<PredictionHead, { quantity: "snr2500" }> | undefined;
  if (snr === undefined) return;
  // "experimental" is value-bearing exactly like "available": it carries a
  // payload, so the M10 identity has to hold for it too, in any combination.
  if (
    !VALUE_BEARING_STATES.includes(decode.state.availability) ||
    !VALUE_BEARING_STATES.includes(snr.state.availability)
  ) {
    return;
  }
  if (!("value" in decode.state) || !("value" in snr.state)) return;
  if (
    snr.effectiveModelId !== decode.effectiveModelId ||
    snr.effectiveModelVersion !== decode.effectiveModelVersion ||
    // M24: two heads from one lineage but different artefacts are two
    // different models for replay, so the M10 identity does not bind them.
    snr.modelHash !== decode.modelHash ||
    snr.preprocessingHash !== decode.preprocessingHash ||
    snr.featureHash !== decode.featureHash
  ) {
    return;
  }
  const margin = decode.state.value.marginDb;
  const snr2500Db = snr.state.value.snr2500Db;
  if (snr2500Db === NO_POWER_DB) {
    // M07: no power reaches the receiver, so there is no SNR to subtract a
    // threshold from and M10's margin is undefined rather than merely large.
    // The decode head reports a null margin (or stops being value-bearing,
    // which is handled above); any finite number here is unsourced.
    if (margin !== null) {
      reject(
        ctx,
        ["heads", decodeIndex, "state", "value", "marginDb"],
        "A no-power SNR2500 leaves the decode margin undefined (M07, M10)",
      );
    }
    // No power reaches the decoder, so the only decode probability the same
    // model can report is zero, or none at all (M07, M10).
    const probabilityValue = decode.state.value.probability;
    if (probabilityValue !== null && probabilityValue !== 0) {
      reject(
        ctx,
        ["heads", decodeIndex, "state", "value", "probability"],
        "A no-power SNR2500 admits no decode probability above zero (M07, M10)",
      );
    }
    return;
  }
  if (!Number.isFinite(snr2500Db)) return;
  if (margin === null) {
    // M10: the margin is a subtraction, and both of its terms are present in
    // this very result from this very model. "Not reported" would be a claim
    // that the arithmetic could not be done.
    reject(
      ctx,
      ["heads", decodeIndex, "state", "value", "marginDb"],
      "A decode head beside a finite same-model SNR2500 must report the margin (M10)",
    );
    return;
  }
  const expected = snr2500Db - decode.state.value.thresholdSnr2500Db;
  if (Math.abs(margin - expected) > DECODE_MARGIN_TOLERANCE_DB) {
    reject(
      ctx,
      ["heads", decodeIndex, "state", "value", "marginDb"],
      `Decode margin must equal SNR2500 minus the declared threshold (M10); expected ${expected}`,
    );
  }
}

/**
 * M07: when one result carries both a circuit-support head and an SNR head
 * from the same model and the same artefacts, the SNR head's support state is
 * one of the verdicts the circuit-support head published for that mechanism. A pair that disagrees
 * offers a consumer two answers to "does this circuit carry power" with
 * nothing in the contract to choose between them.
 *
 * The no-power sentinel is already tied to the support state inside the SNR
 * payload, so pinning the state here pins the sentinel with it.
 */
function crossCheckCircuitSupport(
  heads: readonly PredictionHead[],
  ctx: z.RefinementCtx,
): void {
  const snrIndex = heads.findIndex((head) => head.quantity === "snr2500");
  if (snrIndex < 0) return;
  const snr = heads[snrIndex] as Extract<
    PredictionHead,
    { quantity: "snr2500" }
  >;
  const support = heads.find((head) => head.quantity === "circuit_support") as
    Extract<PredictionHead, { quantity: "circuit_support" }> | undefined;
  if (support === undefined) return;
  if (
    !VALUE_BEARING_STATES.includes(snr.state.availability) ||
    !VALUE_BEARING_STATES.includes(support.state.availability)
  ) {
    return;
  }
  if (!("value" in snr.state) || !("value" in support.state)) return;
  if (
    snr.effectiveModelId !== support.effectiveModelId ||
    snr.effectiveModelVersion !== support.effectiveModelVersion ||
    // M24: two heads from different artefacts are two different models for
    // replay. A result may legally serve one head from a fallback model, and
    // two models are entitled to disagree about whether a circuit carries
    // power; only one model contradicting itself is a contract violation.
    snr.modelHash !== support.modelHash ||
    snr.preprocessingHash !== support.preprocessingHash ||
    snr.featureHash !== support.featureHash
  ) {
    return;
  }
  const published = support.state.value.modes
    .filter((mode) => mode.mechanism === snr.mechanismFamily)
    .map((mode) => mode.support);
  if (published.length === 0) return;
  if (published.includes(snr.state.value.support)) return;
  reject(
    ctx,
    ["heads", snrIndex, "state", "value", "support"],
    `The circuit-support head reports ${published.join(", ")} for mechanism ${snr.mechanismFamily}, not ${snr.state.value.support} (M07)`,
  );
}

export const predictionResultSchema = z
  .object({
    schemaVersion: z.literal(RESULT_SCHEMA_VERSION),
    contextId: identifier,
    /**
     * The exact request this result answers, named by the M01 digest
     * `requestKeyDigest` produces. A free-text label could never be compared
     * against a recomputed key, so the wire form is the digest itself.
     */
    requestKey: requestKeyDigestText,
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
    const seenSources = new Set<string>();
    value.evidence.sources.forEach((source, index) => {
      // M11: one source, one entry. Two entries for one id let a consumer read
      // whichever it saw last, and an eligible duplicate beside an excluded
      // one would make the census of what was used ambiguous.
      if (seenSources.has(source.sourceId)) {
        reject(
          ctx,
          ["evidence", "sources", index, "sourceId"],
          `Duplicate evidence entry for source ${source.sourceId} (M11)`,
        );
      }
      seenSources.add(source.sourceId);
      if (!source.eligible) return;
      /**
       * M02/M24: the causal order a real product goes through. A datum is
       * observed, then published, then captured by this system, and only then
       * can a result use it. Each stamp being before `issuedAt` is not enough:
       * a capture that precedes its own publication, or a publication that
       * precedes the end of the interval it reports, describes no history that
       * could have produced the number, and a replay driven from it would be
       * reconstructing a provenance that never happened.
       */
      const stamps: [string, string | null][] = [
        ["observedIntervalEndAt", source.observedIntervalEndAt],
        ["publishedAt", source.publishedAt],
        ["capturedAt", source.capturedAt],
      ];
      let previous: [string, number] | null = null;
      for (const [field, stamp] of stamps) {
        if (stamp === null) continue;
        const at = instantMs(stamp);
        if (at > issued) {
          reject(
            ctx,
            ["evidence", "sources", index, field],
            `An eligible source must have ${field} no later than issuedAt (M02)`,
          );
        }
        if (previous !== null && at < previous[1]) {
          reject(
            ctx,
            ["evidence", "sources", index, field],
            `An eligible source is observed, then published, then captured: ${field} must not precede ${previous[0]} (M02, M24)`,
          );
        }
        previous = [field, at];
      }
      /**
       * M02: the age of an eligible source is `issuedAt` minus the end of the
       * interval it observed, not a free-standing number a producer may pick.
       * The tolerance is one second because `ageSeconds` is whole seconds
       * while the timestamps carry milliseconds.
       */
      if (source.ageSeconds === null) {
        reject(
          ctx,
          ["evidence", "sources", index, "ageSeconds"],
          "An eligible source must state its age as issued (M02)",
        );
      } else if (source.observedIntervalEndAt !== null) {
        const expected =
          (issued - instantMs(source.observedIntervalEndAt)) / 1000;
        if (Math.abs(source.ageSeconds - expected) > AGE_TOLERANCE_SECONDS) {
          reject(
            ctx,
            ["evidence", "sources", index, "ageSeconds"],
            `An eligible source age must be issuedAt minus observedIntervalEndAt (M02); expected ${expected}`,
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
      if (instantMs(head.validAt) !== instantMs(value.validAt)) {
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
      // A head whose own payload was rejected has no parsed state to read.
      const availability: string | undefined = head.state?.availability;
      if (
        availability !== undefined &&
        VALUE_BEARING_STATES.includes(availability)
      ) {
        // M24: a served head is replayable only if the exact artefacts are
        // named. An unavailable head produced nothing and may omit them.
        for (const field of [
          "modelHash",
          "preprocessingHash",
          "featureHash",
        ] as const) {
          if (head[field] !== null) continue;
          reject(
            ctx,
            ["heads", index, field],
            `A served ${head.quantity} head must pin its ${field} for replay (M24)`,
          );
        }
      }
      if (
        availability !== undefined &&
        VALUE_BEARING_STATES.includes(availability) &&
        !isProtocolCoverage({
          event: head.quantity,
          domain: head.domain,
          horizon: head.horizon,
          mechanism: head.mechanismFamily,
        })
      ) {
        // M11: the frozen protocol says which claims exist at all. A served
        // head on a tuple it never froze is an answer to a question no metric,
        // comparator or gate was written for. An unavailable head is a
        // declared gap and may describe one.
        reject(
          ctx,
          ["heads", index, "mechanismFamily"],
          `The protocol defines no ${head.quantity} on ${head.domain} at ${head.horizon} via ${head.mechanismFamily} (M11)`,
        );
      }
      if (
        head.quantity === "observed_activity" &&
        availability !== undefined &&
        VALUE_BEARING_STATES.includes(availability) &&
        "value" in head.state &&
        instantMs(head.state.value.intervalEndAt) > issued
      ) {
        // M02: an observation the result reports is an observation it had when
        // it was issued. An interval running past `issuedAt` folds reports that
        // did not exist yet into the answer, and a historical evaluation that
        // replayed it would be scoring the model against its own future.
        reject(
          ctx,
          ["heads", index, "state", "value", "intervalEndAt"],
          "An observed interval ends no later than issuedAt; a later end is data the result could not have had (M02)",
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
      if (!servedByAnotherModel && head.fallbackReason !== null) {
        // M19: the head-level reason exists to explain a head the result's own
        // effective model did not serve. On a head it did serve there is no
        // fallback to report, and the reason would contradict the provenance.
        reject(
          ctx,
          ["heads", index, "fallbackReason"],
          "A head served by the result's effective model reports no fallback reason (M19)",
        );
      }
    });
    crossCheckDecodeMargin(value.heads, ctx);
    crossCheckCircuitSupport(value.heads, ctx);
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
