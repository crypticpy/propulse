import { describe, expect, it, vi } from "vitest";
import { createSpotPreferences } from "../defaults";
import { captureLegacyViews, type LegacyStorageReader } from "./legacyCapture";
import { convertLegacyViewCapture } from "./legacyViewConversion";

const storage = (entries: Record<string, unknown> = {}): LegacyStorageReader => ({
  getItem: vi.fn((key: string) => key in entries ? JSON.stringify(entries[key]) : null),
});
const persisted = (state: unknown, version = 0) => ({ state, version });

describe("legacy capture and conversion", () => {
  it("reads only explicit keys without touching authentication/device stores or live state", () => {
    const local = storage({
      "propulse-settings": persisted({ textScale: "xl", catIcomNetworkPassword: "secret", customUnknown: { future: 7 } }),
      "propulse-display-device": { deviceToken: "never-read" },
      "sb-auth-token": { access_token: "never-read" },
      "propulse-kiosk": persisted({ active: true, activeSceneId: "old", rotation: { enabled: true, intervalSec: 45 } }),
    });
    const capture = captureLegacyViews(local, storage());
    expect(local.getItem).not.toHaveBeenCalledWith("propulse-display-device");
    expect(local.getItem).not.toHaveBeenCalledWith("sb-auth-token");
    const json = JSON.stringify(capture);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("activeSceneId");
    expect(capture.local["propulse-settings"]).toEqual(persisted({ textScale: "xl", customUnknown: { future: 7 } }));
    expect(capture.local["propulse-kiosk"]).toEqual(persisted({ rotation: { enabled: true, intervalSec: 45 } }));
  });

  it("makes four independent complete family seeds and preserves supported legacy preferences", () => {
    const capture = captureLegacyViews(storage({
      "propulse-settings": persisted({
        textScale: "xl", timeFormat: "12h", spotAge: { maxAgeMinutes: 15, enabled: false, showAgeColumn: false },
        spotClustering: { enabled: false, minClusterSize: 8, gridSize: 5 },
        uiInteraction: { spotColorMode: "band", showSpotCallsignLabels: false, spotClickTunesRadio: true },
        forecastDisplay: { hoursToShow: 24 },
      }, 37),
      "propulse-spot-filters": { bands: ["20m"], modes: ["USB", "FT-8"] },
      "propulse-dx-filters": persisted({ filters: { maxAge: 30, bands: ["40m"] } }),
      "propulse-map-layers": { aurora: true, spots: false },
      "propulse-map-style": "standard",
      "propulse-night-darkness": 0.7,
      "propulse-auto-rotate-speed": 600,
    }), storage());
    const plan = convertLegacyViewCapture(capture, { ownerId: "owner-a" });
    expect(Object.values(plan.views).map((view) => view.config.family)).toEqual(["normal", "pro", "lite", "hamclock"]);
    const config = plan.views.pro.config;
    expect(config.spots.filters).toMatchObject({ bands: ["20m"], maxAgeMinutes: 15, modes: { all: false, modes: ["SSB", "FT8"] } });
    expect(config.spots.grouping).toEqual({ enabled: false, detail: "regions", minGroupSize: 8 });
    expect(config.presentation).toMatchObject({
      textScale: "xl", mapStyle: "standard", nightDarkness: 0.7, spotColorMode: "band",
      layers: { aurora: true, spots: false }, forecast: { hoursToShow: 24 },
      autoRotate: { enabled: false, secondsPerRevolution: 600 }, controls: { timeFormat: "12h", spotAgeDecay: false },
    });
    expect(config.context.followRadio).toBe(false);
    expect(config.presentation.controls).not.toHaveProperty("spotClickTunesRadio");
    expect(plan.warnings).toContain("Legacy angular clustering has no geographic equivalent; Regions grouping was used");
    config.presentation.layers.spots = true;
    expect(plan.views.normal.config.presentation.layers.spots).toBe(false);
    expect(plan.views.hamclock.config.presentation.projection).toBe("flat");
    expect(plan.views.hamclock.config.spots.paths.background.style).toBe("off");
  });

  it("preserves collapsed panels with distinct stable placements when no saved geometry exists", () => {
    const capture = captureLegacyViews(storage({ "propulse-panel-states": { bandConditions: true, pathAnalysis: false, dxSpotList: false, satellites: true } }), storage());
    const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
    const panels = plan.views.pro.config.presentation.panels;
    expect(panels).toHaveLength(4);
    expect(new Set(panels.map((panel) => `${panel.x},${panel.y}`)).size).toBe(4);
    expect(panels.find((panel) => panel.id === "band-conditions")?.collapsed).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes("1920x1080"))).toBe(true);
  });

  it("keeps saved Pro collapse state when generic controls disagree", () => {
    const capture = captureLegacyViews(storage({
      "propulse-pro-panel-layout": {
        "band-conditions": { x: 20, y: 30, width: 256, height: 400, collapsed: false },
        "path-analysis": { x: 300, y: 30, width: 288, height: 400, collapsed: true },
      },
      "propulse-panel-states": { bandConditions: true, pathAnalysis: false, satellites: true },
    }), storage());
    const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
    const panels = plan.views.pro.config.presentation.panels;
    expect(panels.find((panel) => panel.id === "band-conditions")).toMatchObject({ x: 20, y: 30, collapsed: false });
    expect(panels.find((panel) => panel.id === "path-analysis")?.collapsed).toBe(true);
    expect(panels.find((panel) => panel.id === "satellites")?.collapsed).toBe(true);
    expect(capture.local["propulse-panel-states"]).toEqual({ bandConditions: true, pathAnalysis: false, satellites: true });
  });

  it("does not silently change invalid scene timing or transitions", () => {
    for (const override of [{ durationSec: 1 }, { transition: "unknown" }]) {
      const capture = captureLegacyViews(storage({ "propulse-kiosk": persisted({ scenes: [
        { id: "wall", name: "Wall", route: "/map", ...override },
      ] }, 7) }), storage());
      const original = structuredClone(capture);
      expect(() => convertLegacyViewCapture(capture, { ownerId: "a" })).toThrow();
      expect(capture).toEqual(original);
    }
  });

  it("uses newer HamClock fields once, resolves inherited text and validates widgets", () => {
    const capture = captureLegacyViews(storage({
      "propulse-settings": persisted({ textScale: "200" }, 37),
      "propulse-hamclock-layout": persisted({ spotsSide: "left", spotsSidebarCollapsed: true, hamclockMode: "weather", preferredViewMode: "azimuthal" }, 4),
      "propulse-hamclock-widget-config": persisted({ widgets: { unsupportedWidget: { strange: true }, recentContacts: { rowCount: 3 } } }, 1),
    }), storage({ "propulse-hamclock-display": persisted({ textSize: "inherit", spotsSide: "right", spotsSidebarCollapsed: false, theme: "brass", followRadio: true }, 8) }));
    const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
    expect(plan.views.hamclock.config.presentation).toMatchObject({ textScale: "200", projection: "azimuthal", hamclock: {
      spotsSide: "right", spotsSidebarCollapsed: false, mode: "weather", theme: "brass",
      widgets: [{ tileId: "recentContacts", schemaVersion: 1, config: { rowCount: 3 } }],
    } });
    expect(plan.views.hamclock.config.context.followRadio).toBe(true);
    expect(plan.views.pro.config.context.followRadio).toBe(false);
    expect(plan.views.pro.config.presentation.hamclock.widgets).toEqual([]);
  });

  it("retains defaults for invalid known fields and preserves unknown values in backup", () => {
    const capture = captureLegacyViews(storage({
      "propulse-settings": persisted({ textScale: "invalid", futureSetting: 7, uiInteraction: { holdDurationMs: -1 } }, 37),
      "propulse-night-darkness": 99,
      "propulse-map-layers": { spots: "yes", aurora: true },
    }), storage());
    const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
    expect(plan.views.pro.config.presentation.textScale).toBe("md");
    expect(plan.views.pro.config.presentation.controls.holdDurationMs).toBe(500);
    expect(plan.views.pro.config.presentation.nightDarkness).toBe(0.5);
    expect(plan.views.pro.config.presentation.layers).toMatchObject({ spots: true, aurora: true });
    expect(JSON.stringify(plan.backup)).toContain('"futureSetting":7');
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("materializes each scene from the captured family baseline without previous-scene leakage", () => {
    const capture = captureLegacyViews(storage({
      "propulse-map-style": "standard",
      "propulse-map-layers": { aurora: false, spots: true },
      "propulse-kiosk": persisted({ rotation: { intervalSec: 45 }, scenes: [
        { id: "first", name: "First", route: "/map", map: { layoutMode: "pro", mapStyle: "satellite", preset: "quiet", autoRotate: true } },
        { id: "second", name: "Second", route: "/map", map: { layoutMode: "pro" } },
        { id: "solar", name: "Solar", route: "/solar" },
      ] }, 7),
    }), storage());
    const plan = convertLegacyViewCapture(capture, { ownerId: "a", layerPresets: { quiet: { spots: false, aurora: true } } });
    expect(plan.scenes[0].config.presentation).toMatchObject({ mapStyle: "satellite", autoRotate: { enabled: true }, layers: { spots: false, aurora: true } });
    expect(plan.scenes[1].config.presentation).toMatchObject({ mapStyle: "standard", autoRotate: { enabled: false }, layers: { spots: true, aurora: false } });
    expect(plan.scenes.every((scene) => scene.durationSec === 45)).toBe(true);
    expect(plan.scenes[2].config).toMatchObject({ family: "route", route: "/solar" });
    expect(() => convertLegacyViewCapture(capture, { ownerId: "a" })).toThrow("needs its shipped layer preset");
  });

  it("migrates numeric kiosk pins and historical default pins before scene validation", () => {
    for (const [version, id, pin, expected] of [
      [6, "custom-wall", 1, "solar"], [6, "custom-wall", 3, "weather"],
      [5, "default-wall", 1, "spots"], [5, "default-hamclock-weather", 0, "weather"],
    ] as const) {
      const capture = captureLegacyViews(storage({ "propulse-kiosk": persisted({ scenes: [{
        id, name: "Wall", route: "/map", map: { layoutMode: "hamclock", hamclock: { leftPage: pin } },
      }] }, version) }), storage());
      const original = structuredClone(capture);
      const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
      expect(plan.scenes[0].config.presentation.hamclock.initialPageId).toBe(expected);
      expect(plan.backup).toEqual(original);
      expect(capture).toEqual(original);
    }
  });

  it("requires lossless named profile conversion and passes copied baseline inputs", () => {
    const capture = captureLegacyViews(storage({ "propulse-custom-profiles": [{ id: "my-cw", name: "My CW" }] }), storage());
    expect(() => convertLegacyViewCapture(capture, { ownerId: "a" })).toThrow("adapter is required");
    expect(() => convertLegacyViewCapture(capture, { ownerId: "a", convertProfiles: () => [] })).toThrow("omitted entries");
    const adapter = vi.fn((profiles: readonly unknown[]) => profiles.map(() => ({ kind: "activity" as const, id: "my-cw", name: "My CW", version: 1, spots: createSpotPreferences() })));
    expect(() => convertLegacyViewCapture(capture, { ownerId: "a", convertProfiles: () => [{ kind: "activity", id: "different", name: "Changed", version: 1, spots: createSpotPreferences() }] })).toThrow("changed a valid identity");
    const plan = convertLegacyViewCapture(capture, { ownerId: "a", convertProfiles: adapter });
    expect(adapter).toHaveBeenCalledOnce();
    expect(plan.presets[0].id).toBe("my-cw");
  });

  it("refuses unsupported future versions and routes without writing or activating anything", () => {
    const capture = captureLegacyViews(storage({ "propulse-settings": persisted({ textScale: "xl" }, 999) }), storage());
    expect(() => convertLegacyViewCapture(capture, { ownerId: "a" })).toThrow("Unsupported legacy version");
    const scenes = captureLegacyViews(storage({ "propulse-kiosk": persisted({ scenes: [{ id: "auth", name: "Login", route: "/login" }] }, 7) }), storage());
    expect(() => convertLegacyViewCapture(scenes, { ownerId: "a" })).toThrow("unsupported route");
  });

  it("refuses storage failure and oversized captures rather than sealing partial defaults", () => {
    const bad = { getItem: () => { throw new Error("Storage unavailable"); } };
    expect(() => captureLegacyViews(storage(), bad)).toThrow("Storage unavailable");
    expect(() => captureLegacyViews(storage({ "propulse-settings": { huge: "x".repeat(2 * 1024 * 1024) } }), storage())).toThrow("exceeds 2 MiB");
  });

  it("warns on corrupt JSON without copying possible credentials into backup; supports literal legacy scalars", () => {
    const source = { getItem: (key: string) => key === "propulse-settings" ? '{"password":"hidden"' : key === "propulse-map-style" ? "standard" : null };
    const capture = captureLegacyViews(source, storage());
    expect(JSON.stringify(capture)).not.toContain("hidden");
    expect(capture.warnings[0]).toContain("Invalid JSON");
    expect(convertLegacyViewCapture(capture, { ownerId: "a" }).views.pro.config.presentation.mapStyle).toBe("standard");
  });
});
