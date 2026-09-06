/** Internal W04 repository. Delivery bookkeeping is local only; activation, authenticated transport and UI integration remain separate gates. */
import { z } from "zod";
import type { IDBPTransaction, StoreNames } from "idb";
import {
  equipmentInstanceSchema, equipmentModelSchema, evidenceSchema, experimentSchema, layoutSchema,
  locationSchema, operatingSelectionSchema, publicationSourceSchema, setupRevisionSchema, setupSchema,
  parseWorkbenchArchive, type DeepReadonly, type WorkbenchArchive,
} from "@/lib/station/workbench/contracts";
import {
  ABSENT_POINTER_VERSION, openStationDatabase, StationDatabaseError,
  type AccountPointer, type StationDatabaseSchema, type StationDatabaseOptions, type StationDatabaseHandle,
  type RecordVersionRecord, type HeadRecord, type OperationRecord, type OutboxRecord,
} from "@/lib/station/workbench/storage/database";
import {
  stationEntityKindSchema, verifyStationOperation, stationOperationSchema, type StationOperation, type StationHead, type StationEntityKind,
} from "@/lib/station/workbench/storage/operations";
import { evaluateStationChange, stationArchiveIdentities, type StationStoredHead } from "@/lib/station/workbench/storage/state";
import {
  compareStationDeliveryResults, evaluateStationDeliveryGraph, parseStationDeliveryResult, stationDeliveryResultSchema,
  type StationDeliveryResult, type StationDeliveryGraph, type StationDeliveryReadiness,
} from "@/lib/station/workbench/storage/delivery";
import { readStationOutbox } from "@/lib/station/workbench/storage/outbox";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

const id = z.string().min(1).refine((value) => value.trim() === value, "Identity must be unpadded");
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const kind = stationEntityKindSchema;
const headSchema = z.object({ kind, id, versionId: id, deleted: z.boolean() }).strict();
const expectationSchema = z.object({ kind, id, versionId: id.nullable() }).strict();
const baseDescriptorSchema = expectationSchema.extend({ availability: z.enum(["absent", "available", "tombstone", "unavailable"]) }).strict();
const receiptSchema = z.object({
  ownerId: id, generationId: id, operationId: id, payloadDigest: digest,
  localSequence: z.number().int().positive().safe(), committedHeads: z.array(headSchema),
}).strict();
const conflictResultSchema = z.object({
  status: z.literal("conflict"), conflictId: id, operationId: id, localSequence: z.number().int().positive().safe(),
  actualHeads: z.array(expectationSchema), reason: z.string(),
  expectedBases: z.array(baseDescriptorSchema), actualBases: z.array(baseDescriptorSchema),
  candidateValidation: z.object({ status: z.literal("quarantined"), reason: z.literal("historical-validation-context-unavailable") }).strict(),
}).strict();
const versionSchema = z.object({ ownerId: id, generationId: id, kind, id, versionId: id, payloadDigest: digest, body: z.unknown() }).strict();
const storedHeadSchema = z.object({ ownerId: id, generationId: id, kind, id, versionId: id, tombstone: z.boolean() }).strict();
const operationRowSchema = z.object({
  ownerId: id, operationId: id, generationId: id, payloadDigest: digest, localSequence: z.number().int().positive().safe(),
  status: z.enum(["committed", "conflict"]), operation: z.unknown(), result: z.unknown(),
}).strict();
const outboxRowSchema = z.object({
  ownerId: id, operationId: id, generationId: id, localSequence: z.number().int().positive().safe(),
  state: z.enum(["pending", "acknowledged", "blocked", "conflicted"]), dependencyOperationIds: z.array(id), operation: z.unknown(),
}).strict();
const bodies = {
  model: equipmentModelSchema, equipment: equipmentInstanceSchema, evidence: evidenceSchema, location: locationSchema,
  setup: setupSchema, revision: setupRevisionSchema, layout: layoutSchema, experiment: experimentSchema,
  operating: operatingSelectionSchema, "publication-source": publicationSourceSchema,
};
const arrayNames = {
  model: "models", equipment: "inventory", evidence: "evidence", location: "locations", setup: "setups",
  revision: "revisions", layout: "layouts", experiment: "experiments", "publication-source": "publications",
} as const;
type StorageName = StoreNames<StationDatabaseSchema>;
type Transaction = IDBPTransaction<StationDatabaseSchema, StorageName[], "readonly" | "readwrite">;
const READ_STORES: StorageName[] = ["accountMeta", "generations", "heads", "recordVersions"];
const DELIVERY_STORES: StorageName[] = ["operations", "outbox", "deliveryResults", "conflicts", "recordVersions"];
const WRITE_STORES: StorageName[] = [...new Set([...READ_STORES, ...DELIVERY_STORES])];
const key = (item: { kind: StationEntityKind; id: string }) => JSON.stringify([item.kind, item.id]);
const versionKey = (item: { kind: StationEntityKind; id: string; versionId: string }) => JSON.stringify([item.kind, item.id, item.versionId]);
const prefix = (...parts: string[]) => IDBKeyRange.bound(parts, [...parts, []]);

function immutable<T>(input: T): DeepReadonly<T> {
  const copy = structuredClone(input);
  const freeze = (value: unknown) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  };
  freeze(copy);
  return copy as DeepReadonly<T>;
}
function damaged(message: string): never { throw new StationDatabaseError("recovery-required", message); }

/** Canonical validation of stored data is corruption evidence; operational IO
 * and cryptography failures outside this synchronous boundary are not. */
function storedCanonicalJson(input: unknown): string {
  try { return canonicalWorkbenchJson(input); }
  catch (error) { return damaged(error instanceof Error ? error.message : "Stored body is not canonical JSON"); }
}

export type StationCommitReceipt = z.infer<typeof receiptSchema>;
export type StationCommitResult =
  | { status: "committed" | "replayed"; receipt: StationCommitReceipt }
  | z.infer<typeof conflictResultSchema>
  | { status: "recovery-required" | "retry-required"; reason: string };
export type StationSnapshotResult =
  | { status: "ready"; pointer: AccountPointer; archive: DeepReadonly<WorkbenchArchive>; heads: StationStoredHead[]; localSequence: number }
  | { status: "legacy-active"; pointer: AccountPointer }
  | { status: "recovery-required"; reason: string };
export type StationDeliveryRecordResult =
  | { status: "recorded" | "replayed"; result: StationDeliveryResult }
  | { status: "retry-required"; reason: string };
export type StationCheckpoint = "after-reads" | "after-versions" | "after-heads" | "after-receipt" | "after-outbox"
  | "after-delivery-result" | "after-delivery-descendant";
export interface StationRepositoryOptions extends StationDatabaseOptions {
  /** Internal synchronous failure injection; production callers omit it. */
  testHooks?: { checkpoint: (checkpoint: StationCheckpoint) => void };
}
export interface StationRepository {
  readonly ownerId: string;
  readSnapshot(): Promise<DeepReadonly<StationSnapshotResult>>;
  commit(operation: unknown): Promise<DeepReadonly<StationCommitResult>>;
  /** Local bookkeeping only: caller must independently authenticate transport. */
  recordDeliveryResult(result: unknown): Promise<DeepReadonly<StationDeliveryRecordResult>>;
  /** A snapshot of readiness, not a sender lease or transport authorization. */
  readDeliveryReadiness(options: { generationId: string }): Promise<DeepReadonly<StationDeliveryReadiness[]>>;
  listOutbox(options: { generationId: string; limit: number }): Promise<DeepReadonly<OutboxRecord[]>>;
  close(): void;
}
export type StationRepositoryOpenResult =
  | { status: "ready"; repository: StationRepository }
  | { status: "unavailable" | "blocked" | "recovery-required"; reason: string };

async function readPointer(tx: Transaction, ownerId: string): Promise<AccountPointer> {
  const row = await tx.objectStore("accountMeta").get([ownerId, "active-pointer"]);
  if (row === undefined) return { generationId: null, versionId: ABSENT_POINTER_VERSION };
  const parsed = z.object({ ownerId: z.literal(ownerId), key: z.literal("active-pointer"), generationId: id.nullable(), versionId: id }).strict().parse(row);
  if (parsed.versionId === ABSENT_POINTER_VERSION) damaged("A stored pointer cannot reuse the absent sentinel");
  return { generationId: parsed.generationId, versionId: parsed.versionId };
}

async function readState(tx: Transaction, ownerId: string, pointer: AccountPointer) {
  if (pointer.generationId === null) throw new TypeError("Cannot load a legacy generation");
  const generationId = pointer.generationId;
  const [generation, rawHeads, rawVersions, sequence] = await Promise.all([
    tx.objectStore("generations").get([ownerId, generationId]),
    tx.objectStore("heads").getAll(prefix(ownerId, generationId)),
    tx.objectStore("recordVersions").getAll(prefix(ownerId, generationId)),
    tx.objectStore("accountMeta").get([ownerId, "local-sequence"]),
  ]);
  z.object({ ownerId: z.literal(ownerId), generationId: z.literal(generationId), state: z.literal("active"),
    schemaVersion: z.literal(1), createdAt: z.string().datetime({ offset: true }), sourceGenerationId: id.nullable(),
    sealDigest: digest.nullable(), manifest: z.unknown(),
  }).strict().parse(generation);
  const sequenceRow = z.object({ ownerId: z.literal(ownerId), key: z.literal("local-sequence"), value: z.number().int().nonnegative().safe() }).strict().parse(sequence);
  const versions = rawVersions.map((raw) => {
    const row = versionSchema.parse(raw);
    if (row.ownerId !== ownerId || row.generationId !== generationId) damaged("Stored version scope mismatch");
    const body = bodies[row.kind].parse(row.body);
    if (storedCanonicalJson(body) !== storedCanonicalJson(row.body)) damaged("Stored body is not canonical schema content");
    if ((row.kind !== "operating" && (!("id" in body) || body.id !== row.id))
      || (row.kind === "operating" && row.id !== "operating")
      || (row.kind !== "model" && (!("ownerId" in body) || body.ownerId !== ownerId))
      || (row.kind === "revision" && row.versionId !== row.id)) damaged("Stored version identity mismatch");
    return row as RecordVersionRecord;
  });
  const versionMap = new Map(versions.map((row) => [versionKey(row), row]));
  const headRows = rawHeads.map((row) => storedHeadSchema.parse(row));
  const heads: StationStoredHead[] = [];
  const archive = { schemaVersion: 1, ownerId, models: [], inventory: [], evidence: [], locations: [], setups: [], revisions: [], layouts: [], experiments: [], publications: [], operating: null } as WorkbenchArchive;
  for (const row of headRows) {
    if (row.ownerId !== ownerId || row.generationId !== generationId) damaged("Stored head scope mismatch");
    heads.push({ kind: row.kind, id: row.id, versionId: row.versionId, deleted: row.tombstone });
    const version = versionMap.get(versionKey(row));
    if (row.tombstone) {
      if (row.kind === "revision" || version || !versions.some((entry) => key(entry) === key(row))) damaged("Invalid retained tombstone");
      continue;
    }
    if (!version) damaged("A live head is missing its immutable version");
    if (row.kind === "operating") archive.operating = version.body as WorkbenchArchive["operating"];
    else (archive[arrayNames[row.kind]] as unknown[]).push(version.body);
  }
  // Every stored identity, including retained versions, needs its live or tombstoned head.
  const headKeys = new Set(heads.map(key));
  if (versions.some((row) => !headKeys.has(key(row)))) damaged("Stored version identity has no head");
  const parsed = parseWorkbenchArchive(archive);
  if (stationArchiveIdentities(parsed).length !== heads.filter((head) => !head.deleted).length) damaged("Archive and heads disagree");
  return { archive: parsed, heads, versions, localSequence: sequenceRow.value };
}

function committedHeads(operation: DeepReadonly<StationOperation>): StationStoredHead[] {
  return [
    ...operation.nextHeads.map((head) => ({ ...head, deleted: false })),
    ...operation.tombstones.map((head) => ({ kind: head.kind, id: head.id, versionId: head.versionId, deleted: true })),
  ];
}

function baseDescriptor({ kind, id, versionId, availability }: z.infer<typeof baseDescriptorSchema>) {
  return { kind, id, versionId, availability };
}

function boundReceipt(rowInput: OperationRecord): StationCommitReceipt {
  const row = operationRowSchema.parse(rowInput);
  const operation = stationOperationSchema.parse(row.operation);
  if (canonicalWorkbenchJson(operation) !== canonicalWorkbenchJson(row.operation)
    || operation.ownerId !== row.ownerId || operation.generationId !== row.generationId
    || operation.operationId !== row.operationId || operation.payloadDigest !== row.payloadDigest) damaged("Stored operation binding mismatch");
  const receipt = receiptSchema.parse(row.result);
  if (row.status !== "committed" || receipt.ownerId !== row.ownerId || receipt.operationId !== row.operationId || receipt.generationId !== row.generationId
    || receipt.payloadDigest !== row.payloadDigest || receipt.localSequence !== row.localSequence
    || canonicalWorkbenchJson(receipt.committedHeads) !== canonicalWorkbenchJson(committedHeads(operation))) damaged("Commit receipt binding mismatch");
  return receipt;
}

async function replay(tx: Transaction, rowInput: OperationRecord, operation: DeepReadonly<StationOperation>): Promise<StationCommitResult> {
  const row = operationRowSchema.parse(rowInput);
  if (row.ownerId !== operation.ownerId || row.operationId !== operation.operationId || row.generationId !== operation.generationId
    || row.payloadDigest !== operation.payloadDigest || canonicalWorkbenchJson(row.operation) !== canonicalWorkbenchJson(operation)) {
    throw new TypeError("Operation ID was already used with a different payload or generation");
  }
  if (row.status === "conflict") {
    const result = conflictResultSchema.parse(row.result);
    const conflict = await tx.objectStore("conflicts").get([row.ownerId, row.generationId, row.operationId]);
    const details = z.object({ operation: z.unknown(), reason: z.string(), candidateValidation: conflictResultSchema.shape.candidateValidation,
      expectedBases: z.array(baseDescriptorSchema.extend({ body: z.unknown() }).strict()),
      actualBases: z.array(baseDescriptorSchema.extend({ body: z.unknown() }).strict()),
    }).strict().parse(conflict?.details);
    if (!conflict || conflict.ownerId !== row.ownerId || conflict.generationId !== row.generationId || conflict.conflictId !== row.operationId
      || conflict.operationId !== row.operationId || conflict.createdAt !== operation.createdAt
      || result.conflictId !== row.operationId || result.operationId !== row.operationId || result.localSequence !== row.localSequence
      || canonicalWorkbenchJson(details.operation) !== canonicalWorkbenchJson(operation)
      || details.reason !== result.reason || canonicalWorkbenchJson(details.candidateValidation) !== canonicalWorkbenchJson(result.candidateValidation)
      || canonicalWorkbenchJson(details.expectedBases.map(baseDescriptor)) !== canonicalWorkbenchJson(result.expectedBases)
      || canonicalWorkbenchJson(details.actualBases.map(baseDescriptor)) !== canonicalWorkbenchJson(result.actualBases)
      || canonicalWorkbenchJson(details.expectedBases.map(({ kind, id, versionId }) => ({ kind, id, versionId }))) !== canonicalWorkbenchJson(operation.expectedHeads)
      || canonicalWorkbenchJson(details.actualBases.map(({ kind, id, versionId }) => ({ kind, id, versionId }))) !== canonicalWorkbenchJson(result.actualHeads)) damaged("Conflict receipt binding mismatch");
    if (result.actualHeads.length !== operation.expectedHeads.length
      || result.actualHeads.some((head, index) => key(head) !== key(operation.expectedHeads[index]))) damaged("Conflict targets do not match the operation");
    for (const base of [...details.expectedBases, ...details.actualBases]) {
      if (base.availability === "available") {
        if (base.versionId === null || base.body === null) damaged("Available conflict base is incomplete");
        const retained = await tx.objectStore("recordVersions").get([row.ownerId, row.generationId, base.kind, base.id, base.versionId!]);
        if (!retained || canonicalWorkbenchJson(retained.body) !== canonicalWorkbenchJson(base.body)) damaged("Conflict base differs from retained version");
      } else if (base.body !== null || ((base.availability === "absent") !== (base.versionId === null))) {
        damaged("Conflict base availability is inconsistent");
      }
    }
    return result;
  }
  return { status: "replayed", receipt: boundReceipt(rowInput) };
}

function deliveryOutboxState(status: StationDeliveryReadiness["status"]): OutboxRecord["state"] {
  return status === "acknowledged" ? "acknowledged" : status === "conflicted" ? "conflicted"
    : status === "rejected" || status === "blocked" ? "blocked" : "pending";
}

/** Read the complete retained generation, including acknowledged prerequisites.
 * Queue rows are audited against permanent receipts; no prior dependency list
 * or envelope is repaired or regenerated. Hashing follows transaction completion. */
async function readDependencies(tx: Transaction, ownerId: string, generationId: string) {
  const [rawOperations, rawOutbox, rawResults] = await Promise.all([
    tx.objectStore("operations").index("by-sequence").getAll(prefix(ownerId, generationId)),
    tx.objectStore("outbox").index("by-state-sequence").getAll(prefix(ownerId, generationId)),
    tx.objectStore("deliveryResults").index("by-generation").getAll([ownerId, generationId]),
  ]);
  const operations = rawOperations.map((row): OperationRecord => {
    const parsed = operationRowSchema.parse(row);
    return { ...parsed, operation: parsed.operation, result: parsed.result };
  });
  const outbox = rawOutbox.map((row): OutboxRecord => {
    const parsed = outboxRowSchema.parse(row);
    return { ...parsed, operation: parsed.operation };
  });
  const results = rawResults.map((row) => stationDeliveryResultSchema.parse(row));
  const graph: StationDeliveryGraph = { ownerId, generationId, operations: [] };
  const operationIds = new Set(operations.map((row) => row.operationId));
  if (outbox.length !== operations.length || outbox.some((row) => !operationIds.has(row.operationId))
    || results.some((row) => !operationIds.has(row.operationId))) damaged("Delivery ledger has an orphan or missing operation/outbox receipt");
  const sequences = new Set<number>();
  for (const row of operations) {
    const queue = outbox.find((candidate) => candidate.operationId === row.operationId);
    if (!queue || row.ownerId !== ownerId || row.generationId !== generationId
      || queue.ownerId !== ownerId || queue.generationId !== generationId
      || queue.localSequence !== row.localSequence
      || canonicalWorkbenchJson(queue.operation) !== canonicalWorkbenchJson(row.operation)) damaged("Outbox operation receipt binding mismatch");
    if (sequences.has(row.localSequence)) damaged("Duplicate delivery operation sequence");
    sequences.add(row.localSequence);
    const operation = stationOperationSchema.parse(row.operation);
    await replay(tx, row, operation);
    const receiptHeads = row.status === "committed" ? boundReceipt(row).committedHeads : [];
    const terminalResult = results.find((result) => result.operationId === row.operationId) ?? null;
    // A malformed generation on an owner-global terminal key must not vanish
    // behind the generation index and make the operation appear unsent.
    if (terminalResult === null && await tx.objectStore("deliveryResults").get([ownerId, row.operationId]) !== undefined) {
      damaged("Delivery result scope mismatch");
    }
    graph.operations.push({ ownerId, generationId, operationId: row.operationId, payloadDigest: row.payloadDigest,
      committedHeads: receiptHeads, localStatus: row.status, dependencyOperationIds: queue.dependencyOperationIds,
      terminalResult });
  }
  const referencesHead = (operation: StationOperation, prior: StationDeliveryGraph["operations"][number]) => prior.committedHeads.some((head) =>
    operation.expectedHeads.some((expected) => key(head) === key(expected) && head.versionId === expected.versionId));
  // Bind persisted dependency edges back to the signed head preconditions.
  // Older writers omitted already-acknowledged prerequisites; that omission
  // is safe only while the immutable accepted result is retained and verified.
  for (const [index, node] of graph.operations.entries()) {
    const operation = stationOperationSchema.parse(operations[index].operation);
    for (const dependencyId of node.dependencyOperationIds) {
      const dependencyIndex = operations.findIndex((row) => row.operationId === dependencyId);
      if (dependencyIndex === -1) damaged("Missing delivery dependency");
      const predecessor = graph.operations[dependencyIndex];
      if (operations[dependencyIndex].localSequence >= operations[index].localSequence
        || predecessor.localStatus !== "committed" || !referencesHead(operation, predecessor)) damaged("Delivery dependency does not match an earlier committed head precondition");
    }
    for (const [priorIndex, predecessor] of graph.operations.entries()) {
      if (operations[priorIndex].localSequence < operations[index].localSequence && predecessor.localStatus === "committed"
        && referencesHead(operation, predecessor) && !node.dependencyOperationIds.includes(predecessor.operationId)
        && predecessor.terminalResult?.outcome !== "accepted") damaged("Missing required delivery dependency for a retained head precondition");
    }
  }
  const readiness = evaluateStationDeliveryGraph(graph);
  for (const node of readiness) {
    if (outbox.find((row) => row.operationId === node.operationId)!.state !== deliveryOutboxState(node.status)) damaged("Outbox delivery state disagrees with terminal results and dependency graph");
  }
  return { outbox, operations, results, graph, readiness };
}

/** Hash retained bodies after a readonly snapshot, then compare the exact audited
 * state inside the write transaction. No WebCrypto awaits occur during writes. */
function createRepository(db: StationDatabaseHandle, hooks: StationRepositoryOptions["testHooks"]): StationRepository {
  const ownerId = db.ownerId;
  const checkpoint = (point: StationCheckpoint) => {
    const result: unknown = hooks?.checkpoint(point);
    if (result !== undefined) throw new TypeError("Failure-injection hooks must be synchronous and return void");
  };
  return Object.freeze({
    ownerId,
    close: () => db.close(),
    async readSnapshot(): Promise<DeepReadonly<StationSnapshotResult>> {
      const tx = db.transaction<StorageName[], "readonly">(READ_STORES, "readonly");
      try {
        const pointer = await readPointer(tx, ownerId);
        if (pointer.generationId === null) { await tx.done; return immutable({ status: "legacy-active", pointer }); }
        const state = await readState(tx, ownerId, pointer);
        await tx.done;
        if ((await Promise.all(state.versions.map(async (row) => await digestWorkbenchJson(row.body) === row.payloadDigest))).some((valid) => !valid)) damaged("Stored body digest mismatch");
        // Check lifecycle after asynchronous hashing, without reading a new snapshot.
        const check = db.transaction("accountMeta", "readonly");
        await check.done;
        return immutable({ status: "ready", pointer, archive: state.archive, heads: state.heads, localSequence: state.localSequence });
      } catch (error) {
        await tx.done.catch(() => undefined);
        // Aborting an in-flight read surfaces AbortError. Probe the bound handle
        // after settlement so lifecycle invalidation is not reported as corruption.
        const check = db.transaction("accountMeta", "readonly");
        await check.done;
        if (error instanceof z.ZodError || (error instanceof StationDatabaseError && error.code === "recovery-required")) {
          return immutable({ status: "recovery-required", reason: error.message });
        }
        // An open handle can still encounter transient transaction/request or
        // cryptography errors. Propagate those; they do not establish corruption.
        throw error;
      }
    },
    async commit(input: unknown): Promise<DeepReadonly<StationCommitResult>> {
      const operation = await verifyStationOperation(input);
      if (operation.ownerId !== ownerId) throw new TypeError("Operation owner does not match the bound repository");
      const bodyDigests = new Map(await Promise.all(operation.records.map(async (record) => [versionKey(record), await digestWorkbenchJson(record.body)] as const)));
      // A concurrent writer can advance state while WebCrypto runs. Retry a
      // bounded number of exact audits; contention is not damaged storage.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const audit = db.transaction<StorageName[], "readonly">(WRITE_STORES, "readonly");
        let auditedState: string;
        try {
          const prior = await audit.objectStore("operations").get([ownerId, operation.operationId]);
          if (prior) { const result = await replay(audit, prior, operation); await audit.done; return immutable(result); }
          const pointer = await readPointer(audit, ownerId);
          if (pointer.generationId !== operation.generationId) { await audit.done; return immutable({ status: "recovery-required", reason: "Operation does not target the active generation" }); }
          const state = await readState(audit, ownerId, pointer);
          const dependencies = await readDependencies(audit, ownerId, operation.generationId);
          await audit.done;
          await Promise.all(dependencies.operations.map((row) => verifyStationOperation(row.operation)));
          if ((await Promise.all(state.versions.map(async (row) => await digestWorkbenchJson(row.body) === row.payloadDigest))).some((valid) => !valid)) damaged("Stored body digest mismatch");
          auditedState = canonicalWorkbenchJson({ state, dependencies });
        } catch (error) {
          await audit.done.catch(() => undefined);
          throw error;
        }
        const tx = db.transaction<StorageName[], "readwrite">(WRITE_STORES, "readwrite");
        try {
          const prior = await tx.objectStore("operations").get([ownerId, operation.operationId]);
          if (prior) { const result = await replay(tx, prior, operation); await tx.done; return immutable(result); }
          const pointer = await readPointer(tx, ownerId);
          if (pointer.generationId !== operation.generationId) { await tx.done; return immutable({ status: "recovery-required", reason: "Operation does not target the active generation" }); }
          const state = await readState(tx, ownerId, pointer);
          const dependencySnapshot = await readDependencies(tx, ownerId, operation.generationId);
          if (canonicalWorkbenchJson({ state, dependencies: dependencySnapshot }) !== auditedState) {
            tx.abort();
            await tx.done.catch(() => undefined);
            continue;
          }
          checkpoint("after-reads");
          for (const record of operation.records) {
            // A fresh operation requires a fresh token even when its body matches
            // history. Reusing a token would rewind CAS and outbox dependency identity.
            // Exact operation replay has already returned above this boundary.
            if (state.versions.some((row) => versionKey(row) === versionKey(record))
              || state.heads.some((head) => versionKey(head) === versionKey(record))) {
              throw new TypeError("Immutable storage version collision");
            }
          }
          for (const tombstone of operation.tombstones) {
            if (state.versions.some((row) => versionKey(row) === versionKey(tombstone))) throw new TypeError("Tombstone token collides with a retained body");
            if (state.heads.some((head) => versionKey(head) === versionKey(tombstone))) throw new TypeError("Tombstone token was already used");
          }
          const change = evaluateStationChange(state, operation);
          const sequence = state.localSequence + 1;
          if (!Number.isSafeInteger(sequence)) damaged("Local operation sequence is exhausted");
          const previousOutbox = dependencySnapshot.outbox;
          const dependencies: string[] = [];
          for (const pending of previousOutbox.filter((row) => row.generationId === operation.generationId).sort((a, b) => a.localSequence - b.localSequence)) {
            const previous = dependencySnapshot.operations.find((row) => row.operationId === pending.operationId);
            if (!previous || pending.ownerId !== ownerId || previous.ownerId !== ownerId || previous.generationId !== operation.generationId
              || previous.operationId !== pending.operationId || previous.localSequence !== pending.localSequence
              || canonicalWorkbenchJson(previous.operation) !== canonicalWorkbenchJson(pending.operation)) damaged("Outbox operation receipt is missing or inconsistent");
            operationRowSchema.parse(previous);
            if (previous.status !== "committed") continue;
            const receipt = boundReceipt(previous);
            if (receipt.committedHeads.some((head) => operation.expectedHeads.some((expected) => key(head) === key(expected) && head.versionId === expected.versionId))) dependencies.push(pending.operationId);
          }
          let result: StationCommitResult;
          let storedResult: unknown;
          if (change.status === "conflict") {
            const conflictId = operation.operationId;
            const bases = (heads: readonly StationHead[]) => heads.map((head) => {
              const record = head.versionId === null ? undefined : state.versions.find((row) => versionKey(row) === versionKey({ ...head, versionId: head.versionId! }));
              const deleted = state.heads.some((row) => key(row) === key(head) && row.versionId === head.versionId && row.deleted);
              const availability: z.infer<typeof baseDescriptorSchema>["availability"] = head.versionId === null ? "absent" : record ? "available" : deleted ? "tombstone" : "unavailable";
              return { ...head, availability, body: record?.body ?? null };
            });
            const expectedBases = bases(operation.expectedHeads);
            const actualBases = bases(change.actualHeads);
            result = { status: "conflict", conflictId, operationId: operation.operationId, localSequence: sequence, actualHeads: change.actualHeads, reason: change.reason, candidateValidation: change.candidateValidation,
              expectedBases: expectedBases.map(baseDescriptor), actualBases: actualBases.map(baseDescriptor) };
            storedResult = result;
            await tx.objectStore("conflicts").add({ ownerId, generationId: operation.generationId, conflictId, state: "unresolved", operationId: operation.operationId, createdAt: operation.createdAt, resolutionOperationId: null,
              details: { operation, reason: change.reason, candidateValidation: change.candidateValidation, expectedBases, actualBases } });
          } else {
            for (const record of operation.records) {
              await tx.objectStore("recordVersions").add({ ownerId, generationId: operation.generationId, ...record, payloadDigest: bodyDigests.get(versionKey(record))! } as RecordVersionRecord);
            }
            checkpoint("after-versions");
            const advancedHeads = committedHeads(operation);
            for (const head of advancedHeads) await tx.objectStore("heads").put({ ownerId, generationId: operation.generationId, kind: head.kind, id: head.id, versionId: head.versionId, tombstone: head.deleted } satisfies HeadRecord);
            checkpoint("after-heads");
            const receipt: StationCommitReceipt = { ownerId, generationId: operation.generationId, operationId: operation.operationId, payloadDigest: operation.payloadDigest, localSequence: sequence, committedHeads: advancedHeads };
            result = { status: "committed", receipt };
            storedResult = receipt;
          }
          await tx.objectStore("accountMeta").put({ ownerId, key: "local-sequence", value: sequence });
          await tx.objectStore("operations").add({ ownerId, generationId: operation.generationId, operationId: operation.operationId, payloadDigest: operation.payloadDigest, localSequence: sequence,
            status: change.status === "conflict" ? "conflict" : "committed", operation, result: storedResult });
          checkpoint("after-receipt");
          const blocked = dependencies.some((dependency) => dependencySnapshot.readiness.some((node) => node.operationId === dependency
            && (node.status === "rejected" || node.status === "blocked" || node.status === "conflicted")));
          await tx.objectStore("outbox").add({ ownerId, generationId: operation.generationId, operationId: operation.operationId, localSequence: sequence,
            state: change.status === "conflict" ? "conflicted" : blocked ? "blocked" : "pending", dependencyOperationIds: dependencies, operation });
          checkpoint("after-outbox");
          await tx.done;
          return immutable(result);
        } catch (error) {
          try { tx.abort(); } catch { /* A failed transaction may already be aborted. */ }
          await tx.done.catch(() => undefined);
          throw error;
        }
      }
      return immutable({ status: "retry-required", reason: "Station changed repeatedly during integrity verification; retry the same operation" });
    },
    async recordDeliveryResult(input: unknown): Promise<DeepReadonly<StationDeliveryRecordResult>> {
      const incoming = parseStationDeliveryResult(input);
      if (incoming.ownerId !== ownerId) throw new TypeError("Delivery owner does not match the bound repository");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const audit = db.transaction<StorageName[], "readonly">(DELIVERY_STORES, "readonly");
        let audited: string;
        try {
          const snapshot = await readDependencies(audit, ownerId, incoming.generationId);
          await audit.done;
          await Promise.all(snapshot.operations.map((row) => verifyStationOperation(row.operation)));
          audited = canonicalWorkbenchJson(snapshot);
        } catch (error) {
          await audit.done.catch(() => undefined);
          throw error;
        }
        const tx = db.transaction<StorageName[], "readwrite">(DELIVERY_STORES, "readwrite");
        try {
          const snapshot = await readDependencies(tx, ownerId, incoming.generationId);
          if (canonicalWorkbenchJson(snapshot) !== audited) {
            tx.abort();
            await tx.done.catch(() => undefined);
            continue;
          }
          const target = snapshot.graph.operations.find((node) => node.operationId === incoming.operationId);
          if (!target) throw new TypeError("Delivery operation is missing from the bound generation");
          if (target.localStatus !== "committed") throw new TypeError("A local conflict cannot receive a terminal delivery result");
          const { dependencyOperationIds: _dependencies, localStatus: _status, terminalResult: previous, ...binding } = target;
          void _dependencies; void _status;
          const outcome = compareStationDeliveryResults(previous, incoming, binding);
          // Evaluate before writing: an acceptance cannot skip prerequisites.
          target.terminalResult = stationDeliveryResultSchema.parse(outcome.result);
          const readiness = evaluateStationDeliveryGraph(snapshot.graph);
          if (outcome.status === "recorded") {
            await tx.objectStore("deliveryResults").add(target.terminalResult);
            checkpoint("after-delivery-result");
            for (const node of readiness) {
              const row = snapshot.outbox.find((candidate) => candidate.operationId === node.operationId)!;
              const state = deliveryOutboxState(node.status);
              if (row.state === state) continue;
              await tx.objectStore("outbox").put({ ...row, state });
              checkpoint("after-delivery-descendant");
            }
          }
          await tx.done;
          return immutable(outcome);
        } catch (error) {
          try { tx.abort(); } catch { /* The request may have already aborted. */ }
          await tx.done.catch(() => undefined);
          throw error;
        }
      }
      return immutable({ status: "retry-required", reason: "Delivery graph changed repeatedly during integrity verification; retry the same result" });
    },
    async readDeliveryReadiness(options: { generationId: string }): Promise<DeepReadonly<StationDeliveryReadiness[]>> {
      const request = z.object({ generationId: id }).strict().parse(options);
      const tx = db.transaction<StorageName[], "readonly">(DELIVERY_STORES, "readonly");
      try {
        const snapshot = await readDependencies(tx, ownerId, request.generationId);
        await tx.done;
        await Promise.all(snapshot.operations.map((row) => verifyStationOperation(row.operation)));
        // Check owner-handle lifecycle after hashing without replacing the snapshot.
        const check = db.transaction("accountMeta", "readonly");
        await check.done;
        return immutable(snapshot.readiness);
      } catch (error) {
        await tx.done.catch(() => undefined);
        throw error;
      }
    },
    async listOutbox(options: { generationId: string; limit: number }): Promise<DeepReadonly<OutboxRecord[]>> {
      const request = z.object({ generationId: id, limit: z.number().int().positive().max(0xffff_ffff) }).strict().parse(options);
      const tx = db.transaction<StorageName[], "readonly">(["outbox", "operations", "conflicts", "recordVersions"], "readonly");
      let selected: z.infer<typeof outboxRowSchema>[];
      try {
        const rows = await readStationOutbox(tx.objectStore("outbox"), { ownerId, ...request });
        selected = rows.map((row) => outboxRowSchema.parse(row));
        for (const row of selected) {
          const stored = await tx.objectStore("operations").get([ownerId, row.operationId]);
          if (!stored || row.ownerId !== ownerId || row.generationId !== request.generationId
            || stored.ownerId !== ownerId || stored.generationId !== row.generationId || stored.operationId !== row.operationId
            || stored.localSequence !== row.localSequence || canonicalWorkbenchJson(stored.operation) !== canonicalWorkbenchJson(row.operation)) damaged("Outbox operation receipt is missing or inconsistent");
          // Validate receipts against this same readonly snapshot. Hash the bound
          // operation only after completion; never trust a standalone queue envelope.
          await replay(tx, stored, stationOperationSchema.parse(row.operation));
        }
        await tx.done;
      } catch (error) {
        await tx.done.catch(() => undefined);
        throw error;
      }
      for (const row of selected) {
        const operation = await verifyStationOperation(row.operation);
        if (row.ownerId !== ownerId || operation.ownerId !== ownerId || operation.generationId !== row.generationId || operation.operationId !== row.operationId) damaged("Outbox operation binding mismatch");
      }
      const check = db.transaction("accountMeta", "readonly");
      await check.done;
      return immutable(selected.map((row) => ({ ...row, operation: row.operation })));
    },
  });
}

export async function openStationRepository(options: StationRepositoryOptions): Promise<StationRepositoryOpenResult> {
  const hooks = options.testHooks;
  const result = await openStationDatabase(options);
  return result.status === "ready" ? { status: "ready", repository: createRepository(result.database, hooks) } : result;
}
