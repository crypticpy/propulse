import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewConfiguration } from "../defaults";
import { IndexedViewLibrary } from "./indexedLibrary";
import { ViewLibrarySync, type ReadableLibraryTransport } from "./librarySync";
import type { LibraryPageResult } from "./httpTransport";
import type { LibraryRecord } from "./schema";

const libraries: IndexedViewLibrary[] = [];
const syncs: ViewLibrarySync[] = [];
const names = new Set<string>();
function library(name: string = crypto.randomUUID()) {
  names.add(name);
  const db = new IndexedViewLibrary("owner-a", name);
  libraries.push(db);
  return db;
}
function record(id = "station", revision = 1): LibraryRecord {
  return { ownerId: "owner-a", kind: "view", id, revision, value: { kind: "view", data: {
    id, name: id, schemaVersion: 1, sourcePreset: null, config: createViewConfiguration(),
  } } };
}
function setup(readPage: ReadableLibraryTransport["readPage"], currentOwner = () => "owner-a") {
  const db = library();
  const transport = { readPage: vi.fn(readPage), commit: vi.fn(async () => ({ status: "unavailable" as const, message: "Offline" })) };
  const sync = new ViewLibrarySync(db, transport, currentOwner);
  syncs.push(sync);
  return { db, sync, transport };
}
afterEach(async () => {
  vi.restoreAllMocks();
  syncs.splice(0).forEach((sync) => sync.dispose());
  await Promise.all(libraries.splice(0).map((db) => db.close()));
  await Promise.all([...names].map((name) => deleteDB(name)));
  names.clear();
});

describe("session-scoped library refresh", () => {
  it("is inert until requested, coalesces pages and preserves pending drafts and newer cached revisions", async () => {
    const { db, sync, transport } = setup(async (cursor) => ({ status: "loaded", page: cursor
      ? { records: [record("tv")], nextCursor: null }
      : { records: [record()], nextCursor: { kind: "view", id: "station" } } }));
    expect(transport.readPage).not.toHaveBeenCalled();
    await db.cache([record("station", 3)]);
    await db.enqueue({ operationId: "draft", ownerId: "owner-a", kind: "view", id: "station", expectedRevision: 3, value: record().value });
    const first = sync.refresh();
    expect(sync.refresh()).toBe(first);
    expect(await first).toEqual({ status: "refreshed", records: 2 });
    expect(transport.readPage).toHaveBeenCalledTimes(2);
    expect((await db.get("view", "station"))?.revision).toBe(3);
    expect(await db.pending()).toHaveLength(1);
    expect(transport.commit).not.toHaveBeenCalled();
  });

  it.each(["dispose", "owner-change"])("ignores a delayed response after %s", async (change) => {
    let owner = "owner-a";
    let release!: (result: LibraryPageResult) => void;
    const { sync } = setup(() => new Promise((resolve) => { release = resolve; }), () => owner);
    const observer = library([...names][0]);
    const pull = sync.refresh();
    if (change === "dispose") sync.dispose();
    else owner = "owner-b";
    release({ status: "loaded", page: { records: [record()], nextCursor: null } });
    expect((await pull).status).toBe("forbidden");
    expect(await observer.list()).toEqual([]);
  });

  it.each(["abort", "owner-change", "close"])("rolls back the entire cache page on %s during its second write", async (change) => {
    const db = library();
    const observer = library([...names][0]);
    const controller = new AbortController();
    let active = true;
    await db.cache([record("station", 1)]);
    const original = IDBObjectStore.prototype.put;
    let writes = 0;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (this.name === "records" && ++writes === 2) {
        if (change === "abort") controller.abort();
        else if (change === "close") void db.close();
        else active = false;
      }
      return request;
    });
    await expect(db.cache([record("station", 2), record("tv")], {
      signal: controller.signal, isActive: () => active,
    })).rejects.toThrow();
    expect(writes).toBe(2);
    expect(await observer.list()).toEqual([record("station", 1)]);
  });

  it("retains earlier pages on failure and retries from the start without deleting cached entries", async () => {
    let fail = true;
    const { db, sync } = setup(async (cursor) => cursor && fail
      ? { status: "unavailable", message: "Offline" }
      : { status: "loaded", page: cursor
        ? { records: [{ ...record("tv", 2), value: null }], nextCursor: null }
        : { records: [record()], nextCursor: { kind: "view", id: "station" } } });
    await db.cache([record("tv"), record("unlisted")]);
    expect((await sync.refresh()).status).toBe("unavailable");
    expect((await db.get("view", "station"))?.revision).toBe(1);
    fail = false;
    expect((await sync.refresh()).status).toBe("refreshed");
    expect((await db.get("view", "tv"))?.value).toBeNull();
    expect(await db.get("view", "unlisted")).not.toBeNull();
  });

  it("rejects mixed-owner pages atomically", async () => {
    const { db, sync } = setup(async () => ({ status: "loaded", page: {
      records: [record(), { ...record("foreign"), ownerId: "owner-b" }], nextCursor: null,
    } }));
    expect((await sync.refresh()).status).toBe("unavailable");
    expect(await db.list()).toEqual([]);
  });

  it("stops cyclic cursors before applying the repeated page", async () => {
    let calls = 0;
    const { db, sync, transport } = setup(async () => {
      calls++;
      const id = calls === 2 ? "tv" : "station";
      return { status: "loaded", page: { records: [record(id, calls)], nextCursor: { kind: "view", id } } };
    });
    expect((await sync.refresh()).status).toBe("unavailable");
    expect(transport.readPage).toHaveBeenCalledTimes(3);
    expect((await db.get("view", "station"))?.revision).toBe(1);
  });
});
