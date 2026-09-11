import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mergeGearPullRows,
  pushPendingGearDeletions,
} from "./shackGearTombstone";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: mocks.from,
  }),
}));

beforeEach(() => {
  mocks.update.mockReset();
  mocks.from.mockReset();
  mocks.update.mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null });
  mocks.from.mockImplementation(() => ({
    update: mocks.update,
    eq: vi.fn().mockReturnThis(),
  }));
});

describe("shackGearTombstone", () => {
  it("removes tombstoned rows from the merged local inventory", () => {
    const result = mergeGearPullRows(
      [
        {
          id: "keep",
          updated_at: "2026-01-02T00:00:00.000Z",
          deleted_at: null,
        },
        {
          id: "gone",
          updated_at: "2026-01-03T00:00:00.000Z",
          deleted_at: "2026-01-03T00:00:00.000Z",
        },
      ],
      (row) => ({ id: row.id, name: row.id }),
      (row) => row.id,
      [
        { id: "local-only", name: "local-only" },
        { id: "gone", name: "gone" },
      ],
    );

    expect(result?.merged.map((row) => row.id)).toEqual(["keep", "local-only"]);
    expect(result?.removedIds).toEqual(["gone"]);
  });

  it("pushes owner-scoped soft deletes before survivor upserts", async () => {
    const eq = vi
      .fn()
      .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ error: null }) });
    mocks.update.mockReturnValue({ eq });

    const ack = await pushPendingGearDeletions("user-1", [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(mocks.from).toHaveBeenCalledWith("antennas");
    expect(ack).toEqual(["antennas:ant-1"]);
  });
});
