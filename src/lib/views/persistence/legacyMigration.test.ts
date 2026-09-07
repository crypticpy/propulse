import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import { createDisplayAssignmentFixture } from "../fixtures";
import { IndexedViewLibrary } from "./indexedLibrary";
import { legacyMigrationPlanSchema, type LegacyMigrationPlan } from "./legacyMigration";
import { RevisionedViewRepository } from "./repository";

const connections: IndexedViewLibrary[] = [];
const names = new Set<string>();
function library(owner = "owner-a", name: string = crypto.randomUUID()) {
  names.add(name);
  const db = new IndexedViewLibrary(owner, name);
  connections.push(db);
  return db;
}
function plan(ownerId = "owner-a", source: LegacyMigrationPlan["source"] = "device"): LegacyMigrationPlan {
  const seed = (family: "normal" | "pro" | "lite" | "hamclock") => ({
    id: `legacy-${family}`, name: `Legacy ${family}`, schemaVersion: 1 as const, sourcePreset: null,
    config: createViewConfiguration(family),
  });
  return {
    version: 1, ownerId, source, backup: { settings: { textScale: "lg", unknownOldField: { retained: true } } },
    views: { normal: seed("normal"), pro: seed("pro"), lite: seed("lite"), hamclock: seed("hamclock") },
    presets: [], scenes: createDisplayAssignmentFixture().scenes,
    warnings: ["Angular clustering radius has no geographic equivalent; region grouping used"],
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(connections.splice(0).map((db) => db.close()));
  await Promise.all([...names].map((name) => deleteDB(name)));
  names.clear();
});

describe("atomic legacy view migration", () => {
  it("captures four independent local seeds, unknown backup fields and complete scenes exactly once", async () => {
    const db = library();
    const input = plan();
    const first = await db.migrateLegacy(input, "local");
    expect(first.status).toBe("migrated");
    expect(await db.list("view")).toHaveLength(4);
    expect(await db.list("display")).toEqual([]);
    expect(await db.pending()).toEqual([]);
    input.views.pro.name = "Later live edits";
    input.scenes[0].config.presentation.layers.spots = !input.scenes[0].config.presentation.layers.spots;
    const repeated = await db.migrateLegacy(input, "local");
    expect(repeated.status).toBe("existing");
    if (first.status !== "migrated" || repeated.status !== "existing") throw new Error("Expected migration");
    expect(repeated.journal).toEqual(first.journal);
    expect((await db.legacyMigration("device"))?.plan.backup).toEqual(plan().backup);
    first.journal.plan.views.normal.name = "Changed returned object";
    expect((await db.get("view", "legacy-normal"))?.value?.kind).toBe("view");
    expect((await db.legacyMigration("device"))?.plan.views.normal.name).toBe("Legacy normal");
  });

  it("queues account seeds without claiming a cloud save or publishing scenes; explicit replay uses repository CAS", async () => {
    const db = library();
    const input = plan("owner-a", "account");
    const first = await db.migrateLegacy(input, "account");
    expect(first.status).toBe("migrated");
    expect(await db.list()).toEqual([]);
    const pending = await db.pending();
    expect(pending).toHaveLength(4);
    expect(pending.every((row) => row.operation.expectedRevision === 0 && row.operation.kind === "view")).toBe(true);
    expect((await db.migrateLegacy(input, "account")).status).toBe("existing");
    expect(await db.pending()).toEqual(pending);
    const server = library();
    const transport = { commit: vi.fn((operation) => server.commitLocal(operation)) };
    const repo = new RevisionedViewRepository(db, { mode: "account", transport, currentOwner: () => "owner-a" });
    await repo.flushPending();
    expect(transport.commit).toHaveBeenCalledTimes(4);
    expect(await db.list("view")).toHaveLength(4);
    expect(await db.pending()).toEqual([]);
    expect((await db.migrateLegacy(input, "account")).status).toBe("existing");
    expect(await db.pending()).toEqual([]);
  });

  it("serializes competing tabs; the first captured baseline wins", async () => {
    const a = library();
    const b = library("owner-a", [...names][0]);
    const one = plan();
    const two = plan();
    two.views.normal.name = "Second capture";
    const results = await Promise.all([a.migrateLegacy(one, "local"), b.migrateLegacy(two, "local")]);
    expect(results.map((result) => result.status).sort()).toEqual(["existing", "migrated"]);
    expect(await a.legacyMigration("device")).toEqual(await b.legacyMigration("device"));
    expect(await a.list()).toHaveLength(4);
  });

  it("never reuses a device capture for another owner, but permits distinct account captures", async () => {
    const a = library();
    const b = library("owner-b", [...names][0]);
    expect((await a.migrateLegacy(plan(), "account")).status).toBe("migrated");
    expect((await b.migrateLegacy(plan("owner-b"), "account")).status).toBe("forbidden");
    expect(await b.legacyMigration("device")).toBeNull();
    expect((await b.migrateLegacy(plan("owner-b", "account"), "account")).status).toBe("migrated");
    expect(await b.legacyMigration("account")).not.toBeNull();
    expect(await a.legacyMigration("account")).toBeNull();
  });

  it("does not silently convert local migration records into cloud-confirmed records", async () => {
    const db = library();
    await db.migrateLegacy(plan(), "local");
    expect((await db.migrateLegacy(plan(), "account")).status).toBe("conflict");
    expect(await db.pending()).toEqual([]);
    expect((await db.migrateLegacy(plan("owner-a", "account"), "local")).status).toBe("invalid");
  });

  it.each(["record", "tombstone", "pending"])("does not overwrite an existing %s or partially seed other views", async (kind) => {
    const db = library();
    const request = { operationId: "existing", ownerId: "owner-a", kind: "view" as const, id: "legacy-pro", expectedRevision: 0,
      value: { kind: "view" as const, data: plan().views.pro } };
    if (kind === "pending") await db.enqueue(request);
    else {
      await db.commitLocal(request);
      if (kind === "tombstone") await db.commitLocal({ ...request, operationId: "deleted", expectedRevision: 1, value: null });
    }
    expect((await db.migrateLegacy(plan(), "local")).status).toBe("conflict");
    expect(await db.get("view", "legacy-normal")).toBeNull();
    expect(await db.legacyMigration("device")).toBeNull();
  });

  it.each(["local", "account"] as const)("rolls back every %s seed if writing the journal fails", async (mode) => {
    const db = library();
    await db.list();
    const original = IDBObjectStore.prototype.add;
    const add = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "migrations") throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, value, key);
    });
    expect((await db.migrateLegacy(plan(), mode)).status).toBe("unavailable");
    add.mockRestore();
    expect(await db.list()).toEqual([]);
    expect(await db.pending()).toEqual([]);
    expect(await db.legacyMigration("device")).toBeNull();
    expect((await db.migrateLegacy(plan(), mode)).status).toBe("migrated");
  });

  it.each(["abort", "owner-change"])("rolls back seeds and journal on %s during the final write", async (change) => {
    const db = library();
    let active = true;
    const controller = new AbortController();
    const original = IDBObjectStore.prototype.add;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = original.call(this, value, key);
      if (this.name === "migrations") {
        if (change === "abort") controller.abort();
        else active = false;
      }
      return request;
    });
    expect((await db.migrateLegacy(plan(), "account", { signal: controller.signal, isActive: () => active })).status).toBe("forbidden");
    expect(await db.list()).toEqual([]);
    expect(await db.pending()).toEqual([]);
    expect(await db.legacyMigration("device")).toBeNull();
  });

  it("rejects invalid/future input, aliased family IDs, credentials, cycles and incomplete scenes before opening storage", async () => {
    const db = library();
    const open = vi.spyOn(indexedDB, "open");
    const invalid = [
      { ...plan(), version: 999 },
      { ...plan(), backup: { settings: { api_key: "do-not-copy" } } },
      { ...plan(), backup: { data: "x".repeat(2 * 1024 * 1024) } },
    ];
    const duplicate = plan(); duplicate.views.lite.id = duplicate.views.pro.id; invalid.push(duplicate);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle; invalid.push({ ...plan(), backup: cycle });
    const partial = plan(); Reflect.deleteProperty(partial.scenes[0].config, "spots"); invalid.push(partial);
    for (const input of invalid) {
      expect(legacyMigrationPlanSchema.safeParse(input).success).toBe(false);
      expect((await db.migrateLegacy(input as LegacyMigrationPlan, "local")).status).toBe("invalid");
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("retains named recipe IDs while keeping them independent of same-named views", async () => {
    const db = library();
    const input = plan();
    input.presets = [{ kind: "activity", id: "legacy-normal", name: "My CW", version: 1, spots: createSpotPreferences() }];
    expect((await db.migrateLegacy(input, "local")).status).toBe("migrated");
    expect((await db.get("preset", "legacy-normal"))?.value).toEqual({ kind: "preset", data: input.presets[0] });
    expect((await db.get("view", "legacy-normal"))?.value?.kind).toBe("view");
  });

  it("retains existing pending drafts and leaves no journal when account queue capacity is insufficient", async () => {
    const db = library();
    const input = plan("owner-a", "account");
    input.presets = Array.from({ length: 64 }, (_, i) => ({ kind: "activity", id: `recipe-${i}`, name: `Recipe ${i}`, version: 1, spots: createSpotPreferences() }));
    for (let i = 0; i < 33; i++) {
      const id = `pending-${i}`;
      await db.enqueue({ operationId: id, ownerId: "owner-a", kind: "view", id, expectedRevision: 0,
        value: { kind: "view", data: { ...input.views.normal, id } } });
    }
    expect((await db.migrateLegacy(input, "account")).status).toBe("unavailable");
    expect(await db.pending()).toHaveLength(33);
    expect(await db.list()).toEqual([]);
    expect(await db.legacyMigration("account")).toBeNull();
  });

  it("upgrades the v1 database without losing records, pending drafts or receipts", async () => {
    const name = crypto.randomUUID();
    const old = await openDB(name, 1, { upgrade(db) {
      db.createObjectStore("records", { keyPath: ["ownerId", "kind", "id"] }).createIndex("owner", "ownerId");
      const pending = db.createObjectStore("pending", { keyPath: ["operation.ownerId", "operation.operationId"] });
      pending.createIndex("owner", "operation.ownerId");
      pending.createIndex("document", ["operation.ownerId", "operation.kind", "operation.id"], { unique: true });
      db.createObjectStore("receipts", { keyPath: ["operation.ownerId", "operation.operationId"] }).createIndex("owner", "operation.ownerId");
    } });
    const request = { operationId: "old-save", ownerId: "owner-a", kind: "view" as const, id: "old-view", expectedRevision: 0,
      value: { kind: "view" as const, data: { ...plan().views.normal, id: "old-view" } } };
    const saved = { status: "saved" as const, record: { ownerId: request.ownerId, kind: request.kind, id: request.id, revision: 1, value: request.value } };
    await old.put("records", saved.record);
    await old.put("receipts", { operation: request, result: saved });
    await old.put("pending", { operation: { ...request, operationId: "pending", id: "draft", value: { ...request.value, data: { ...request.value.data, id: "draft" } } }, state: "queued", message: null, current: null });
    old.close();
    const db = library("owner-a", name);
    expect((await db.migrateLegacy(plan(), "local")).status).toBe("migrated");
    expect(await db.commitLocal(request)).toEqual(saved);
    expect(await db.pending()).toHaveLength(1);
    expect(await db.list()).toHaveLength(5);
  });
});
