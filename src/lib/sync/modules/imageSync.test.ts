import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllImageIds: vi.fn(),
  storeImageWithId: vi.fn(),
  download: vi.fn(),
  queryResult: {
    data: [] as unknown[],
    error: null as { message: string } | null,
  },
  queryCalls: [] as Array<[string, unknown[]]>,
}));

vi.mock("@/lib/db/imageStore", () => ({
  getImage: vi.fn(),
  storeImageWithId: mocks.storeImageWithId,
  getAllImageIds: mocks.getAllImageIds,
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
      builder.then = (
        resolve: (value: unknown) => void,
        reject?: (reason: unknown) => void,
      ) => Promise.resolve(mocks.queryResult).then(resolve, reject);
      return builder;
    },
    storage: {
      from: () => ({
        download: mocks.download,
        upload: vi.fn(),
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

beforeEach(() => {
  mocks.getAllImageIds.mockResolvedValue([]);
  mocks.storeImageWithId.mockResolvedValue(undefined);
  mocks.download.mockResolvedValue({ data: new Blob(["x"]), error: null });
  mocks.queryResult = { data: [], error: null };
  mocks.queryCalls = [];
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
