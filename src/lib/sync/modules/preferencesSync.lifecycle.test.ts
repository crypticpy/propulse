import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  write: vi.fn(),
  // Overridable per-test; defaults match the prior empty-object stand-in.
  shackState: {} as Record<string, unknown>,
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }) }));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/shackStore", () => ({ useShackStore: { getState: () => mocks.shackState, setState: mocks.write } }));
vi.mock("@/stores/profileStore", () => ({ useProfileStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/themeStore", () => ({ useThemeStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/dxStore", () => ({ useDXStore: { getState: () => ({}), setState: mocks.write } }));
import { preferencesSync } from "./preferencesSync";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.shackState = {};
});

it("drops a pending preference response after its authenticated lifetime ends", async () => {
  let resolve!: (value: unknown) => void;
  mocks.maybeSingle.mockReturnValue(new Promise((done) => { resolve = done; }));
  let active = true;
  const pull = preferencesSync.pull("owner-a", null, { isActive: () => active });
  active = false;
  resolve({ data: { preferences: { units: "imperial", _theme: { themeId: "wrong-owner" } }, updated_at: "2026-09-07" }, error: null });
  expect(await pull).toBeNull();
  expect(mocks.write).not.toHaveBeenCalled();
});

it("retains backward-compatible application for a current response", async () => {
  mocks.maybeSingle.mockResolvedValue({ data: { preferences: { units: "metric" }, updated_at: "2026-09-07" }, error: null });
  expect(await preferencesSync.pull("owner-a", null)).toBe("2026-09-07");
  expect(mocks.write).toHaveBeenCalledWith({ units: "metric" });
});

it("does not request preferences when its lifetime is already invalid", async () => {
  expect(await preferencesSync.pull("owner-a", null, { isActive: () => false })).toBeNull();
  expect(mocks.maybeSingle).not.toHaveBeenCalled();
});

it("does not restore a radio from the prefs blob when it has a pending local deletion, nor add a radio absent locally (#326)", async () => {
  // preferencesSync is a second writer of radios/customRadios alongside
  // shackSync; a stale blob from another device must not resurrect gear
  // this device already tombstoned, and must not add gear that only
  // exists on the server side of this blob (that is shackSync's job).
  mocks.shackState = {
    radios: [
      { id: "radio-1", equipmentId: "ic-7300", addedAt: "2026-01-01T00:00:00.000Z" },
    ],
    customRadios: [],
    activeRadioId: "radio-1",
    pendingGearDeletions: [
      {
        table: "user_radios",
        recordId: "radio-1",
        requestedAt: "2026-01-02T00:00:00.000Z",
        ownerId: "owner-a",
      },
    ],
  };
  mocks.maybeSingle.mockResolvedValue({
    data: {
      preferences: {
        radios: [
          { id: "radio-1", equipmentId: "ic-7300", addedAt: "2026-01-01T00:00:00.000Z" },
          { id: "radio-2", equipmentId: "ft-991a", addedAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
      updated_at: "2026-09-07",
    },
    error: null,
  });

  await preferencesSync.pull("owner-a", null);

  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({ radios: [] }),
  );
});

it("merges a blob radio's changed fields into the matching local entry while keeping an unmatched local entry (#326)", async () => {
  // A radio added offline (radio-b) exists locally but not yet in the
  // blob; the old intersection-replace logic silently dropped it. The
  // merge must update matching fields for radio-a and retain radio-b.
  const radioA = {
    id: "radio-a",
    equipmentId: "ic-7300",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  const radioB = {
    id: "radio-b",
    equipmentId: "ft-991a",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  mocks.shackState = {
    radios: [radioA, radioB],
    customRadios: [],
    activeRadioId: "radio-a",
    pendingGearDeletions: [],
  };
  mocks.maybeSingle.mockResolvedValue({
    data: {
      preferences: {
        radios: [{ ...radioA, nickname: "Updated Name" }],
      },
      updated_at: "2026-09-07",
    },
    error: null,
  });

  await preferencesSync.pull("owner-a", null);

  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({
      radios: [{ ...radioA, nickname: "Updated Name" }, radioB],
    }),
  );
});

it("drops a radio entirely when it has a pending deletion, even though the blob still lists it (#326)", async () => {
  const radioA = {
    id: "radio-a",
    equipmentId: "ic-7300",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  const radioB = {
    id: "radio-b",
    equipmentId: "ft-991a",
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  mocks.shackState = {
    radios: [radioA, radioB],
    customRadios: [],
    activeRadioId: "radio-a",
    pendingGearDeletions: [
      {
        table: "user_radios",
        recordId: "radio-b",
        requestedAt: "2026-01-02T00:00:00.000Z",
        ownerId: "owner-a",
      },
    ],
  };
  mocks.maybeSingle.mockResolvedValue({
    data: {
      preferences: {
        radios: [radioA, radioB],
      },
      updated_at: "2026-09-07",
    },
    error: null,
  });

  await preferencesSync.pull("owner-a", null);

  expect(mocks.write).toHaveBeenCalledWith(
    expect.objectContaining({ radios: [radioA] }),
  );
});
