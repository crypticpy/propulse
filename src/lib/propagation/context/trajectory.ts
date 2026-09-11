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
import {
  admitRecord,
  type Admitted,
} from "@/lib/propagation/context/admission";
import {
  getLedgerEntry,
  type SourceLedgerEntry,
} from "@/lib/propagation/context/ledger";
import { preferredRecord } from "@/lib/propagation/context/selection";
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
  /**
   * Every driver to report on, whether or not anything covers it.
   *
   * A variable whose only product was excluded still has to appear, saying
   * absent and why. Deriving the driver set from what happened to survive
   * would drop it from the grid instead, and a silently missing driver reads
   * as a question nobody asked (M11).
   */
  readonly variables?: readonly string[];
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
 * Which driver an input was filed under is this module's own bookkeeping, so a
 * record filed under the wrong one is a caller bug reported here. Everything
 * else an input must satisfy is the same question the whole leaf asks, so it
 * goes to `admitRecord` and is not answered a second time: an undeclared
 * variable, a product of the wrong kind for the role, a claimed archive its
 * source cannot prove, a bin beyond the declared horizon (M11, M14).
 */
function filedAs(record: SourceRecord, variable: string, label: string): void {
  if (record.variable !== variable) {
    throw new ContextForecastError(
      record.sourceId,
      `carries "${record.variable}" but was filed as the ${label} for "${variable}"`,
    );
  }
}

/** The ledger entry every admission is judged against. */
function entryOf(record: SourceRecord): SourceLedgerEntry {
  return getLedgerEntry(record.sourceId);
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
    // The outlook carries f107, kp and planetary_a under one issue time, so a
    // misfiled record would emit a flux number as Kp; an observation source
    // wearing forecast stamps would emit a measurement as a prediction.
    filedAs(record, variable, "driver");
    const admitted = admitRecord(entryOf(record), record, {
      role: "forecast",
    });
    if (options.mode === "offline" && record.origin !== "bundled") continue;
    if (!Number.isFinite(record.value)) continue;
    if (
      options.requireVerifiedArchive === true &&
      record.stamps.archiveClass !== "verified_as_issued"
    ) {
      continue;
    }
    // M14: driven only by forecasts actually issued at the prediction's issue
    // time, and only by ones this service already held.
    if (
      admitted.forecastIssuedMs > issued ||
      admitted.publishedMs > issued ||
      admitted.capturedMs > issued
    ) {
      continue;
    }
    placed.push({
      record,
      validFromMs: admitted.validity.fromMs,
      validToMs: admitted.validity.toMs,
      issuedMs: admitted.forecastIssuedMs,
      capturedMs: admitted.capturedMs,
    });
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
    if (best === null) {
      best = candidate;
      continue;
    }
    if (candidate.issuedMs !== best.issuedMs) {
      if (candidate.issuedMs > best.issuedMs) best = candidate;
      continue;
    }
    if (candidate.capturedMs !== best.capturedMs) {
      if (candidate.capturedMs > best.capturedMs) best = candidate;
      continue;
    }
    // Two bins issued and captured together cover the same sample. They are
    // equally current, so the same total order the census uses decides, rather
    // than the order the caller listed them in.
    if (preferredRecord(candidate.record, best.record) === candidate.record) {
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
 * Whether a bundled prior was available at `issuedAt` and describes `at`.
 *
 * A climatology is still a dated product. One bundled after the issue instant
 * could not have informed the prediction, and a monthly value says nothing
 * about the month after the one it covers, so both are absent rather than
 * approximated.
 */
function priorAppliesAt(
  prior: SourceRecord,
  admitted: Admitted,
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
  if (admitted.publishedMs > issued) return false;
  if (admitted.capturedMs > issued) return false;
  if (
    admitted.forecastIssuedMs !== null &&
    admitted.forecastIssuedMs > issued
  ) {
    return false;
  }
  // No stated validity means a value with no expiry, which is what a plain
  // climatology is. A stated one is honoured exactly.
  if (admitted.validity === null) return true;
  return at >= admitted.validity.fromMs && at < admitted.validity.toMs;
}

/**
 * Internal to this leaf. Its inputs are a `Selected` outcome and a mode it
 * cannot re-derive, so it is not exported from the barrel: `buildContextSnapshot`
 * is the public entry and its census is the only producer of these inputs.
 */
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
    ...(options.variables ?? []),
    ...Object.keys(options.forecasts),
    ...Object.keys(options.observations ?? {}),
    ...Object.keys(options.priors ?? {}),
  ]);

  // Every input is admitted before the grid is walked, so a caller bug is
  // reported whether or not a forecast happens to cover every sample, and the
  // observation a sample reads is checked once rather than never.
  const observationByVariable = new Map<string, SourceRecord>();
  for (const [variable, outcome] of Object.entries(
    options.observations ?? {},
  )) {
    if (outcome.state !== "selected") continue;
    filedAs(outcome.record, variable, "observation");
    admitRecord(entryOf(outcome.record), outcome.record, {
      role: "observation",
    });
    observationByVariable.set(variable, outcome.record);
  }

  const priorByVariable = new Map<
    string,
    { readonly record: SourceRecord; readonly admitted: Admitted }
  >();
  for (const [variable, prior] of Object.entries(options.priors ?? {})) {
    filedAs(prior, variable, "prior");
    const admitted = admitRecord(entryOf(prior), prior, { role: "bundled" });
    priorByVariable.set(variable, { record: prior, admitted });
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
      const observed = observationByVariable.get(variable);
      // M14: at the issue instant the observation is the state. One sample
      // later it is not, and nothing here extends it.
      if (index === 0 && observed !== undefined) {
        drivers[variable] = {
          origin: "observed_at_issue",
          value: observed.value,
          stamps: observed.stamps,
          sourceId: observed.sourceId,
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
      if (
        prior !== undefined &&
        priorAppliesAt(prior.record, prior.admitted, options, issued, at)
      ) {
        drivers[variable] = {
          origin: "climatological_prior",
          value: prior.record.value,
          stamps: prior.record.stamps,
          sourceId: prior.record.sourceId,
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
