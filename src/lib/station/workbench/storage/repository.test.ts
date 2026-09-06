import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExperimentFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import { type WorkbenchArchive } from "@/lib/station/workbench/contracts";
import { prepareRevision, prepareRevisionRestore } from "@/lib/station/workbench/revisions/services";
import { openStationDatabase, type StationDatabaseHandle, type RecordVersionRecord } from "@/lib/station/workbench/storage/database";
import { prepareStationOperation, type StationEntityKind } from "@/lib/station/workbench/storage/operations";
import type { StationDeliveryResult } from "@/lib/station/workbench/storage/delivery";
import { canonicalWorkbenchJson, digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";
import { openStationRepository, type StationRepositoryOptions, type StationRepository, type StationCheckpoint } from "@/lib/station/workbench/storage/repository";

const handles: { close(): void }[] = [];
const generationId = "generation-a";
const initial = (kind: StationEntityKind, id: string) => kind === "revision" ? id : `initial:${kind}:${id}`;
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { handles.splice(0).forEach((handle) => handle.close()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function database(factory: IDBFactory, ownerId = FIXTURE_OWNER) {
  const result = await openStationDatabase({ indexedDB: factory, ownerId });
  if (result.status !== "ready") throw new Error(result.reason);
  handles.push(result.database);
  return result.database;
}
async function repository(factory: IDBFactory, options: Partial<StationRepositoryOptions> = {}) {
  const result = await openStationRepository({ indexedDB: factory, ownerId: FIXTURE_OWNER, ...options });
  if (result.status !== "ready") throw new Error(result.reason);
  handles.push(result.repository);
  return result.repository;
}
// This test-only seeding bypasses activation intentionally. No production API creates an active generation.
async function seed(db: StationDatabaseHandle, archive = createExperimentFixture(), generation = generationId) {
  const collections = {
    model: archive.models, equipment: archive.inventory, evidence: archive.evidence, location: archive.locations,
    setup: archive.setups, revision: archive.revisions, layout: archive.layouts, experiment: archive.experiments,
    "publication-source": archive.publications, operating: archive.operating ? [archive.operating] : [],
  };
  const records: RecordVersionRecord[] = [];
  for (const [kind, bodies] of Object.entries(collections)) for (const body of bodies) {
    const id = "id" in body ? body.id : "operating";
    records.push({ ownerId: db.ownerId, generationId: generation, kind: kind as StationEntityKind, id,
      versionId: initial(kind as StationEntityKind, id), body, payloadDigest: await digestWorkbenchJson(body) });
  }
  const tx = db.transaction(["accountMeta", "generations", "recordVersions", "heads"], "readwrite");
  await tx.objectStore("generations").add({ ownerId: db.ownerId, generationId: generation, state: "active", schemaVersion: 1,
    createdAt: FIXTURE_DATE, sourceGenerationId: null, sealDigest: null, manifest: { synthetic: true } });
  await tx.objectStore("accountMeta").put({ ownerId: db.ownerId, key: "active-pointer", generationId: generation, versionId: `pointer:${generation}` });
  await tx.objectStore("accountMeta").put({ ownerId: db.ownerId, key: "local-sequence", value: 0 });
  for (const record of records) {
    await tx.objectStore("recordVersions").add(record);
    await tx.objectStore("heads").add({ ownerId: db.ownerId, generationId: generation, kind: record.kind, id: record.id, versionId: record.versionId, tombstone: false });
  }
  await tx.done;
  return archive;
}
function base(operationId: string, ownerId = FIXTURE_OWNER, generation = generationId) {
  return { schemaVersion: 1, operationId, ownerId, generationId: generation, createdAt: FIXTURE_DATE,
    expectedHeads: [], records: [], nextHeads: [], tombstones: [], setupDraftPreconditions: [] };
}
async function rename(archive: WorkbenchArchive, operationId = "rename-a", expectedVersion = initial("setup", archive.setups[0].id), versionId = operationId, name = operationId) {
  const setup = archive.setups[0];
  return prepareStationOperation({ ...base(operationId, archive.ownerId),
    expectedHeads: [{ kind: "setup", id: setup.id, versionId: expectedVersion }],
    records: [{ kind: "setup", id: setup.id, versionId, body: { ...setup, name } }],
    nextHeads: [{ kind: "setup", id: setup.id, versionId }],
    setupDraftPreconditions: [{ setupId: setup.id, revisionId: setup.draftRevisionId }],
  });
}
async function edit(archive: WorkbenchArchive) {
  const setup = archive.setups[0];
  const content = structuredClone(archive.revisions.find((item) => item.id === setup.draftRevisionId)!);
  const raw = content as unknown as Record<string, unknown>;
  for (const field of ["id", "ownerId", "setupId", "parentRevisionId", "createdAt", "transition"]) delete raw[field];
  content.notes = "Edited route notes";
  const proposal = prepareRevision(archive, { setupId: setup.id, revisionId: "home-r3", expectedHead: setup.draftRevisionId, createdAt: FIXTURE_DATE, content });
  return prepareStationOperation({ ...base("edit"),
    expectedHeads: [{ kind: "setup", id: setup.id, versionId: initial("setup", setup.id) }, { kind: "revision", id: proposal.revision.id, versionId: null }],
    records: [{ kind: "setup", id: setup.id, versionId: "setup-edit", body: proposal.setup }, { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id, body: proposal.revision }],
    nextHeads: [{ kind: "setup", id: setup.id, versionId: "setup-edit" }, { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id }],
    setupDraftPreconditions: [{ setupId: setup.id, revisionId: setup.draftRevisionId }],
  });
}
async function snapshot(repo: StationRepository) {
  const result = await repo.readSnapshot();
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return result;
}
async function counts(db: StationDatabaseHandle) {
  const tx = db.transaction(["recordVersions", "heads", "operations", "outbox", "conflicts", "accountMeta"], "readonly");
  const values = await Promise.all(["recordVersions", "heads", "operations", "outbox", "conflicts"].map((name) => tx.objectStore(name as "heads").count()));
  const sequence = await tx.objectStore("accountMeta").get([db.ownerId, "local-sequence"]);
  await tx.done;
  return { values, sequence };
}

describe("internal station repository atomic saves", () => {
  it("keeps the legacy pointer absent and opens without activating any generation", async () => {
    const factory = new IDBFactory();
    const repo = await repository(factory);
    expect(await repo.readSnapshot()).toEqual({ status: "legacy-active", pointer: { generationId: null, versionId: "absent" } });
    expect(await repo.listOutbox({ generationId, limit: 10 })).toEqual([]);
    const db = await database(factory);
    const tx = db.transaction(["accountMeta", "generations"], "readonly");
    expect(await tx.objectStore("accountMeta").count()).toBe(0);
    expect(await tx.objectStore("generations").count()).toBe(0);
    await tx.done;
  });
  it("persists an appended revision and preserves historical equipment, operating, experiment and layout pins across reopen", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await edit(archive);
    expect((await repo.commit(operation)).status).toBe("committed");
    repo.close();
    const reopened = await repository(factory);
    const saved = await snapshot(reopened);
    expect(saved.localSequence).toBe(1);
    expect(saved.archive.setups[0].draftRevisionId).toBe("home-r3");
    for (const revision of archive.revisions) expect(saved.archive.revisions.find((item) => item.id === revision.id)).toEqual(revision);
    expect(saved.archive.operating).toEqual(archive.operating);
    expect(saved.archive.experiments).toEqual(archive.experiments);
    expect(saved.archive.layouts).toEqual(archive.layouts);
    expect(Object.isFrozen(saved.archive.revisions[0].equipment[0].privateMetadata)).toBe(true);
    expect((await reopened.listOutbox({ generationId, limit: 10 }))[0].operation).toEqual(operation);
  });
  it("replays the original receipt after later edits and derives pending dependencies from head tokens", async () => {
    const factory = new IDBFactory();
    const archive = await seed(await database(factory));
    const repo = await repository(factory);
    const first = await rename(archive);
    const original = await repo.commit(first);
    const second = await rename(archive, "rename-b", "rename-a");
    await repo.commit(second);
    const replay = await repo.commit(structuredClone(first));
    expect(original.status).toBe("committed");
    expect(replay).toEqual({ ...original, status: "replayed" });
    expect((await snapshot(repo)).archive.setups[0].name).toBe("rename-b");
    expect((await snapshot(repo)).localSequence).toBe(2);
    const outbox = await repo.listOutbox({ generationId, limit: 2 });
    expect(outbox.map((row) => row.operationId)).toEqual(["rename-a", "rename-b"]);
    expect(outbox[1].dependencyOperationIds).toEqual(["rename-a"]);
    expect((await repo.listOutbox({ generationId, limit: 1 })).length).toBe(1);
    await expect(repo.commit(await rename(archive, "rename-a", "rename-b", "different", "Changed reuse"))).rejects.toThrow("already used");
    expect((await snapshot(repo)).localSequence).toBe(2);
  });
  it("serializes two handles, retains stale alternatives with both bases, and permanently replays a conflict", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const a = await repository(factory);
    const b = await repository(factory);
    const left = await rename(archive, "left");
    const right = await rename(archive, "right");
    const results = await Promise.all([a.commit(left), b.commit(right)]);
    expect(results.map((result) => result.status).sort()).toEqual(["committed", "conflict"]);
    const losingOperation = results[0].status === "conflict" ? left : right;
    const conflict = results.find((result) => result.status === "conflict")!;
    const tx = db.transaction(["conflicts", "recordVersions"], "readonly");
    const row = await tx.objectStore("conflicts").get([FIXTURE_OWNER, generationId, losingOperation.operationId]);
    expect(row?.details).toMatchObject({ operation: losingOperation, expectedBases: [{ availability: "available", body: archive.setups[0] }], actualBases: [{ availability: "available" }] });
    expect(await tx.objectStore("recordVersions").get([FIXTURE_OWNER, generationId, "setup", archive.setups[0].id, losingOperation.operationId])).toBeUndefined();
    await tx.done;
    expect(await b.commit(losingOperation)).toEqual(conflict);
    expect((await snapshot(a)).localSequence).toBe(2);
    expect((await a.listOutbox({ generationId, limit: 10 })).find((row) => row.operationId === losingOperation.operationId)?.state).toBe("conflicted");
  });
  it("quarantines unvalidated stale references without making them canonical or sendable, including replay after reopen", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const original = await rename(archive, "stale-invalid");
    const { payloadDigest: _digest, ...unsigned } = original;
    void _digest;
    const equipment = archive.inventory[0];
    // Model availability needs an aggregate context. Keep the setup's W03
    // draft/location invariant intact while exercising an unvalidated reference.
    const operation = await prepareStationOperation({ ...unsigned,
      expectedHeads: [...unsigned.expectedHeads, { kind: "equipment", id: equipment.id, versionId: initial("equipment", equipment.id) }],
      records: [...unsigned.records, { kind: "equipment", id: equipment.id, versionId: "invalid-model-v2", body: { ...equipment, modelId: "missing-model" } }],
      nextHeads: [...unsigned.nextHeads, { kind: "equipment", id: equipment.id, versionId: "invalid-model-v2" }],
    });
    const initialCounts = await counts(db);
    await expect(repo.commit(operation)).rejects.toThrow(/Missing model/);
    expect(await counts(db)).toEqual(initialCounts);
    await repo.commit(await rename(archive));
    const before = await snapshot(repo);
    const result = await repo.commit(operation);
    const validation = { status: "quarantined", reason: "historical-validation-context-unavailable" };
    expect(result).toMatchObject({ status: "conflict", candidateValidation: validation });
    const after = await snapshot(repo);
    expect(after.archive).toEqual(before.archive);
    expect(after.heads).toEqual(before.heads);
    const tx = db.transaction(["conflicts", "recordVersions"], "readonly");
    const conflict = await tx.objectStore("conflicts").get([FIXTURE_OWNER, generationId, operation.operationId]);
    expect(conflict?.details).toMatchObject({ operation, candidateValidation: validation });
    expect(await tx.objectStore("recordVersions").get([FIXTURE_OWNER, generationId, "setup", archive.setups[0].id, "stale-invalid"])).toBeUndefined();
    expect(await tx.objectStore("recordVersions").get([FIXTURE_OWNER, generationId, "equipment", equipment.id, "invalid-model-v2"])).toBeUndefined();
    await tx.done;
    repo.close();
    const reopened = await repository(factory);
    expect(await reopened.commit(operation)).toEqual(result);
    expect((await reopened.listOutbox({ generationId, limit: 10 })).find((row) => row.operationId === operation.operationId)).toMatchObject({ state: "conflicted", operation });
  });
  it.each(["different-head", "wrong-deletion-flag", "missing-head"])("rejects %s corruption in replayed and dependency receipts", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await rename(archive);
    await repo.commit(operation);
    const tx = db.transaction("operations", "readwrite");
    const row = (await tx.store.get([FIXTURE_OWNER, operation.operationId]))!;
    const result = row.result as { committedHeads: { versionId: string; deleted: boolean }[] };
    if (failure === "missing-head") result.committedHeads = [];
    if (failure === "different-head") result.committedHeads[0].versionId = "forged-head";
    if (failure === "wrong-deletion-flag") result.committedHeads[0].deleted = true;
    await tx.store.put(row);
    await tx.done;
    const before = await counts(db);
    await expect(repo.commit(operation)).rejects.toThrow("receipt binding");
    await expect(repo.commit(await rename(archive, "next", "rename-a"))).rejects.toThrow("receipt binding");
    expect(await counts(db)).toEqual(before);
  });
  it.each(["receipt-owner", "receipt-sequence", "outbox-sequence", "outbox-operation"])("rejects %s mismatch before deriving dependencies", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await rename(archive);
    await repo.commit(operation);
    const tx = db.transaction(["operations", "outbox"], "readwrite");
    const row = (await tx.objectStore("operations").get([FIXTURE_OWNER, operation.operationId]))!;
    const outbox = (await tx.objectStore("outbox").get([FIXTURE_OWNER, operation.operationId]))!;
    const result = row.result as { ownerId: string; localSequence: number };
    if (failure === "receipt-owner") result.ownerId = "wrong-owner";
    if (failure === "receipt-sequence") result.localSequence = 2;
    if (failure === "outbox-sequence") outbox.localSequence = 2;
    if (failure === "outbox-operation") outbox.operation = { ...operation, ownerId: "wrong-owner" };
    await tx.objectStore("operations").put(row);
    await tx.objectStore("outbox").put(outbox);
    await tx.done;
    const before = await counts(db);
    await expect(repo.commit(await rename(archive, "next", "rename-a"))).rejects.toThrow(/receipt|binding/);
    expect(await counts(db)).toEqual(before);
  });
  it("conflicts a graph edit prepared before a rename even when the semantic draft is unchanged", async () => {
    const factory = new IDBFactory();
    const archive = await seed(await database(factory));
    const repo = await repository(factory);
    await repo.commit(await rename(archive));
    expect((await repo.commit(await edit(archive))).status).toBe("conflict");
    const saved = await snapshot(repo);
    expect(saved.archive.setups[0].name).toBe("rename-a");
    expect(saved.archive.revisions).toHaveLength(archive.revisions.length);
  });
  it.each<StationCheckpoint>(["after-reads", "after-versions", "after-heads", "after-receipt", "after-outbox"])("aborts every store and sequence at %s", async (point) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const before = await counts(db);
    const repo = await repository(factory, { testHooks: { checkpoint: (at) => { if (at === point) throw new Error(`Injected ${point}`); } } });
    await expect(repo.commit(await edit(archive))).rejects.toThrow(`Injected ${point}`);
    repo.close();
    expect(await counts(db)).toEqual(before);
    const saved = await snapshot(await repository(factory));
    expect(saved.archive.revisions).toHaveLength(archive.revisions.length);
    expect(saved.archive.setups).toEqual(archive.setups);
  });
  it("binds accounts across shared handles and aborts a save when its handle closes during transaction", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const otherArchive = JSON.parse(JSON.stringify(archive).split(FIXTURE_OWNER).join("other-owner")) as WorkbenchArchive;
    await seed(await database(factory, "other-owner"), otherArchive);
    const other = await repository(factory, { ownerId: "other-owner" });
    await expect(other.commit(await rename(archive))).rejects.toThrow("owner");
    const repo = await repository(factory, { testHooks: { checkpoint: (at) => { if (at === "after-heads") repo.close(); } } });
    await expect(repo.commit(await rename(archive))).rejects.toThrow();
    expect((await snapshot(other)).localSequence).toBe(0);
    expect((await snapshot(await repository(factory))).localSequence).toBe(0);
    await other.commit(await rename(otherArchive));
    expect((await snapshot(other)).localSequence).toBe(1);
    expect((await snapshot(await repository(factory))).localSequence).toBe(0);
    await expect(repo.commit(await rename(archive))).rejects.toThrow("closed");
  });
  it("rejects stale-generation writes while replaying the prior generation receipt", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const first = await rename(archive);
    const committed = await repo.commit(first);
    await seed(db, archive, "generation-b");
    expect(await repo.commit(first)).toEqual({ ...committed, status: "replayed" });
    expect((await repo.commit(await rename(archive, "old-fresh", "rename-a"))).status).toBe("recovery-required");
    const reused = { ...first, generationId: "generation-b" };
    const draft = { ...reused } as Record<string, unknown>;
    delete draft.payloadDigest;
    await expect(repo.commit(await prepareStationOperation(draft))).rejects.toThrow("already used");
    expect((await snapshot(repo)).localSequence).toBe(0);
  });
  it("retains permanent tombstones, conflicts stale resurrection and rejects explicit ordinary resurrection", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = createExperimentFixture();
    const spare = { ...structuredClone(archive.inventory[2]), id: "spare", label: "Unwired spare" };
    archive.inventory.push(spare);
    await seed(db, archive);
    const repo = await repository(factory);
    const old = initial("equipment", spare.id);
    const deletion = await prepareStationOperation({ ...base("delete-spare"), expectedHeads: [{ kind: "equipment", id: spare.id, versionId: old }], tombstones: [{ kind: "equipment", id: spare.id, versionId: "deleted-spare", expectedVersionId: old }] });
    const deletionResult = await repo.commit(deletion);
    expect(deletionResult.status).toBe("committed");
    expect(await repo.commit(deletion)).toEqual({ ...deletionResult, status: "replayed" });
    const resurrection = (expected: string, operationId: string) => prepareStationOperation({ ...base(operationId), expectedHeads: [{ kind: "equipment", id: spare.id, versionId: expected }], records: [{ kind: "equipment", id: spare.id, versionId: operationId, body: spare }], nextHeads: [{ kind: "equipment", id: spare.id, versionId: operationId }] });
    const beforeReuse = await counts(db);
    await expect(repo.commit(await resurrection(old, "deleted-spare"))).rejects.toThrow("Immutable storage version collision");
    const duplicateDeletion = { ...deletion } as Record<string, unknown>;
    delete duplicateDeletion.payloadDigest;
    duplicateDeletion.operationId = "duplicate-delete";
    await expect(repo.commit(await prepareStationOperation(duplicateDeletion))).rejects.toThrow("Tombstone token was already used");
    expect(await counts(db)).toEqual(beforeReuse);
    expect((await repo.commit(await resurrection(old, "stale-spare"))).status).toBe("conflict");
    await expect(repo.commit(await resurrection("deleted-spare", "explicit-spare"))).rejects.toThrow("tombstoned");
    const saved = await snapshot(repo);
    expect(saved.archive.inventory.some((item) => item.id === spare.id)).toBe(false);
    expect(saved.heads.find((head) => head.id === spare.id)).toMatchObject({ deleted: true, versionId: "deleted-spare" });
    expect(saved.localSequence).toBe(2);
  });
  it("rejects reusing a historical live token for a new tombstone", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const location = archive.locations[0];
    const initialToken = initial("location", location.id);
    await repo.commit(await prepareStationOperation({ ...base("location-edit"),
      expectedHeads: [{ kind: "location", id: location.id, versionId: initialToken }],
      records: [{ kind: "location", id: location.id, versionId: "location-v2", body: { ...location, label: "Renamed home" } }],
      nextHeads: [{ kind: "location", id: location.id, versionId: "location-v2" }],
    }));
    const before = await counts(db);
    await expect(repo.commit(await prepareStationOperation({ ...base("delete-location"),
      expectedHeads: [{ kind: "location", id: location.id, versionId: "location-v2" }],
      tombstones: [{ kind: "location", id: location.id, versionId: initialToken, expectedVersionId: "location-v2" }],
    }))).rejects.toThrow("Tombstone token collides with a retained body");
    expect(await counts(db)).toEqual(before);
    expect((await snapshot(repo)).archive.locations[0].label).toBe("Renamed home");
  });
  it("rejects immutable version collisions without overwriting retained history", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    await repo.commit(await rename(archive));
    const before = await counts(db);
    await expect(repo.commit(await rename(archive, "collision", "rename-a", initial("setup", archive.setups[0].id), "Overwrite historical body"))).rejects.toThrow("Immutable storage version collision");
    expect(await counts(db)).toEqual(before);
    expect((await snapshot(repo)).archive.setups[0].name).toBe("rename-a");
  });
  it("rejects v1 to v2 to v1 head rewinds even with an identical historical body and preserves dependency identity", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const first = await rename(archive, "first", initial("setup", archive.setups[0].id), "v1", "First name");
    const firstResult = await repo.commit(first);
    await repo.commit(await rename(archive, "second", "v1", "v2", "Second name"));
    const rewind = await rename(archive, "rewind", "v2", "v1", "First name");
    expect(rewind.records[0].body).toEqual(first.records[0].body);
    const before = await counts(db);
    await expect(repo.commit(rewind)).rejects.toThrow("Immutable storage version collision");
    expect(await counts(db)).toEqual(before);
    expect((await snapshot(repo)).heads.find((head) => head.kind === "setup")).toMatchObject({ versionId: "v2" });
    expect((await snapshot(repo)).archive.setups[0].name).toBe("Second name");
    expect(await repo.commit(first)).toEqual({ ...firstResult, status: "replayed" });
    await repo.commit(await rename(archive, "third", "v2", "v3", "Third name"));
    const outbox = await repo.listOutbox({ generationId, limit: 10 });
    expect(outbox.map((row) => row.operationId)).toEqual(["first", "second", "third"]);
    expect(outbox[2].dependencyOperationIds).toEqual(["second"]);
    expect((await repo.commit(await rename(archive, "stale-after-v1", "v1", "stale-token"))).status).toBe("conflict");
    expect((await snapshot(repo)).archive.setups[0].name).toBe("Third name");
  });
  it("rejects retained tokens even when a stored digest was changed to match the incoming body", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    await repo.commit(await rename(archive));
    const token = initial("setup", archive.setups[0].id);
    const collision = await rename(archive, "collision", "rename-a", token, "Different historical body");
    const forgedDigest = await digestWorkbenchJson(collision.records[0].body);
    const tx = db.transaction("recordVersions", "readwrite");
    const row = (await tx.store.get([FIXTURE_OWNER, generationId, "setup", archive.setups[0].id, token]))!;
    await tx.store.put({ ...row, payloadDigest: forgedDigest });
    await tx.done;
    const before = await counts(db);
    await expect(repo.commit(collision)).rejects.toThrow("Stored body digest mismatch");
    expect(await counts(db)).toEqual(before);
    expect((await repo.readSnapshot()).status).toBe("recovery-required");
  });
  it.each(["before-audit", "during-audit"])("rejects corrupt retained restore sources %s without committing copies", async (timing) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const source = archive.revisions[0];
    const setup = archive.setups.find((item) => item.id === source.setupId)!;
    const proposal = prepareRevisionRestore(archive, { setupId: setup.id, sourceRevisionId: source.id, revisionId: "restore-copy",
      expectedHead: setup.draftRevisionId, createdAt: FIXTURE_DATE });
    const operation = await prepareStationOperation({ ...base("restore-copy"),
      expectedHeads: [{ kind: "setup", id: setup.id, versionId: initial("setup", setup.id) }, { kind: "revision", id: proposal.revision.id, versionId: null }],
      records: [{ kind: "setup", id: setup.id, versionId: "restore-setup", body: proposal.setup }, { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id, body: proposal.revision }],
      nextHeads: [{ kind: "setup", id: setup.id, versionId: "restore-setup" }, { kind: "revision", id: proposal.revision.id, versionId: proposal.revision.id }],
      setupDraftPreconditions: [proposal.expectedHead],
    });
    const corrupt = async () => {
      const tx = db.transaction("recordVersions", "readwrite");
      const row = (await tx.store.get([FIXTURE_OWNER, generationId, "revision", source.id, source.id]))!;
      row.body = { ...(row.body as object), notes: "Corrupt but schema-valid historical content" };
      await tx.store.put(row);
      await tx.done;
    };
    let raced = false;
    if (timing === "before-audit") await corrupt();
    else {
      const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
        const hashed = await nativeDigest(algorithm, data);
        if (!raced && new TextDecoder().decode(data) === canonicalWorkbenchJson(source)) {
          raced = true;
          await corrupt();
        }
        return hashed;
      });
    }
    const before = await counts(db);
    await expect(repo.commit(operation)).rejects.toThrow("Stored body digest mismatch");
    expect(await counts(db)).toEqual(before);
    if (timing === "during-audit") expect(raced).toBe(true);
    expect((await repo.readSnapshot()).status).toBe("recovery-required");
  });
  it.each(["conflict-id", "actual-head", "reason", "ledger-reason", "missing-ledger", "paired-target", "base-body"])("rejects replayed conflict %s tampering", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    await repo.commit(await rename(archive));
    const operation = await rename(archive, "loser");
    expect((await repo.commit(operation)).status).toBe("conflict");
    const tx = db.transaction(["operations", "conflicts"], "readwrite");
    const row = (await tx.objectStore("operations").get([FIXTURE_OWNER, operation.operationId]))!;
    const result = row.result as { conflictId: string; reason: string; actualHeads: { versionId: string }[] };
    if (failure === "conflict-id") result.conflictId = "wrong-conflict";
    if (failure === "actual-head") result.actualHeads[0].versionId = "wrong-base";
    if (failure === "reason") result.reason = "Altered reason";
    if (failure === "ledger-reason") {
      const ledger = (await tx.objectStore("conflicts").get([FIXTURE_OWNER, generationId, operation.operationId]))!;
      (ledger.details as { reason: string }).reason = "Altered ledger";
      await tx.objectStore("conflicts").put(ledger);
    }
    if (failure === "paired-target" || failure === "base-body") {
      const ledger = (await tx.objectStore("conflicts").get([FIXTURE_OWNER, generationId, operation.operationId]))!;
      const details = ledger.details as { actualBases: { id: string; body: { name: string } }[] };
      if (failure === "paired-target") {
        (result.actualHeads[0] as unknown as { id: string }).id = "unrelated-setup";
        details.actualBases[0].id = "unrelated-setup";
      } else details.actualBases[0].body.name = "Forged recovery base";
      await tx.objectStore("conflicts").put(ledger);
    }
    if (failure === "missing-ledger") await tx.objectStore("conflicts").delete([FIXTURE_OWNER, generationId, operation.operationId]);
    await tx.objectStore("operations").put(row);
    await tx.done;
    const before = await counts(db);
    await expect(repo.commit(operation)).rejects.toThrow();
    expect(await counts(db)).toEqual(before);
  });
  it("rejects matching altered dependency envelopes whose original digest no longer verifies", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const original = await rename(archive);
    await repo.commit(original);
    const tx = db.transaction(["operations", "outbox"], "readwrite");
    const row = (await tx.objectStore("operations").get([FIXTURE_OWNER, original.operationId]))!;
    const outbox = (await tx.objectStore("outbox").get([FIXTURE_OWNER, original.operationId]))!;
    const altered = structuredClone(row.operation) as { records: { body: { name: string } }[] };
    altered.records[0].body.name = "Tampered retained operation";
    row.operation = altered;
    outbox.operation = altered;
    await tx.objectStore("operations").put(row);
    await tx.objectStore("outbox").put(outbox);
    await tx.done;
    const before = await counts(db);
    await expect(repo.commit(await rename(archive, "dependent", original.operationId))).rejects.toThrow(/digest/i);
    await expect(repo.listOutbox({ generationId, limit: 10 })).rejects.toThrow(/digest/i);
    expect(await counts(db)).toEqual(before);
  });
  it.each(["missing-receipt", "different-signed-operation", "outbox-sequence", "receipt-head", "ledger-digest"])("rejects outbox %s corruption before returning queue entries", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await rename(archive);
    await repo.commit(operation);
    const alternative = await rename(archive, operation.operationId, initial("setup", archive.setups[0].id), operation.operationId, "Different valid signed body");
    const tx = db.transaction(["outbox", "operations"], "readwrite");
    const queue = (await tx.objectStore("outbox").get([FIXTURE_OWNER, operation.operationId]))!;
    const ledger = (await tx.objectStore("operations").get([FIXTURE_OWNER, operation.operationId]))!;
    if (failure === "different-signed-operation") queue.operation = alternative;
    if (failure === "outbox-sequence") queue.localSequence = 7;
    if (failure === "receipt-head") (ledger.result as { committedHeads: { versionId: string }[] }).committedHeads[0].versionId = "wrong-head";
    if (failure === "ledger-digest") ledger.payloadDigest = "0".repeat(64);
    await tx.objectStore("outbox").put(queue);
    if (failure === "missing-receipt") await tx.objectStore("operations").delete([FIXTURE_OWNER, operation.operationId]);
    else await tx.objectStore("operations").put(ledger);
    await tx.done;
    const before = await counts(db);
    await expect(repo.listOutbox({ generationId, limit: 10 })).rejects.toThrow();
    expect(await counts(db)).toEqual(before);
  });
  it.each(["ledger", "receipt"])("rejects changing an originally unavailable conflict base into a tombstone in the %s", async (target) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await rename(archive, "future-conflict", "future-version", "candidate-version");
    const result = await repo.commit(operation);
    expect(result).toMatchObject({ status: "conflict", expectedBases: [{ versionId: "future-version", availability: "unavailable" }] });
    const tx = db.transaction(["conflicts", "operations"], "readwrite");
    if (target === "ledger") {
      const row = (await tx.objectStore("conflicts").get([FIXTURE_OWNER, generationId, operation.operationId]))!;
      (row.details as { expectedBases: { availability: string }[] }).expectedBases[0].availability = "tombstone";
      await tx.objectStore("conflicts").put(row);
    } else {
      const row = (await tx.objectStore("operations").get([FIXTURE_OWNER, operation.operationId]))!;
      (row.result as { expectedBases: { availability: string }[] }).expectedBases[0].availability = "tombstone";
      await tx.objectStore("operations").put(row);
    }
    await tx.done;
    await expect(repo.commit(operation)).rejects.toThrow("Conflict receipt binding");
    await expect(repo.listOutbox({ generationId, limit: 10 })).rejects.toThrow("Conflict receipt binding");
  });
  it("rejects changing a captured tombstone conflict base into unavailable", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = createExperimentFixture();
    const spare = { ...structuredClone(archive.inventory[2]), id: "unwired-spare" };
    archive.inventory.push(spare);
    await seed(db, archive);
    const repo = await repository(factory);
    const versionId = initial("equipment", spare.id);
    await repo.commit(await prepareStationOperation({ ...base("delete-spare"),
      expectedHeads: [{ kind: "equipment", id: spare.id, versionId }],
      tombstones: [{ kind: "equipment", id: spare.id, versionId: "spare-tombstone", expectedVersionId: versionId }],
    }));
    const stale = await prepareStationOperation({ ...base("stale-spare"),
      expectedHeads: [{ kind: "equipment", id: spare.id, versionId }],
      records: [{ kind: "equipment", id: spare.id, versionId: "spare-candidate", body: spare }],
      nextHeads: [{ kind: "equipment", id: spare.id, versionId: "spare-candidate" }],
    });
    expect(await repo.commit(stale)).toMatchObject({ status: "conflict", actualBases: [{ availability: "tombstone" }] });
    const tx = db.transaction("conflicts", "readwrite");
    const row = (await tx.store.get([FIXTURE_OWNER, generationId, stale.operationId]))!;
    (row.details as { actualBases: { availability: string }[] }).actualBases[0].availability = "unavailable";
    await tx.store.put(row);
    await tx.done;
    await expect(repo.commit(stale)).rejects.toThrow("Conflict receipt binding");
  });
  it("replays the original unavailable observation after that version legitimately appears and the generation changes", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const repo = await repository(factory);
    const operation = await rename(archive, "future-conflict", "future-version", "candidate-version");
    const original = await repo.commit(operation);
    expect(original).toMatchObject({ status: "conflict", expectedBases: [{ availability: "unavailable" }] });
    await repo.commit(await rename(archive, "real-future-write", initial("setup", archive.setups[0].id), "future-version"));
    expect((await snapshot(repo)).heads.find((head) => head.kind === "setup")?.versionId).toBe("future-version");
    repo.close();
    const reopened = await repository(factory);
    expect(await reopened.commit(operation)).toEqual(original);
    expect((await reopened.listOutbox({ generationId, limit: 10 }))[0].operation).toEqual(operation);
    await seed(db, archive, "next-generation");
    expect(await reopened.commit(operation)).toEqual(original);
  });
  it("propagates close during a pending snapshot without diagnosing healthy storage as damaged", async () => {
    const factory = new IDBFactory();
    await seed(await database(factory));
    const repo = await repository(factory);
    const pending = repo.readSnapshot();
    repo.close();
    await expect(pending).rejects.toMatchObject({ code: "closed" });
    expect((await (await repository(factory)).readSnapshot()).status).toBe("ready");
  });
  it.each(["UnknownError", "AbortError", "SecurityError"])("propagates operational readonly %s without diagnosing corruption", async (name) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    await seed(db);
    const repo = await repository(factory);
    const before = await counts(db);
    const failure = new DOMException("Transient read failure", name);
    const read = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(() => { throw failure; });
    await expect(repo.readSnapshot()).rejects.toBe(failure);
    read.mockRestore();
    expect(await counts(db)).toEqual(before);
    expect((await repo.readSnapshot()).status).toBe("ready");
  });
  it("propagates a real readonly transaction abort while keeping the handle usable", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    await seed(db);
    const repo = await repository(factory);
    const original = IDBObjectStore.prototype.get;
    const read = vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(function (this: IDBObjectStore, query) {
      const request = original.call(this, query);
      this.transaction.abort();
      return request;
    });
    await expect(repo.readSnapshot()).rejects.toMatchObject({ name: "AbortError" });
    read.mockRestore();
    expect((await repo.readSnapshot()).status).toBe("ready");
  });
  it.each(["DOMException", "TypeError"])("propagates operational cryptography %s instead of reporting healthy data as corrupt", async (kind) => {
    const factory = new IDBFactory();
    await seed(await database(factory));
    const repo = await repository(factory);
    const failure = kind === "DOMException" ? new DOMException("Crypto unavailable", "OperationError") : new TypeError("Crypto unavailable");
    const hash = vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(failure);
    await expect(repo.readSnapshot()).rejects.toBe(failure);
    hash.mockRestore();
    expect((await repo.readSnapshot()).status).toBe("ready");
  });
  it.each(["unknown-kind", "padded-token", "nonboolean-tombstone", "unsafe-sequence", "future-generation"])("fails closed on persisted %s metadata", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const tx = db.transaction(["heads", "accountMeta", "generations"], "readwrite");
    const head = (await tx.objectStore("heads").get([FIXTURE_OWNER, generationId, "setup", archive.setups[0].id]))!;
    if (failure === "unknown-kind") await tx.objectStore("heads").put({ ...head, kind: "future-kind" } as unknown as typeof head);
    if (failure === "padded-token") await tx.objectStore("heads").put({ ...head, versionId: " padded " });
    if (failure === "nonboolean-tombstone") await tx.objectStore("heads").put({ ...head, tombstone: "false" } as unknown as typeof head);
    if (failure === "unsafe-sequence") await tx.objectStore("accountMeta").put({ ownerId: FIXTURE_OWNER, key: "local-sequence", value: Number.MAX_SAFE_INTEGER + 1 });
    if (failure === "future-generation") {
      const row = (await tx.objectStore("generations").get([FIXTURE_OWNER, generationId]))!;
      await tx.objectStore("generations").put({ ...row, schemaVersion: 2 });
    }
    await tx.done;
    const before = await counts(db);
    const repo = await repository(factory);
    expect((await repo.readSnapshot()).status).toBe("recovery-required");
    await expect(repo.commit(await rename(archive))).rejects.toThrow();
    expect(await counts(db)).toEqual(before);
  });
  it.each(["missing-version", "invalid-body", "noncanonical-body", "digest-mismatch"])("returns recovery-required for %s without repairing or dropping stored data", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const tuple: [string, string, StationEntityKind, string, string] = [FIXTURE_OWNER, generationId, "setup", archive.setups[0].id, initial("setup", archive.setups[0].id)];
    const tx = db.transaction("recordVersions", "readwrite");
    const row = (await tx.store.get(tuple))!;
    if (failure === "missing-version") await tx.store.delete(tuple);
    else await tx.store.put({ ...row, body: failure === "invalid-body" ? { malformed: true }
      : failure === "noncanonical-body" ? { ...archive.setups[0], unexpectedDate: new Date(FIXTURE_DATE) }
        : { ...archive.setups[0], name: "Tampered but schema-valid" } });
    await tx.done;
    const before = await counts(db);
    expect((await (await repository(factory)).readSnapshot()).status).toBe("recovery-required");
    expect(await counts(db)).toEqual(before);
  });
});


async function committed(repo: StationRepository, operation: unknown) {
  const result = await repo.commit(operation);
  if (result.status !== "committed" && result.status !== "replayed") throw new Error(JSON.stringify(result));
  return result.receipt;
}
function acceptedDelivery(receipt: Awaited<ReturnType<typeof committed>>): StationDeliveryResult {
  const { localSequence: _sequence, ...binding } = receipt;
  void _sequence;
  return { schemaVersion: 1, ...binding, committedHeads: binding.committedHeads.map((head) => ({ ...head })), outcome: "accepted" };
}
function rejectedDelivery(receipt: Awaited<ReturnType<typeof committed>>): StationDeliveryResult {
  return { schemaVersion: 1, ownerId: receipt.ownerId, generationId: receipt.generationId, operationId: receipt.operationId,
    payloadDigest: receipt.payloadDigest, outcome: "rejected", reason: { code: "remote-head-conflict", message: "Remote base changed" } };
}
async function deliveryRows(db: StationDatabaseHandle) {
  const tx = db.transaction(["operations", "outbox", "deliveryResults"], "readonly");
  const [operations, outbox, results] = await Promise.all([
    tx.objectStore("operations").getAll(), tx.objectStore("outbox").getAll(), tx.objectStore("deliveryResults").getAll(),
  ]);
  await tx.done;
  return { operations, outbox, results };
}
async function deliveryFixture() {
  const factory = new IDBFactory();
  const db = await database(factory);
  const archive = await seed(db);
  const repo = await repository(factory);
  const a = await committed(repo, await rename(archive, "A"));
  const b = await committed(repo, await rename(archive, "B", "A"));
  const c = await committed(repo, await rename(archive, "C", "B"));
  const d = await committed(repo, await prepareStationOperation(base("D")));
  return { factory, db, archive, repo, a, b, c, d };
}

describe("durable local station delivery bookkeeping", () => {
  it("blocks A→B→C and later E on rejection, leaves D ready, and preserves canonical state and original receipts", async () => {
    const { factory, db, archive, repo, a, d } = await deliveryFixture();
    const before = await snapshot(repo);
    const originals = (await deliveryRows(db)).operations;
    expect((await repo.readDeliveryReadiness({ generationId })).map((node) => node.status)).toEqual(["ready", "waiting", "waiting", "ready"]);
    expect((await repo.recordDeliveryResult(rejectedDelivery(a))).status).toBe("recorded");
    expect(await snapshot(repo)).toEqual(before);
    expect((await deliveryRows(db)).operations).toEqual(originals);
    let ready = await repo.readDeliveryReadiness({ generationId });
    expect(ready.map((node) => node.status)).toEqual(["rejected", "blocked", "blocked", "ready"]);
    expect(ready[2].blockedByOperationIds).toEqual(["A"]);
    expect((await repo.listOutbox({ generationId, limit: 10 })).map((row) => row.state)).toEqual(["blocked", "blocked", "blocked", "pending"]);
    await committed(repo, await rename(archive, "E", "C"));
    ready = await repo.readDeliveryReadiness({ generationId });
    expect(ready[4]).toMatchObject({ operationId: "E", status: "blocked", blockedByOperationIds: ["A"] });
    expect((await repo.listOutbox({ generationId, limit: 10 }))[4]).toMatchObject({ state: "blocked", dependencyOperationIds: ["C"] });
    await repo.recordDeliveryResult(acceptedDelivery(d));
    repo.close();
    const reopened = await repository(factory);
    expect((await reopened.recordDeliveryResult(rejectedDelivery(a))).status).toBe("replayed");
    expect((await reopened.readDeliveryReadiness({ generationId })).map((node) => node.status)).toEqual(["rejected", "blocked", "blocked", "acknowledged", "blocked"]);
    expect((await reopened.listOutbox({ generationId, limit: 10 })).map((row) => row.operationId)).toEqual(["A", "B", "C", "E"]);
    expect((await snapshot(reopened)).localSequence).toBe(5);
  });

  it("acknowledges old A after local B without rolling back heads, changing receipts, or omitting acknowledged prerequisites", async () => {
    const { db, archive, repo, a, b, c } = await deliveryFixture();
    const before = await snapshot(repo);
    const originals = (await deliveryRows(db)).operations;
    await repo.recordDeliveryResult(acceptedDelivery(a));
    expect(await snapshot(repo)).toEqual(before);
    expect((await deliveryRows(db)).operations).toEqual(originals);
    expect((await repo.readDeliveryReadiness({ generationId })).map((node) => node.status)).toEqual(["acknowledged", "ready", "waiting", "ready"]);
    await expect(repo.recordDeliveryResult(acceptedDelivery(c))).rejects.toThrow(/acknowledged prerequisites/);
    await repo.recordDeliveryResult(acceptedDelivery(b));
    await repo.recordDeliveryResult(acceptedDelivery(c));
    await committed(repo, await rename(archive, "E", "C"));
    expect((await repo.listOutbox({ generationId, limit: 10 })).find((row) => row.operationId === "E")?.dependencyOperationIds).toEqual(["C"]);
    expect((await repo.readDeliveryReadiness({ generationId })).find((node) => node.operationId === "E")?.status).toBe("ready");
    expect(await repo.commit(await rename(archive, "A"))).toEqual({ status: "replayed", receipt: a });
  });

  it.each(["owner", "generation", "operation", "digest", "head-token", "head-deletion", "missing-head", "extra-head"])("rejects delivery %s mismatch without writes", async (change) => {
    const { db, repo, a } = await deliveryFixture();
    const result = acceptedDelivery(a);
    if (result.outcome !== "accepted") throw new Error("Fixture");
    if (change === "owner") result.ownerId = "other-owner";
    if (change === "generation") result.generationId = "other-generation";
    if (change === "operation") result.operationId = "missing-operation";
    if (change === "digest") result.payloadDigest = "b".repeat(64);
    if (change === "head-token") result.committedHeads[0].versionId = "other-token";
    if (change === "head-deletion") result.committedHeads[0].deleted = true;
    if (change === "missing-head") result.committedHeads = [];
    if (change === "extra-head") result.committedHeads.push({ kind: "location", id: "extra", versionId: "extra", deleted: false });
    const before = await deliveryRows(db);
    await expect(repo.recordDeliveryResult(result)).rejects.toThrow();
    expect(await deliveryRows(db)).toEqual(before);
  });

  it("binds exact tombstones and preserves their original local receipt", async () => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = createExperimentFixture();
    const spare = { ...structuredClone(archive.inventory[2]), id: "delivery-spare" };
    archive.inventory.push(spare);
    await seed(db, archive);
    const repo = await repository(factory);
    const operation = await prepareStationOperation({ ...base("delete-delivery-spare"),
      expectedHeads: [{ kind: "equipment", id: spare.id, versionId: initial("equipment", spare.id) }],
      tombstones: [{ kind: "equipment", id: spare.id, versionId: "deleted-spare", expectedVersionId: initial("equipment", spare.id) }],
    });
    const receipt = await committed(repo, operation);
    const altered = acceptedDelivery(receipt);
    if (altered.outcome !== "accepted") throw new Error("Fixture");
    altered.committedHeads[0].deleted = false;
    await expect(repo.recordDeliveryResult(altered)).rejects.toThrow(/exact committed heads/);
    expect((await repo.recordDeliveryResult(acceptedDelivery(receipt))).status).toBe("recorded");
    expect(await repo.commit(operation)).toEqual({ status: "replayed", receipt });
  });

  it("replays terminal outcomes after reopen and rejects changed rejection details and contradictory outcomes", async () => {
    const { factory, db, repo, a } = await deliveryFixture();
    const original = rejectedDelivery(a);
    await repo.recordDeliveryResult(original);
    repo.close();
    const reopened = await repository(factory);
    const before = await deliveryRows(db);
    expect(await reopened.recordDeliveryResult(original)).toEqual({ status: "replayed", result: original });
    const changed = rejectedDelivery(a);
    if (changed.outcome !== "rejected") throw new Error("Fixture");
    changed.reason.message = "New explanation";
    await expect(reopened.recordDeliveryResult(changed)).rejects.toThrow(/Conflicting terminal/);
    await expect(reopened.recordDeliveryResult(acceptedDelivery(a))).rejects.toThrow(/Conflicting terminal/);
    expect(await deliveryRows(db)).toEqual(before);
  });

  it("accepts correctly bound late old-generation delivery while refusing another account's response", async () => {
    const { factory, db, archive, repo, a } = await deliveryFixture();
    await seed(db, archive, "new-generation");
    const before = await snapshot(repo);
    await repo.recordDeliveryResult(acceptedDelivery(a));
    expect(await snapshot(repo)).toEqual(before);
    expect((await repo.readDeliveryReadiness({ generationId }))[0].status).toBe("acknowledged");
    expect(await repo.readDeliveryReadiness({ generationId: "new-generation" })).toEqual([]);
    const other = await repository(factory, { ownerId: "other-owner" });
    await expect(other.recordDeliveryResult(acceptedDelivery(a))).rejects.toThrow(/owner/);
    expect(await other.readDeliveryReadiness({ generationId })).toEqual([]);
  });

  it("never records a server result for a quarantined local conflict", async () => {
    const { db, archive, repo } = await deliveryFixture();
    const stale = await rename(archive, "local-conflict");
    expect((await repo.commit(stale)).status).toBe("conflict");
    const result: StationDeliveryResult = { schemaVersion: 1, ownerId: FIXTURE_OWNER, generationId, operationId: stale.operationId,
      payloadDigest: stale.payloadDigest, outcome: "rejected", reason: { code: "remote-rejection", message: "Not sendable" } };
    const before = await deliveryRows(db);
    await expect(repo.recordDeliveryResult(result)).rejects.toThrow(/local conflict/);
    await expect(repo.recordDeliveryResult({ schemaVersion: 1, ownerId: FIXTURE_OWNER, generationId, operationId: stale.operationId,
      payloadDigest: stale.payloadDigest, outcome: "accepted", committedHeads: [] })).rejects.toThrow(/local conflict/);
    expect((await repo.readDeliveryReadiness({ generationId })).find((node) => node.operationId === "local-conflict")?.status).toBe("conflicted");
    expect(await deliveryRows(db)).toEqual(before);
  });

  it.each(["after-delivery-result", "after-delivery-descendant"] as const)("rolls back terminal and descendant writes at %s", async (point) => {
    const { factory, db, repo, a } = await deliveryFixture();
    const before = await deliveryRows(db);
    const beforeState = await snapshot(repo);
    let descendants = 0;
    const failing = await repository(factory, { testHooks: { checkpoint: (at) => {
      if (at === point && (at !== "after-delivery-descendant" || ++descendants === 2)) throw new Error(`Injected ${point}`);
    } } });
    await expect(failing.recordDeliveryResult(rejectedDelivery(a))).rejects.toThrow(`Injected ${point}`);
    failing.close();
    const reopened = await repository(factory);
    expect(await deliveryRows(db)).toEqual(before);
    expect(await snapshot(reopened)).toEqual(beforeState);
    expect((await reopened.recordDeliveryResult(rejectedDelivery(a))).status).toBe("recorded");
  });

  it("serializes duplicate and contradictory outcomes across two handles", async () => {
    const { factory, db, repo, a, d } = await deliveryFixture();
    const other = await repository(factory);
    const repeated = await Promise.all([repo.recordDeliveryResult(acceptedDelivery(a)), other.recordDeliveryResult(acceptedDelivery(a))]);
    expect(repeated.map((result) => result.status).sort()).toEqual(["recorded", "replayed"]);
    const competing = await Promise.allSettled([repo.recordDeliveryResult(acceptedDelivery(d)), other.recordDeliveryResult(rejectedDelivery(d))]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await deliveryRows(db)).results).toHaveLength(2);
  });

  it("serializes rejection against a concurrent new dependent so E cannot escape blocking", async () => {
    const { factory, archive, repo, a } = await deliveryFixture();
    const other = await repository(factory);
    const e = await rename(archive, "E", "C");
    const results = await Promise.all([repo.recordDeliveryResult(rejectedDelivery(a)), other.commit(e)]);
    expect(results.map((result) => result.status)).toEqual(["recorded", "committed"]);
    expect((await repo.readDeliveryReadiness({ generationId })).find((node) => node.operationId === "E")).toMatchObject({ operationId: "E", status: "blocked", blockedByOperationIds: ["A"] });
    expect((await repo.listOutbox({ generationId, limit: 10 })).find((node) => node.operationId === "E")?.state).toBe("blocked");
  });

  it.each(["missing-edge", "extra-edge", "cycle", "missing-node", "wrong-generation", "forged-state", "tampered-envelope"])("rejects %s ledger corruption without repairing graph rows", async (change) => {
    const { db, repo, a } = await deliveryFixture();
    const tx = db.transaction(["operations", "outbox"], "readwrite");
    const row = (await tx.objectStore("outbox").get([FIXTURE_OWNER, "B"]))!;
    if (change === "missing-edge") row.dependencyOperationIds = [];
    if (change === "extra-edge") row.dependencyOperationIds.push("D");
    if (change === "cycle") row.dependencyOperationIds = ["C"];
    if (change === "missing-node") row.dependencyOperationIds = ["missing"];
    if (change === "wrong-generation") row.generationId = "wrong-generation";
    if (change === "forged-state") row.state = "acknowledged";
    if (change === "tampered-envelope") {
      const operationRow = (await tx.objectStore("operations").get([FIXTURE_OWNER, "B"]))!;
      const altered = structuredClone(row.operation) as { records: { body: { name: string } }[] };
      altered.records[0].body.name = "Altered while preserving old hash";
      row.operation = altered;
      operationRow.operation = altered;
      await tx.objectStore("operations").put(operationRow);
    }
    await tx.objectStore("outbox").put(row);
    await tx.done;
    const before = await deliveryRows(db);
    await expect(repo.readDeliveryReadiness({ generationId })).rejects.toThrow();
    await expect(repo.recordDeliveryResult(rejectedDelivery(a))).rejects.toThrow();
    expect(await deliveryRows(db)).toEqual(before);
  });

  it("does not hide a terminal key with a corrupt generation behind the generation index", async () => {
    const { db, repo, a } = await deliveryFixture();
    const tx = db.transaction("deliveryResults", "readwrite");
    await tx.store.add({ ...acceptedDelivery(a), generationId: "wrong-generation" });
    await tx.done;
    const before = await deliveryRows(db);
    await expect(repo.readDeliveryReadiness({ generationId })).rejects.toThrow(/Delivery result scope mismatch/);
    await expect(repo.recordDeliveryResult(acceptedDelivery(a))).rejects.toThrow(/Delivery result scope mismatch/);
    expect(await deliveryRows(db)).toEqual(before);
  });

  it("rechecks the exact graph after asynchronous hashes instead of repairing a raced dependency", async () => {
    const { db, repo, a } = await deliveryFixture();
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    let raced = false;
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      const hashed = await nativeDigest(algorithm, data);
      if (!raced) {
        raced = true;
        const tx = db.transaction("outbox", "readwrite");
        const row = (await tx.store.get([FIXTURE_OWNER, "B"]))!;
        row.dependencyOperationIds = [];
        await tx.store.put(row);
        await tx.done;
      }
      return hashed;
    });
    await expect(repo.recordDeliveryResult(rejectedDelivery(a))).rejects.toThrow(/Missing required delivery dependency/);
    expect((await deliveryRows(db)).results).toEqual([]);
    expect(raced).toBe(true);
  });

  it("returns retry-required after three valid graph races without delivery writes, then records a clean retry", async () => {
    const { factory, db, archive, repo, a } = await deliveryFixture();
    const writer = await repository(factory);
    const checkpoints = vi.fn();
    const recorder = await repository(factory, { testHooks: { checkpoint: checkpoints } });
    const changes = await Promise.all([
      rename(archive, "E", "C"), rename(archive, "F", "E"), rename(archive, "G", "F"),
    ]);
    const terminal = rejectedDelivery(a);
    const originalRows = await deliveryRows(db);
    let expectedRows = originalRows;
    let expectedState = await snapshot(repo);
    const { payloadDigest: _digest, ...auditedOperation } = await rename(archive, "A");
    void _digest;
    const auditedBytes = canonicalWorkbenchJson(auditedOperation);
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    let auditAttempts = 0;
    let writing = false;
    const hash = vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
      const hashed = await nativeDigest(algorithm, data);
      // A is hashed once after each delivery readonly audit has completed. Hold
      // that hash until another handle commits a valid new descendant, so every
      // write attempt must observe a different graph. Ignore the writer's own
      // dependency hashes to avoid recursive races; no timing/sleeps are needed.
      if (!writing && new TextDecoder().decode(data) === auditedBytes) {
        auditAttempts += 1;
        const change = changes[auditAttempts - 1];
        if (change) {
          writing = true;
          try {
            expect(await deliveryRows(db)).toEqual(expectedRows);
            await committed(writer, change);
            expectedRows = await deliveryRows(db);
            expect(expectedRows.results).toEqual([]);
            expect(expectedRows.outbox.every((row) => row.state === "pending")).toBe(true);
            expectedState = await snapshot(writer);
          } finally { writing = false; }
        }
      }
      return hashed;
    });
    const result = await recorder.recordDeliveryResult(terminal);
    hash.mockRestore();
    expect(result).toEqual({ status: "retry-required", reason: "Delivery graph changed repeatedly during integrity verification; retry the same result" });
    expect(auditAttempts).toBe(3);
    expect(checkpoints).not.toHaveBeenCalled();
    expect(await deliveryRows(db)).toEqual(expectedRows);
    expect(await snapshot(repo)).toEqual(expectedState);
    expect(expectedState.localSequence).toBe(7);
    expect(expectedState.archive.setups[0].name).toBe("G");
    expect(expectedRows.operations.filter((row) => ["A", "B", "C", "D"].includes(row.operationId))).toEqual(originalRows.operations);

    expect(await recorder.recordDeliveryResult(terminal)).toEqual({ status: "recorded", result: terminal });
    const recordedRows = await deliveryRows(db);
    expect(recordedRows.results).toEqual([terminal]);
    expect(recordedRows.operations).toEqual(expectedRows.operations);
    expect(recordedRows.outbox).toEqual(expectedRows.outbox.map((row) => ({ ...row, state: row.operationId === "D" ? "pending" : "blocked" })));
    expect(await snapshot(repo)).toEqual(expectedState);
    expect((await recorder.readDeliveryReadiness({ generationId })).map((node) => [node.operationId, node.status])).toEqual([
      ["A", "rejected"], ["B", "blocked"], ["C", "blocked"], ["D", "ready"], ["E", "blocked"], ["F", "blocked"], ["G", "blocked"],
    ]);
  });

  it("aborts delivery when the account-bound handle closes after the terminal write", async () => {
    const { factory, db, a } = await deliveryFixture();
    const before = await deliveryRows(db);
    const repo = await repository(factory, { testHooks: { checkpoint: (at) => { if (at === "after-delivery-result") repo.close(); } } });
    await expect(repo.recordDeliveryResult(acceptedDelivery(a))).rejects.toThrow();
    expect(await deliveryRows(db)).toEqual(before);
    await expect(repo.recordDeliveryResult(acceptedDelivery(a))).rejects.toThrow(/closed/);
  });
});
