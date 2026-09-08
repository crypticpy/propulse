import { beforeEach, expect, it, vi } from "vitest";
import { WriteQueue } from "./writeQueue";

beforeEach(() => localStorage.clear());

it("reloads only the requested owner's queue and never imports or changes either legacy format", () => {
  const legacy = JSON.stringify({ state: { queue: [{ id: "legacy-row" }] }, version: 0 });
  localStorage.setItem("propulse-sync-queue", legacy);
  const a = new WriteQueue("owner/a");
  const b = new WriteQueue("owner/b");
  expect(a.getAll()).toEqual([]);
  expect(b.getAll()).toEqual([]);
  a.enqueue("log_entries", "upsert", { id: "a-row" });
  b.enqueue("log_entries", "upsert", { id: "b-row" });
  expect(new WriteQueue("owner/a").getAll().map((entry) => entry.data.id)).toEqual(["a-row"]);
  expect(new WriteQueue("owner/b").getAll().map((entry) => entry.data.id)).toEqual(["b-row"]);
  expect(localStorage.getItem("propulse-account-write-queue-v1:owner%2Fa")).not.toBeNull();
  expect(localStorage.getItem("propulse-sync-queue")).toBe(legacy);
  localStorage.setItem("propulse-sync-queue", JSON.stringify(a.getAll()));
  expect(new WriteQueue("unknown-owner").getAll()).toEqual([]);
  expect(localStorage.getItem("propulse-sync-queue")).toBe(JSON.stringify(a.getAll()));
});

it.each([undefined, null, ""])("ownerless queues perform no storage reads or writes (%s)", (owner) => {
  const read = vi.spyOn(Storage.prototype, "getItem");
  const write = vi.spyOn(Storage.prototype, "setItem");
  try {
    const queue = new WriteQueue(owner);
    queue.enqueue("log_entries", "upsert", { id: "memory-only" });
    expect(queue.pendingCount).toBe(1);
    queue.clear();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});
