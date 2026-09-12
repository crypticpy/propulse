import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteQueueEntry } from "./types";

const mocks = vi.hoisted(() => ({
  getAllImageIds: vi.fn(),
  storeImageWithId: vi.fn(),
  getImage: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  upsertResult: { error: null as { message: string } | null },
  queryResult: {
    data: [] as unknown[],
    error: null as { message: string } | null,
  },
  snapshot: {
    profileImageId: null as string | null,
    radios: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    antennas: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    feedlines: [] as Array<{ imageId?: string }>,
    accessories: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    inlineComponents: [] as Array<{ imageId?: string }>,
  },
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const method of ["select", "eq", "gt", "or", "order"]) {
        builder[method] = () => builder;
      }
      builder.upsert = () => Promise.resolve(mocks.upsertResult);
      builder.then = (
        resolve: (value: unknown) => void,
        reject?: (reason: unknown) => void,
      ) => Promise.resolve(mocks.queryResult).then(resolve, reject);
      return builder;
    },
    storage: {
      from: () => ({
        download: mocks.download,
        upload: mocks.upload,
      }),
    },
  }),
}));

vi.mock("@/lib/db/imageReferenceSnapshot", () => ({
  getLiveImageReferenceSnapshot: () => mocks.snapshot,
}));

vi.mock("@/lib/db/imageStore", () => ({
  getImage: mocks.getImage,
  storeImageWithId: mocks.storeImageWithId,
  getAllImageIds: mocks.getAllImageIds,
}));

function emptySnapshot() {
  return {
    profileImageId: null as string | null,
    radios: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    antennas: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    feedlines: [] as Array<{ imageId?: string }>,
    accessories: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    inlineComponents: [] as Array<{ imageId?: string }>,
  };
}

function storedImage(id: string) {
  return {
    id,
    blob: new Blob(["jpeg"]),
    width: 120,
    height: 80,
    createdAt: "2026-09-12T00:00:00.000Z",
    sizeBytes: 4,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let manager: import("./SyncManager").SyncManager;
let imageSync: typeof import("./modules/imageSync").imageSync;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  mocks.snapshot = emptySnapshot();
  mocks.getAllImageIds.mockResolvedValue([]);
  mocks.storeImageWithId.mockResolvedValue(undefined);
  mocks.getImage.mockImplementation(async (id: string) => storedImage(id));
  mocks.download.mockResolvedValue({ data: new Blob(["x"]), error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.upsertResult = { error: null };
  mocks.queryResult = { data: [], error: null };
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const sync = await import("./SyncManager");
  imageSync = (await import("./modules/imageSync")).imageSync;
  manager = sync.SyncManager.getInstance();
  manager.registerModule(imageSync);
});

afterEach(async () => {
  await manager.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SyncManager referenced image uploads (#323)", () => {
  it("uploads a referenced blob after a photo-save schedule while online", async () => {
    await manager.start("owner-a");
    mocks.snapshot.profileImageId = "img-save";
    manager.scheduleReferencedImageUploads();

    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.upload).toHaveBeenCalledWith(
      "owner-a/img-save.jpg",
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: true },
    );
    expect(manager.getPendingCount()).toBe(0);
  });

  it("uploads a referenced blob on Sync Now", async () => {
    await manager.start("owner-a");
    mocks.snapshot.profileImageId = "img-sync";
    await manager.syncNow();

    expect(mocks.upload).toHaveBeenCalledWith(
      "owner-a/img-sync.jpg",
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: true },
    );
    expect(manager.getPendingCount()).toBe(0);
    const { useSyncStore } = await import("./syncStore");
    expect(useSyncStore.getState().status.error).toBeNull();
    expect(useSyncStore.getState().status.lastSyncAt).not.toBeNull();
  });

  it("keeps a failed blob pending and does not report a full sync", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "network" } });
    await manager.start("owner-a");
    const lastSyncAt = (await import("./syncStore")).useSyncStore.getState()
      .status.lastSyncAt;
    await vi.advanceTimersByTimeAsync(5_000);
    mocks.snapshot.profileImageId = "img-fail";
    await manager.syncNow();

    expect(mocks.upload).toHaveBeenCalled();
    expect(manager.getPendingCount()).toBe(1);
    const { useSyncStore } = await import("./syncStore");
    expect(useSyncStore.getState().status.pendingCount).toBe(1);
    expect(useSyncStore.getState().status.error).toBe(
      "Some items are still pending",
    );
    expect(useSyncStore.getState().status.lastSyncAt).toBe(lastSyncAt);
  });

  it("resumes a pending upload when the browser comes back online", async () => {
    const online = vi.spyOn(manager, "isOnline").mockReturnValue(false);
    await manager.start("owner-a");
    mocks.snapshot.profileImageId = "img-offline";
    manager.scheduleReferencedImageUploads();
    expect(manager.getPendingCount()).toBe(1);
    expect(mocks.upload).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    expect(mocks.upload).toHaveBeenCalledWith(
      "owner-a/img-offline.jpg",
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: true },
    );
    expect(manager.getPendingCount()).toBe(0);
  });

  it("fences in-flight image queue completion to the original owner", async () => {
    const oldQueue = deferred<string[]>();
    const nextQueue = deferred<string[]>();
    const originalProcessQueue = imageSync.processQueue!;
    const processQueue = vi
      .fn<typeof originalProcessQueue>()
      .mockReturnValueOnce(oldQueue.promise)
      .mockReturnValueOnce(nextQueue.promise);
    imageSync.processQueue = processQueue;

    try {
      await manager.start("owner-a");
      mocks.snapshot.profileImageId = "img-a";
      manager.scheduleReferencedImageUploads();
      await vi.waitFor(() => expect(processQueue).toHaveBeenCalledTimes(1));
      const oldIds = processQueue.mock.calls[0][1].map(
        (entry: WriteQueueEntry) => entry.queueId,
      );
      await manager.stop();
      expect(manager.getPendingCount()).toBe(0);

      mocks.snapshot = emptySnapshot();
      await manager.start("owner-b");
      expect(processQueue).toHaveBeenCalledTimes(1);
      mocks.snapshot.profileImageId = "img-b";
      manager.scheduleReferencedImageUploads();
      await vi.waitFor(() => expect(processQueue).toHaveBeenCalledTimes(2));
      const nextIds = processQueue.mock.calls[1][1].map(
        (entry: WriteQueueEntry) => entry.queueId,
      );

      oldQueue.resolve(oldIds);
      await vi.waitFor(() => expect(manager.getPendingCount()).toBe(1));
      expect(
        JSON.parse(
          localStorage.getItem("propulse-account-write-queue-v1:owner-a")!,
        ),
      ).toHaveLength(1);
      expect(
        JSON.parse(
          localStorage.getItem("propulse-account-write-queue-v1:owner-b")!,
        ),
      ).toHaveLength(1);
      expect(processQueue.mock.calls.map(([owner]) => owner)).toEqual([
        "owner-a",
        "owner-b",
      ]);
      expect(
        processQueue.mock.calls[1][1].map(
          (entry: WriteQueueEntry) => entry.data.id,
        ),
      ).toEqual(["img-b"]);

      nextQueue.resolve(nextIds);
      await vi.waitFor(() => expect(manager.getPendingCount()).toBe(0));
    } finally {
      imageSync.processQueue = originalProcessQueue;
    }
  });
});
