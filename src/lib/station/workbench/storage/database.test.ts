import "fake-indexeddb/auto";
import { forceCloseDatabase, IDBFactory } from "fake-indexeddb";
import { unwrap } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABSENT_POINTER_VERSION, STATION_DATABASE_NAME, openStationDatabase,
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
    const db = await nativeOpen(factory, STATION_DATABASE_NAME, 1);
    const names = [...db.objectStoreNames];
    expect(names).toEqual([
      "accountMeta", "conflicts", "generations", "heads", "mediaRefs", "migrationRecords",
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
    const upgraded = await nativeOpen(factory, STATION_DATABASE_NAME, 2);
    expect(upgraded.version).toBe(2);
    expect(invalidated).toHaveBeenCalledExactlyOnceWith("versionchange");
    await expect(a.readAccountPointer()).rejects.toMatchObject({ code: "closed" });
    expect(() => b.transaction("accountMeta")).toThrow(/closed/);
    upgraded.close();
    expect((await openStationDatabase({ ownerId: "owner-a", indexedDB: factory })).status).toBe("recovery-required");
  });

  it("returns blocked without leaving a late upgrade/open capable of changing data", async () => {
    const factory = new IDBFactory();
    const name = "station-blocked-test";
    const blocker = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("retained"));
    const blocked = vi.fn();
    let settleLate!: () => void;
    const late = new Promise<void>((resolve) => { settleLate = resolve; });
    // Force a genuine blocked upgrade request through the injected factory.
    // Production always requests version 1; this also checks rejecting unexpected upgrade versions.
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
    const name = "station-existing-test";
    const original = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("old-data"));
    original.close();
    expect((await openStationDatabase({ ownerId: "owner-a", dbName: name, indexedDB: factory })).status).toBe("recovery-required");
    const unchanged = await nativeOpen(factory, name, 1);
    expect([...unchanged.objectStoreNames]).toEqual(["old-data"]);
  });

  it("never opens legacy application databases, including through the disposable-name option", async () => {
    const factory = new IDBFactory();
    for (const name of ["propulse-db", "propulse-images"]) {
      const legacy = await nativeOpen(factory, name, 1, (db) => db.createObjectStore("original"));
      legacy.close();
      const open = vi.spyOn(factory, "open");
      expect((await openStationDatabase({ ownerId: "owner-a", dbName: name, indexedDB: factory })).status).toBe("unavailable");
      expect(open).not.toHaveBeenCalled();
      open.mockRestore();
    }
    await ready(factory);
    for (const name of ["propulse-db", "propulse-images"]) {
      const legacy = await nativeOpen(factory, name, 1);
      expect([...legacy.objectStoreNames]).toEqual(["original"]);
    }
  });
});
