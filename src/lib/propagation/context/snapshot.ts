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
  inactiveBarrierAsOf,
  selectAsOf,
} from "@/lib/propagation/context/selection";
import {
  buildTrajectory,
  DEFAULT_GRID_HOURS,
} from "@/lib/propagation/context/trajectory";
import {
  ageSecondsAt,
  CONTEXT_SCHEMA_VERSION,
  instantMs,
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
  /** Every record the caller holds, keyed by ledger source id. */
  readonly histories: Readonly<Record<string, SourceHistory>>;
  /** As-issued forecast records, keyed by the variable they drive. */
  readonly forecasts: Readonly<Record<string, SourceHistory>>;
  /** Bundled climatological priors, keyed by variable. */
  readonly priors?: Readonly<Record<string, SourceRecord>>;
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

/** Deterministic serialization: object keys sorted, arrays in order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
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
function selectSource(
  sourceId: string,
  options: ContextSnapshotOptions,
): Record<string, Selected> {
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
  for (const variable of entry.variables) {
    const forVariable = history.filter(
      (record) => record.variable === variable,
    );
    outcomes[variable] =
      forVariable.length === 0
        ? { state: "absent", reason: "no_record_in_history" }
        : selectAsOf(forVariable, {
            issuedAt: options.issuedAt,
            entry,
            mode: options.mode,
            barrier,
            requireVerifiedArchive: options.requireVerifiedArchive,
          });
  }
  return outcomes;
}

export async function buildContextSnapshot(
  options: ContextSnapshotOptions,
): Promise<ContextSnapshot> {
  const { issuedAt, mode } = options;

  const selections = new Map<string, Record<string, Selected>>();
  for (const sourceId of CENSUS_SOURCE_IDS) {
    selections.set(sourceId, selectSource(sourceId, options));
  }

  const sources: Record<string, SnapshotEntry> = {};
  for (const [sourceId, outcomes] of selections) {
    const variables: Record<string, PublishedOutcome> = {};
    for (const [variable, outcome] of Object.entries(outcomes)) {
      variables[variable] = published(outcome);
    }

    // The source is dated by its newest selected record, and pinned by the
    // digest of every record it contributed, so a change in any one component
    // changes the source version and with it the context identity.
    const selectedRecords: SourceRecord[] = [];
    let representative: { record: SourceRecord; ageSeconds: number } | null =
      null;
    let excluded: {
      reason: ExclusionReason;
      latest: SourceRecord | null;
    } | null = null;
    let excludedAt = Number.NEGATIVE_INFINITY;

    for (const outcome of Object.values(outcomes)) {
      if (outcome.state === "selected") {
        selectedRecords.push(outcome.record);
        const at = instantMs(outcome.record.stamps.observedIntervalEndAt);
        if (
          representative === null ||
          at > instantMs(representative.record.stamps.observedIntervalEndAt)
        ) {
          representative = {
            record: outcome.record,
            ageSeconds: outcome.ageSeconds,
          };
        }
        continue;
      }
      if (outcome.state !== "excluded") continue;
      const at =
        outcome.latest === null
          ? Number.NEGATIVE_INFINITY
          : instantMs(outcome.latest.stamps.observedIntervalEndAt);
      if (excluded === null || at > excludedAt) {
        excluded = { reason: outcome.reason, latest: outcome.latest };
        excludedAt = at;
      }
    }

    if (representative !== null) {
      sources[sourceId] = {
        state: "selected",
        sourceId,
        variables,
        record: representative.record,
        ageSeconds: representative.ageSeconds,
        sourceVersion: `sha256:${await sha256Hex(canonical(selectedRecords))}`,
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
  for (const [sourceId, outcomes] of selections) {
    if (getLedgerEntry(sourceId).kind !== "observation") continue;
    for (const [variable, outcome] of Object.entries(outcomes)) {
      if (outcome.state !== "selected") continue;
      observations[variable] = outcome;
    }
  }

  const trajectory = buildTrajectory({
    issuedAt,
    hours: options.trajectoryHours ?? DEFAULT_GRID_HOURS,
    forecasts: options.forecasts,
    observations,
    priors: options.priors,
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
