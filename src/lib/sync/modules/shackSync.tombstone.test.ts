import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shackState: {
    radios: [] as Array<{ id: string; equipmentId: string; addedAt: string }>,
    antennas: [] as Array<{ id: string; name: string }>,
    feedlines: [] as unknown[],
    accessories: [] as unknown[],
    stationPresets: [] as unknown[],
    inlineComponents: [] as unknown[],
    stationChains: [] as unknown[],
    equipmentHistory: [] as unknown[],
    customRadios: [] as unknown[],
    pendingGearDeletions: [] as Array<{
      table: string;
      recordId: string;
      requestedAt: string;
      ownerId: string;
    }>,
  },
  setState: vi.fn(),
  acknowledgeGearDeletions: vi.fn(),
  applyGearRemoval: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  /** Ordered log of table-level writes, for asserting delete-before-upsert (#326). */
  callLog: [] as string[],
}));

vi.mock("@/stores/shackStore", () => ({
  useShackStore: {
    getState: () => ({
      ...mocks.shackState,
      acknowledgeGearDeletions: mocks.acknowledgeGearDeletions,
      applyGearRemoval: mocks.applyGearRemoval,
    }),
    setState: mocks.setState,
  },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: mocks.from,
  }),
}));

import { shackSync } from "./shackSync";

function queryBuilder(rows: unknown[] | null) {
  const builder = {
    select: mocks.select.mockReturnThis(),
    eq: mocks.eq.mockReturnThis(),
    gt: mocks.gt.mockReturnThis(),
    then: (
      resolve: (value: unknown) => void,
      reject?: (reason: unknown) => void,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return builder;
}

/**
 * Builds a `.from(table)` stand-in for the push path: the tombstone chain
 * `.update().eq(userIdEq).eq(idColumnEq).select()`, the zero-row follow-up
 * `.select().eq().eq().maybeSingle()`, and `.upsert()` for survivors. Every
 * `.eq()` call is recorded so tests can assert the filtered column/value.
 */
function makeTableMock(
  table: string,
  updateResult: { data: unknown[] | null; error: { message: string } | null },
) {
  const eqLog: Array<[string, unknown]> = [];
  const eq = (column: string, value: unknown) => {
    eqLog.push([column, value]);
    return chain;
  };
  const chain: {
    eq: typeof eq;
    select: () => Promise<typeof updateResult>;
    maybeSingle: () => Promise<{ data: null; error: null }>;
  } = {
    eq,
    select: vi.fn(() => {
      mocks.callLog.push(`update:${table}`);
      return Promise.resolve(updateResult);
    }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  return {
    update: vi.fn(() => chain),
    select: vi.fn(() => chain),
    upsert: vi.fn(() => {
      mocks.callLog.push(`upsert:${table}`);
      return { error: null };
    }),
    eqLog,
  };
}

beforeEach(() => {
  mocks.shackState.radios = [];
  mocks.shackState.pendingGearDeletions = [];
  mocks.setState.mockClear();
  mocks.acknowledgeGearDeletions.mockClear();
  mocks.applyGearRemoval.mockClear();
  mocks.from.mockReset();
  mocks.select.mockReset();
  mocks.eq.mockReset();
  mocks.gt.mockReset();
  mocks.callLog = [];
});

describe("shackSync tombstones (#326)", () => {
  it("pull removes server-tombstoned gear, acks matching pending intents for the pulling user, and cascades the cleanup", async () => {
    mocks.shackState.radios = [
      {
        id: "radio-old",
        equipmentId: "ic-7300",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mocks.shackState.pendingGearDeletions = [
      {
        table: "user_radios",
        recordId: "radio-old",
        requestedAt: "2026-01-02T00:00:00.000Z",
        ownerId: "user-1",
      },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === "user_radios") {
        return queryBuilder([
          {
            instance_id: "radio-old",
            equipment_id: "ic-7300",
            nickname: null,
            tx_power_setting: null,
            purchase_date: null,
            firmware_version: null,
            notes: null,
            wiring: null,
            specs_override: {
              _snapshot: {
                id: "radio-old",
                equipmentId: "ic-7300",
                addedAt: "2026-01-01T00:00:00.000Z",
              },
            },
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-03T00:00:00.000Z",
            deleted_at: "2026-01-03T00:00:00.000Z",
          },
        ]);
      }
      return queryBuilder([]);
    });

    await shackSync.pull("user-1", "2026-01-02T00:00:00.000Z");

    expect(mocks.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        radios: [],
      }),
    );
    expect(mocks.acknowledgeGearDeletions).toHaveBeenCalledWith(
      ["user_radios:radio-old"],
      "user-1",
    );
    // Referential cleanup (dangling presets/chains/activeRadioId) runs
    // through the same shared cascade the local remove* actions use (#326).
    expect(mocks.applyGearRemoval).toHaveBeenCalledWith(
      "user_radios",
      ["radio-old"],
      "user-1",
    );
  });

  it("push applies pending deletions before upserting survivors, filtered by user_id and the correct id column", async () => {
    mocks.shackState.pendingGearDeletions = [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-02T00:00:00.000Z",
        ownerId: "user-1",
      },
    ];
    mocks.shackState.antennas = [{ id: "ant-2", name: "Dipole" }];

    const antennasMock = makeTableMock("antennas", {
      data: [{ id: "ant-1" }],
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "antennas") return antennasMock;
      return { upsert: vi.fn().mockReturnValue({ error: null }) };
    });

    await shackSync.push("user-1");

    expect(mocks.acknowledgeGearDeletions).toHaveBeenCalledWith(
      ["antennas:ant-1"],
      "user-1",
    );
    // Delete-before-upsert ordering: the tombstone must land before the
    // survivor upsert, or a stale upsert could resurrect the deleted row.
    expect(mocks.callLog).toEqual(["update:antennas", "upsert:antennas"]);
    // The tombstone update is scoped to this user's row via `id`, not
    // `instance_id` (that column only exists on user_radios).
    expect(antennasMock.eqLog).toEqual([
      ["user_id", "user-1"],
      ["id", "ant-1"],
    ]);
  });

  it("scopes the user_radios tombstone update by instance_id, not id", async () => {
    mocks.shackState.pendingGearDeletions = [
      {
        table: "user_radios",
        recordId: "radio-1",
        requestedAt: "2026-01-02T00:00:00.000Z",
        ownerId: "user-1",
      },
    ];

    const radiosMock = makeTableMock("user_radios", {
      data: [{ instance_id: "radio-1" }],
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "user_radios") return radiosMock;
      return { upsert: vi.fn().mockReturnValue({ error: null }) };
    });

    await shackSync.push("user-1");

    expect(mocks.acknowledgeGearDeletions).toHaveBeenCalledWith(
      ["user_radios:radio-1"],
      "user-1",
    );
    expect(radiosMock.eqLog).toEqual([
      ["user_id", "user-1"],
      ["instance_id", "radio-1"],
    ]);
  });
});
