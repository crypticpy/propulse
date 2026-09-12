import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsBackup } from "@/lib/utils/settingsBackup";
import {
  collectBackupGearRefs,
  filterBlockedGearFromBackup,
  resolveRestoreGearBlocks,
} from "@/lib/utils/settingsBackupGearRestore";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  shackState: {
    pendingGearDeletions: [] as Array<{
      table: string;
      recordId: string;
      requestedAt: string;
      ownerId: string;
    }>,
    acknowledgedGearDeletions: [] as Array<{
      table: string;
      recordId: string;
      acknowledgedAt: string;
      ownerId: string;
    }>,
  },
  isSupabaseConfigured: true,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
  getSupabase: () => ({
    from: mocks.from,
  }),
}));

vi.mock("@/stores/shackStore", () => ({
  useShackStore: {
    getState: () => mocks.shackState,
  },
}));

function sampleBackup(): SettingsBackup {
  return {
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    appName: "propulse",
    userPreferences: {
      station: null,
      preferences: {
        radios: [{ id: "radio-1", equipmentId: "ic-7300", addedAt: "2026-01-01" }],
        customRadios: [],
        activeRadioId: "radio-1",
      } as never,
      savedTargets: [],
    },
    mapSettings: {
      panelStates: {
        bandConditions: false,
        pathAnalysis: false,
        dxSpotList: false,
        satellites: false,
      },
      recentTargets: [],
    },
    dxFilters: {
      bands: [],
      modes: [],
      maxAge: 30,
      neededOnly: false,
      sortByNeeded: false,
    },
    watches: [],
    pins: [],
    dismissedAlertIds: [],
    shackEquipment: {
      antennas: [{ id: "ant-1", name: "Dipole" } as never],
      feedlines: [],
      accessories: [],
      stationPresets: [],
      activePresetId: null,
    },
  };
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.shackState.pendingGearDeletions = [];
  mocks.shackState.acknowledgedGearDeletions = [];
});

describe("settingsBackupGearRestore (#1078)", () => {
  it("collects gear refs from a backup", () => {
    const refs = collectBackupGearRefs(sampleBackup());
    expect(refs.map((ref) => `${ref.table}:${ref.recordId}`)).toEqual([
      "user_radios:radio-1",
      "antennas:ant-1",
    ]);
  });

  it("skips server-tombstoned gear and reports it", async () => {
    mocks.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data:
              table === "antennas"
                ? [{ id: "ant-1", deleted_at: "2026-01-02T00:00:00.000Z" }]
                : [{ instance_id: "radio-1", deleted_at: null }],
            error: null,
          }),
        }),
      }),
    }));

    const { blockedKeys, skipped } = await resolveRestoreGearBlocks(
      "user-1",
      collectBackupGearRefs(sampleBackup()),
    );

    expect(blockedKeys).toEqual(new Set(["antennas:ant-1"]));
    expect(skipped).toEqual([
      expect.objectContaining({
        table: "antennas",
        recordId: "ant-1",
        reason: "tombstoned",
      }),
    ]);
  });

  it("skips locally acknowledged purged gear and reports it", async () => {
    mocks.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));
    mocks.shackState.acknowledgedGearDeletions = [
      {
        table: "antennas",
        recordId: "ant-1",
        acknowledgedAt: new Date().toISOString(),
        ownerId: "user-1",
      },
    ];

    const { skipped } = await resolveRestoreGearBlocks(
      "user-1",
      collectBackupGearRefs(sampleBackup()),
    );

    expect(skipped).toEqual([
      expect.objectContaining({
        table: "antennas",
        recordId: "ant-1",
        reason: "purged",
      }),
    ]);
  });

  it("filters blocked gear out of the backup payload", () => {
    const filtered = filterBlockedGearFromBackup(
      sampleBackup(),
      new Set(["antennas:ant-1"]),
    );

    expect(filtered.shackEquipment?.antennas).toEqual([]);
    expect(
      (filtered.userPreferences.preferences as { radios: unknown[] }).radios,
    ).toHaveLength(1);
  });
});
