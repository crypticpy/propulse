/**
 * PROP-05 forecast trajectory (#951), implementing the M14 forecast rules and
 * the #982 section 1 grid.
 *
 * The grid is `validAt[j] = issuedAt + j * 3600 s`, j = 0..hours-1: labelled
 * instantaneous samples at absolute instants. There is no current-day hourly
 * key and no local midnight anywhere in this file, which is why a run that
 * crosses midnight, a month end or a year end produces the same samples as one
 * that does not.
 *
 * Three rules do the work:
 *
 * 1. A driver is filled only from a forecast that had already been issued,
 *    published and captured by `issuedAt`. A forecast may be valid in the
 *    future; it may not have been issued in the future.
 * 2. Each forecast keeps its producer's cadence. A 3 h Kp bin serves the three
 *    hourly samples inside it as one record, and the bucket it owns is emitted
 *    beside the grid so an interval-valued question is answered against the
 *    real bucket rather than an instantaneous sample relabelled.
 * 3. Where no issued forecast covers a sample, the driver is `absent` with a
 *    reason, or a labelled bundled `climatological_prior` where one exists. A
 *    last observation is never held flat and no value is ever 0 by default.
 *    M13's lag states and relaxation dynamics belong to PROP-12 and are not
 *    implemented here.
 */
import { getLedgerEntry } from "@/lib/propagation/context/ledger";
import {
  instantMs,
  type BucketWindow,
  type DriverValue,
  type Instant,
  type Selected,
  type SourceHistory,
  type SourceMode,
  type SourceRecord,
  type TrajectorySample,
} from "@/lib/propagation/context/types";

/** A forecast record that cannot be placed on the grid. */
export class ContextForecastError extends Error {
  override readonly name = "ContextForecastError";

  constructor(
    readonly sourceId: string,
    readonly detail: string,
  ) {
    super(
      `forecast record from "${sourceId}" cannot be placed on the grid: ${detail}`,
    );
  }
}

export const GRID_STEP_SECONDS = 3600;
export const DEFAULT_GRID_HOURS = 24;

export interface TrajectoryOptions {
  readonly issuedAt: Instant;
  /** Samples to emit. 24 by contract; parameterised so tests can be small. */
  readonly hours?: number;
  /** As-issued forecast records, keyed by the variable they drive. */
  readonly forecasts: Readonly<Record<string, SourceHistory>>;
  /** The observation selected at the issue instant, keyed by variable. */
  readonly observations?: Readonly<Record<string, Selected>>;
  /** Bundled climatological priors, keyed by variable. */
  readonly priors?: Readonly<Record<string, SourceRecord>>;
  readonly mode: SourceMode;
  readonly requireVerifiedArchive?: boolean;
}

export interface Trajectory {
  readonly samples: readonly TrajectorySample[];
  readonly buckets: readonly BucketWindow[];
}

interface PlacedForecast {
  readonly record: SourceRecord;
  readonly validFromMs: number;
  readonly validToMs: number;
  readonly issuedMs: number;
  readonly capturedMs: number;
}

/**
 * The forecasts a prediction issued at `issuedAt` could actually have used.
 *
 * A forecast carries its issue time in `forecastIssuedAt`; a record without
 * one is not a forecast and is rejected rather than silently treated as valid
 * for every horizon.
 */
function eligibleForecasts(
  history: SourceHistory,
  variable: string,
  options: TrajectoryOptions,
  issued: number,
): PlacedForecast[] {
  const placed: PlacedForecast[] = [];
  for (const record of history) {
    if (!getLedgerEntry(record.sourceId).variables.includes(record.variable)) {
      // M11: a variable its own source never declared cannot be selected, so
      // it is dropped here rather than driving a sample.
      continue;
    }
    if (record.variable !== variable) {
      // A declared record filed under the wrong driver is a caller bug: the
      // outlook carries f107, kp and planetary_a under one issue time, and
      // emitting a flux number as Kp would be silent nonsense.
      throw new ContextForecastError(
        record.sourceId,
        `carries "${record.variable}" but was filed under the driver "${variable}"`,
      );
    }
    const { stamps } = record;
    if (stamps.forecastIssuedAt === null) {
      throw new ContextForecastError(record.sourceId, "no forecast issue time");
    }
    if (stamps.validFrom === null || stamps.validTo === null) {
      throw new ContextForecastError(record.sourceId, "no valid interval");
    }
    const validFromMs = instantMs(stamps.validFrom, "validFrom");
    const validToMs = instantMs(stamps.validTo, "validTo");
    if (validToMs <= validFromMs) {
      throw new ContextForecastError(
        record.sourceId,
        "valid interval ends before it opens",
      );
    }
    if (options.mode === "offline" && record.origin !== "bundled") continue;
    if (!Number.isFinite(record.value)) continue;
    if (
      options.requireVerifiedArchive === true &&
      stamps.archiveClass !== "verified_as_issued"
    ) {
      continue;
    }
    const issuedMs = instantMs(stamps.forecastIssuedAt, "forecastIssuedAt");
    const publishedMs = instantMs(
      stamps.publication.publishedAt,
      "publishedAt",
    );
    const capturedMs = instantMs(stamps.capturedAt, "capturedAt");
    // M14: driven only by forecasts actually issued at the prediction's issue
    // time, and only by ones this service already held.
    if (issuedMs > issued || publishedMs > issued || capturedMs > issued)
      continue;
    placed.push({ record, validFromMs, validToMs, issuedMs, capturedMs });
  }
  return placed;
}

/**
 * The forecast covering `at`: the one most recently issued, and among equally
 * recent issues the one most recently captured. A later issue supersedes an
 * earlier one for the same valid interval; it never merges with it.
 */
function coveringForecast(
  placed: readonly PlacedForecast[],
  at: number,
): PlacedForecast | null {
  let best: PlacedForecast | null = null;
  for (const candidate of placed) {
    if (at < candidate.validFromMs || at >= candidate.validToMs) continue;
    if (
      best === null ||
      candidate.issuedMs > best.issuedMs ||
      (candidate.issuedMs === best.issuedMs &&
        candidate.capturedMs > best.capturedMs)
    ) {
      best = candidate;
    }
  }
  return best;
}

function bucketKey(bucket: BucketWindow): string {
  return [
    bucket.variable,
    bucket.sourceId,
    bucket.startAt,
    bucket.endAt,
    bucket.revision,
  ].join("\u0000");
}

/**
 * Whether this record may stand as the prior for `variable`.
 *
 * The same rule the forecast histories pass: a record filed under a driver its
 * own source never declared is dropped, and a declared record filed under the
 * wrong driver is a caller bug rather than an absent sample. A prior is also a
 * standing bundled product by definition, so a forecast bin read as one would
 * label a prediction as climatology (M11, M14).
 */
function priorBinds(prior: SourceRecord, variable: string): boolean {
  const entry = getLedgerEntry(prior.sourceId);
  if (!entry.variables.includes(prior.variable)) return false;
  if (prior.variable !== variable) {
    throw new ContextForecastError(
      prior.sourceId,
      `carries "${prior.variable}" but was filed as the prior for "${variable}"`,
    );
  }
  return entry.kind === "bundled";
}

/**
 * Whether a bundled prior was available at `issuedAt` and describes `at`.
 *
 * A climatology is still a dated product. One bundled after the issue instant
 * could not have informed the prediction, and a monthly value says nothing
 * about the month after the one it covers, so both are absent rather than
 * approximated.
 */
function priorAppliesAt(
  prior: SourceRecord,
  options: TrajectoryOptions,
  issued: number,
  at: number,
): boolean {
  if (!Number.isFinite(prior.value)) return false;
  if (options.mode === "offline" && prior.origin !== "bundled") return false;
  if (
    options.requireVerifiedArchive === true &&
    prior.stamps.archiveClass !== "verified_as_issued"
  ) {
    return false;
  }
  const { stamps } = prior;
  if (instantMs(stamps.publication.publishedAt, "publishedAt") > issued)
    return false;
  if (instantMs(stamps.capturedAt, "capturedAt") > issued) return false;
  if (
    stamps.forecastIssuedAt !== null &&
    instantMs(stamps.forecastIssuedAt, "forecastIssuedAt") > issued
  ) {
    return false;
  }
  // No stated validity means a value with no expiry, which is what a plain
  // climatology is. A stated one is honoured exactly.
  if (stamps.validFrom === null || stamps.validTo === null) return true;
  const from = instantMs(stamps.validFrom, "validFrom");
  const to = instantMs(stamps.validTo, "validTo");
  return at >= from && at < to;
}

export function buildTrajectory(options: TrajectoryOptions): Trajectory {
  const issued = instantMs(options.issuedAt, "issuedAt");
  const hours = options.hours ?? DEFAULT_GRID_HOURS;
  if (!Number.isInteger(hours) || hours < 1) {
    throw new ContextForecastError(
      "trajectory",
      `grid length ${String(hours)} is not a positive integer`,
    );
  }

  const variables = new Set<string>([
    ...Object.keys(options.forecasts),
    ...Object.keys(options.observations ?? {}),
    ...Object.keys(options.priors ?? {}),
  ]);

  // Priors are bound to their driver before the grid is walked, so a caller
  // bug is reported whether or not a forecast happens to cover every sample.
  const priorByVariable = new Map<string, SourceRecord>();
  for (const [variable, prior] of Object.entries(options.priors ?? {})) {
    if (priorBinds(prior, variable)) priorByVariable.set(variable, prior);
  }

  const placedByVariable = new Map<string, PlacedForecast[]>();
  for (const variable of variables) {
    placedByVariable.set(
      variable,
      eligibleForecasts(
        options.forecasts[variable] ?? [],
        variable,
        options,
        issued,
      ),
    );
  }

  const buckets = new Map<string, BucketWindow>();
  const samples: TrajectorySample[] = [];

  for (let index = 0; index < hours; index += 1) {
    const horizonSeconds = index * GRID_STEP_SECONDS;
    const at = issued + horizonSeconds * 1000;
    const drivers: Record<string, DriverValue> = {};

    for (const variable of variables) {
      const observed = options.observations?.[variable];
      // M14: at the issue instant the observation is the state. One sample
      // later it is not, and nothing here extends it.
      if (
        index === 0 &&
        observed !== undefined &&
        observed.state === "selected"
      ) {
        drivers[variable] = {
          origin: "observed_at_issue",
          value: observed.record.value,
          stamps: observed.record.stamps,
          sourceId: observed.record.sourceId,
        };
        continue;
      }

      const covering = coveringForecast(
        placedByVariable.get(variable) ?? [],
        at,
      );
      if (covering !== null) {
        const { record } = covering;
        drivers[variable] = {
          origin: "issued_forecast",
          value: record.value,
          stamps: record.stamps,
          sourceId: record.sourceId,
        };
        if (
          record.stamps.intervalSeconds !== null &&
          record.stamps.validFrom !== null &&
          record.stamps.validTo !== null
        ) {
          const bucket: BucketWindow = {
            variable,
            sourceId: record.sourceId,
            startAt: record.stamps.validFrom,
            endAt: record.stamps.validTo,
            intervalSeconds: record.stamps.intervalSeconds,
            revision: record.stamps.revision,
          };
          buckets.set(bucketKey(bucket), bucket);
        }
        continue;
      }

      const prior = priorByVariable.get(variable);
      if (prior !== undefined && priorAppliesAt(prior, options, issued, at)) {
        drivers[variable] = {
          origin: "climatological_prior",
          value: prior.value,
          stamps: prior.stamps,
          sourceId: prior.sourceId,
        };
        continue;
      }

      drivers[variable] = {
        origin: "absent",
        reason:
          options.mode === "offline"
            ? "no bundled forecast or prior covers this sample in offline mode"
            : "no forecast issued by issuedAt covers this sample, and no prior is declared",
      };
    }

    samples.push({
      validAt: new Date(at).toISOString(),
      horizonSeconds,
      drivers,
    });
  }

  return { samples, buckets: [...buckets.values()] };
}
