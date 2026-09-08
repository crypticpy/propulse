import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncLifecycle, SyncModule } from "./types";

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let manager: import("./SyncManager").SyncManager;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  manager = (await import("./SyncManager")).SyncManager.getInstance();
});
afterEach(async () => {
  await manager.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function moduleWith(overrides: Partial<SyncModule>): SyncModule {
  return { name: "test", tier: "eager", tables: ["user_preferences"], pull: vi.fn().mockResolvedValue(null), push: vi.fn().mockResolvedValue(undefined), ...overrides };
}

describe("SyncManager session lifetime", () => {
  it.each(["same owner", "different owner"])("a stopped pending start cannot revive after restart: %s", async (kind) => {
    const oldPull = deferred<string | null>();
    const nextPull = deferred<string | null>();
    const lifecycles: SyncLifecycle[] = [];
    const pull = vi.fn((_owner: string, _since: string | null, lifecycle?: SyncLifecycle) => {
      lifecycles.push(lifecycle!);
      return lifecycles.length === 1 ? oldPull.promise : nextPull.promise;
    });
    const incremental = moduleWith({ name: "incremental", tier: "incremental", tables: ["log_entries"] });
    manager.registerModule(moduleWith({ pull }));
    manager.registerModule(incremental);
    const add = vi.spyOn(window, "addEventListener");
    const oldStart = manager.start("owner-a");
    const stopping = manager.stop();
    expect(manager.isRunning).toBe(false);
    expect(lifecycles[0].isActive()).toBe(false);
    const nextStart = manager.start(kind === "same owner" ? "owner-a" : "owner-b");
    oldPull.resolve("old-response");
    await oldStart;
    await stopping;
    const { useSyncStore } = await import("./syncStore");
    const { syncMeta } = await import("./syncMeta");
    expect(useSyncStore.getState().status.state).toBe("syncing");
    expect(syncMeta.getTimestamp("test")).toBeNull();
    expect(incremental.pull).not.toHaveBeenCalled();
    expect(add.mock.calls.filter(([name]) => name === "online")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    nextPull.resolve("current-response");
    await nextStart;
    expect(syncMeta.getTimestamp("test")).toBe("current-response");
    expect(incremental.pull).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.filter(([name]) => name === "online")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not flush on stop or dequeue a newer session's durable entries on old completion", async () => {
    const oldQueue = deferred<string[]>();
    const nextQueue = deferred<string[]>();
    const processQueue = vi.fn().mockReturnValueOnce(oldQueue.promise).mockReturnValueOnce(nextQueue.promise);
    manager.registerModule(moduleWith({ name: "logs", tier: "incremental", tables: ["log_entries"], processQueue }));
    await manager.start("owner-a");
    manager.enqueue("log_entries", "upsert", { id: "entry" });
    const firstSync = manager.syncNow();
    await vi.waitFor(() => expect(processQueue).toHaveBeenCalledTimes(1));
    const oldIds = processQueue.mock.calls[0][1].map((entry: { queueId: string }) => entry.queueId);
    const stopped = manager.stop();
    expect(processQueue).toHaveBeenCalledTimes(1);
    const restarted = manager.start("owner-b");
    await vi.waitFor(() => expect(processQueue).toHaveBeenCalledTimes(2));
    oldQueue.resolve(oldIds);
    await firstSync;
    await stopped;
    expect(manager.getPendingCount()).toBe(1);
    expect(JSON.parse(localStorage.getItem("propulse-sync-queue")!)).toHaveLength(1);
    const { useSyncStore } = await import("./syncStore");
    expect(useSyncStore.getState().status.state).toBe("syncing");
    expect(processQueue.mock.calls.map(([owner]) => owner)).toEqual(["owner-a", "owner-b"]);
    nextQueue.resolve(oldIds);
    await restarted;
    expect(manager.getPendingCount()).toBe(0);
  });

  it("a stopped eager push cannot continue syncNow under the next owner", async () => {
    const pushing = deferred<void>();
    const module = moduleWith({ push: vi.fn(() => pushing.promise) });
    manager.registerModule(module);
    await manager.start("owner-a");
    const syncing = manager.syncNow();
    await manager.stop();
    await manager.start("owner-b");
    expect(module.pull).toHaveBeenCalledTimes(2);
    pushing.resolve();
    await syncing;
    expect(module.pull).toHaveBeenCalledTimes(2);
    expect(module.push).toHaveBeenCalledWith("owner-a");
  });
});
