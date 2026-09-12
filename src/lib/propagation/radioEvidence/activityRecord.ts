/**
 * radioEvidence/activityRecord — the per-path verdict (#1047).
 *
 * One function, one rule: a count is stated only when a listening receiver
 * produced it, and silence is stated only when a listening receiver was there
 * to hear it. Everything else is `unknown` with a reason and no number.
 *
 * `issuedAt` is an argument. The derivation is pure, so the same rows and the
 * same issuance always produce the same record, whatever the wall clock says.
 */

import {
  DEFAULT_OBSERVED_WINDOW_SECONDS,
  hourEnd,
  normalizeHourStart,
  alignedWindow,
  resolveCoverage,
  unreadableSpans,
} from "@/lib/propagation/radioEvidence/coverage";
import {
  MODE_CLASSES,
  type ModeClass,
  type ObservedActivityDescriptor,
  type UnknownReason,
  type ModeClassCounts,
  type PathActivityBase,
  type PathActivityPairRow,
  type PathActivityRecord,
  type RadioEvidenceInputs,
} from "@/lib/propagation/radioEvidence/types";

function isModeClass(value: string): value is ModeClass {
  return (MODE_CLASSES as readonly string[]).includes(value);
}

/** Seconds between two instants, clamped at zero. An age is never negative. */
function ageSecondsBetween(issuedAt: string, since: string): number {
  return Math.max(0, (Date.parse(issuedAt) - Date.parse(since)) / 1000);
}

/**
 * A row qualifies as a report when it carries spots, a transmitter and a
 * receiver, sits on a readable hour, and is in the requested mode set.
 *
 * A wholly backfilled row (`backfilled_count >= spot_count`) qualifies too.
 * The collector backfilled the Maidenhead field from the callsign rather than
 * from the spot, which is weaker attribution, not a missing report; dropping
 * it would turn a real decode into apparent silence. The record flags it.
 */
function qualifies(
  row: PathActivityPairRow,
  readable: ReadonlySet<string>,
  modes: ReadonlySet<ModeClass>,
): boolean {
  if (row.spot_count < 1 || row.unique_tx < 1 || row.unique_rx < 1)
    return false;
  if (!isModeClass(row.mode_class) || !modes.has(row.mode_class)) return false;
  return readable.has(normalizeHourStart(row.hour_utc));
}

function emptyModeCounts(): Record<ModeClass, number> {
  return { cw: 0, digital: 0, phone: 0 };
}

/**
 * The `unknown` record for a descriptor whose rows could not be read at all.
 *
 * Nothing was read, so no hour is known to be unreadable and no aggregation
 * lag can be stated; both are reported as such rather than as zeroes. There
 * is still no `count` field, which is the whole point: a failed read must not
 * arrive at a consumer looking like a silent band.
 */
export function unknownActivity(
  descriptor: ObservedActivityDescriptor,
  reason: UnknownReason,
): PathActivityRecord {
  const windowSeconds =
    descriptor.windowSeconds ?? DEFAULT_OBSERVED_WINDOW_SECONDS;
  const window = alignedWindow(descriptor.issuedAt, windowSeconds);
  return {
    band: descriptor.band,
    txField: descriptor.txField,
    rxField: descriptor.rxField,
    issuedAt: descriptor.issuedAt,
    windowStartAt: window.startAt,
    windowEndAt: window.endAt,
    intervalSeconds: windowSeconds,
    modeClasses: [...(descriptor.modeClasses ?? MODE_CLASSES)],
    aggregationLagSeconds: null,
    requestedHourCount: 0,
    readableHourCount: 0,
    coveredHourCount: 0,
    unreadableSpans: [],
    state: "unknown",
    reason,
  };
}

/**
 * Derive the observed-activity record for one (band, tx field, rx field) over
 * the window ending at `issuedAt`.
 */
export function derivePathActivity(
  inputs: RadioEvidenceInputs,
): PathActivityRecord {
  const windowSeconds = inputs.windowSeconds ?? DEFAULT_OBSERVED_WINDOW_SECONDS;
  const modeClasses = inputs.modeClasses ?? MODE_CLASSES;
  const coverage = resolveCoverage({
    issuedAt: inputs.issuedAt,
    windowSeconds,
    readableHours: inputs.readableHours,
    coverageRows: inputs.coverageRows,
    modeClasses,
  });
  const { span } = coverage;
  const window = alignedWindow(inputs.issuedAt, windowSeconds);

  const base: PathActivityBase = {
    band: inputs.band,
    txField: inputs.txField,
    rxField: inputs.rxField,
    issuedAt: inputs.issuedAt,
    windowStartAt: window.startAt,
    windowEndAt: window.endAt,
    intervalSeconds: windowSeconds,
    modeClasses: [...modeClasses],
    aggregationLagSeconds:
      span.latestReadableHourEnd === null
        ? null
        : ageSecondsBetween(inputs.issuedAt, span.latestReadableHourEnd),
    requestedHourCount: span.candidateHourStarts.length,
    readableHourCount: span.readableHourStarts.length,
    coveredHourCount:
      coverage.kind === "covered" ? coverage.coveredHourStarts.length : 0,
    unreadableSpans: unreadableSpans(span),
  };
  const windowComplete = span.unreadableHourStarts.length === 0;

  const readable = new Set(span.readableHourStarts);
  const modes = new Set(modeClasses);
  const qualified = inputs.pairRows.filter((row) =>
    qualifies(row, readable, modes),
  );

  // Reports first, and deliberately: a report inside a readable hour is real
  // evidence whatever happened in an unreadable one. Qualification already
  // requires a readable hour, so this cannot fire on an unaggregated window.
  if (qualified.length === 0) {
    if (coverage.kind === "unknown") {
      // No count field at all: "missing is never zero" (M11). A zero here
      // would be read as a closed band by every consumer that renders it.
      return { ...base, state: "unknown", reason: coverage.reason };
    }
    if (!windowComplete) {
      // Silence over part of a window is not silence over the window: the
      // missing hour could hold every report on this path. `no_reports` would
      // state a zero for hours nothing here can see.
      return {
        ...base,
        state: "unknown",
        reason: "aggregate_hour_not_readable",
      };
    }
    if (!coverage.windowFullyCovered) {
      // Every hour is readable and some were still unwatched. Silence over
      // the watched hours is not silence over the window. The
      // unwatched hours could hold every report on this path, so the record
      // says how much of the window was watched and states no count.
      return {
        ...base,
        state: "unknown",
        reason: "partial_receiver_coverage",
      };
    }
    return {
      ...base,
      state: "no_reports",
      count: 0,
      latestCoveredHourEnd: coverage.latestCoveredHourEnd,
      // The coverage age, not a report age: a stale coverage window must not
      // read as a fresh "nothing heard".
      ageSeconds: ageSecondsBetween(
        inputs.issuedAt,
        coverage.latestCoveredHourEnd,
      ),
      ageKind: "coverage",
    };
  }

  // The count is exact over the readable hours whatever the coverage was: a
  // readable hour with no listener holds no reports, so nothing is hidden
  // there. Readability, not coverage, is what makes a total a total, which is
  // why `countIsLowerBound` tracks the gap and not the watch.
  const modeCounts = emptyModeCounts();
  let count = 0;
  let backfilledCount = 0;
  let uniqueTx = 0;
  let uniqueRx = 0;
  let latestHourStart = normalizeHourStart(qualified[0].hour_utc);
  for (const row of qualified) {
    count += row.spot_count;
    backfilledCount += row.backfilled_count;
    // Hourly distinct counts are not additive across hours: the same operator
    // heard in three hours is one station, not three. The largest hour is the
    // strongest claim these aggregates support.
    uniqueTx = Math.max(uniqueTx, row.unique_tx);
    uniqueRx = Math.max(uniqueRx, row.unique_rx);
    if (isModeClass(row.mode_class)) {
      modeCounts[row.mode_class] += row.spot_count;
    }
    const hourStart = normalizeHourStart(row.hour_utc);
    if (Date.parse(hourStart) > Date.parse(latestHourStart)) {
      latestHourStart = hourStart;
    }
  }
  const latestQualifiedHourEnd = hourEnd(latestHourStart);
  const backfilledShare = backfilledCount / count;

  return {
    ...base,
    state: "verified_open",
    count,
    // The reports are real; the claim that they are all of them is not, once
    // an hour of the window is missing.
    countIsLowerBound: !windowComplete,
    uniqueTx,
    uniqueRx,
    modeCounts: modeCounts as ModeClassCounts,
    backfilledCount,
    backfilledShare,
    // Wholly backfilled reports are attributed by callsign, not by the spot's
    // own grid. The share carries the partial case; the flag names the case
    // where no report in the window had a direct field.
    fieldAttribution: backfilledShare >= 1 ? "callsign_backfill" : "direct",
    latestQualifiedHourEnd,
    ageSeconds: ageSecondsBetween(inputs.issuedAt, latestQualifiedHourEnd),
    ageKind: "report",
  };
}
