/**
 * radioEvidence/types — the vocabulary of observed path activity (#1047).
 *
 * This module is shape only: no logic, no clock, no I/O. Every instant is an
 * ISO-8601 string and `issuedAt` is always an argument, never a clock read,
 * so a derivation is deterministic and replayable.
 *
 * The one claim this family refuses to make is closure. There is no `closed`
 * member below and no code path that produces one: a path with no reports is
 * either `no_reports` (somebody was listening and heard nothing) or `unknown`
 * (nobody was listening, or the aggregate for that hour is not readable).
 * Absence of a report is absence of evidence, never evidence of absence.
 */

import type { PredictionHead } from "@/lib/propagation/contracts/result";

/** The three mode classes `path_hourly_stats.mode_class` stores. */
export const MODE_CLASSES = ["cw", "digital", "phone"] as const;
export type ModeClass = (typeof MODE_CLASSES)[number];

/**
 * The observed-activity verdict. Deliberately three-valued: a fourth "closed"
 * member would be unprovable from these aggregates.
 */
export type ObservedActivityState = "verified_open" | "no_reports" | "unknown";

/**
 * Why a cell is `unknown`, in precedence order. `window_not_aggregated` wins
 * over `aggregate_hour_not_readable`, which wins over `no_receiver_coverage`:
 * an hour that was never written cannot be said to be unreadable, and an
 * unreadable hour says nothing about who was listening in it.
 */
export type UnknownReason =
  | "window_not_aggregated"
  | "aggregate_hour_not_readable"
  | "no_receiver_coverage"
  /**
   * The aggregates could not be read at all (a failed request). Only a caller
   * that performs the read can state this one; the pure derivation never
   * produces it. It is still `unknown`, because a failed read is the absence
   * of evidence and nothing else.
   */
  | "aggregate_read_failed";

/**
 * Whether the reports behind a count were attributed to a Maidenhead field
 * directly or via the collector's callsign backfill. Backfilled reports are
 * flagged, never dropped.
 */
export type FieldAttribution = "direct" | "callsign_backfill";

/**
 * A contiguous run of window hours the aggregates cannot speak for, as an
 * interval. A count would say how much is missing; a span says which part, so
 * a consumer can tell a fresh gap from an old one.
 */
export interface UnreadableSpan {
  readonly startAt: string;
  /** Exclusive: the start of the first readable hour after the gap. */
  readonly endAt: string;
}

/** Which instant an age was measured from, so the two never read alike. */
export type AgeKind = "report" | "coverage";

/** The narrow projection of `path_hourly_stats` a pair query needs. */
export interface PathActivityPairRow {
  hour_utc: string;
  mode_class: string;
  tx_field: string;
  rx_field: string;
  spot_count: number;
  unique_tx: number;
  unique_rx: number;
  backfilled_count: number;
}

/**
 * The narrow projection a coverage query needs: whether anyone was heard at
 * the receiving field on a band-hour, whatever the transmitting field.
 */
export interface PathCoverageRow {
  hour_utc: string;
  mode_class: string;
  tx_field: string;
  unique_rx: number;
}

/** The narrow projection of `band_hourly_stats_readable` the gap witness needs. */
export interface ReadableBandHourRow {
  hour_utc: string;
}

/**
 * Which complete hours of the window the aggregates can speak for.
 *
 * `candidateHourStarts` are the whole hours that fit inside the window; the
 * current partial hour is never written, which is what `aggregationLag`
 * exists to report. `unreadableHourStarts` is the span the gap ledger removed.
 */
export interface ReadableSpan {
  readonly candidateHourStarts: readonly string[];
  readonly readableHourStarts: readonly string[];
  readonly unreadableHourStarts: readonly string[];
  /** End (`hour_utc + 1h`) of the newest readable hour, or null when none is. */
  readonly latestReadableHourEnd: string | null;
}

/** The coverage question: was the receiving field heard from at all? */
export type CoverageVerdict =
  | {
      readonly kind: "covered";
      readonly span: ReadableSpan;
      readonly coveredHourStarts: readonly string[];
      /** End of the newest covered hour; the anchor of a `no_reports` age. */
      readonly latestCoveredHourEnd: string;
    }
  | {
      readonly kind: "unknown";
      readonly span: ReadableSpan;
      readonly reason: UnknownReason;
    };

/** Everything a record states whatever its verdict. */
export interface PathActivityBase {
  readonly band: string;
  readonly txField: string;
  readonly rxField: string;
  readonly issuedAt: string;
  readonly windowStartAt: string;
  readonly intervalSeconds: number;
  readonly modeClasses: readonly ModeClass[];
  /**
   * `issuedAt` minus the end of the newest readable hour. A consumer that
   * hides this could read a 40-minute-old aggregate as live silence.
   * Null when the window holds no readable hour at all.
   */
  readonly aggregationLagSeconds: number | null;
  /** Whole hours the window asked about. */
  readonly requestedHourCount: number;
  /** Of those, how many the gap-filtered view exposes. */
  readonly readableHourCount: number;
  /**
   * The hours it does not, as intervals. Empty means the evidence spans the
   * whole window, which is the only condition under which silence is silence
   * and a count is exact.
   */
  readonly unreadableSpans: readonly UnreadableSpan[];
}

/** Reports per mode class, always summing to `count`. */
export type ModeClassCounts = Readonly<Record<ModeClass, number>>;

/**
 * The per-(band, tx field, rx field, window) verdict.
 *
 * `count` exists only on the two states that can honestly state one. On
 * `unknown` the field is structurally absent rather than zero: "missing is
 * never zero" (M11), and a zero here would be read as a closed path.
 *
 * `no_reports` additionally requires every hour of the window to be readable.
 * Silence over five of six hours is not silence over the window: the sixth
 * could hold every report on the path, so that case is `unknown`.
 */
export type PathActivityRecord =
  | (PathActivityBase & {
      readonly state: "verified_open";
      readonly count: number;
      /**
       * True when part of the window is unreadable. The reports are real, so
       * the state stands; the count is then a floor rather than a total, and
       * every consumer has to say so.
       */
      readonly countIsLowerBound: boolean;
      /** Largest hourly distinct-transmitter count; hours are not summed. */
      readonly uniqueTx: number;
      /** Largest hourly distinct-receiver count; hours are not summed. */
      readonly uniqueRx: number;
      readonly modeCounts: ModeClassCounts;
      readonly backfilledCount: number;
      readonly backfilledShare: number;
      readonly fieldAttribution: FieldAttribution;
      readonly latestQualifiedHourEnd: string;
      readonly ageSeconds: number;
      readonly ageKind: "report";
    })
  | (PathActivityBase & {
      readonly state: "no_reports";
      readonly count: 0;
      readonly latestCoveredHourEnd: string;
      readonly ageSeconds: number;
      readonly ageKind: "coverage";
    })
  | (PathActivityBase & {
      readonly state: "unknown";
      readonly reason: UnknownReason;
    });

/** What a verdict is about, independent of the rows that answer it. */
export interface ObservedActivityDescriptor {
  readonly band: string;
  readonly txField: string;
  readonly rxField: string;
  /** The instant the verdict is as of. An argument, never `Date.now()`. */
  readonly issuedAt: string;
  /** Lookback length; defaults to `DEFAULT_OBSERVED_WINDOW_SECONDS`. */
  readonly windowSeconds?: number;
  /** Mode classes that qualify; defaults to all three. */
  readonly modeClasses?: readonly ModeClass[];
}

/** Everything `derivePathActivity` reads. Rows are supplied, never fetched. */
export interface RadioEvidenceInputs extends ObservedActivityDescriptor {
  readonly pairRows: readonly PathActivityPairRow[];
  readonly coverageRows: readonly PathCoverageRow[];
  readonly readableHours: readonly ReadableBandHourRow[];
}

/**
 * The identity a head projection cannot derive. The leaf never mints a digest
 * over a query result: an invented sha256 would be a fake immutability claim
 * (O5), and a model identity a reader asserted about itself would mislabel
 * every head it ever emitted (O6).
 */
export interface ObservedActivityIdentity {
  readonly contextId: string;
  readonly effectiveModelId: string;
  readonly effectiveModelVersion: string;
  /** `sha256:…` digest pinning the aggregate snapshot that was read. */
  readonly sourceVersion: string;
  readonly modelHash: string;
  readonly preprocessingHash: string;
  readonly featureHash: string;
  /**
   * When the aggregate rows were read; the published/captured stamp. It may
   * not precede the end of the newest readable hour (an hour's row is written
   * after that hour closes) and may not follow `issuedAt`; the contract
   * rejects either, rather than this module papering over a stamp it was
   * handed.
   */
  readonly readAt: string;
}

/** An `evidence.sources` entry, as the result contract spells one. */
export interface ObservedActivityEvidenceSource {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly observedIntervalEndAt: string | null;
  readonly publishedAt: string | null;
  readonly capturedAt: string | null;
  readonly ageSeconds: number | null;
  readonly eligible: boolean;
  readonly exclusionReason: string | null;
}

/** The `observed_activity` member of the head union. */
export type ObservedActivityHead = Extract<
  PredictionHead,
  { quantity: "observed_activity" }
>;

/**
 * What a projection hands an assembler: one head and the evidence entry the
 * head's coverage claim must resolve to (M11/M24). The pair travels together
 * because a coverage id with no eligible source is not provenance at all.
 */
export interface ObservedActivityProjection {
  readonly head: ObservedActivityHead;
  readonly evidenceSource: ObservedActivityEvidenceSource;
}
