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
  resolveCoverage,
  windowStartAt,
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
  if (row.spot_count < 1 || row.unique_tx < 1 || row.unique_rx < 1) return false;
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
  return {
    band: descriptor.band,
    txField: descriptor.txField,
    rxField: descriptor.rxField,
    issuedAt: descriptor.issuedAt,
    windowStartAt: windowStartAt(descriptor.issuedAt, windowSeconds),
    intervalSeconds: windowSeconds,
    modeClasses: [...(descriptor.modeClasses ?? MODE_CLASSES)],
    aggregationLagSeconds: null,
    unreadableHourCount: 0,
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
  });
  const { span } = coverage;

  const base: PathActivityBase = {
    band: inputs.band,
    txField: inputs.txField,
    rxField: inputs.rxField,
    issuedAt: inputs.issuedAt,
    windowStartAt: windowStartAt(inputs.issuedAt, windowSeconds),
    intervalSeconds: windowSeconds,
    modeClasses: [...modeClasses],
    aggregationLagSeconds:
      span.latestReadableHourEnd === null
        ? null
        : ageSecondsBetween(inputs.issuedAt, span.latestReadableHourEnd),
    unreadableHourCount: span.unreadableHourStarts.length,
  };

  if (coverage.kind === "unknown") {
    // No count field at all: "missing is never zero" (M11). A zero here would
    // be read as a closed band by every consumer that ever renders it.
    return { ...base, state: "unknown", reason: coverage.reason };
  }

  const readable = new Set(span.readableHourStarts);
  const modes = new Set(modeClasses);
  const qualified = inputs.pairRows.filter((row) =>
    qualifies(row, readable, modes),
  );

  if (qualified.length === 0) {
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
