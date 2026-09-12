/**
 * ObservedActivityChip — what the receiver network actually logged on this
 * path, in words (#1047).
 *
 * The one thing this component may never do is turn silence into closure.
 * `no_reports` means a receiver was listening and logged nothing; `unknown`
 * means nobody can say. Neither is "band closed", so no copy here says it and
 * a test asserts the absence. Every state carries a word as well as a hue, and
 * the count is always secondary to the verdict that earns it.
 *
 * The chip owns its own read so the host panel stays markup only.
 */

import { useId } from "react";
import { Badge, Card, type BadgeStatus } from "@/components/ui";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useObservedPathActivity } from "@/hooks/useObservedPathActivity";
import type {
  PathActivityRecord,
  UnknownReason,
} from "@/lib/propagation/radioEvidence/types";

interface ObservedActivityChipProps {
  /** Operator's grid square (the transmitting end). */
  txGrid: string | null | undefined;
  /** Target's grid square (the receiving end). */
  rxGrid: string | null | undefined;
  className?: string;
}

/** `HH:MM` in UTC, which is the only zone an aggregation hour is written in. */
function utcHourMinute(instant: string): string {
  return new Date(instant).toISOString().slice(11, 16);
}

/**
 * The span the record answered, in words.
 *
 * The bounds are stated rather than implied because they are not the span the
 * operator asked for: the aggregates are written per whole hour, so a reading
 * taken at 18:30 answers to 18:00 and the last half hour is simply not in
 * yet. Saying so is the difference between a quiet band and a quiet ledger.
 */
function windowPhrase(record: PathActivityRecord): string {
  const bounds = `${utcHourMinute(record.windowStartAt)} to ${utcHourMinute(
    record.windowEndAt,
  )} UTC`;
  return record.windowEndAt === new Date(record.issuedAt).toISOString()
    ? `Window ${bounds}.`
    : `Window ${bounds}; the current hour is not aggregated yet.`;
}

/**
 * How much of the window the aggregates cannot speak for, in words. The gap
 * is named rather than hinted at, because "at least" with no reason reads as
 * hedging instead of as a missing hour.
 */
function missingHourPhrase(record: PathActivityRecord): string {
  const missing = record.requestedHourCount - record.readableHourCount;
  return missing === 1 ? "1 hour is" : `${missing} hours are`;
}

/**
 * Why a count is a floor. A floor has two causes and they are different
 * facts: hours the aggregate cannot speak for, or rows the read never
 * received. Naming the wrong one would send a reader looking for a gap that
 * is not there.
 */
function lowerBoundPhrase(record: PathActivityRecord): string {
  return record.readableHourCount < record.requestedHourCount
    ? `Partial window: ${missingHourPhrase(record)} missing from the aggregate, so this is a floor, not a total.`
    : "This receiving area is busy enough that its rows did not fit in one read, so this is a floor, not a total.";
}

/** An elapsed span in the coarsest unit that stays honest. */
function formatAge(seconds: number): string {
  if (seconds < 120) return "just now";
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3_600)} h ago`;
}

/**
 * Why nobody can answer. Each line names the missing thing, because "unknown"
 * with no cause reads as a fault in the app rather than a gap in the evidence.
 * None of these mention reports: an unknown cell states no count at all.
 */
const UNKNOWN_COPY: Record<
  UnknownReason,
  (record: PathActivityRecord) => string
> = {
  no_receiver_coverage: () =>
    "Nobody was listening at the far end during this window, so nothing can be said either way.",
  partial_receiver_coverage: (record) =>
    `Somebody was listening for ${record.coveredHourCount} of the ${record.requestedHourCount} hours in this window. The watched hours were quiet, which says nothing about the rest.`,
  aggregate_hour_not_readable: () =>
    "The hourly aggregate has a gap over this window, so the evidence is incomplete.",
  window_not_aggregated: () =>
    "This window is not aggregated yet. The hourly rollup writes an hour once it closes.",
  aggregate_read_truncated: () =>
    "This receiving area is busy enough that its hours did not fit in one read, so the quiet hours cannot be confirmed.",
  aggregate_read_failed: () =>
    "The aggregate could not be read just now, so the evidence is unavailable.",
};

const STATE_TONE: Record<PathActivityRecord["state"], BadgeStatus> = {
  verified_open: "good",
  no_reports: "active",
  unknown: "quiet",
};

const STATE_WORD: Record<PathActivityRecord["state"], string> = {
  verified_open: "Heard open",
  no_reports: "No reports",
  unknown: "Unknown",
};

/** Observed activity for the path between two grids, on the active band. */
export function ObservedActivityChip({
  txGrid,
  rxGrid,
  className = "",
}: ObservedActivityChipProps) {
  const band = useActiveBand();
  const labelId = useId();
  const { record, isLoading } = useObservedPathActivity({
    band,
    txGrid,
    rxGrid,
  });

  if (record === null) {
    return (
      <Card role="group" aria-labelledby={labelId} className={className}>
        <p id={labelId} className="font-mono text-xs uppercase text-su-muted">
          Observed activity
        </p>
        <p className="mt-1 text-sm text-su-muted">
          {isLoading
            ? "Checking reports for this path…"
            : "Set both ends of the path to check reports."}
        </p>
      </Card>
    );
  }

  return (
    <Card role="group" aria-labelledby={labelId} className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <p id={labelId} className="font-mono text-xs uppercase text-su-muted">
          Observed activity
        </p>
        <Badge status={STATE_TONE[record.state]} size="sm">
          {STATE_WORD[record.state]}
        </Badge>
      </div>

      {record.state === "verified_open" && (
        <div className="mt-1 space-y-1">
          <p className="text-sm text-su-text">
            Receivers logged this path within the last{" "}
            {Math.round(record.intervalSeconds / 3_600)} hours.
          </p>
          <p className="text-sm text-su-muted">
            Latest {formatAge(record.ageSeconds)}
          </p>
          <p className="font-mono text-sm text-su-muted">
            {record.countIsLowerBound ? "At least " : ""}
            {record.count} reports
          </p>
          {record.countIsLowerBound && (
            <p className="text-sm text-su-muted">{lowerBoundPhrase(record)}</p>
          )}
          {record.fieldAttribution === "callsign_backfill" && (
            <p className="text-sm text-su-muted">
              Grid from callsign, not from the report itself
            </p>
          )}
        </div>
      )}

      {record.state === "no_reports" && (
        <div className="mt-1 space-y-1">
          <p className="text-sm text-su-text">
            Receivers were listening at the far end and logged nothing on this
            path over the window. That is silence, not a verdict on the band.
          </p>
          <p className="text-sm text-su-muted">
            Coverage runs to {formatAge(record.ageSeconds)}
          </p>
        </div>
      )}

      {record.state === "unknown" && (
        <p className="mt-1 text-sm text-su-text">
          {UNKNOWN_COPY[record.reason](record)}
        </p>
      )}

      <p className="mt-1 text-sm text-su-muted">{windowPhrase(record)}</p>
    </Card>
  );
}
