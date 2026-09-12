import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteQueueEntry } from "../types";

const mocks = vi.hoisted(() => ({
  getAllImageIds: vi.fn(),
  storeImageWithId: vi.fn(),
  getImage: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  upsertResult: { error: null as { message: string } | null },
  upsertCalls: [] as unknown[],
  queryResult: {
    data: [] as unknown[],
    error: null as { message: string } | null,
  },
  queryCalls: [] as Array<[string, unknown[]]>,
  snapshot: {
    profileImageId: null as string | null,
    radios: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    antennas: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    feedlines: [] as Array<{ imageId?: string }>,
    accessories: [] as Array<{ imageId?: string; galleryImageIds?: string[] }>,
    inlineComponents: [] as Array<{ imageId?: string }>,
  },
}));

vi.mock("@/lib/db/imageStore", () => ({
  getImage: mocks.getImage,
  storeImageWithId: mocks.storeImageWithId,
  getAllImageIds: mocks.getAllImageIds,
}));

vi.mock("@/lib/db/imageReferenceSnapshot", () => ({
  getLiveImageReferenceSnapshot: () => mocks.snapshot,
}));

vi.mock("@/stores/shackStore", () => ({
  useShackStore: {
    getState: () => ({
      radios: [],
      antennas: [],
      feedlines: [],
      accessories: [],
      inlineComponents: [],
    }),
  },
}));

vi.mock("@/stores/profileStore", () => ({
  useProfileStore: { getState: () => ({ profileImageId: null }) },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {};
      for (const method of ["select", "eq", "gt", "or", "order"]) {
        builder[method] = (...args: unknown[]) => {
          mocks.queryCalls.push([method, args]);
          return builder;
        };
      }
      builder.upsert = (...args: unknown[]) => {
        mocks.upsertCalls.push(args);
        return Promise.resolve(mocks.upsertResult);
      };
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

import { imageSync } from "./imageSync";

const USER = "user-1";

function row(id: string, createdAt: string) {
  return {
    id,
    user_id: USER,
    storage_path: `${USER}/${id}.jpg`,
    width: 100,
    height: 80,
    size_bytes: 1024,
    created_at: createdAt,
  };
}

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

function queueEntry(id: string): WriteQueueEntry {
  return {
    queueId: `q-${id}`,
    table: "user_images",
    operation: "upsert",
    data: { id },
    timestamp: "2026-09-12T00:00:00.000Z",
    retryCount: 0,
    status: "pending",
  };
}

function storedImage(id: string) {
  return {
    id,
    blob: new Blob(["jpeg"]),
    width: 100,
    height: 80,
    createdAt: "2026-09-12T00:00:00.000Z",
    sizeBytes: 4,
  };
}

beforeEach(() => {
  mocks.getAllImageIds.mockResolvedValue([]);
  mocks.storeImageWithId.mockResolvedValue(undefined);
  mocks.getImage.mockReset();
  mocks.download.mockResolvedValue({ data: new Blob(["x"]), error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.upsertResult = { error: null };
  mocks.upsertCalls = [];
  mocks.queryResult = { data: [], error: null };
  mocks.queryCalls = [];
  mocks.snapshot = emptySnapshot();
});

describe("imageSync.pull cursor (#324)", () => {
  it("does not advance the cursor when an older download fails but a newer row succeeds", async () => {
    mocks.queryResult = {
      data: [
        row("img-a", "2026-01-01T00:00:00.000Z"),
        row("img-b", "2026-01-02T00:00:00.000Z"),
      ],
      error: null,
    };
    mocks.download.mockImplementation(async (path: string) => {
      if (path.endsWith("img-a.jpg")) {
        return { data: null, error: { message: "network" } };
      }
      return { data: new Blob(["ok"]), error: null };
    });

    const cursor = await imageSync.pull(USER, "2025-12-31T00:00:00.000Z");

    expect(cursor).toBeNull();
    expect(mocks.storeImageWithId).toHaveBeenCalledTimes(1);
    expect(mocks.storeImageWithId).toHaveBeenCalledWith(
      "img-b",
      expect.any(Blob),
      100,
      80,
    );
  });

  it("returns a compound cursor after a successful prefix including equal timestamps", async () => {
    const t = "2026-01-01T00:00:00.000Z";
    mocks.queryResult = {
      data: [row("img-a", t), row("img-b", t)],
      error: null,
    };

    const cursor = await imageSync.pull(USER, null);

    expect(cursor).toBe(`${t}|img-b`);
    expect(mocks.storeImageWithId).toHaveBeenCalledTimes(2);
  });

  it("retries a failed row on the next delta pull without re-downloading successful blobs", async () => {
    const since = "2025-12-31T00:00:00.000Z";
    mocks.queryResult = {
      data: [
        row("img-a", "2026-01-01T00:00:00.000Z"),
        row("img-b", "2026-01-02T00:00:00.000Z"),
      ],
      error: null,
    };
    mocks.download.mockImplementation(async (path: string) => {
      if (path.endsWith("img-a.jpg")) {
        return { data: null, error: { message: "network" } };
      }
      return { data: new Blob(["ok"]), error: null };
    });

    await imageSync.pull(USER, since);

    mocks.getAllImageIds.mockResolvedValue(["img-b"]);
    mocks.queryCalls = [];
    mocks.download.mockResolvedValue({
      data: new Blob(["retry"]),
      error: null,
    });

    const cursor = await imageSync.pull(USER, since);

    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect(mocks.storeImageWithId).toHaveBeenLastCalledWith(
      "img-a",
      expect.any(Blob),
      100,
      80,
    );
    expect(cursor).toBe("2026-01-02T00:00:00.000Z|img-b");
  });

  it("re-scans without a delta filter when the saved cursor is legacy timestamp-only", async () => {
    const since = "2026-01-01T00:00:00.000Z";
    mocks.queryResult = {
      data: [row("img-a", "2026-01-01T00:00:00.000Z")],
      error: null,
    };

    const cursor = await imageSync.pull(USER, since);

    expect(
      mocks.queryCalls.some(([method]) => method === "gt" || method === "or"),
    ).toBe(false);
    expect(cursor).toBe("2026-01-01T00:00:00.000Z|img-a");
  });

  it("uses a compound delta filter when the saved cursor includes an id suffix", async () => {
    const since = "2026-01-01T00:00:00.000Z|img-a";
    mocks.queryResult = {
      data: [row("img-b", "2026-01-01T00:00:00.000Z")],
      error: null,
    };

    await imageSync.pull(USER, since);

    expect(mocks.queryCalls).toContainEqual([
      "or",
      [
        "created_at.gt.2026-01-01T00:00:00.000Z,and(created_at.eq.2026-01-01T00:00:00.000Z,id.gt.img-a)",
      ],
    ]);
  });
});

describe("imageSync.processQueue (#323)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.snapshot.profileImageId = "img-new";
    mocks.getImage.mockResolvedValue(storedImage("img-new"));
  });

  it("uploads a referenced local blob and returns the queue id", async () => {
    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual(["q-img-new"]);
    expect(mocks.upload).toHaveBeenCalledWith(
      `${USER}/img-new.jpg`,
      expect.any(Blob),
      { contentType: "image/jpeg", upsert: true },
    );
    expect(mocks.upsertCalls).toHaveLength(1);
  });

  it("leaves upload failures unprocessed so they stay pending", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "network" } });

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual([]);
    expect(mocks.upsertCalls).toHaveLength(0);
  });

  it("leaves metadata failures unprocessed so they stay pending", async () => {
    mocks.upsertResult = { error: { message: "rls" } };

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual([]);
  });

  it("does not report a missing local blob as uploaded", async () => {
    mocks.getImage.mockResolvedValue(undefined);

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("dequeues ids already on the server without uploading again", async () => {
    mocks.queryResult = { data: [{ id: "img-new" }], error: null };

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual(["q-img-new"]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("drops unreferenced queue entries without uploading", async () => {
    mocks.snapshot.profileImageId = "other";

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-new"),
    ]);

    expect(processed).toEqual(["q-img-new"]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads the successful blob and keeps a sibling failure pending", async () => {
    mocks.snapshot = {
      ...emptySnapshot(),
      profileImageId: "img-ok",
      radios: [{ imageId: "img-fail" }],
    };
    mocks.getImage.mockImplementation(async (id: string) => storedImage(id));
    mocks.upload.mockImplementation(async (path: string) => {
      if (path.endsWith("img-fail.jpg")) {
        return { error: { message: "network" } };
      }
      return { error: null };
    });

    const processed = await imageSync.processQueue!(USER, [
      queueEntry("img-ok"),
      queueEntry("img-fail"),
    ]);

    expect(processed).toEqual(["q-img-ok"]);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
});
