/**
 * radioEvidence/coverage — which hours the aggregates can speak for, and
 * whether the receiving field was heard from in any of them (#1047).
 *
 * **The gap witness is the band-hour, deliberately.** There is no
 * `path_hourly_stats_readable` view: `spot_aggregation_hour_readable` returns
 * false for `'path_hourly'` by construction and `collector_aggregation_gaps`
 * grants SELECT to `service_role` only, so a browser has no direct witness of
 * a path-grain gap. `compute_retained_spot_hour` records a gap per aggregation
 * off the same two-hour `spot_history` prune, so a `band_hourly` gap and a
 * `path_hourly` gap for one hour are produced by the same event, which makes
 * the band view the honest already-exposed proxy. This is an approximation,
 * stated here rather than hidden: a band-hour that is readable while its path
 * rows were lost would be read as coverage. A follow-up issue carries the
 * exact answer (a `path_hourly_stats_readable` view, which is a migration and
 * therefore out of #1047's scope).
 *
 * Everything here is pure: rows plus `issuedAt` in, a verdict out. No clock.
 */

import {
  MODE_CLASSES,
  type CoverageVerdict,
  type ModeClass,
  type PathCoverageRow,
  type ReadableBandHourRow,
  type ReadableSpan,
  type UnreadableSpan,
} from "@/lib/propagation/radioEvidence/types";

const HOUR_MS = 3_600_000;

/**
 * Default lookback. Six hours clears the aggregation lag comfortably, keeps
 * the coverage fan-out (every tx field for a busy rx field) inside one or two
 * PostgREST pages, and is always reported alongside the derived age so "six
 * hours old" can never be mistaken for "now".
 */
export const DEFAULT_OBSERVED_WINDOW_SECONDS = 6 * 3600;

/** An hour key in one spelling; PostgREST may return either offset form. */
export function normalizeHourStart(hourUtc: string): string {
  return new Date(
    Math.floor(Date.parse(hourUtc) / HOUR_MS) * HOUR_MS,
  ).toISOString();
}

/** The end of the aggregation hour that starts at `hourStart`. */
export function hourEnd(hourStart: string): string {
  return new Date(Date.parse(hourStart) + HOUR_MS).toISOString();
}

/** The instant the window opens: `issuedAt` minus its length. */
export function windowStartAt(issuedAt: string, windowSeconds: number): string {
  return new Date(Date.parse(issuedAt) - windowSeconds * 1000).toISOString();
}

/**
 * The whole hours that fit inside the window, oldest first.
 *
 * Partial hours are excluded because the collector never writes one: the hour
 * in progress has no row, and treating its absence as a gap (or as silence)
 * would misreport every query. An empty list means the window is shorter than
 * the aggregation grain, which is its own unknown reason.
 */
export function candidateHourStarts(
  issuedAt: string,
  windowSeconds: number,
): string[] {
  const issued = Date.parse(issuedAt);
  const opens = issued - windowSeconds * 1000;
  const hours: string[] = [];
  let start = Math.ceil(opens / HOUR_MS) * HOUR_MS;
  for (; start + HOUR_MS <= issued; start += HOUR_MS) {
    hours.push(new Date(start).toISOString());
  }
  return hours;
}

/** Which candidate hours the gap-filtered band view exposes. */
export function readableSpan(
  issuedAt: string,
  windowSeconds: number,
  readableHours: readonly ReadableBandHourRow[],
): ReadableSpan {
  const exposed = new Set(
    readableHours.map((row) => normalizeHourStart(row.hour_utc)),
  );
  const candidateHourStarts_ = candidateHourStarts(issuedAt, windowSeconds);
  const readableHourStarts = candidateHourStarts_.filter((hour) =>
    exposed.has(hour),
  );
  const newest = readableHourStarts[readableHourStarts.length - 1];
  return {
    candidateHourStarts: candidateHourStarts_,
    readableHourStarts,
    unreadableHourStarts: candidateHourStarts_.filter(
      (hour) => !exposed.has(hour),
    ),
    latestReadableHourEnd: newest === undefined ? null : hourEnd(newest),
  };
}

/**
 * The unreadable hours of a span, merged into contiguous intervals.
 *
 * The end is the start of the next hour after the run, so a single missing
 * hour reads as the hour it is rather than as an instant.
 */
export function unreadableSpans(span: ReadableSpan): UnreadableSpan[] {
  const spans: UnreadableSpan[] = [];
  for (const hour of span.unreadableHourStarts) {
    const last = spans[spans.length - 1];
    if (last !== undefined && last.endAt === hour) {
      spans[spans.length - 1] = { startAt: last.startAt, endAt: hourEnd(hour) };
      continue;
    }
    spans.push({ startAt: hour, endAt: hourEnd(hour) });
  }
  return spans;
}

/**
 * The hours on which the receiving field was heard from at all, in the modes
 * the request asked about.
 *
 * A row counts whatever its `tx_field`: coverage is about the receiver being
 * present in the network, not about our pair. The mode set is not optional in
 * the same way: a digital-only receiver proves nothing about a CW request, and
 * counting it would turn "nobody was listening for CW" into "heard nothing on
 * CW". Rows carrying `unique_rx = 0` are an aggregation artefact of a
 * band-hour, not a listening receiver.
 */
export function coveredHours(
  coverageRows: readonly PathCoverageRow[],
  modeClasses: readonly ModeClass[] = MODE_CLASSES,
): Set<string> {
  const modes = new Set<string>(modeClasses);
  const covered = new Set<string>();
  for (const row of coverageRows) {
    if (row.unique_rx > 0 && modes.has(row.mode_class)) {
      covered.add(normalizeHourStart(row.hour_utc));
    }
  }
  return covered;
}

export interface CoverageQuery {
  readonly issuedAt: string;
  readonly windowSeconds: number;
  readonly readableHours: readonly ReadableBandHourRow[];
  readonly coverageRows: readonly PathCoverageRow[];
  /** Modes the request asks about; defaults to all three. */
  readonly modeClasses?: readonly ModeClass[];
}

/**
 * The coverage verdict, in the precedence the semantics table fixes: a window
 * with no complete hour cannot be called unreadable, and an unreadable window
 * says nothing about who was listening.
 */
export function resolveCoverage(query: CoverageQuery): CoverageVerdict {
  const span = readableSpan(
    query.issuedAt,
    query.windowSeconds,
    query.readableHours,
  );
  if (span.candidateHourStarts.length === 0) {
    return { kind: "unknown", span, reason: "window_not_aggregated" };
  }
  if (span.readableHourStarts.length === 0) {
    return { kind: "unknown", span, reason: "aggregate_hour_not_readable" };
  }
  const heard = coveredHours(query.coverageRows, query.modeClasses);
  const coveredHourStarts = span.readableHourStarts.filter((hour) =>
    heard.has(hour),
  );
  if (coveredHourStarts.length === 0) {
    return { kind: "unknown", span, reason: "no_receiver_coverage" };
  }
  return {
    kind: "covered",
    span,
    coveredHourStarts,
    latestCoveredHourEnd: hourEnd(
      coveredHourStarts[coveredHourStarts.length - 1],
    ),
  };
}
