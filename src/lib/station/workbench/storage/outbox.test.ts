import "fake-indexeddb/auto";
import { IDBFactory, IDBIndex, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openStationDatabase, type OutboxRecord, type StationDatabaseHandle } from "@/lib/station/workbench/storage/database";
import { readStationOutbox } from "@/lib/station/workbench/storage/outbox";

const handles: StationDatabaseHandle[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  handles.splice(0).forEach((handle) => handle.close());
});
const record = (operationId: string, localSequence: number, state: OutboxRecord["state"], ownerId = "owner", generationId = "active"): OutboxRecord => ({
  ownerId, generationId, operationId, localSequence, state, dependencyOperationIds: [], operation: { fixture: operationId },
});
async function seed(rows: OutboxRecord[]) {
  const opened = await openStationDatabase({ ownerId: "owner", indexedDB: new IDBFactory() });
  if (opened.status !== "ready") throw new Error(opened.reason);
  const db = opened.database;
  handles.push(db);
  const tx = db.transaction("outbox", "readwrite");
  await Promise.all(rows.map((row) => tx.store.add(row)));
  await tx.done;
  return db;
}
function observeReads() {
  const calls: { indexName: string; range: IDBKeyRange; count: number | undefined; rows: OutboxRecord[] }[] = [];
  const original = IDBIndex.prototype.getAll;
  vi.spyOn(IDBIndex.prototype, "getAll").mockImplementation(function (this: IDBIndex, query, count) {
    if (!(query instanceof IDBKeyRange)) throw new Error("Queries must use an index key range");
    const call = { indexName: this.name, range: query, count, rows: [] as OutboxRecord[] };
    calls.push(call);
    const request = original.call(this, query, count);
    request.addEventListener("success", () => { call.rows = request.result; });
    return request;
  });
  const fullStoreRead = vi.spyOn(IDBObjectStore.prototype, "getAll");
  const storeCursor = vi.spyOn(IDBObjectStore.prototype, "openCursor");
  const indexCursor = vi.spyOn(IDBIndex.prototype, "openCursor");
  return { calls, fullStoreRead, storeCursor, indexCursor };
}

function fixtureRows() {
  const rows: OutboxRecord[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push(record(`pending-${i}`, i * 3 + 3, "pending"), record(`blocked-${i}`, i * 3 + 1, "blocked"), record(`conflicted-${i}`, i * 3 + 2, "conflicted"));
    rows.push(record(`ack-${i}`, i, "acknowledged"), record(`old-${i}`, i, "pending", "owner", "old"), record(`other-${i}`, i, "pending", "other", "active"));
  }
  return rows;
}

describe("indexed unacknowledged outbox queries", () => {
  it("bounds each state read before merging and excludes unrelated rows at the index", async () => {
    const db = await seed(fixtureRows());
    const observed = observeReads();
    const tx = db.transaction("outbox", "readonly");
    const result = await readStationOutbox(tx.store, { ownerId: "owner", generationId: "active", limit: 4 });
    await tx.done;
    expect(result.map((row) => row.localSequence)).toEqual([1, 2, 3, 4]);
    expect(result.map((row) => row.operationId)).toEqual(["blocked-0", "conflicted-0", "pending-0", "blocked-1"]);
    expect(observed.calls).toHaveLength(3);
    expect(observed.calls.map((call) => call.count)).toEqual([4, 4, 4]);
    expect(observed.calls.reduce((sum, call) => sum + call.rows.length, 0)).toBe(12);
    for (const call of observed.calls) {
      expect(call.indexName).toBe("by-state-sequence");
      expect(call.rows.every((row) => row.ownerId === "owner" && row.generationId === "active" && row.state !== "acknowledged")).toBe(true);
      expect(call.range.includes(["owner", "active", "acknowledged", 1])).toBe(false);
      expect(call.range.includes(["owner", "old", "pending", 1])).toBe(false);
      expect(call.range.includes(["other", "active", "pending", 1])).toBe(false);
    }
    expect(observed.fullStoreRead).not.toHaveBeenCalled();
    expect(observed.storeCursor).not.toHaveBeenCalled();
    expect(observed.indexCursor).not.toHaveBeenCalled();
  });

  it("reads all scoped outstanding dependencies in a caller-owned write transaction", async () => {
    const db = await seed(fixtureRows());
    const observed = observeReads();
    const tx = db.transaction(["outbox", "operations"], "readwrite");
    const result = await readStationOutbox(tx.objectStore("outbox"), { ownerId: "owner", generationId: "active" });
    await tx.done;
    expect(result).toHaveLength(90);
    expect(result.map((row) => row.localSequence)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(observed.calls.map((call) => call.count)).toEqual([undefined, undefined, undefined]);
    expect(observed.calls.reduce((sum, call) => sum + call.rows.length, 0)).toBe(90);
    expect(result.some((row) => row.state === "acknowledged" || row.ownerId !== "owner" || row.generationId !== "active")).toBe(false);
    expect(observed.fullStoreRead).not.toHaveBeenCalled();
  });

  it("uses deterministic IDB-compatible tie ordering and handles an empty requested generation", async () => {
    const db = await seed([record("z", 1, "pending"), record("A", 1, "pending"), record("b", 1, "blocked"), record("Z", 1, "conflicted")]);
    const tx = db.transaction("outbox", "readonly");
    expect((await readStationOutbox(tx.store, { ownerId: "owner", generationId: "active", limit: 2 })).map((row) => row.operationId)).toEqual(["A", "Z"]);
    await tx.done;
    const empty = db.transaction("outbox", "readonly");
    expect(await readStationOutbox(empty.store, { ownerId: "owner", generationId: "absent", limit: 2 })).toEqual([]);
    await empty.done;
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, 0x1_0000_0000, Number.MAX_SAFE_INTEGER])("rejects invalid limit %s without opening an index", async (limit) => {
    const index = vi.fn();
    await expect(readStationOutbox({ index }, { ownerId: "owner", generationId: "active", limit })).rejects.toThrow(/positive unsigned 32-bit integer/);
    expect(index).not.toHaveBeenCalled();
  });

  it("passes the maximum valid IDB count without wrapping to zero", async () => {
    const db = await seed([record("one", 1, "pending")]);
    const observed = observeReads();
    const tx = db.transaction("outbox", "readonly");
    expect(await readStationOutbox(tx.store, { ownerId: "owner", generationId: "active", limit: 0xffff_ffff })).toHaveLength(1);
    await tx.done;
    expect(observed.calls.map((call) => call.count)).toEqual([0xffff_ffff, 0xffff_ffff, 0xffff_ffff]);
  });
});
