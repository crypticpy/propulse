/**
 * PROP-05 immutable context snapshot (#951).
 *
 * One call, one instant, one frozen answer. `buildContextSnapshot` takes the
 * histories a caller holds and an `issuedAt`, and returns the census of what
 * was considered at that instant: which source was used, which was excluded
 * and why, which produced nothing at all, and the as-issued forecast
 * trajectory that follows from the same rule. Nothing in here reads a clock,
 * nothing mutates, and the result is deeply frozen, so two callers given the
 * same snapshot cannot see two different contexts.
 *
 * The identity is a digest of the census itself. A context whose mode changed,
 * or in which one source degraded, is a different context and gets a different
 * `contextId`, which is what stops a degraded run from quietly reusing a
 * healthy run's cached answer (M02, M24).
 */
import { deepFreeze } from "@/lib/propagation/contracts/validation";

import {
  DISABLED_CAPABILITIES,
  getLedgerEntry,
  LEDGER_SOURCE_IDS,
  LEDGER_VERSION,
  SOURCE_LEDGER,
} from "@/lib/propagation/context/ledger";
import {
  ContextVariableError,
  eligibleAsOf,
  inactiveBarrierAsOf,
  preferredRecord,
  selectAsOf,
} from "@/lib/propagation/context/selection";
import {
  buildTrajectory,
  DEFAULT_GRID_HOURS,
} from "@/lib/propagation/context/trajectory";
import {
  ageSecondsAt,
  canonicalJson as canonical,
  CONTEXT_SCHEMA_VERSION,
  type ContextSnapshot,
  type DatedRecord,
  type ExclusionReason,
  type Instant,
  type PublishedOutcome,
  type Selected,
  type SnapshotEntry,
  type SourceHistory,
  type SourceMode,
  type SourceRecord,
} from "@/lib/propagation/context/types";

/**
 * Every source the census reports on. A declared source that produced nothing
 * still gets an entry, because "we looked and there was nothing" and "we never
 * looked" are different facts and M11 requires the first to be visible.
 */
export const CENSUS_SOURCE_IDS: readonly string[] = LEDGER_SOURCE_IDS;

export interface ContextSnapshotOptions {
  readonly issuedAt: Instant;
  readonly mode: SourceMode;
  /**
   * Every record the caller holds, keyed by ledger source id.
   *
   * This is the only input. Observations, forecast bins and bundled priors all
   * arrive here and are censused together, so the trajectory is driven by the
   * same records `toEvidenceSources` reports on. There is no second channel a
   * record can reach the trajectory through, which is what makes the census and
   * the trajectory incapable of disagreeing (M24).
   */
  readonly histories: Readonly<Record<string, SourceHistory>>;
  readonly trajectoryHours?: number;
  readonly requireVerifiedArchive?: boolean;
}

export interface EvidenceSourceProjection {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly observedIntervalEndAt: Instant | null;
  readonly publishedAt: Instant | null;
  readonly capturedAt: Instant | null;
  readonly ageSeconds: number | null;
  readonly eligible: boolean;
  readonly exclusionReason: string | null;
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error(
      "WebCrypto SubtleCrypto is unavailable, so an immutable context identity cannot be formed; refusing to emit an unpinned snapshot (M24)",
    );
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The pinned version of one record.
 *
 * None of these producers publishes a version string, so there is nothing
 * upstream to quote. The digest of the record's own canonical serialization is
 * the honest substitute: it changes when any stamp or value changes, and two
 * runs over the same bytes produce the same pin (M24).
 */
async function sourceVersionOf(record: SourceRecord): Promise<string> {
  return `sha256:${await sha256Hex(canonical(record))}`;
}

function assumptionsFor(mode: SourceMode): readonly string[] {
  const captureBounded = Object.values(SOURCE_LEDGER)
    .filter((entry) => entry.archiveClass === "capture_bounded")
    .map((entry) => entry.sourceId);
  const verified = Object.values(SOURCE_LEDGER)
    .filter((entry) => entry.archiveClass === "verified_as_issued")
    .map((entry) => entry.sourceId);

  return [
    "M02 as-of: a record is eligible at issuedAt only when its observed interval end, its publication and its capture are all no later than issuedAt, in that causal order. A forecast may be valid in the future; it may not have been issued in the future.",
    "M11 freshness: a source outside its declared age bound is excluded from corrections and stays visible and dated. A source with no declared record is reported absent. No missing value is ever read as zero.",
    "M14 forecast: the trajectory is driven only by forecasts already issued at issuedAt, each on its producer's own cadence. No observation is held flat past the issue instant.",
    `Publication class: ${captureBounded.join(", ")} print no publication time, so their publication is bounded by the capture instant and they are labelled capture_bounded; ${verified.join(", ")} carry a printed issue time and are verified_as_issued.`,
    mode === "offline"
      ? "Mode offline: only bundled records are eligible, so observation residuals are excluded by rule rather than by connectivity."
      : `Mode ${mode}: connectivity is not eligibility; every record still passes the same as-of test.`,
    ...DISABLED_CAPABILITIES.map(
      (capability) =>
        `Disabled capability ${capability.id}: ${capability.reason} (owner: ${capability.owner})`,
    ),
  ];
}

/** The provenance of a record, without the number nobody may use (M11). */
function dated(record: SourceRecord): DatedRecord {
  const { value: _excludedValue, ...rest } = record;
  return rest;
}

function published(outcome: Selected): PublishedOutcome {
  if (outcome.state === "selected") {
    return {
      state: "selected",
      record: outcome.record,
      ageSeconds: outcome.ageSeconds,
    };
  }
  if (outcome.state === "excluded") {
    return {
      state: "excluded",
      reason: outcome.reason,
      latest: outcome.latest === null ? null : dated(outcome.latest),
    };
  }
  return { state: "absent", reason: "no_record_in_history" };
}

/**
 * Decide one source, one variable at a time.
 *
 * `magnetic_field` carries four components and `solar_wind` three. Selecting
 * once per source would keep whichever record happened to sort first and drop
 * the rest, so each declared variable gets its own history and its own answer.
 */
interface SourceCensus {
  /** The record a driver may read, one answer per declared variable. */
  readonly outcomes: Record<string, Selected>;
  /**
   * Every record of this source that passed the as-of test, not only the one
   * each variable settled on. A forecast product answers with a course rather
   * than a number, and its pin has to cover all of it.
   */
  readonly eligible: readonly SourceRecord[];
}

function selectSource(
  sourceId: string,
  options: ContextSnapshotOptions,
): SourceCensus {
  const entry = getLedgerEntry(sourceId);
  const history = options.histories[sourceId] ?? [];
  for (const record of history) {
    if (
      record.sourceId !== sourceId ||
      !entry.variables.includes(record.variable)
    ) {
      throw new ContextVariableError(record.sourceId, record.variable);
    }
  }
  const barrier = inactiveBarrierAsOf(history, { issuedAt: options.issuedAt });

  const outcomes: Record<string, Selected> = {};
  const eligible: SourceRecord[] = [];
  for (const variable of entry.variables) {
    const forVariable = history.filter(
      (record) => record.variable === variable,
    );
    if (forVariable.length === 0) {
      outcomes[variable] = { state: "absent", reason: "no_record_in_history" };
      continue;
    }
    const selectOptions = {
      issuedAt: options.issuedAt,
      entry,
      mode: options.mode,
      barrier,
      requireVerifiedArchive: options.requireVerifiedArchive,
    };
    outcomes[variable] = selectAsOf(forVariable, selectOptions);
    eligible.push(...eligibleAsOf(forVariable, selectOptions));
  }
  return { outcomes, eligible };
}

/**
 * The pin of a product that answered with more than one record.
 *
 * The digest covers every eligible record, sorted so it does not depend on the
 * order a caller happened to hand them in. A forecast course whose later bin
 * moved is a different product, and a reader comparing two pins has to be able
 * to see that even when the bin it reads today is unchanged (M24).
 */
async function versionOfAll(records: readonly SourceRecord[]): Promise<string> {
  const serialized = records.map((record) => canonical(record)).sort();
  return `sha256:${await sha256Hex(`[${serialized.join(",")}]`)}`;
}

export async function buildContextSnapshot(
  options: ContextSnapshotOptions,
): Promise<ContextSnapshot> {
  const { issuedAt, mode } = options;

  const selections = new Map<string, SourceCensus>();
  for (const sourceId of CENSUS_SOURCE_IDS) {
    selections.set(sourceId, selectSource(sourceId, options));
  }

  const sources: Record<string, SnapshotEntry> = {};
  for (const [sourceId, sourceCensus] of selections) {
    const { outcomes } = sourceCensus;
    const variables: Record<string, PublishedOutcome> = {};
    for (const [variable, outcome] of Object.entries(outcomes)) {
      variables[variable] = published(outcome);
    }

    // The source is dated by its newest selected record, and pinned by the
    // digest of every record it contributed, so a change in any one component
    // changes the source version and with it the context identity.
    let representative: { record: SourceRecord; ageSeconds: number } | null =
      null;
    let excluded: {
      reason: ExclusionReason;
      latest: SourceRecord | null;
    } | null = null;

    // Which variable speaks for a multi-variable source is decided by the same
    // total order selection uses, so listing the same records in another order
    // cannot change the representative or the identity that follows from it.
    for (const outcome of Object.values(outcomes)) {
      if (outcome.state === "selected") {
        if (
          representative === null ||
          preferredRecord(outcome.record, representative.record) ===
            outcome.record
        ) {
          representative = {
            record: outcome.record,
            ageSeconds: outcome.ageSeconds,
          };
        }
        continue;
      }
      if (outcome.state !== "excluded") continue;
      if (excluded === null) {
        excluded = { reason: outcome.reason, latest: outcome.latest };
        continue;
      }
      if (outcome.latest === null) continue;
      if (
        excluded.latest === null ||
        preferredRecord(outcome.latest, excluded.latest) === outcome.latest
      ) {
        excluded = { reason: outcome.reason, latest: outcome.latest };
      }
    }

    if (representative !== null) {
      sources[sourceId] = {
        state: "selected",
        sourceId,
        variables,
        record: representative.record,
        ageSeconds: representative.ageSeconds,
        sourceVersion: await versionOfAll(sourceCensus.eligible),
      };
      continue;
    }
    if (excluded !== null) {
      sources[sourceId] = {
        state: "excluded",
        sourceId,
        variables,
        reason: excluded.reason,
        latest: excluded.latest === null ? null : dated(excluded.latest),
        sourceVersion:
          excluded.latest === null
            ? "unknown"
            : await sourceVersionOf(excluded.latest),
      };
      continue;
    }
    sources[sourceId] = {
      state: "absent",
      sourceId,
      variables,
      reason: "no_record_in_history",
      sourceVersion: "unknown",
    };
  }

  // The observation a driver may use at horizon zero, keyed by the variable it
  // carries rather than by its source. Only a declared observation source may
  // fill it: a forecast record is a prediction whatever instant it was issued
  // at, and labelling one `observed_at_issue` would report a guess as a
  // measurement (M14).
  const observations: Record<string, Selected> = {};
  // As-issued forecast bins, and the bundled priors that stand where no
  // forecast speaks, both read out of the same census. A record the census
  // never saw has no way into the trajectory.
  const forecasts: Record<string, SourceRecord[]> = {};
  const priors: Record<string, SourceRecord> = {};
  for (const [sourceId, sourceCensus] of selections) {
    const { kind } = getLedgerEntry(sourceId);
    if (kind === "forecast") {
      for (const record of sourceCensus.eligible) {
        forecasts[record.variable] = [
          ...(forecasts[record.variable] ?? []),
          record,
        ];
      }
      continue;
    }
    for (const [variable, outcome] of Object.entries(sourceCensus.outcomes)) {
      if (outcome.state !== "selected") continue;
      if (kind === "observation") observations[variable] = outcome;
      if (kind === "bundled") priors[variable] = outcome.record;
    }
  }

  const trajectory = buildTrajectory({
    issuedAt,
    hours: options.trajectoryHours ?? DEFAULT_GRID_HOURS,
    // Every variable any declared source carries, so a driver whose only
    // product was excluded still appears on the grid saying absent and why,
    // rather than vanishing from it.
    variables: CENSUS_SOURCE_IDS.flatMap((sourceId) => [
      ...getLedgerEntry(sourceId).variables,
    ]),
    forecasts,
    observations,
    priors,
    mode,
    requireVerifiedArchive: options.requireVerifiedArchive,
  });

  const assumptions = assumptionsFor(mode);
  const census = {
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    issuedAt,
    mode,
    ledgerVersion: LEDGER_VERSION,
    sources,
    trajectory: trajectory.samples,
    bucketWindows: trajectory.buckets,
    assumptions,
  };

  return deepFreeze({
    ...census,
    contextId: `ctx:sha256:${await sha256Hex(canonical(census))}`,
  }) as ContextSnapshot;
}

/**
 * The PROP-04 `evidence.sources` projection of a snapshot.
 *
 * Every declared source appears exactly once, eligible or not, with the stamps
 * that decided it. An excluded source keeps its dated stamps instead of being
 * dropped, which is how a stale source stays visible without being used.
 */
export function toEvidenceSources(
  snapshot: ContextSnapshot,
): readonly EvidenceSourceProjection[] {
  return Object.values(snapshot.sources)
    .map((entry): EvidenceSourceProjection => {
      if (entry.state === "selected") {
        const { stamps } = entry.record;
        return {
          sourceId: entry.sourceId,
          sourceVersion: entry.sourceVersion,
          observedIntervalEndAt: stamps.observedIntervalEndAt,
          publishedAt: stamps.publication.publishedAt,
          capturedAt: stamps.capturedAt,
          ageSeconds: entry.ageSeconds,
          eligible: true,
          exclusionReason: null,
        };
      }
      const latest = entry.state === "excluded" ? entry.latest : null;
      return {
        sourceId: entry.sourceId,
        sourceVersion: entry.sourceVersion,
        observedIntervalEndAt: latest?.stamps.observedIntervalEndAt ?? null,
        publishedAt: latest?.stamps.publication.publishedAt ?? null,
        capturedAt: latest?.stamps.capturedAt ?? null,
        ageSeconds:
          latest === null
            ? null
            : ageSecondsAt(
                snapshot.issuedAt,
                latest.stamps.observedIntervalEndAt,
              ),
        eligible: false,
        exclusionReason: entry.reason,
      };
    })
    .sort((left, right) =>
      left.sourceId < right.sourceId
        ? -1
        : left.sourceId > right.sourceId
          ? 1
          : 0,
    );
}
