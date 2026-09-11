/**
 * radioEvidence/observedActivityHead — the #950 `observed_activity` head,
 * produced from a `PathActivityRecord` (#1047).
 *
 * This is a producer for a head the contract already carries: the wire shape
 * does not change here, and `RESULT_SCHEMA_VERSION` is unchanged (asserted by
 * this module's test).
 *
 * Two things the projection refuses to invent, both because inventing them
 * would be a false provenance claim rather than a convenience:
 *
 * - **the source digest.** An eligible evidence source pins a sha256 over an
 *   immutable product (M24). A digest computed here would be a digest of one
 *   query's rows, which is not the thing replay needs; the caller that pinned
 *   the aggregate snapshot supplies it.
 * - **the model identity.** A deterministic reader is not a model, but a head
 *   must name one. The caller passes its own identity, and the kind is fixed
 *   at `observation_assisted`: the contract defines that as a calculation
 *   that assimilates current observations and behaves differently when they
 *   are missing, which is exactly this reader, and it is correctly refused by
 *   a `physics_only` model policy.
 */

import { QUANTITY_UNITS } from "@/lib/propagation/contracts/enums";
import type {
  MechanismFamily,
  PredictionDomain,
  PredictionHorizon,
} from "@/lib/propagation/contracts/enums";
import type {
  ObservedActivityEvidenceSource,
  ObservedActivityHead,
  ObservedActivityIdentity,
  ObservedActivityProjection,
  PathActivityRecord,
} from "@/lib/propagation/radioEvidence/types";

/**
 * The reader's documented id, for callers that have no better name for it.
 * It is a default a caller may pass, never a default this module applies.
 */
export const OBSERVED_ACTIVITY_READER_ID = "collector_path_hourly_reader";

/** The evidence source a count from these aggregates resolves to (M11). */
export const OBSERVED_ACTIVITY_COVERAGE_ID = "collector_path_hourly_stats";

/**
 * The frozen protocol row `observed_activity` sits on (M11): the protocol
 * defines it only on `declared_model_bands` / `versioned_event_population` /
 * `current` / `event_head`, and a served head on any other tuple answers a
 * question no metric was written for.
 */
const PROTOCOL_ROW: {
  readonly domain: PredictionDomain;
  readonly horizon: PredictionHorizon;
  readonly mechanismFamily: MechanismFamily;
} = {
  domain: "versioned_event_population",
  horizon: "current",
  mechanismFamily: "event_head",
};

/**
 * What the head asserts about itself beyond the numbers. Each one is a claim
 * a consumer would otherwise have to guess at, and the second is the whole
 * point of the leaf.
 */
const ASSUMPTIONS = [
  "band_hour_readability_is_the_path_gap_witness",
  "absence_of_reports_is_never_closure",
  "hourly_unique_counts_are_not_summed_across_hours",
  "network_attribution_is_not_stored_at_path_grain",
] as const;

function evidenceSourceFor(
  activity: PathActivityRecord,
  identity: ObservedActivityIdentity,
): ObservedActivityEvidenceSource {
  const observedIntervalEndAt = latestReadableEnd(activity);
  if (observedIntervalEndAt === null) {
    // No readable hour means no as-issued availability history, which is
    // ineligible by M02. The entry stays in the census, naming why: a source
    // that was considered and not used is itself provenance.
    return {
      sourceId: OBSERVED_ACTIVITY_COVERAGE_ID,
      sourceVersion: identity.sourceVersion,
      observedIntervalEndAt: null,
      publishedAt: null,
      capturedAt: null,
      ageSeconds: null,
      eligible: false,
      exclusionReason: "no_readable_aggregate_hour_in_window",
    };
  }
  return {
    sourceId: OBSERVED_ACTIVITY_COVERAGE_ID,
    sourceVersion: identity.sourceVersion,
    observedIntervalEndAt,
    publishedAt: identity.readAt,
    capturedAt: identity.readAt,
    // M02: the age of an eligible source is issuedAt minus the end of what it
    // observed, to the second the contract recomputes.
    ageSeconds:
      (Date.parse(activity.issuedAt) - Date.parse(observedIntervalEndAt)) /
      1000,
    eligible: true,
    exclusionReason: null,
  };
}

/**
 * The end of the newest readable hour, reconstructed from the record's own
 * aggregation lag so the projection needs no second pass over the rows.
 */
function latestReadableEnd(activity: PathActivityRecord): string | null {
  if (activity.aggregationLagSeconds === null) return null;
  return new Date(
    Date.parse(activity.issuedAt) - activity.aggregationLagSeconds * 1000,
  ).toISOString();
}

/**
 * Project a record onto the contract's `observed_activity` head plus the
 * evidence entry its coverage claim must resolve to.
 */
export function projectObservedActivityHead(
  activity: PathActivityRecord,
  identity: ObservedActivityIdentity,
): ObservedActivityProjection {
  const issuedAt = new Date(Date.parse(activity.issuedAt)).toISOString();
  const base: Omit<ObservedActivityHead, "state"> = {
    quantity: "observed_activity",
    units: QUANTITY_UNITS.observed_activity,
    ...PROTOCOL_ROW,
    intervalSeconds: activity.intervalSeconds,
    contextId: identity.contextId,
    // The observation interval is anchored on validAt and may not end after
    // issuance, so the head is as-issued: validAt is issuedAt (M02, M19).
    validAt: issuedAt,
    effectiveModelId: identity.effectiveModelId,
    effectiveModelVersion: identity.effectiveModelVersion,
    effectiveModelKind: "observation_assisted",
    effectiveModeProfileId: null,
    modelHash: identity.modelHash,
    preprocessingHash: identity.preprocessingHash,
    featureHash: identity.featureHash,
    // A count of reports is observed, not estimated or fitted: no calibration
    // artefact owns it and no interval brackets it.
    calibrationId: null,
    assumptions: [...ASSUMPTIONS],
    fallbackReason: null,
    uncertainty: { kind: "none" },
  };

  if (activity.state === "unknown") {
    // missing_input, not unavailable: the capability ran and the input -- a
    // report from a listening receiver -- was absent. No value, no count.
    return {
      head: {
        ...base,
        state: { availability: "missing_input", reason: activity.reason },
      },
      evidenceSource: evidenceSourceFor(activity, identity),
    };
  }

  return {
    head: {
      ...base,
      state: {
        availability: "available",
        value: {
          count: activity.count,
          intervalStartAt: new Date(
            Date.parse(issuedAt) - activity.intervalSeconds * 1000,
          ).toISOString(),
          intervalEndAt: issuedAt,
          sourceCoverageIds: [OBSERVED_ACTIVITY_COVERAGE_ID],
        },
      },
    },
    evidenceSource: evidenceSourceFor(activity, identity),
  };
}
