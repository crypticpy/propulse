/** Synchronous domain validation for the repository's atomic write boundary.
 * Digest verification and immutable storage-version collision checks belong to
 * the surrounding repository. This module performs no storage or IO. */
import {
  parseWorkbenchArchive, type DeepReadonly, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import {
  stationOperationSchema, type StationEntityKind, type StationHead,
} from "@/lib/station/workbench/storage/operations";
import { prepareRevisionRestore, prepareSetupClone } from "@/lib/station/workbench/revisions/services";
import { canonicalWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

export interface StationStoredHead {
  kind: StationEntityKind;
  id: string;
  versionId: string;
  deleted: boolean;
}

export interface StationStateSnapshot {
  archive: DeepReadonly<WorkbenchArchive>;
  heads: readonly StationStoredHead[];
}

type ChangeResult =
  | { status: "ready"; archive: DeepReadonly<WorkbenchArchive> }
  | { status: "conflict"; actualHeads: StationHead[]; reason: string; candidateValidation: { status: "quarantined"; reason: "historical-validation-context-unavailable" } };

const key = (value: { kind: StationEntityKind; id: string }) => JSON.stringify([value.kind, value.id]);

/** Stable domain identities represented by an archive, including retained
 * revisions. An operating pin is a singleton; its body has no fabricated ID. */
export function stationArchiveIdentities(archive: DeepReadonly<WorkbenchArchive>): { kind: StationEntityKind; id: string }[] {
  return [
    ...archive.models.map(({ id }) => ({ kind: "model" as const, id })),
    ...archive.inventory.map(({ id }) => ({ kind: "equipment" as const, id })),
    ...archive.evidence.map(({ id }) => ({ kind: "evidence" as const, id })),
    ...archive.locations.map(({ id }) => ({ kind: "location" as const, id })),
    ...archive.setups.map(({ id }) => ({ kind: "setup" as const, id })),
    ...archive.revisions.map(({ id }) => ({ kind: "revision" as const, id })),
    ...archive.layouts.map(({ id }) => ({ kind: "layout" as const, id })),
    ...archive.experiments.map(({ id }) => ({ kind: "experiment" as const, id })),
    ...archive.publications.map(({ id }) => ({ kind: "publication-source" as const, id })),
    ...(archive.operating ? [{ kind: "operating" as const, id: "operating" }] : []),
  ];
}

function validateHeads(archive: DeepReadonly<WorkbenchArchive>, heads: readonly StationStoredHead[]): Map<string, StationStoredHead> {
  const identities = new Set(stationArchiveIdentities(archive).map(key));
  const result = new Map<string, StationStoredHead>();
  for (const head of heads) {
    if (!head.versionId || head.versionId.trim() !== head.versionId || typeof head.deleted !== "boolean" || result.has(key(head))) {
      throw new TypeError("Invalid or duplicate stored head");
    }
    if (head.deleted === identities.has(key(head))) throw new TypeError("Stored heads do not match the archive");
    if (head.kind === "revision" && (head.deleted || head.versionId !== head.id)) throw new TypeError("Retained revisions require their immutable live head");
    result.set(key(head), head);
  }
  if ([...identities].some((identity) => !result.has(identity))) throw new TypeError("Archive identity is missing its storage head");
  return result;
}

/** Must run against an archive/head snapshot read inside the write transaction.
 * A stale proposal is retained as an explicitly unvalidated, quarantined
 * alternative. Expected heads are not a complete historical validation context;
 * no candidate records become canonical history on this path. */
export function evaluateStationChange(snapshot: StationStateSnapshot, operationInput: unknown): ChangeResult {
  const operation = stationOperationSchema.parse(operationInput);
  const archive = parseWorkbenchArchive(snapshot.archive);
  if (operation.ownerId !== archive.ownerId) throw new TypeError("Operation owner does not match the repository snapshot");
  const heads = validateHeads(archive, snapshot.heads);
  // These invariants depend only on the proposal and retained immutable lineage,
  // not mutable current setup/equipment metadata. Invalid proposals cannot evade
  // them by including a stale CAS token.
  const setups = operation.records.filter((record) => record.kind === "setup");
  const revisions = operation.records.filter((record) => record.kind === "revision");
  if (operation.tombstones.some((target) => target.kind === "revision")) throw new TypeError("Ordinary operations retain revision history");
  for (const revision of revisions) {
    if (archive.revisions.some((stored) => stored.id === revision.id)) throw new TypeError("A retained revision identity cannot be replaced");
    const transition = revision.body.transition;
    if (!transition) throw new TypeError("New revisions require an explicit W03 transition");
    if (!setups.some((setup) => setup.id === revision.body.setupId && setup.body.draftRevisionId === revision.id)) {
      throw new TypeError("New revision requires the matching setup head advance");
    }
    const initial = transition.kind === "initial" || transition.kind === "clone";
    if (initial !== (revision.body.parentRevisionId === null)) throw new TypeError("Revision transition has an invalid parent requirement");
    if (revision.body.parentRevisionId !== null
      && archive.revisions.find((stored) => stored.id === revision.body.parentRevisionId)?.setupId !== revision.body.setupId) {
      throw new TypeError("Revision parent must reference retained lineage in the same setup");
    }
    if (transition.kind === "restore" || transition.kind === "clone") {
      const source = archive.revisions.find((stored) => stored.id === transition.sourceRevisionId);
      if (!source || (transition.kind === "restore" ? source.setupId !== revision.body.setupId : source.setupId === revision.body.setupId)) {
        throw new TypeError("Historical transition source has invalid retained lineage");
      }
    }
  }
  for (const setup of setups) {
    const expected = operation.setupDraftPreconditions.find((item) => item.setupId === setup.id)!;
    if (expected.revisionId !== setup.body.draftRevisionId
      && !revisions.some((revision) => revision.id === setup.body.draftRevisionId && revision.body.setupId === setup.id)) {
      throw new TypeError("Changing a draft requires a newly appended revision, not a historical head rewind");
    }
  }
  const candidateValidation = { status: "quarantined", reason: "historical-validation-context-unavailable" } as const;
  const actualHeads = operation.expectedHeads.map((expected) => ({
    kind: expected.kind, id: expected.id, versionId: heads.get(key(expected))?.versionId ?? null,
  }));
  if (actualHeads.some((actual, index) => actual.versionId !== operation.expectedHeads[index].versionId)) {
    return { status: "conflict", actualHeads, candidateValidation, reason: "Storage head changed since this operation was prepared" };
  }
  for (const precondition of operation.setupDraftPreconditions) {
    const actual = archive.setups.find((setup) => setup.id === precondition.setupId)?.draftRevisionId ?? null;
    if (actual !== precondition.revisionId) return { status: "conflict", actualHeads, candidateValidation, reason: "Setup draft changed since this operation was prepared" };
  }
  // Deletion is an explicit durable version, never a missing row. A stale edit
  // cannot recreate it; resurrection requires a separately reviewed protocol.
  for (const changed of [...operation.nextHeads, ...operation.tombstones]) {
    if (heads.get(key(changed))?.deleted) throw new TypeError("A tombstoned identity cannot be rewritten by an ordinary operation");
  }
  for (const revision of revisions) {
    const setup = setups.find((setup) => setup.id === revision.body.setupId && setup.body.draftRevisionId === revision.id)!;
    // Replay W03's historical copy semantics at the trusted boundary. Merely
    // naming a restore/clone source cannot authorize altered historical pins.
    const transition = revision.body.transition!;
    if (transition.kind === "restore" || transition.kind === "clone") {
      const source = archive.revisions.find((item) => item.id === transition.sourceRevisionId);
      if (!source) throw new TypeError("Historical transition source is missing");
      const mapping = (original: readonly { id: string }[], candidate: readonly { id: string }[]) => {
        if (original.length !== candidate.length) throw new TypeError("Clone must preserve the complete source graph");
        return Object.fromEntries(original.map((item, index) => [item.id, candidate[index].id]));
      };
      const expected = transition.kind === "restore"
        ? prepareRevisionRestore(archive, { setupId: setup.id, sourceRevisionId: source.id, revisionId: revision.id, expectedHead: revision.body.parentRevisionId, createdAt: revision.body.createdAt })
        : prepareSetupClone(archive, { setupId: setup.id, sourceRevisionId: source.id, revisionId: revision.id, name: setup.body.name, createdAt: revision.body.createdAt,
          idMap: { connections: mapping(source.connections, revision.body.connections), cableRuns: mapping(source.cableRuns, revision.body.cableRuns), routes: mapping(source.routes, revision.body.routes) },
        });
      if (canonicalWorkbenchJson(expected.revision) !== canonicalWorkbenchJson(revision.body)
        || canonicalWorkbenchJson(expected.setup) !== canonicalWorkbenchJson(setup.body)) {
        throw new TypeError("Historical transition must preserve W03 source pins and setup metadata");
      }
    }
  }
  for (const setup of setups) {
    const previous = archive.setups.find((stored) => stored.id === setup.id);
    if ((!previous || previous.draftRevisionId !== setup.body.draftRevisionId)
      && !revisions.some((revision) => revision.id === setup.body.draftRevisionId && revision.body.setupId === setup.id)) {
      throw new TypeError("Changing a draft requires a newly appended revision, not a historical head rewind");
    }
  }

  const next = structuredClone(archive) as WorkbenchArchive;
  const replace = <T extends { id: string }>(rows: T[], id: string, body?: T): T[] => {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return body === undefined ? rows : [...rows, body];
    return body === undefined ? rows.filter((row) => row.id !== id) : rows.map((row, position) => position === index ? body : row);
  };
  for (const record of operation.records) {
    switch (record.kind) {
      case "model": next.models = replace(next.models, record.id, record.body); break;
      case "equipment": next.inventory = replace(next.inventory, record.id, record.body); break;
      case "evidence": next.evidence = replace(next.evidence, record.id, record.body); break;
      case "location": next.locations = replace(next.locations, record.id, record.body); break;
      case "setup": next.setups = replace(next.setups, record.id, record.body); break;
      case "revision": next.revisions = [...next.revisions, record.body]; break;
      case "layout": next.layouts = replace(next.layouts, record.id, record.body); break;
      case "experiment": next.experiments = replace(next.experiments, record.id, record.body); break;
      default: throw new TypeError("Selection/publication writes require their owning package's gate");
    }
  }
  for (const target of operation.tombstones) {
    switch (target.kind) {
      case "model": next.models = replace(next.models, target.id); break;
      case "equipment": next.inventory = replace(next.inventory, target.id); break;
      case "evidence": next.evidence = replace(next.evidence, target.id); break;
      case "location": next.locations = replace(next.locations, target.id); break;
      case "setup": next.setups = replace(next.setups, target.id); break;
      case "layout": next.layouts = replace(next.layouts, target.id); break;
      case "experiment": next.experiments = replace(next.experiments, target.id); break;
      default: throw new TypeError("Retained history and reviewed selections cannot be tombstoned here");
    }
  }
  // Full field/evidence, owner, topology, lineage and reference closure checks.
  // A deletion that breaks retained references aborts; no record is dropped to
  // make a damaged archive pass validation.
  return { status: "ready", archive: parseWorkbenchArchive(next) };
}
