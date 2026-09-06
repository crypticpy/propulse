import "fake-indexeddb/auto";
import { forceCloseDatabase, IDBFactory } from "fake-indexeddb";
import { unwrap, wrap } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABSENT_POINTER_VERSION, STATION_DATABASE_NAME, STATION_DATABASE_VERSION, openStationDatabase,
  type AccountMetaRecord, type StationDatabaseHandle, type StationDatabaseOptions,
} from "@/lib/station/workbench/storage/database";

const handles: StationDatabaseHandle[] = [];
const nativeHandles: IDBDatabase[] = [];
afterEach(() => {
  handles.splice(0).forEach((handle) => handle.close());
  nativeHandles.splice(0).forEach((handle) => handle.close());
});

async function ready(factory: IDBFactory, ownerId = "owner-a", extra: Partial<StationDatabaseOptions> = {}) {
  const result = await openStationDatabase({ ownerId, indexedDB: factory, ...extra });
  if (result.status !== "ready") throw new Error(result.reason);
  handles.push(result.database);
  return result.database;
}

function nativeOpen(factory: IDBFactory, name: string, version: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      nativeHandles.push(request.result);
      resolve(request.result);
    };
  });
}

// Frozen v1 fixture independent of the implementation's v2 structure. Upgrade
// tests deliberately retain opaque bodies: this boundary upgrades schema, not data.
const V1_FIXTURE: Record<string, { key: string[]; indexes: Record<string, string[]> }> = {
  accountMeta: { key: ["ownerId", "key"], indexes: {} },
  generations: { key: ["ownerId", "generationId"], indexes: { "by-state": ["ownerId", "state"] } },
  recordVersions: { key: ["ownerId", "generationId", "kind", "id", "versionId"], indexes: { "by-entity": ["ownerId", "generationId", "kind", "id"], "by-kind": ["ownerId", "generationId", "kind"] } },
  heads: { key: ["ownerId", "generationId", "kind", "id"], indexes: { "by-kind": ["ownerId", "generationId", "kind"] } },
  operations: { key: ["ownerId", "operationId"], indexes: { "by-sequence": ["ownerId", "generationId", "localSequence"] } },
  outbox: { key: ["ownerId", "operationId"], indexes: { "by-state-sequence": ["ownerId", "generationId", "state", "localSequence"] } },
  conflicts: { key: ["ownerId", "generationId", "conflictId"], indexes: { "by-state": ["ownerId", "generationId", "state"] } },
  migrationRecords: { key: ["ownerId", "stageId", "chunkId"], indexes: { "by-stage": ["ownerId", "stageId"] } },
  recoveryRecords: { key: ["ownerId", "generationId", "recordId"], indexes: { "by-generation": ["ownerId", "generationId"] } },
  mediaRefs: { key: ["ownerId", "generationId", "mediaId"], indexes: { "by-generation": ["ownerId", "generationId"] } },
};
function createV1Fixture(db: IDBDatabase) {
  const stores: Record<string, IDBObjectStore> = {};
  for (const [name, definition] of Object.entries(V1_FIXTURE)) {
    const store = db.createObjectStore(name, { keyPath: definition.key });
    stores[name] = store;
    for (const [index, keyPath] of Object.entries(definition.indexes)) store.createIndex(index, keyPath);
    for (const ownerId of ["owner-a", "owner-b"]) {
      const row = { ownerId, generationId: "preserved-generation", key: "active-pointer", versionId: "preserved-v1",
        kind: "equipment", id: "preserved-id", operationId: "preserved-operation", localSequence: 37,
        state: name === "outbox" ? "pending" : "unresolved", tombstone: true,
        conflictId: "conflict", stageId: "stage", chunkId: "chunk", recordId: "recovery", mediaId: "media",
        payload: JSON.parse('{"__proto__":{"kept":true},"privateNotes":"original","unknown":[0,false,null]}'),
      };
      store.add(row);
    }
  }
  return stores;
}
async function rawSnapshot(db: IDBDatabase) {
  const names = [...db.objectStoreNames];
  const tx = wrap(db.transaction(names, "readonly"));
  const result = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await tx.objectStore(name).getAll()])));
  await tx.done;
  return result;
}

describe("additive v1 to v2 delivery storage upgrade", () => {
  it("preserves all ten stores and both owner namespaces, then stores exact terminal results separately", async () => {
    const factory = new IDBFactory();
    const v1 = await nativeOpen(factory, STATION_DATABASE_NAME, 1, createV1Fixture);
    const original = await rawSnapshot(v1);
    expect(Object.keys(original)).toHaveLength(10);
    const changed = vi.fn(() => v1.close());
    v1.addEventListener("versionchange", changed);
    const handle = await ready(factory);
    expect(changed).toHaveBeenCalledOnce();
    const v2 = await nativeOpen(factory, STATION_DATABASE_NAME, 2);
    expect(v2.version).toBe(2);
    expect(await rawSnapshot(v2)).toEqual({ ...original, deliveryResults: [] });
    for (const ownerId of ["owner-a", "owner-b"]) {
      const tx = handle.transaction("deliveryResults", "readwrite");
      await tx.store.add({ schemaVersion: 1, ownerId, generationId: "preserved-generation", operationId: "preserved-operation",
        payloadDigest: "a".repeat(64), outcome: "accepted", committedHeads: [{ kind: "equipment", id: "preserved-id", versionId: "preserved-v1", deleted: true }] });
      await tx.done;
    }
    const read = handle.transaction("deliveryResults", "readonly");
    const rows = await read.store.index("by-generation").getAll(["owner-a", "preserved-generation"]);
    await read.done;
    expect(rows).toEqual([{ schemaVersion: 1, ownerId: "owner-a", generationId: "preserved-generation", operationId: "preserved-operation",
      payloadDigest: "a".repeat(64), outcome: "accepted", committedHeads: [{ kind: "equipment", id: "preserved-id", versionId: "preserved-v1", deleted: true }] }]);
    const saved = await rawSnapshot(v2);
    delete saved.deliveryResults;
    expect(saved).toEqual(original);
    await expect(nativeOpen(factory, STATION_DATABASE_NAME, 1)).rejects.toMatchObject({ name: "VersionError" });
  });
  it.each(["missing-store", "extra-store", "wrong-index-key", "unique-index", "multi-entry-index"])("rejects %s in v1 before adding a store and retains the original database", async (failure) => {
    const factory = new IDBFactory();
    const v1 = await nativeOpen(factory, STATION_DATABASE_NAME, 1, (db) => {
      const stores = createV1Fixture(db);
      if (failure === "missing-store") db.deleteObjectStore("mediaRefs");
      else if (failure === "extra-store") db.createObjectStore("unrecognized");
      else {
        stores.outbox.deleteIndex("by-state-sequence");
        stores.outbox.createIndex("by-state-sequence", failure === "multi-entry-index" ? "ownerId" : failure === "wrong-index-key" ? ["generationId", "ownerId"] : V1_FIXTURE.outbox.indexes["by-state-sequence"],
          { unique: failure === "unique-index", multiEntry: failure === "multi-entry-index" });
      }
    });
    const original = await rawSnapshot(v1);
    v1.close();
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required");
    const retained = await nativeOpen(factory, STATION_DATABASE_NAME, 1);
    expect(retained.version).toBe(1);
    expect(retained.objectStoreNames.contains("deliveryResults")).toBe(false);
    expect(await rawSnapshot(retained)).toEqual(original);
  });
  it("rolls back a failed delivery index creation, preserving v1 records for a clean retry", async () => {
    const factory = new IDBFactory();
    const v1 = await nativeOpen(factory, STATION_DATABASE_NAME, 1, createV1Fixture);
    const original = await rawSnapshot(v1);
    v1.close();
    const createIndex = IDBObjectStore.prototype.createIndex;
    const injected = vi.spyOn(IDBObjectStore.prototype, "createIndex").mockImplementation(function (this: IDBObjectStore, name, keyPath, options) {
      if (this.name === "deliveryResults") throw new DOMException("Injected upgrade failure", "QuotaExceededError");
      return createIndex.call(this, name, keyPath, options);
    });
    try { expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required"); }
    finally { injected.mockRestore(); }
    const retained = await nativeOpen(factory, STATION_DATABASE_NAME, 1);
    expect(await rawSnapshot(retained)).toEqual(original);
    expect(retained.objectStoreNames.contains("deliveryResults")).toBe(false);
    retained.close();
    await ready(factory);
    expect(await rawSnapshot(await nativeOpen(factory, STATION_DATABASE_NAME, 2))).toEqual({ ...original, deliveryResults: [] });
  });
  it("leaves an intact blocked v1 unchanged even after its abandoned upgrade request is unblocked", async () => {
    const factory = new IDBFactory();
    const blocker = await nativeOpen(factory, STATION_DATABASE_NAME, 1, createV1Fixture);
    const original = await rawSnapshot(blocker);
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => { settle = resolve; });
    const injected = { open: (name: string, version?: number) => {
      const request = factory.open(name, version);
      request.addEventListener("error", settle);
      request.addEventListener("success", settle);
      return request;
    } };
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: injected })).status).toBe("blocked");
    blocker.close();
    await settled;
    const retained = await nativeOpen(factory, STATION_DATABASE_NAME, 1);
    expect(await rawSnapshot(retained)).toEqual(original);
    expect(retained.objectStoreNames.contains("deliveryResults")).toBe(false);
  });
  it.each(["missing-store", "wrong-store-key", "wrong-index-key", "unique-index", "extra-index"])("rejects existing v2 %s without repairing data", async (failure) => {
    const factory = new IDBFactory();
    const broken = await nativeOpen(factory, STATION_DATABASE_NAME, 2, (db) => {
      createV1Fixture(db);
      if (failure === "missing-store") return;
      const store = db.createObjectStore("deliveryResults", { keyPath: failure === "wrong-store-key" ? ["operationId", "ownerId"] : ["ownerId", "operationId"] });
      store.createIndex("by-generation", failure === "wrong-index-key" ? ["generationId", "ownerId"] : ["ownerId", "generationId"], { unique: failure === "unique-index" });
      if (failure === "extra-index") store.createIndex("unexpected", "operationId");
      store.add({ ownerId: "owner-a", operationId: "original", generationId: "generation", opaqueOutcome: "preserve" });
    });
    const original = await rawSnapshot(broken);
    broken.close();
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required");
    expect(await rawSnapshot(await nativeOpen(factory, STATION_DATABASE_NAME, 2))).toEqual(original);
  });
  it("preserves a populated future database without downgrading or interpreting its records", async () => {
    const factory = new IDBFactory();
    const future = await nativeOpen(factory, STATION_DATABASE_NAME, 3, (db) => {
      createV1Fixture(db);
      db.createObjectStore("future-format").add({ original: "unknown future metadata" }, "retained");
    });
    const original = await rawSnapshot(future);
    future.close();
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required");
    expect(await rawSnapshot(await nativeOpen(factory, STATION_DATABASE_NAME, 3))).toEqual(original);
  });
});

describe("internal station database schema and owner pointers", () => {
  it("creates only empty additive stores with compound owner-first keys/indexes and an absent pointer", async () => {
    const factory = new IDBFactory();
    const handle = await ready(factory);
    expect(handle.ownerId).toBe("owner-a");
    const pointer = await handle.readAccountPointer();
    expect(pointer).toEqual({ generationId: null, versionId: ABSENT_POINTER_VERSION });
    expect(pointer.versionId).toBe("absent");
    expect(Object.isFrozen(pointer)).toBe(true);
    expect(Object.isFrozen(handle)).toBe(true);
    const db = await nativeOpen(factory, STATION_DATABASE_NAME, STATION_DATABASE_VERSION);
    const names = [...db.objectStoreNames];
    expect(names).toEqual([
      "accountMeta", "conflicts", "deliveryResults", "generations", "heads", "mediaRefs", "migrationRecords",
      "operations", "outbox", "recordVersions", "recoveryRecords",
    ]);
    const tx = db.transaction(names, "readonly");
    for (const name of names) {
      const store = tx.objectStore(name);
      expect(Array.isArray(store.keyPath)).toBe(true);
      expect(store.keyPath[0]).toBe("ownerId");
      expect(store.autoIncrement).toBe(false);
      for (const indexName of store.indexNames) {
        expect(store.index(indexName).keyPath[0]).toBe("ownerId");
      }
    }
    const read = handle.transaction(["accountMeta", "generations", "operations", "outbox"], "readonly");
    const counts = await Promise.all(["accountMeta", "generations", "operations", "outbox"].map((name) => read.objectStore(name as "accountMeta").count()));
    await read.done;
    expect(counts).toEqual([0, 0, 0, 0]);
  });

  it("keeps identical record IDs in different owner namespaces and rereads shared state across handles/reopen", async () => {
    const factory = new IDBFactory();
    const a = await ready(factory);
    const secondA = await ready(factory);
    const b = await ready(factory, "owner-b");
    // This is the internal repository bridge: production repository validation supplies the bound owner.
    for (const [handle, token] of [[a, "a-pointer"], [b, "b-pointer"]] as const) {
      const tx = handle.transaction(["accountMeta", "recordVersions", "heads", "operations", "outbox"], "readwrite");
      await tx.objectStore("accountMeta").put({ ownerId: handle.ownerId, key: "active-pointer", generationId: "same-generation", versionId: token });
      await tx.objectStore("recordVersions").put({ ownerId: handle.ownerId, generationId: "same-generation", kind: "equipment", id: "same-item", versionId: "v1", payloadDigest: "digest", body: { privateNote: handle.ownerId } });
      await tx.objectStore("heads").put({ ownerId: handle.ownerId, generationId: "same-generation", kind: "equipment", id: "same-item", versionId: "v1", tombstone: false });
      await tx.objectStore("operations").put({ ownerId: handle.ownerId, generationId: "same-generation", operationId: "same-operation", payloadDigest: "digest", localSequence: 1, status: "committed", operation: {}, result: {} });
      await tx.objectStore("outbox").put({ ownerId: handle.ownerId, generationId: "same-generation", operationId: "same-operation", localSequence: 1, state: "pending", dependencyOperationIds: [], operation: {} });
      await tx.done;
    }
    expect(await secondA.readAccountPointer()).toEqual({ generationId: "same-generation", versionId: "a-pointer" });
    expect(await b.readAccountPointer()).toEqual({ generationId: "same-generation", versionId: "b-pointer" });
    a.close();
    const reopened = await ready(factory);
    expect(await reopened.readAccountPointer()).toEqual(await secondA.readAccountPointer());
    const tx = reopened.transaction(["recordVersions", "outbox"], "readonly");
    const versions = await tx.objectStore("recordVersions").index("by-entity").getAll([reopened.ownerId, "same-generation", "equipment", "same-item"]);
    const outbox = await tx.objectStore("outbox").index("by-state-sequence").getAll([reopened.ownerId, "same-generation", "pending", 1]);
    await tx.done;
    expect(versions).toHaveLength(1);
    expect(versions[0].body).toEqual({ privateNote: "owner-a" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].ownerId).toBe("owner-a");
  });

  it.each(["", " ", "\t", " owner", "owner "])("rejects invalid owner identity %j before opening storage", async (ownerId) => {
    const open = vi.fn();
    const result = await openStationDatabase({ ownerId, indexedDB: { open } });
    expect(result.status).toBe("unavailable");
    expect(open).not.toHaveBeenCalled();
  });

  it("binds the validated owner before asynchronous open even if caller options change", async () => {
    const options = { ownerId: "owner-a", indexedDB: new IDBFactory() };
    const pending = openStationDatabase(options);
    options.ownerId = "owner-b";
    const result = await pending;
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    handles.push(result.database);
    expect(result.database.ownerId).toBe("owner-a");
  });

  it.each([
    { generationId: "", versionId: "v1" },
    { generationId: "generation", versionId: "absent" },
    { generationId: null, versionId: " " },
    { generationId: 4, versionId: "v1" },
  ])("fails closed on a corrupt or reserved stored pointer: %j", async (pointer) => {
    const handle = await ready(new IDBFactory());
    const tx = handle.transaction("accountMeta", "readwrite");
    await tx.store.put({ ownerId: handle.ownerId, key: "active-pointer", ...pointer } as AccountMetaRecord);
    await tx.done;
    await expect(handle.readAccountPointer()).rejects.toMatchObject({ code: "recovery-required" });
    const stored = handle.transaction("accountMeta", "readonly");
    expect(await stored.store.count()).toBe(1);
    await stored.done;
  });
});

describe("station database lifecycle failures", () => {
  it("close invalidates reads/transactions, aborts unfinished writes and allows clean reopen", async () => {
    const factory = new IDBFactory();
    const handle = await ready(factory);
    const tx = handle.transaction("accountMeta", "readwrite");
    const put = tx.store.put({ ownerId: handle.ownerId, key: "active-pointer", generationId: "pending", versionId: "v1" });
    const failedPut = expect(put).rejects.toBeDefined();
    const failedDone = expect(tx.done).rejects.toBeDefined();
    handle.close();
    handle.close();
    await failedPut;
    await failedDone;
    await expect(handle.readAccountPointer()).rejects.toMatchObject({ code: "closed" });
    expect(() => handle.transaction("accountMeta", "readonly")).toThrow(/closed/);
    expect(await (await ready(factory)).readAccountPointer()).toEqual({ generationId: null, versionId: "absent" });
  });

  it("versionchange closes and invalidates every bound handle, allowing an external upgrade to proceed", async () => {
    const factory = new IDBFactory();
    const invalidated = vi.fn();
    const a = await ready(factory, "owner-a", { onInvalidated: invalidated });
    const b = await ready(factory, "owner-b");
    const upgraded = await nativeOpen(factory, STATION_DATABASE_NAME, STATION_DATABASE_VERSION + 1);
    expect(upgraded.version).toBe(STATION_DATABASE_VERSION + 1);
    expect(invalidated).toHaveBeenCalledExactlyOnceWith("versionchange");
    await expect(a.readAccountPointer()).rejects.toMatchObject({ code: "closed" });
    expect(() => b.transaction("accountMeta")).toThrow(/closed/);
    upgraded.close();
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required");
  });

  it("returns blocked without leaving a late upgrade/open capable of changing data", async () => {
    const factory = new IDBFactory();
    const name = "propulse-station-workbench-test-blocked";
    const blocker = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("retained"));
    const blocked = vi.fn();
    let settleLate!: () => void;
    const late = new Promise<void>((resolve) => { settleLate = resolve; });
    // Force a genuine blocked upgrade request through the injected factory.
    // The abandoned request must not perform a late upgrade after returning blocked.
    const injected = { open: () => {
      const request = factory.open(name, 2);
      request.addEventListener("error", () => settleLate());
      request.addEventListener("success", () => settleLate());
      return request;
    } };
    const result = await openStationDatabase({ ownerId: "owner-a", dbName: name, indexedDB: injected, onBlocked: blocked });
    expect(result.status).toBe("blocked");
    expect(blocked).toHaveBeenCalledOnce();
    blocker.close();
    await late;
    const retained = await nativeOpen(factory, name, 1);
    expect([...retained.objectStoreNames]).toEqual(["retained"]);
    expect(retained.version).toBe(1);
  });

  it("invalidates a terminated connection without changing stored data", async () => {
    const factory = new IDBFactory();
    let reportInvalidation!: (reason: string) => void;
    const invalidated = new Promise<string>((resolve) => { reportInvalidation = resolve; });
    const handle = await ready(factory, "owner-a", { onInvalidated: reportInvalidation });
    const tx = handle.transaction("accountMeta", "readwrite");
    await tx.store.put({ ownerId: handle.ownerId, key: "active-pointer", generationId: "retained", versionId: "pointer-v1" });
    await tx.done;
    // fake-indexeddb 6.2.5 declares a constructor here, but its helper takes a database instance.
    forceCloseDatabase(unwrap(tx.db) as unknown as Parameters<typeof forceCloseDatabase>[0]);
    expect(await invalidated).toBe("terminated");
    await expect(handle.readAccountPointer()).rejects.toMatchObject({ code: "closed" });
    expect(await (await ready(factory)).readAccountPointer()).toEqual({ generationId: "retained", versionId: "pointer-v1" });
  });

  it("reports unavailable injected storage and synchronous permission failures", async () => {
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: null })).status).toBe("unavailable");
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: { open: () => { throw new DOMException("Denied", "SecurityError"); } } })).status).toBe("unavailable");
  });

  it("retains an unsupported existing v1 schema without repairing or recreating it", async () => {
    const factory = new IDBFactory();
    const name = "propulse-station-workbench-test-existing";
    const original = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("old-data"));
    original.close();
    expect((await openStationDatabase({ ownerId: "owner-a", dbName: name, indexedDB: factory })).status).toBe("recovery-required");
    const unchanged = await nativeOpen(factory, name, 1);
    expect([...unchanged.objectStoreNames]).toEqual(["old-data"]);
  });

  it("never opens legacy application databases, including through the disposable-name option", async () => {
    const factory = new IDBFactory();
    const reservedNames = ["propulse-db", "propulse-images", "propulse-credentials", "propulse-scp", "propulse-api-cache", "propulse-net-session-cache"];
    for (const name of reservedNames) {
      const legacy = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("original"));
      legacy.close();
      const open = vi.spyOn(factory, "open");
      expect((await openStationDatabase({ ownerId: "owner-a", dbName: name, indexedDB: factory })).status).toBe("unavailable");
      expect(open).not.toHaveBeenCalled();
      open.mockRestore();
    }
    await ready(factory);
    for (const name of reservedNames) {
      const legacy = await nativeOpen(factory, name, 1);
      expect([...legacy.objectStoreNames]).toEqual(["original"]);
    }
  });
  it.each(["unrelated-new-db", "propulse-station-workbench-test-", "propulse-station-workbench-other", " propulse-station-workbench-test-owner"])("rejects unsafe custom name %s before opening storage", async (dbName) => {
    const open = vi.fn();
    expect((await openStationDatabase({ ownerId: "owner-a", dbName, indexedDB: { open } })).status).toBe("unavailable");
    expect(open).not.toHaveBeenCalled();
  });
  it("opens an explicitly named disposable station database", async () => {
    const factory = new IDBFactory();
    const dbName = "propulse-station-workbench-test-isolated";
    const handle = await ready(factory, "owner-a", { dbName });
    expect(await handle.readAccountPointer()).toEqual({ generationId: null, versionId: "absent" });
    const tx = handle.transaction("accountMeta", "readonly");
    expect(tx.db.name).toBe(dbName);
    await tx.done;
  });
});

describe("station write transaction durability", () => {
  async function observedHandle() {
    const handle = await ready(new IDBFactory());
    const tx = handle.transaction("accountMeta", "readonly");
    const raw = unwrap(tx.db);
    await tx.done;
    return { handle, raw, original: raw.transaction.bind(raw) };
  }
  it("requests strict durability for writes, including callers asking for relaxed mode", async () => {
    const { handle, raw } = await observedHandle();
    const calls = vi.spyOn(raw, "transaction");
    const read = handle.transaction("accountMeta", "readonly");
    await read.done;
    expect(calls).toHaveBeenCalledExactlyOnceWith("accountMeta", "readonly");
    calls.mockClear();
    const write = handle.transaction("accountMeta", "readwrite", { durability: "relaxed" });
    expect(unwrap(write).durability).toBe("strict");
    await write.store.put({ ownerId: handle.ownerId, key: "local-sequence", value: 1 });
    await write.done;
    expect(calls.mock.calls).toEqual([["accountMeta", "readonly", { durability: "strict" }], ["accountMeta", "readwrite", { durability: "strict" }]]);
    calls.mockClear();
    const second = handle.transaction("accountMeta", "readwrite");
    await second.done;
    expect(calls).toHaveBeenCalledExactlyOnceWith("accountMeta", "readwrite", { durability: "strict" });
    calls.mockRestore();
  });
  it.each(["TypeError", "NotSupportedError", "ignored-options"])("falls back only after a known-valid capability probe reports %s", async (failure) => {
    const { handle, raw, original } = await observedHandle();
    const calls = vi.spyOn(raw, "transaction").mockImplementation((stores, mode, options) => {
      if (options !== undefined) {
        if (failure === "TypeError") throw new TypeError("Options unsupported");
        if (failure === "NotSupportedError") throw new DOMException("Options unsupported", "NotSupportedError");
      }
      return original(stores, mode);
    });
    const write = handle.transaction("accountMeta", "readwrite");
    await write.store.put({ ownerId: handle.ownerId, key: "local-sequence", value: 2 });
    await write.done;
    expect(calls.mock.calls).toEqual([["accountMeta", "readonly", { durability: "strict" }], ["accountMeta", "readwrite"]]);
    calls.mockClear();
    const second = handle.transaction("accountMeta", "readwrite");
    await second.done;
    expect(calls).toHaveBeenCalledExactlyOnceWith("accountMeta", "readwrite");
    calls.mockRestore();
  });
  it.each(["SecurityError", "InvalidStateError", "QuotaExceededError"])("does not treat probe %s as unsupported durability", async (name) => {
    const { handle, raw } = await observedHandle();
    const failure = new DOMException("Storage unavailable", name);
    const calls = vi.spyOn(raw, "transaction").mockImplementation(() => { throw failure; });
    expect(() => handle.transaction("accountMeta", "readwrite")).toThrow(expect.objectContaining({ name: failure.name, message: failure.message }));
    expect(calls).toHaveBeenCalledOnce();
    calls.mockRestore();
  });
  it.each(["TypeError", "NotSupportedError", "QuotaExceededError"])("does not retry an actual write failing with %s after successful detection", async (name) => {
    const { handle, raw, original } = await observedHandle();
    const failure = name === "TypeError" ? new TypeError("Invalid write") : new DOMException("Write failed", name);
    const calls = vi.spyOn(raw, "transaction").mockImplementation((stores, mode, options) => {
      if (mode === "readwrite") throw failure;
      return original(stores, mode, options);
    });
    expect(() => handle.transaction("accountMeta", "readwrite")).toThrow(expect.objectContaining({ name: failure.name, message: failure.message }));
    expect(calls.mock.calls).toEqual([["accountMeta", "readonly", { durability: "strict" }], ["accountMeta", "readwrite", { durability: "strict" }]]);
    calls.mockRestore();
  });
});
