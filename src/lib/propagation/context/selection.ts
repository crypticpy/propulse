/**
 * PROP-05 as-of selection (#951), implementing M02 as-issued eligibility and
 * the M11 freshness bound.
 *
 * This is the time-travel primitive the whole leaf is built on: given every
 * record a source ever produced and one `issuedAt`, return the record that was
 * actually usable then. Replaying a past instant and answering a live request
 * run this identical function; there is no "latest" pointer to go stale, no
 * mutation, and no clock read.
 *
 * The rule is a transcription of `selected_field` in
 * `ml/service/operational_weather.py`, in the same order and with the same tie
 * break, because the deployed N5 service is the oracle those source latency
 * rules already passed. `parity.test.ts` holds the two together on a fixture
 * generated from that oracle. #951 forbids changing the Python, and nothing
 * here does.
 */
import type { SourceLedgerEntry } from "@/lib/propagation/context/ledger";
import {
  ageSecondsAt,
  instantMs,
  type Instant,
  type Selected,
  type SourceHistory,
  type SourceMode,
  type SourceRecord,
} from "@/lib/propagation/context/types";

/**
 * A record whose stamps describe a history that could not have happened.
 *
 * Observed, then published, then captured is the causal order a real product
 * goes through. A capture that precedes its own publication, or a publication
 * that precedes the end of the interval it reports, is a producer bug, not an
 * eligibility outcome: answering from it would reconstruct a provenance that
 * never existed (M02, M24). It is therefore thrown at the boundary rather than
 * quietly excluded, where a caller would read it as an ordinary outage.
 */
export class ContextStampError extends Error {
  override readonly name = "ContextStampError";

  constructor(
    readonly sourceId: string,
    readonly detail: string,
  ) {
    super(`record from "${sourceId}" describes an impossible history: ${detail}`);
  }
}

/** A record carrying a variable its ledger entry never declared (M11). */
export class ContextVariableError extends Error {
  override readonly name = "ContextVariableError";

  constructor(
    readonly sourceId: string,
    readonly variable: string,
  ) {
    super(
      `source "${sourceId}" does not declare the variable "${variable}"; an undeclared variable cannot be selected (M11)`,
    );
  }
}

export interface SelectOptions {
  readonly issuedAt: Instant;
  readonly entry: SourceLedgerEntry;
  readonly mode: SourceMode;
  /**
   * The barrier from `inactiveBarrierAsOf`. Passed in rather than recomputed
   * so a caller selecting several variables from one source pays for it once
   * and every variable sees the same barrier.
   */
  readonly barrier?: Instant | null;
  /**
   * Demand a printed publication time. This is the switch behind the
   * `verified_as_issued_replay` disabled capability: with no client reader for
   * the as-issued archive, turning it on leaves no eligible live observation,
   * which is the honest answer rather than a silent downgrade.
   */
  readonly requireVerifiedArchive?: boolean;
}

function assertCausalStamps(record: SourceRecord): void {
  const observed = instantMs(record.stamps.observedIntervalEndAt, "observedIntervalEndAt");
  const published = instantMs(record.stamps.publication.publishedAt, "publishedAt");
  const captured = instantMs(record.stamps.capturedAt, "capturedAt");
  if (published < observed) {
    throw new ContextStampError(
      record.sourceId,
      "published before the interval it reports had closed",
    );
  }
  if (captured < published) {
    throw new ContextStampError(record.sourceId, "captured before it was published");
  }
  const start = record.stamps.observedIntervalStartAt;
  if (start !== null && instantMs(start, "observedIntervalStartAt") > observed) {
    throw new ContextStampError(record.sourceId, "observation interval ends before it starts");
  }
}

function eligibleInMode(record: SourceRecord, mode: SourceMode): boolean {
  // M11: offline mode explicitly excludes observation residuals. A bundled
  // asset is available in every mode; a cached or network record is available
  // in both live modes, because connectivity alone is not eligibility and the
  // difference between them is which history the caller hands in, not which
  // rule applies.
  if (mode === "offline") return record.origin === "bundled";
  return true;
}

/**
 * The newest marker, causal at `issuedAt`, at which this source was explicitly
 * inactive.
 *
 * NOAA occasionally flags every magnetometer or plasma spacecraft inactive.
 * The record of that flag invalidates every older active record from then on:
 * an older reading must not be served past it just because it is still inside
 * the age window. Mirrors `inactive_source_barrier`.
 */
export function inactiveBarrierAsOf(
  history: SourceHistory,
  options: { readonly issuedAt: Instant },
): Instant | null {
  const issued = instantMs(options.issuedAt, "issuedAt");
  let barrier: Instant | null = null;
  let barrierAt = Number.NEGATIVE_INFINITY;
  for (const record of history) {
    if (record.activity !== "inactive") continue;
    const captured = instantMs(record.stamps.capturedAt, "capturedAt");
    // A marker this service had not captured by `issuedAt` could not have
    // invalidated anything at `issuedAt`.
    if (captured > issued) continue;
    const marker = record.stamps.observedIntervalEndAt;
    const markerAt = instantMs(marker, "observedIntervalEndAt");
    if (markerAt > barrierAt) {
      barrier = marker;
      barrierAt = markerAt;
    }
  }
  return barrier;
}

/**
 * The record from `history` that was usable at `issuedAt`, or why none was.
 *
 * Order matters. Each test answers a different question, and the first one a
 * record fails is the reason reported, so "it arrived too late" is never
 * reported as "it was too old".
 */
export function selectAsOf(history: SourceHistory, options: SelectOptions): Selected {
  const { entry, mode } = options;
  const issued = instantMs(options.issuedAt, "issuedAt");
  const barrier = options.barrier ?? null;
  const barrierAt = barrier === null ? null : instantMs(barrier, "barrier");

  let selected: SourceRecord | null = null;
  let selectedKey: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let latest: SourceRecord | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;
  type ExclusionOf = Extract<Selected, { state: "excluded" }>["reason"];
  let excluded: ExclusionOf | null = null;
  let excludedAt = Number.NEGATIVE_INFINITY;

  for (const record of history) {
    if (record.sourceId !== entry.sourceId) {
      throw new ContextVariableError(record.sourceId, record.variable);
    }
    if (!entry.variables.includes(record.variable)) {
      throw new ContextVariableError(record.sourceId, record.variable);
    }
    assertCausalStamps(record);

    const observed = instantMs(record.stamps.observedIntervalEndAt, "observedIntervalEndAt");
    if (observed > latestAt) {
      latest = record;
      latestAt = observed;
    }

    const published = instantMs(record.stamps.publication.publishedAt, "publishedAt");
    const captured = instantMs(record.stamps.capturedAt, "capturedAt");

    let failure: ExclusionOf | null = null;
    if (!eligibleInMode(record, mode)) {
      failure = "offline_mode";
    } else if (observed > issued) {
      failure = "not_yet_observed";
    } else if (published > issued) {
      failure = "not_yet_published";
    } else if (captured > issued) {
      failure = "not_yet_captured";
    } else if (
      options.requireVerifiedArchive === true &&
      record.stamps.archiveClass !== "verified_as_issued"
    ) {
      failure = "unknown_publication_history";
    } else if (
      entry.maxAgeSeconds !== null &&
      (issued - observed) / 1000 > entry.maxAgeSeconds
    ) {
      failure = "beyond_age_bound";
    } else if (!Number.isFinite(record.value)) {
      failure = "non_finite_value";
    } else if (record.activity === "inactive") {
      failure = "source_inactive";
    } else if (barrierAt !== null && observed < barrierAt) {
      failure = "inactive_barrier";
    }

    if (failure !== null) {
      // The reason reported for the source is the one belonging to its newest
      // record: an older record failing for another reason is not what a
      // reader needs to know about.
      if (observed >= excludedAt) {
        excluded = failure;
        excludedAt = observed;
      }
      continue;
    }

    const key: [number, number] = [observed, captured];
    if (key[0] > selectedKey[0] || (key[0] === selectedKey[0] && key[1] > selectedKey[1])) {
      selected = record;
      selectedKey = key;
    }
  }

  if (selected !== null) {
    return {
      state: "selected",
      record: selected,
      ageSeconds: ageSecondsAt(options.issuedAt, selected.stamps.observedIntervalEndAt),
    };
  }
  if (excluded !== null) return { state: "excluded", reason: excluded, latest };
  return { state: "absent", reason: "no_record_in_history" };
}
