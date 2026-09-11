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
    }>,
  },
  setState: vi.fn(),
  acknowledgeGearDeletions: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
}));

vi.mock("@/stores/shackStore", () => ({
  useShackStore: {
    getState: () => ({
      ...mocks.shackState,
      acknowledgeGearDeletions: mocks.acknowledgeGearDeletions,
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

beforeEach(() => {
  mocks.shackState.radios = [];
  mocks.shackState.pendingGearDeletions = [];
  mocks.setState.mockClear();
  mocks.acknowledgeGearDeletions.mockClear();
  mocks.update.mockReset();
  mocks.from.mockReset();
  mocks.select.mockReset();
  mocks.eq.mockReset();
  mocks.gt.mockReset();

  mocks.update.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ error: null }),
      error: null,
    }),
  });
});

describe("shackSync tombstones (#326)", () => {
  it("pull removes server-tombstoned gear and acks matching pending intents", async () => {
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
    expect(mocks.acknowledgeGearDeletions).toHaveBeenCalledWith([
      "user_radios:radio-old",
    ]);
  });

  it("push applies pending deletions before upserting survivors", async () => {
    mocks.shackState.pendingGearDeletions = [
      {
        table: "antennas",
        recordId: "ant-1",
        requestedAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    mocks.shackState.antennas = [{ id: "ant-2", name: "Dipole" }];

    mocks.from.mockImplementation((table: string) => {
      if (table === "antennas") {
        return {
          update: mocks.update,
          upsert: vi.fn().mockReturnValue({ error: null }),
          eq: vi.fn().mockReturnThis(),
        };
      }
      return {
        upsert: vi.fn().mockReturnValue({ error: null }),
        update: mocks.update,
        eq: vi.fn().mockReturnThis(),
      };
    });

    await shackSync.push("user-1");

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.acknowledgeGearDeletions).toHaveBeenCalledWith([
      "antennas:ant-1",
    ]);
  });
});
