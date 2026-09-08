import { describe, expect, it, vi } from "vitest";
import { captureLegacyViewsFromSettingsBackup } from "./legacyBackupCapture";
import { convertLegacyViewCapture } from "./legacyViewConversion";

const exportedAt = "2026-09-07T00:00:00.000Z";
function nestedUnknown(depth: number): unknown {
  let value: unknown = { leaf: true };
  for (let i = 0; i < depth; i++) value = { child: value };
  return value;
}
function backup(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    exportedAt,
    appName: "propulse",
    userPreferences: {
      station: { callsign: "W1AW", grid: "FN31" },
      preferences: {
        textScale: "xl",
        timeFormat: "12h",
        theme: "dark",
        spotClustering: { enabled: false, minClusterSize: 8, gridSize: 5 },
        compassRose: { enabled: true, beamWidth: 40, showBeamWidth: false },
        spotAge: { maxAgeMinutes: 15, enabled: false, showAgeColumn: false },
        uiInteraction: { spotColorMode: "band", showSpotCallsignLabels: false },
        forecastDisplay: { hoursToShow: 24 },
        radios: [{ id: "radio-1" }],
        customRadios: [],
        activeRadioId: "radio-1",
        license: "Extra",
        units: "imperial",
        futureSetting: 7,
        catIcomNetworkPassword: "secret",
      },
      savedTargets: [{ id: "target-1", lat: 40, lon: -74 }],
    },
    mapSettings: {
      panelStates: { bandConditions: true, pathAnalysis: false, dxSpotList: false, satellites: true },
      recentTargets: [{ lat: 1, lon: 2 }],
    },
    dxFilters: { bands: ["40m"], modes: ["FT-8"], maxAge: 30, neededOnly: false, sortByNeeded: false },
    watches: [{ id: "watch-1" }],
    pins: [{ id: "pin-1" }],
    dismissedAlertIds: ["alert-1"],
    shackEquipment: { antennas: [{ id: "ant-1" }] },
    futureSection: { extra: true },
    ...overrides,
  };
}

describe("legacy settings backup capture", () => {
  it("maps visual fields through the capture port and omits secrets, targets and equipment from view drafts", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = backup();
    const original = structuredClone(source);
    const result = captureLegacyViewsFromSettingsBackup(source);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("capture");
    const json = JSON.stringify(result.capture);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("W1AW");
    expect(json).not.toContain("radio-1");
    expect(json).not.toContain("watch-1");
    expect(result.capture.local["propulse-settings"]).toMatchObject({
      textScale: "xl", timeFormat: "12h", futureSetting: 7,
    });
    expect(result.capture.local["propulse-panel-states"]).toEqual({
      bandConditions: true, pathAnalysis: false, dxSpotList: false, satellites: true,
    });
    expect(result.capture.local["propulse-dx-filters"]).toEqual({
      filters: { bands: ["40m"], modes: ["FT-8"], maxAge: 30, neededOnly: false, sortByNeeded: false },
    });
    expect(result.capture.local.futureSection).toEqual({ extra: true });
    expect(result.warnings.some((warning) => warning.includes("omitted"))).toBe(true);
    expect(source).toEqual(original);
    source.userPreferences.preferences.textScale = "mutated";
    expect(result.capture.local["propulse-settings"]).toMatchObject({ textScale: "xl" });
    const plan = convertLegacyViewCapture(result.capture, { ownerId: "owner-a" });
    expect(plan.views.pro.config.presentation.textScale).toBe("xl");
    expect(plan.views.pro.config.spots.filters).toMatchObject({ bands: ["40m"], modes: { modes: ["FT8"] } });
    expect(plan.views.pro.config.presentation.panels.find((panel) => panel.id === "band-conditions")?.collapsed).toBe(true);
    expect(JSON.stringify(plan.views)).not.toContain("secret");
    expect(JSON.stringify(plan.views)).not.toContain("radio-1");
    expect(getItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    getItem.mockRestore();
    fetchSpy.mockRestore();
  });

  it("retains malformed visual fields in capture and conversion warns without mutating input", () => {
    const source = backup({
      userPreferences: {
        preferences: { textScale: "invalid", uiInteraction: { holdDurationMs: -1 }, futureSetting: 7 },
      },
      mapSettings: { panelStates: { bandConditions: "yes", pathAnalysis: false } },
      dxFilters: { bands: "20m", modes: ["NOPE"], maxAge: -1 },
    });
    const original = structuredClone(source);
    const result = captureLegacyViewsFromSettingsBackup(source);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("capture");
    expect(result.capture.local["propulse-settings"]).toMatchObject({ textScale: "invalid", futureSetting: 7 });
    expect(result.capture.local["propulse-panel-states"]).toEqual({ bandConditions: "yes", pathAnalysis: false });
    const plan = convertLegacyViewCapture(result.capture, { ownerId: "owner-a" });
    expect(plan.views.pro.config.presentation.textScale).toBe("md");
    expect(plan.views.pro.config.presentation.controls.holdDurationMs).toBe(500);
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan.backup)).toContain('"futureSetting":7');
    expect(source).toEqual(original);
  });

  it("fails closed on future versions, non-objects and getters without executing accessors", () => {
    expect(captureLegacyViewsFromSettingsBackup(backup({ version: 99 }))).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("Incompatible backup version"),
    });
    expect(captureLegacyViewsFromSettingsBackup("not-json")).toMatchObject({ status: "invalid" });
    const poisoned = backup();
    Object.defineProperty(poisoned, "password", { get() { throw new Error("getter ran"); }, enumerable: true });
    const result = captureLegacyViewsFromSettingsBackup(poisoned);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("capture");
    expect(JSON.stringify(result.capture)).not.toContain("getter ran");
  });

  it("fails closed without throwing when an unknown field nests past the sanitize depth limit", () => {
    const source = backup({ futureSection: nestedUnknown(25) });
    expect(() => captureLegacyViewsFromSettingsBackup(source)).not.toThrow();
    expect(captureLegacyViewsFromSettingsBackup(source)).toMatchObject({ status: "invalid" });
  });

  it("fails closed without throwing when the backup contains a BigInt value", () => {
    const source = backup({ version: 1n as unknown as number });
    expect(() => captureLegacyViewsFromSettingsBackup(source)).not.toThrow();
    expect(captureLegacyViewsFromSettingsBackup(source)).toMatchObject({ status: "invalid" });
  });

  it("preserves a top-level toString key when merging into local recovery data", () => {
    const source = backup({ toString: { note: "keep me" } });
    const result = captureLegacyViewsFromSettingsBackup(source);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("capture");
    expect(result.capture.local.toString).toEqual({ note: "keep me" });
  });

  it("rejects a backup root whose prototype is not a plain object", () => {
    class BackupLike {
      appName = "propulse";
      version = 1;
      exportedAt = "2026-09-07T00:00:00.000Z";
      userPreferences = {};
      mapSettings = {};
      dxFilters = {};
    }
    const result = captureLegacyViewsFromSettingsBackup(new BackupLike());
    expect(result).toMatchObject({ status: "invalid" });
  });
});
