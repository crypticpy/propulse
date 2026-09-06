import { z } from "zod";
import {
  equipmentInstanceSchema, equipmentModelSchema, evidenceSchema, experimentSchema,
  layoutSchema, locationSchema, operatingSelectionSchema, publicationSourceSchema,
  setupRevisionSchema, setupSchema, type DeepReadonly,
} from "@/lib/station/workbench/contracts";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";

const id = z.string().trim().min(1);
export const stationEntityKindSchema = z.enum([
  "model", "equipment", "evidence", "location", "setup", "revision",
  "layout", "experiment", "operating", "publication-source",
]);
export type StationEntityKind = z.infer<typeof stationEntityKindSchema>;

const headSchema = z.object({ kind: stationEntityKindSchema, id, versionId: id.nullable() }).strict();
const nextHeadSchema = headSchema.extend({ versionId: id });
export type StationHead = z.infer<typeof headSchema>;

function versioned<K extends StationEntityKind, S extends z.ZodTypeAny>(kind: K, body: S) {
  return z.object({ kind: z.literal(kind), id, versionId: id, body }).strict();
}
const recordSchema = z.discriminatedUnion("kind", [
  versioned("model", equipmentModelSchema),
  versioned("equipment", equipmentInstanceSchema),
  versioned("evidence", evidenceSchema),
  versioned("location", locationSchema),
  versioned("setup", setupSchema),
  versioned("revision", setupRevisionSchema),
  versioned("layout", layoutSchema),
  versioned("experiment", experimentSchema),
  versioned("operating", operatingSelectionSchema),
  versioned("publication-source", publicationSourceSchema),
]);
export type StationVersionedRecord = z.infer<typeof recordSchema>;

const draftObjectSchema = z.object({
  schemaVersion: z.literal(1), operationId: id, ownerId: id, generationId: id,
  createdAt: z.string().datetime({ offset: true }),
  expectedHeads: z.array(headSchema), records: z.array(recordSchema),
  nextHeads: z.array(nextHeadSchema),
  tombstones: z.array(z.object({ kind: stationEntityKindSchema, id, versionId: id, expectedVersionId: id }).strict()),
  setupDraftPreconditions: z.array(z.object({ setupId: id, revisionId: id.nullable() }).strict()),
}).strict();
type ParsedDraft = z.infer<typeof draftObjectSchema>;
const targetKey = (target: { kind: StationEntityKind; id: string }) => JSON.stringify([target.kind, target.id]);

/** Plain JSON preflight precedes Zod property access, and detaches even raw recovery
 * objects with own __proto__ keys. Never spread or read caller properties first. */
function detachedJson(input: unknown, ctx: z.RefinementCtx): unknown {
  try {
    return JSON.parse(canonicalWorkbenchJson(input));
  } catch (error) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "Operation requires plain JSON", fatal: true });
    return z.NEVER;
  }
}

function checkOperation(operation: ParsedDraft, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  const unique = <T extends { kind: StationEntityKind; id: string }>(items: T[], name: string): Map<string, T> => {
    const result = new Map<string, T>();
    items.forEach((item, index) => {
      const key = targetKey(item);
      if (result.has(key)) issue(`Duplicate ${name} target`, [name, index]);
      result.set(key, item);
      if (item.kind === "operating" && item.id !== "operating") issue("Operating singleton ID must be operating", [name, index, "id"]);
    });
    return result;
  };
  const expectations = unique(operation.expectedHeads, "expectedHeads");
  const records = unique(operation.records, "records");
  const nextHeads = unique(operation.nextHeads, "nextHeads");
  const tombstones = unique(operation.tombstones, "tombstones");
  const draftPreconditions = new Map<string, string | null>();
  operation.setupDraftPreconditions.forEach((precondition, index) => {
    if (draftPreconditions.has(precondition.setupId)) issue("Duplicate setup draft precondition", ["setupDraftPreconditions", index]);
    draftPreconditions.set(precondition.setupId, precondition.revisionId);
    const expectation = expectations.get(targetKey({ kind: "setup", id: precondition.setupId }));
    if (!expectation) issue("Setup draft precondition requires a storage head expectation", ["setupDraftPreconditions", index]);
    else if ((precondition.revisionId === null) !== (expectation.versionId === null)) issue("Setup draft absence must agree with storage head absence", ["setupDraftPreconditions", index]);
  });

  const writable = (kind: StationEntityKind, path: (string | number)[]) => {
    if (kind === "operating" || kind === "publication-source") issue("Operating and publication-source authoring require their separate owner gates", path);
  };
  operation.records.forEach((record, index) => {
    const path = ["records", index];
    writable(record.kind, path);
    if (record.kind !== "operating" && record.body.id !== record.id) issue("Record body ID must match its envelope", [...path, "body", "id"]);
    if (record.kind !== "model" && record.body.ownerId !== operation.ownerId) issue("Record body owner must match operation owner", [...path, "body", "ownerId"]);
    const next = nextHeads.get(targetKey(record));
    if (!next || next.versionId !== record.versionId) issue("Every record requires its matching next head", path);
    if (record.kind === "revision") {
      if (record.id !== record.versionId) issue("Immutable revision ID must equal its version ID", path);
      // Snapshot ownership is checkable without fetching live records. Cross-record
      // IDs, quantities/evidence and topology still require aggregate validation.
      record.body.equipment.forEach((item, itemIndex) => {
        if (item.ownerId !== operation.ownerId) issue("Pinned equipment owner mismatch", [...path, "body", "equipment", itemIndex, "ownerId"]);
      });
      record.body.evidence.forEach((item, itemIndex) => {
        if (item.ownerId !== operation.ownerId) issue("Pinned evidence owner mismatch", [...path, "body", "evidence", itemIndex, "ownerId"]);
      });
      if (record.body.location && record.body.location.ownerId !== operation.ownerId) issue("Pinned location owner mismatch", [...path, "body", "location", "ownerId"]);
      if (!draftPreconditions.has(record.body.setupId)) issue("Revision proposal requires its setup draft precondition", path);
      else if (record.body.parentRevisionId !== draftPreconditions.get(record.body.setupId)) issue("Revision parent must match its setup draft precondition", path);
    }
  });
  operation.nextHeads.forEach((next, index) => {
    const path = ["nextHeads", index];
    writable(next.kind, path);
    const key = targetKey(next);
    const expected = expectations.get(key);
    const record = records.get(key);
    if (!expected) issue("Changed head requires exactly one expectation", path);
    else if (next.versionId === expected.versionId) issue("Changed head requires a new version token", path);
    if (!record || record.versionId !== next.versionId) issue("Next head requires a matching submitted typed record", path);
    if (tombstones.has(key)) issue("A target cannot be advanced and tombstoned together", path);
    if (next.kind === "setup" && !draftPreconditions.has(next.id)) issue("Setup change requires its semantic draft precondition", path);
  });
  operation.tombstones.forEach((tombstone, index) => {
    const path = ["tombstones", index];
    writable(tombstone.kind, path);
    const expected = expectations.get(targetKey(tombstone));
    if (!expected || expected.versionId !== tombstone.expectedVersionId) issue("Tombstone expected token must match its head expectation", path);
    if (tombstone.versionId === tombstone.expectedVersionId) issue("Tombstone requires a new version token", path);
    if (tombstone.kind === "setup" && !draftPreconditions.has(tombstone.id)) issue("Setup deletion requires its semantic draft precondition", path);
  });
}

/** Structural operation validation only. Repository snapshot/reference checks,
 * ownership authorization, immutable collision detection and CAS are still required. */
export const stationOperationDraftSchema = z.preprocess(detachedJson, draftObjectSchema.superRefine(checkOperation));
export const stationOperationSchema = z.preprocess(detachedJson, draftObjectSchema.extend({
  payloadDigest: z.string().regex(/^[0-9a-f]{64}$/, "Digest must be lowercase SHA-256 hex"),
}).superRefine(checkOperation));
export type StationOperationDraft = z.infer<typeof stationOperationDraftSchema>;
export type StationOperation = z.infer<typeof stationOperationSchema>;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Normalize and detach an unsigned proposal, then hash that exact canonical body.
 * Run before opening a persistence transaction; no clock, IDs or IO are supplied. */
export async function prepareStationOperation(draft: unknown): Promise<DeepReadonly<StationOperation>> {
  const parsed = stationOperationDraftSchema.parse(draft);
  const payloadDigest = await digestWorkbenchJson(parsed);
  return freeze({ ...parsed, payloadDigest });
}

/** Verify signed data without silently normalizing its semantic content. Key
 * insertion order is irrelevant; trimmed IDs or stripped/changed bodies reject.
 * A digest establishes payload integrity, never account authorization or replay. */
export async function verifyStationOperation(input: unknown): Promise<DeepReadonly<StationOperation>> {
  const original = canonicalWorkbenchJson(input);
  const parsed = stationOperationSchema.parse(JSON.parse(original));
  if (canonicalWorkbenchJson(parsed) !== original) throw new TypeError("Signed operation must already have its schema-normalized canonical content");
  const { payloadDigest, ...draft } = parsed;
  if (await digestWorkbenchJson(draft) !== payloadDigest) throw new TypeError("Station operation digest mismatch");
  return freeze(parsed);
}
