import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mergeGearPullRows,
  pendingGearDeletionKeys,
  pushPendingGearDeletions,
} from "./shackGearTombstone";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: mocks.from,
  }),
}));

/**
 * Builds a `.from(table)` stand-in supporting the two chains
 * `pushPendingGearDeletions` uses: `.update().eq().eq().select()` and the
 * zero-row follow-up `.select().eq().eq().maybeSingle()`.
 */
function makeTableMock(
  updateResult: { data: unknown[] | null; error: { message: string } | null },
  checkResult: {
    data: unknown | null;
    error: { message: string } | null;
  } = { data: null, error: null },
) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue(updateResult),
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(checkResult),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  mocks.from.mockReset();
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
      "antennas",
      new Set<string>(),
    );

    expect(result?.merged.map((row) => row.id)).toEqual(["keep", "local-only"]);
    expect(result?.removedIds).toEqual(["gone"]);
  });

  it("excludes an active server row with a pending local deletion, without acking it", () => {
    // Offline delete queued locally, then logout/login races the initial
    // pull ahead of the eager push: the server row is still active (#326).
    const result = mergeGearPullRows(
      [
        {
          id: "pending-delete",
          updated_at: "2026-01-02T00:00:00.000Z",
          deleted_at: null,
        },
      ],
      (row) => ({ id: row.id, name: row.id }),
      (row) => row.id,
      [],
      "antennas",
      new Set<string>(["antennas:pending-delete"]),
    );

    expect(result?.merged).toEqual([]);
    expect(result?.removedIds).toEqual([]);
  });

  it("pushes owner-scoped soft deletes before survivor upserts", async () => {
    const table = makeTableMock({ data: [{ id: "ant-1" }], error: null });
    mocks.from.mockImplementation(() => table);

    const ack = await pushPendingGearDeletions("user-1", [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-1",
      },
    ]);

    expect(mocks.from).toHaveBeenCalledWith("antennas");
    expect(ack).toEqual(["antennas:ant-1"]);
  });

  it("does not push or ack an intent owned by a different account", async () => {
    const ack = await pushPendingGearDeletions("user-B", [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-A",
      },
    ]);

    expect(mocks.from).not.toHaveBeenCalled();
    expect(ack).toEqual([]);
  });

  it("does not ack a zero-row update when the row still exists for this user", async () => {
    // PostgREST reports no error when an update matches nothing (e.g. RLS
    // scoped the row away). Without a row-returned check this would
    // silently drop the intent and lose the deletion forever (#326).
    const table = makeTableMock(
      { data: [], error: null },
      { data: { id: "ant-1" }, error: null },
    );
    mocks.from.mockImplementation(() => table);

    const ack = await pushPendingGearDeletions("user-1", [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-1",
      },
    ]);

    expect(ack).toEqual([]);
  });

  it("acks a zero-row update once a follow-up read confirms the row is gone (purged tombstone, #1078)", async () => {
    const table = makeTableMock(
      { data: [], error: null },
      { data: null, error: null },
    );
    mocks.from.mockImplementation(() => table);

    const ack = await pushPendingGearDeletions("user-1", [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-1",
      },
    ]);

    expect(ack).toEqual(["antennas:ant-1"]);
  });

  it("scopes the pull-exclusion key set to the syncing owner", () => {
    // Account A has a pending deletion and account B has an active row
    // with the same table:id — the key set built for B's pull must not
    // include A's intent, or B's active server row would be suppressed
    // indefinitely while A's intent stays queued (#326).
    const pending = [
      {
        table: "antennas" as const,
        recordId: "ant-1",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-A",
      },
      {
        table: "antennas" as const,
        recordId: "ant-2",
        requestedAt: "2026-01-01T00:00:00.000Z",
        ownerId: "user-B",
      },
    ];

    expect(pendingGearDeletionKeys(pending, "user-B")).toEqual(
      new Set(["antennas:ant-2"]),
    );
    expect(pendingGearDeletionKeys(pending, "user-A")).toEqual(
      new Set(["antennas:ant-1"]),
    );
  });
});
