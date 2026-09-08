import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }) }));
vi.mock("@/stores/settingsStore", () => ({ useSettingsStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/shackStore", () => ({ useShackStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/profileStore", () => ({ useProfileStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/themeStore", () => ({ useThemeStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/mapStore", () => ({ useMapStore: { getState: () => ({}), setState: mocks.write } }));
vi.mock("@/stores/dxStore", () => ({ useDXStore: { getState: () => ({}), setState: mocks.write } }));
import { preferencesSync } from "./preferencesSync";

beforeEach(() => vi.clearAllMocks());

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
