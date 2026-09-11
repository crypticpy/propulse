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
import { admitRecord } from "@/lib/propagation/context/admission";
import type { SourceLedgerEntry } from "@/lib/propagation/context/ledger";
import {
  ageSecondsAt,
  canonicalJson,
  instantMs,
  type Instant,
  type Selected,
  type SourceHistory,
  type SourceMode,
  type SourceRecord,
} from "@/lib/propagation/context/types";

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

function eligibleInMode(
  record: SourceRecord,
  entry: SourceLedgerEntry,
  mode: SourceMode,
): boolean {
  // M11: offline mode explicitly excludes observation residuals. A bundled
  // asset is available in every mode; a cached or network record is available
  // in both live modes, because connectivity alone is not eligibility and the
  // difference between them is which history the caller hands in, not which
  // rule applies.
  //
  // `origin` is the caller's own label on one record, so it cannot be the
  // whole test: a Kp measurement shipped inside an offline pack would
  // otherwise be selected and read as the state, which is exactly the
  // residual M11 excludes. What offline excludes is the observation, not the
  // prediction: an as-issued forecast and a bundled climatology are what an
  // offline pack is for, so the ledger's kind decides and the origin still has
  // to agree.
  if (mode === "offline") {
    return record.origin === "bundled" && entry.kind !== "observation";
  }
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
 * The record to prefer between two that both passed the same test.
 *
 * The newest observation wins, then the newest capture: that is the oracle's
 * rule and the one a reader expects. Past that the two are equally current, and
 * leaving the choice to the order a caller happened to list them in would make
 * the representative, and with it the context identity, depend on nothing. The
 * remaining order is arbitrary but total, stable and written down: the nearer
 * term bin first (a record with no stated validity is not a bin and sorts
 * first), then the variable name, then the canonical form of the record.
 */
export function preferredRecord(
  left: SourceRecord,
  right: SourceRecord,
): SourceRecord {
  return compareRecords(left, right) >= 0 ? left : right;
}

function validFromRank(record: SourceRecord): number {
  return record.stamps.validFrom === null
    ? Number.NEGATIVE_INFINITY
    : instantMs(record.stamps.validFrom, "validFrom");
}

/** Positive when `left` is the record to prefer. */
function compareRecords(left: SourceRecord, right: SourceRecord): number {
  const observed =
    instantMs(left.stamps.observedIntervalEndAt, "observedIntervalEndAt") -
    instantMs(right.stamps.observedIntervalEndAt, "observedIntervalEndAt");
  if (observed !== 0) return observed;
  const captured =
    instantMs(left.stamps.capturedAt, "capturedAt") -
    instantMs(right.stamps.capturedAt, "capturedAt");
  if (captured !== 0) return captured;
  const leftFrom = validFromRank(left);
  const rightFrom = validFromRank(right);
  if (leftFrom !== rightFrom) return leftFrom < rightFrom ? 1 : -1;
  if (left.variable !== right.variable) {
    return left.variable < right.variable ? 1 : -1;
  }
  const leftText = canonicalJson(left);
  const rightText = canonicalJson(right);
  if (leftText === rightText) return 0;
  return leftText < rightText ? 1 : -1;
}

type ExclusionOf = Extract<Selected, { state: "excluded" }>["reason"];

/**
 * Why this record was not usable at `issuedAt`, or `null` if it was.
 *
 * Order matters. Each test answers a different question, and the first one a
 * record fails is the reason reported, so "it arrived too late" is never
 * reported as "it was too old". An outage is named before the missing number
 * it causes: a source that went dark reports no reading, and reporting that as
 * a non finite value would describe the symptom instead of the cause.
 */
function exclusionFor(
  record: SourceRecord,
  options: SelectOptions,
  issued: number,
  barrierAt: number | null,
): ExclusionOf | null {
  const { entry, mode } = options;
  const observed = instantMs(
    record.stamps.observedIntervalEndAt,
    "observedIntervalEndAt",
  );
  const published = instantMs(
    record.stamps.publication.publishedAt,
    "publishedAt",
  );
  const captured = instantMs(record.stamps.capturedAt, "capturedAt");

  if (!eligibleInMode(record, entry, mode)) return "offline_mode";
  if (observed > issued) return "not_yet_observed";
  if (published > issued) return "not_yet_published";
  if (captured > issued) return "not_yet_captured";
  if (
    options.requireVerifiedArchive === true &&
    record.stamps.archiveClass !== "verified_as_issued"
  ) {
    return "unknown_publication_history";
  }
  if (
    entry.maxAgeSeconds !== null &&
    (issued - observed) / 1000 > entry.maxAgeSeconds
  ) {
    return "beyond_age_bound";
  }
  if (record.activity === "inactive") return "source_inactive";
  if (barrierAt !== null && observed < barrierAt) return "inactive_barrier";
  if (!Number.isFinite(record.value)) return "non_finite_value";
  return null;
}

/**
 * Every record of this history that was usable at `issuedAt`.
 *
 * `selectAsOf` keeps the one a driver reads; this keeps all of them, which is
 * what pins a product whose answer is more than one number. A forecast course
 * whose later bin moved is a different product even when the bin a caller reads
 * today did not change, and the source version has to say so (M24).
 */
export function eligibleAsOf(
  history: SourceHistory,
  options: SelectOptions,
): readonly SourceRecord[] {
  const issued = instantMs(options.issuedAt, "issuedAt");
  const barrier = options.barrier ?? null;
  const barrierAt = barrier === null ? null : instantMs(barrier, "barrier");
  const eligible: SourceRecord[] = [];
  for (const record of history) {
    admitRecord(options.entry, record);
    if (exclusionFor(record, options, issued, barrierAt) === null) {
      eligible.push(record);
    }
  }
  return eligible;
}

/**
 * The record from `history` that was usable at `issuedAt`, or why none was.
 *
 * Order matters. Each test answers a different question, and the first one a
 * record fails is the reason reported, so "it arrived too late" is never
 * reported as "it was too old".
 */
export function selectAsOf(
  history: SourceHistory,
  options: SelectOptions,
): Selected {
  const issued = instantMs(options.issuedAt, "issuedAt");
  const barrier = options.barrier ?? null;
  const barrierAt = barrier === null ? null : instantMs(barrier, "barrier");

  let selected: SourceRecord | null = null;
  let latest: SourceRecord | null = null;
  let excluded: { reason: ExclusionOf; record: SourceRecord } | null = null;

  for (const record of history) {
    admitRecord(options.entry, record);
    latest = latest === null ? record : preferredRecord(record, latest);

    const failure = exclusionFor(record, options, issued, barrierAt);

    if (failure !== null) {
      // The reason reported for the source is the one belonging to its newest
      // record: an older record failing for another reason is not what a
      // reader needs to know about. Two equally new records are separated by
      // the same total order everything else here uses.
      if (
        excluded === null ||
        preferredRecord(record, excluded.record) === record
      ) {
        excluded = { reason: failure, record };
      }
      continue;
    }

    selected = selected === null ? record : preferredRecord(record, selected);
  }

  if (selected !== null) {
    return {
      state: "selected",
      record: selected,
      ageSeconds: ageSecondsAt(
        options.issuedAt,
        selected.stamps.observedIntervalEndAt,
      ),
    };
  }
  if (excluded !== null) {
    return { state: "excluded", reason: excluded.reason, latest };
  }
  return { state: "absent", reason: "no_record_in_history" };
}
