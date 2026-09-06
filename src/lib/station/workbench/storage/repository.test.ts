import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExperimentFixture, FIXTURE_DATE, FIXTURE_OWNER } from "@/lib/station/workbench/fixtures";
import { type WorkbenchArchive } from "@/lib/station/workbench/contracts";
import { prepareRevision } from "@/lib/station/workbench/revisions/services";
import { openStationDatabase, type StationDatabaseHandle, type RecordVersionRecord } from "@/lib/station/workbench/storage/database";
import { prepareStationOperation, type StationEntityKind } from "@/lib/station/workbench/storage/operations";
import { digestWorkbenchJson } from "@/lib/station/workbench/storage/serialization";
import { openStationRepository, type StationRepositoryOptions, type StationRepository, type StationCheckpoint } from "@/lib/station/workbench/storage/repository";

const handles: { close(): void }[] = [];
const generationId = "generation-a";
const initial = (kind: StationEntityKind, id: string) => kind === "revision" ? id : `initial:${kind}:${id}`;
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { handles.splice(0).forEach((handle) => handle.close()); vi.unstubAllGlobals(); });
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
    expect((await repo.commit(deletion)).status).toBe("committed");
    const resurrection = (expected: string, operationId: string) => prepareStationOperation({ ...base(operationId), expectedHeads: [{ kind: "equipment", id: spare.id, versionId: expected }], records: [{ kind: "equipment", id: spare.id, versionId: operationId, body: spare }], nextHeads: [{ kind: "equipment", id: spare.id, versionId: operationId }] });
    expect((await repo.commit(await resurrection(old, "stale-spare"))).status).toBe("conflict");
    await expect(repo.commit(await resurrection("deleted-spare", "explicit-spare"))).rejects.toThrow("tombstoned");
    const saved = await snapshot(repo);
    expect(saved.archive.inventory.some((item) => item.id === spare.id)).toBe(false);
    expect(saved.heads.find((head) => head.id === spare.id)).toMatchObject({ deleted: true, versionId: "deleted-spare" });
    expect(saved.localSequence).toBe(2);
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
  it("compares canonical bodies as well as digests when a retained version token collides", async () => {
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
    await expect(repo.commit(collision)).rejects.toThrow("Immutable storage version collision");
    expect(await counts(db)).toEqual(before);
    expect((await repo.readSnapshot()).status).toBe("recovery-required");
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
  it.each(["missing-version", "invalid-body", "digest-mismatch"])("returns recovery-required for %s without repairing or dropping stored data", async (failure) => {
    const factory = new IDBFactory();
    const db = await database(factory);
    const archive = await seed(db);
    const tuple: [string, string, StationEntityKind, string, string] = [FIXTURE_OWNER, generationId, "setup", archive.setups[0].id, initial("setup", archive.setups[0].id)];
    const tx = db.transaction("recordVersions", "readwrite");
    const row = (await tx.store.get(tuple))!;
    if (failure === "missing-version") await tx.store.delete(tuple);
    else await tx.store.put({ ...row, body: failure === "invalid-body" ? { malformed: true } : { ...archive.setups[0], name: "Tampered but schema-valid" } });
    await tx.done;
    const before = await counts(db);
    expect((await (await repository(factory)).readSnapshot()).status).toBe("recovery-required");
    expect(await counts(db)).toEqual(before);
  });
});
