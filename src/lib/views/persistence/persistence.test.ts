import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import { createDisplayAssignmentFixture } from "../fixtures";
import { IndexedViewLibrary } from "./indexedLibrary";
import { RevisionedViewRepository, type LibraryTransport } from "./repository";
import { type LibraryOperation, type ViewDraft } from "./schema";

const connections: IndexedViewLibrary[] = [];
const names = new Set<string>();
let nextId = 0;
function library(owner = "owner-a", name = `view-test-${++nextId}`) {
  names.add(name);
  const db = new IndexedViewLibrary(owner, name);
  connections.push(db);
  return db;
}
function view(id = "station"): ViewDraft {
  return { id, name: "Station", schemaVersion: 1, sourcePreset: null, config: createViewConfiguration() };
}
function operation(id = "station", expectedRevision = 0, ownerId = "owner-a"): LibraryOperation {
  return { operationId: `operation-${++nextId}`, ownerId, kind: "view", id, expectedRevision, value: { kind: "view", data: view(id) } };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(connections.splice(0).map((db) => db.close()));
  await Promise.all([...names].map((name) => deleteDB(name)));
  names.clear();
});

describe("transactional owner library", () => {
  it("serializes two tabs saving the same revision without losing independent views", async () => {
    const a = library();
    const name = [...names][0];
    const b = library("owner-a", name);
    const results = await Promise.all([a.commitLocal(operation()), b.commitLocal(operation())]);
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "saved"]);
    expect((await a.get("view", "station"))?.revision).toBe(1);
    const distinct = await Promise.all([a.commitLocal(operation("tv-1")), b.commitLocal(operation("tv-2"))]);
    expect(distinct.map((result) => result.status)).toEqual(["saved", "saved"]);
    expect(await a.list()).toHaveLength(3);
  });

  it("partitions owners and rejects foreign mutations/imports", async () => {
    const a = library();
    const b = library("owner-b", [...names][0]);
    const saved = await a.commitLocal(operation());
    expect(await b.get("view", "station")).toBeNull();
    expect((await b.commitLocal(operation())).status).toBe("forbidden");
    if (saved.status !== "saved") throw new Error("Expected saved fixture");
    await expect(b.cache([saved.record])).rejects.toThrow("Owner mismatch");
    expect(await b.list()).toEqual([]);
  });

  it("replays operation receipts exactly and rejects operation ID reuse", async () => {
    const db = library();
    const request = operation();
    const first = await db.commitLocal(request);
    expect(await db.commitLocal(request)).toEqual(first);
    const changed = structuredClone(request);
    if (changed.value?.kind === "view") changed.value.data.name = "Changed";
    expect((await db.commitLocal(changed)).status).toBe("invalid");
    expect((await db.get("view", "station"))?.revision).toBe(1);
  });

  it("retains tombstone revisions and prevents stale create resurrection", async () => {
    const db = library();
    await db.commitLocal(operation());
    const removed = await db.commitLocal({ ...operation("station", 1), value: null });
    expect(removed.status).toBe("saved");
    expect((await db.get("view", "station"))?.value).toBeNull();
    const stale = await db.commitLocal(operation());
    expect(stale.status).toBe("conflict");
    if (stale.status === "conflict") expect(stale.current?.revision).toBe(2);
    expect((await db.commitLocal(operation("station", 2))).status).toBe("saved");
  });

  it("uses independent revisions for views and custom presets", async () => {
    const db = library();
    const repo = new RevisionedViewRepository(db, { mode: "local" });
    expect((await repo.saveView("owner-a", view(), 0)).status).toBe("saved");
    const preset = { kind: "activity" as const, id: "station", name: "Quiet", version: 1, spots: createSpotPreferences() };
    expect((await repo.savePreset("owner-a", preset, 0)).status).toBe("saved");
    expect((await repo.savePreset("owner-a", preset, 1)).status).toBe("saved");
    expect((await repo.getView("owner-a", "station"))?.revision).toBe(1);
    expect((await db.get("preset", "station"))?.revision).toBe(2);
    await expect(repo.getView("owner-b", "station")).rejects.toThrow();
  });

  it("does not alias input/output objects or regress a cached revision", async () => {
    const db = library();
    const request = operation();
    const first = await db.commitLocal(request);
    if (first.status !== "saved") throw new Error("Expected saved fixture");
    if (request.value?.kind === "view") request.value.data.name = "Mutated input";
    expect((await db.get("view", "station"))?.value).toEqual(first.record.value);
    await db.cache([{ ...first.record, revision: 3 }]);
    await db.cache([first.record]);
    expect((await db.get("view", "station"))?.revision).toBe(3);
  });

  it("reports storage failure without confirming a save, and can recover", async () => {
    const db = library();
    const failed = vi.spyOn(indexedDB, "open").mockImplementationOnce(() => { throw new DOMException("Blocked", "SecurityError"); });
    expect((await db.commitLocal(operation())).status).toBe("unavailable");
    failed.mockRestore();
    expect(await db.list()).toEqual([]);
    expect((await db.commitLocal(operation())).status).toBe("saved");
  });

  it("rejects invalid/future snapshots before mutating records", async () => {
    const db = library();
    const request = operation();
    if (request.value?.kind === "view") Reflect.set(request.value.data.config, "schemaVersion", 999);
    expect((await db.commitLocal(request)).status).toBe("invalid");
    expect(await db.list()).toEqual([]);
  });

  it("rolls back the record when writing its receipt fails", async () => {
    const db = library();
    await db.list();
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "receipts") throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, value, key);
    });
    expect((await db.commitLocal(operation())).status).toBe("unavailable");
    put.mockRestore();
    expect(await db.list()).toEqual([]);
    expect((await db.commitLocal(operation())).status).toBe("saved");
  });

  it("validates registered widget versions and payloads before persistence", async () => {
    const db = library();
    const invalidWidgets: Array<{ tileId: string; schemaVersion: number; config: Record<string, number> }> = [
      { tileId: "missing", schemaVersion: 1, config: {} },
      { tileId: "recentContacts", schemaVersion: 2, config: { rowCount: 4 } },
      { tileId: "recentContacts", schemaVersion: 1, config: { rowCount: 99 } },
    ];
    for (const widget of invalidWidgets) {
      const request = operation();
      if (request.value?.kind === "view") request.value.data.config.presentation.hamclock.widgets = [widget];
      expect((await db.commitLocal(request)).status).toBe("invalid");
    }
    const request = operation();
    if (request.value?.kind === "view") request.value.data.config.presentation.hamclock.widgets = [
      { tileId: "recentContacts", schemaVersion: 1, config: { rowCount: 3 } },
    ];
    expect((await db.commitLocal(request)).status).toBe("saved");
  });
});

describe("offline and account lifecycle", () => {
  function account(transport: LibraryTransport, currentOwner = () => "owner-a") {
    const db = library();
    return { db, repo: new RevisionedViewRepository(db, { mode: "account", transport, currentOwner }) };
  }

  it("persists an offline draft without claiming it saved or changing the library", async () => {
    const server = library();
    let offline = true;
    const { db, repo } = account({ commit: async (request) => {
      if (offline) throw new Error("Offline");
      return server.commitLocal(request);
    } });
    const result = await repo.saveView("owner-a", view(), 0);
    expect(result.status).toBe("pending");
    expect(await repo.getView("owner-a", "station")).toBeNull();
    expect(await db.pending()).toHaveLength(1);
    offline = false;
    await repo.flushPending();
    expect((await repo.getView("owner-a", "station"))?.revision).toBe(1);
    expect(await db.pending()).toEqual([]);
  });

  it("replays a lost successful acknowledgement without creating a second revision", async () => {
    const server = library();
    let lost = true;
    const { db, repo } = account({ commit: async (request) => {
      const result = await server.commitLocal(request);
      if (lost) { lost = false; throw new Error("Connection lost after server commit"); }
      return result;
    } });
    expect((await repo.saveView("owner-a", view(), 0)).status).toBe("pending");
    await repo.flushPending();
    expect((await server.get("view", "station"))?.revision).toBe(1);
    expect((await repo.getView("owner-a", "station"))?.revision).toBe(1);
    expect(await db.pending()).toEqual([]);
  });

  it("settles concurrent replay acknowledgements once across connections", async () => {
    const db = library();
    const other = library("owner-a", [...names][0]);
    const server = library();
    const request = operation();
    await db.enqueue(request);
    const acknowledgement = await server.commitLocal(request);
    const results = await Promise.all([db.settle(request, acknowledgement), other.settle(request, acknowledgement)]);
    expect(results.map((result) => result.status)).toEqual(["saved", "saved"]);
    expect((await db.get("view", "station"))?.revision).toBe(1);
    expect(await db.pending()).toEqual([]);
    // Replaying the receipt must not roll back a later cache revision.
    if (acknowledgement.status !== "saved") throw new Error("Expected saved fixture");
    await db.cache([{ ...acknowledgement.record, revision: 2 }]);
    expect((await other.settle(request, acknowledgement)).status).toBe("saved");
    expect((await db.get("view", "station"))?.revision).toBe(2);
  });

  it("retains conflict drafts and only retries after an explicit new revision choice", async () => {
    const server = library();
    await server.commitLocal(operation());
    const commit = vi.fn((request: LibraryOperation) => server.commitLocal(request));
    const { db, repo } = account({ commit });
    expect((await repo.saveView("owner-a", view(), 0)).status).toBe("conflict");
    const pending = await db.pending();
    expect(pending[0].state).toBe("conflict");
    expect(pending[0].current?.revision).toBe(1);
    await repo.flushPending();
    expect(commit).toHaveBeenCalledTimes(1);
    await db.discard(pending[0].operation.operationId);
    expect((await repo.saveView("owner-a", { ...view(), name: "Explicit overwrite" }, 1)).status).toBe("saved");
  });

  it("leaves old-owner responses unapplied after account change", async () => {
    const server = library();
    let owner: string | null = "owner-a";
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    const { db, repo } = account({ commit: async (request) => {
      started(); await wait; return server.commitLocal(request);
    } }, () => owner ?? "");
    const save = repo.saveView("owner-a", view(), 0);
    await began;
    owner = "owner-b";
    release();
    expect((await save).status).toBe("forbidden");
    expect(await db.list()).toEqual([]);
    expect((await db.pending())[0].state).toBe("queued");
    await expect(repo.getView("owner-a", "station")).rejects.toThrow();
  });

  it("rejects mismatched server acknowledgements without losing the draft", async () => {
    const { db, repo } = account({ commit: async (request) => ({
      status: "saved", record: { ownerId: "owner-b", kind: "view", id: request.id, revision: 1, value: request.value },
    }) });
    expect((await repo.saveView("owner-a", view(), 0)).status).toBe("invalid");
    expect(await db.list()).toEqual([]);
    expect((await db.pending())[0].state).toBe("rejected");
  });

  it("cannot overwrite an outstanding draft with another save", async () => {
    const { db, repo } = account({ commit: async () => { throw new Error("Offline"); } });
    expect((await repo.saveView("owner-a", view(), 0)).status).toBe("pending");
    expect((await repo.saveView("owner-a", { ...view(), name: "Second draft" }, 0)).status).toBe("invalid");
    expect(await db.pending()).toHaveLength(1);
    expect((await repo.saveView("owner-a", view("tv-2"), 0)).status).toBe("pending");
    expect(await db.pending()).toHaveLength(2);
  });

  it("persists pending requests across connection restart", async () => {
    const { db, repo } = account({ commit: async () => { throw new Error("Offline"); } });
    const name = [...names].at(-1)!;
    await repo.saveView("owner-a", view(), 0);
    const request = (await db.pending())[0].operation;
    repo.dispose();
    const reopened = library("owner-a", name);
    expect((await reopened.pending())[0].operation).toEqual(request);
    expect(await library("owner-b", name).pending()).toEqual([]);
  });

  it("does not report a discarded in-flight request as still pending", async () => {
    const server = library();
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const began = new Promise<void>((resolve) => { started = resolve; });
    const { db, repo } = account({ commit: async (request) => {
      started(); await waiting; return server.commitLocal(request);
    } });
    const saving = repo.saveView("owner-a", view(), 0);
    await began;
    await db.discard((await db.pending())[0].operation.operationId);
    release();
    expect((await saving).status).toBe("invalid");
    expect(await db.pending()).toEqual([]);
    // Discarding the local draft does not promise cancellation of an already-sent server request.
    expect((await server.get("view", "station"))?.revision).toBe(1);
  });

  it("keeps publication distinct from view saves and never claims local delivery", async () => {
    const assignment = createDisplayAssignmentFixture();
    const { revision: _revision, ...draft } = assignment;
    const local = new RevisionedViewRepository(library(), { mode: "local" });
    expect((await local.publishDisplay("owner-a", "tv-1", draft, 0)).status).toBe("unavailable");
    const server = library();
    const { db, repo } = account({ commit: (request) => server.commitLocal(request) });
    expect((await repo.publishDisplay("owner-a", "tv-1", draft, 0)).status).toBe("saved");
    expect((await repo.saveView("owner-a", view("tv-1"), 0)).status).toBe("saved");
    expect(await db.list()).toHaveLength(2);
    expect((await db.get("display", "tv-1"))?.value).toEqual({ kind: "display", data: draft });
  });
});
