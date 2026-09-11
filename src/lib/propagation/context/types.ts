/**
 * PROP-05 as-of context types (#951), implementing M02 as-issued time, the
 * M11 freshness census and the M14 forecast grid.
 *
 * Everything here is a record of what was true at one instant, `issuedAt`.
 * The leaf reads no clock: `issuedAt` always arrives as an argument, so a
 * replay of a past instant and a live call run the identical code.
 *
 * The one rule that shapes every type below is that a value and its
 * provenance travel together. A number without stamps cannot be checked for
 * eligibility, and an ineligible source has no `value` field at all, which is
 * how "missing is never zero" (M11) is enforced by the type system rather
 * than by discipline at each call site.
 */
import type { SourceMode } from "@/lib/propagation/contracts/enums";

/** ISO 8601 instant with an offset, at most millisecond precision. */
export type Instant = string;

export const CONTEXT_SCHEMA_VERSION = 1 as const;

/**
 * How well the release time of a record is actually known (M02).
 *
 * `declared` is a publication time the producer printed: the `:Issued:` header
 * on a NOAA text product, `issue_datetime` on an alert, `issued_at` on a
 * collector forecast row.
 *
 * `bounded_by_capture` is the honest form for a product that carries none.
 * Publication provably lies in [observedIntervalEndAt, capturedAt], so the
 * capture instant is a true upper bound: whenever the capture is no later than
 * `issuedAt`, the unknown publication is too. The bound is recorded as the
 * publication time and the record is marked `capture_bounded`, so nothing
 * downstream can mistake it for a verified publication history.
 */
export type PublicationClass = {
  readonly kind: "declared" | "bounded_by_capture";
  readonly publishedAt: Instant;
};

/**
 * M02: "unknown publication history cannot masquerade as a verified as-issued
 * archive". The distinction is carried on every record and reported in the
 * snapshot rather than averaged away.
 */
export type ArchiveClass = "verified_as_issued" | "capture_bounded";

/** Where a record came from, which is what `sourceMode` actually selects on. */
export type RecordOrigin = "bundled" | "cached" | "network";

/** A source that is or is not producing, where the producer says so. */
export type SourceActivity = "active" | "inactive" | "not_reported";

export interface SourceStamps {
  /**
   * Start of the interval the measurement covers, or null for an
   * instantaneous sample. A 3 h Kp bin stamped 03:00 starts at 03:00 and ends
   * at 06:00; it is not an observation until 06:00.
   */
  readonly observedIntervalStartAt: Instant | null;
  readonly observedIntervalEndAt: Instant;
  readonly publication: PublicationClass;
  /** When this service held the record. The clause that makes replay honest. */
  readonly capturedAt: Instant;
  /** The producer's issue time. Non-null only on a forecast record. */
  readonly forecastIssuedAt: Instant | null;
  /** Forecast valid interval. May be, and normally is, in the future. */
  readonly validFrom: Instant | null;
  readonly validTo: Instant | null;
  /** The producer's own cadence. Never resampled, never inferred. */
  readonly intervalSeconds: number | null;
  /** Publication revision label; two revisions are two records. */
  readonly revision: string;
  readonly archiveClass: ArchiveClass;
}

export interface SourceRecord {
  /** Ledger key, e.g. "kp". One ledger entry may back several variables. */
  readonly sourceId: string;
  /** The physical variable this record carries, e.g. "kp", "bz_gsm". */
  readonly variable: string;
  readonly units: string;
  readonly value: number;
  readonly stamps: SourceStamps;
  readonly origin: RecordOrigin;
  readonly activity: SourceActivity;
  readonly qualityFlags: readonly string[];
}

export type SourceHistory = readonly SourceRecord[];

/**
 * Why a record that exists was not used. Every one of these is a statement
 * about the record and `issuedAt`, never about the wall clock.
 */
export type ExclusionReason =
  | "not_yet_observed"
  | "not_yet_published"
  | "not_yet_captured"
  | "beyond_age_bound"
  | "source_inactive"
  | "inactive_barrier"
  | "offline_mode"
  | "non_finite_value"
  | "unknown_publication_history";

/**
 * The outcome for one source at one `issuedAt`.
 *
 * `excluded` keeps the newest causal record in `latest` because M11 says a
 * source outside its bound is excluded from numerical corrections "while its
 * dated observation may remain visible". `absent` means the history held
 * nothing for this source at all, which is a different fact and is reported
 * as one.
 */
export type Selected =
  | { readonly state: "selected"; readonly record: SourceRecord; readonly ageSeconds: number }
  | {
      readonly state: "excluded";
      readonly reason: ExclusionReason;
      readonly latest: SourceRecord | null;
    }
  | { readonly state: "absent"; readonly reason: "no_record_in_history" };

/** One driver value on one grid sample. There is no numeric field when absent. */
export type DriverValue =
  | {
      readonly origin: "issued_forecast";
      readonly value: number;
      readonly stamps: SourceStamps;
      readonly sourceId: string;
    }
  | {
      readonly origin: "observed_at_issue";
      readonly value: number;
      readonly stamps: SourceStamps;
      readonly sourceId: string;
    }
  | {
      readonly origin: "climatological_prior";
      readonly value: number;
      readonly stamps: SourceStamps;
      readonly sourceId: string;
    }
  | { readonly origin: "absent"; readonly reason: string };

export interface TrajectorySample {
  /** issuedAt + j * 3600 s. An absolute instant, never a day-local hour key. */
  readonly validAt: Instant;
  readonly horizonSeconds: number;
  readonly drivers: Readonly<Record<string, DriverValue>>;
}

/**
 * The interval a driver's product actually owns, carried beside the
 * instantaneous grid so an interval-valued question
 * (`INTERVAL_VALUED_QUANTITIES`) is answered against the real bucket instead
 * of a grid sample relabelled as an hourly probability (#982 section 1).
 */
export interface BucketWindow {
  readonly variable: string;
  readonly sourceId: string;
  readonly startAt: Instant;
  readonly endAt: Instant;
  readonly intervalSeconds: number;
  readonly revision: string;
}

/**
 * One source's entry in the snapshot census. Every declared source has one,
 * including the ones that produced nothing, so the snapshot answers "what was
 * considered" and not only "what was used".
 */
export type SnapshotEntry =
  | {
      readonly state: "selected";
      readonly sourceId: string;
      readonly record: SourceRecord;
      readonly ageSeconds: number;
      readonly sourceVersion: string;
    }
  | {
      readonly state: "excluded";
      readonly sourceId: string;
      readonly reason: ExclusionReason;
      readonly latest: SourceRecord | null;
      readonly sourceVersion: string;
    }
  | {
      readonly state: "absent";
      readonly sourceId: string;
      readonly reason: "no_record_in_history";
      readonly sourceVersion: "unknown";
    };

export interface ContextSnapshot {
  readonly schemaVersion: typeof CONTEXT_SCHEMA_VERSION;
  /** "ctx:sha256:<64 lowercase hex>", digested over the whole census. */
  readonly contextId: string;
  readonly issuedAt: Instant;
  readonly mode: SourceMode;
  readonly ledgerVersion: string;
  readonly sources: Readonly<Record<string, SnapshotEntry>>;
  readonly trajectory: readonly TrajectorySample[];
  readonly bucketWindows: readonly BucketWindow[];
  /** Ordered, never empty: the adopted rules are always named. */
  readonly assumptions: readonly string[];
}

/** An instant that could not be parsed would silently become NaN and defeat
 * every ordering comparison, so it is rejected where it enters instead. */
export class ContextTimeError extends Error {
  override readonly name = "ContextTimeError";

  constructor(
    readonly field: string,
    readonly value: unknown,
  ) {
    super(`context timestamp "${field}" is not a parseable instant: ${String(value)}`);
  }
}

/** Milliseconds since epoch, or a thrown error. Never NaN. */
export function instantMs(value: Instant, field = "instant"): number {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) throw new ContextTimeError(field, value);
  return at;
}

/**
 * Age at issue, in whole seconds, rounded up.
 *
 * This mirrors `ml/service/operational_weather.py`'s
 * `max(0, ceil((issue_time - observed).total_seconds()))` exactly, including
 * the clamp at zero, so the parity fixture compares like with like.
 */
export function ageSecondsAt(issuedAt: Instant, observedIntervalEndAt: Instant): number {
  const delta = instantMs(issuedAt, "issuedAt") - instantMs(observedIntervalEndAt, "observedIntervalEndAt");
  return Math.max(0, Math.ceil(delta / 1000));
}

export type { SourceMode };
