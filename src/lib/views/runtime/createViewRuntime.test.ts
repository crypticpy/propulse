import { describe, expect, it, vi } from "vitest";
import type { ViewBinding, ViewConfiguration, ViewRepository } from "../contracts";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import { applyPresetRecipe } from "../presets/apply";
import { getActivityRecipe, getDisplayRecipe } from "../presets/catalog";
import { createViewRuntime } from "./createViewRuntime";
import { saveWorkingViewCopy } from "./saveWorkingView";
import { createMemoryWorkingStorage, workingSlotKey } from "./workingStorage";
import { NEVER_SERIALIZE_WORKING } from "./legacyViewState";

function binding(
  slot = "normal",
  owner = "owner-a",
  kind: ViewBinding["kind"] = "interactive",
): ViewBinding {
  return { ownerId: owner, slotId: slot, kind, sourceView: null, displayId: null };
}

function presentation(config: ViewConfiguration) {
  return JSON.parse(JSON.stringify(config.presentation)) as ViewConfiguration["presentation"];
}

describe("createViewRuntime", () => {
  it("keeps two instances independent and mints a fresh instanceId on recovery", () => {
    const storage = createMemoryWorkingStorage();
    const first = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "instance-a",
    });
    const wall = createViewRuntime({
      binding: binding("hamclock"),
      storage,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "instance-wall",
    });
    first.updateWorkingView({
      presentation: { ...presentation(first.getSnapshot().config), projection: "azimuthal" },
    });
    first.selectSpot("spot-1", { lat: 10, lon: 20 });
    first.setExpandedGroups(["group-1"]);
    expect(wall.getSnapshot().config.presentation.projection).toBe("flat");
    expect(wall.getSnapshot().interaction.selectedReportId).toBeNull();
    first.dispose();
    const recovered = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "instance-b",
    });
    expect(recovered.instanceId).toBe("instance-b");
    expect(recovered.instanceId).not.toBe("instance-a");
    expect(recovered.getSnapshot().config.presentation.projection).toBe("azimuthal");
    expect(recovered.getSnapshot().interaction.selectedReportId).toBeNull();
    expect(recovered.getSnapshot().interaction.target).toBeNull();
    expect(recovered.getSnapshot().interaction.expandedGroupIds).toEqual([]);
    recovered.dispose();
    wall.dispose();
  });

  it("does not serialize transients, instance identity, or measured quality", () => {
    const values = new Map<string, string>();
    const storage = createMemoryWorkingStorage(values);
    const runtime = createViewRuntime({
      binding: binding("pro"),
      storage,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "must-not-persist",
    });
    runtime.selectSpot("spot-9", { lat: 1, lon: 2 });
    runtime.setExpandedGroups(["g1"]);
    runtime.selectPathPoint("point-1");
    const raw = values.get(workingSlotKey("acct:owner-a", "pro")) ?? "";
    expect(raw).toContain('"projection"');
    for (const key of NEVER_SERIALIZE_WORKING) {
      expect(raw.includes(`"${key}"`)).toBe(false);
    }
    expect(JSON.parse(raw).config.presentation.quality).toBe("auto");
    runtime.dispose();
  });

  it("preserves per-projection camera homes when switching projection", () => {
    const runtime = createViewRuntime({ binding: binding("lite"), persistWorking: false });
    const current = runtime.getSnapshot().config;
    const homes = current.presentation.cameraHomes;
    runtime.updateWorkingView({
      presentation: {
        ...presentation(current),
        projection: "flat",
        cameraHomes: {
          ...homes,
          globe: { ...homes.globe, zoom: 4.5 },
          flat: { ...homes.flat, zoom: 2.25 },
        },
      },
    });
    const next = runtime.getSnapshot().config.presentation;
    expect(next.projection).toBe("flat");
    expect(next.cameraHomes.globe.zoom).toBe(4.5);
    expect(next.cameraHomes.flat.zoom).toBe(2.25);
    expect(next.cameraHomes.azimuthal.zoom).toBe(homes.azimuthal.zoom);
    runtime.dispose();
  });

  it("disables follow only on the edited runtime and never writes radio commands", () => {
    const storage = createMemoryWorkingStorage();
    const monitor = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    const wall = createViewRuntime({
      binding: binding("hamclock"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    const tune = vi.fn();
    monitor.updateWorkingView({
      context: { ...monitor.getSnapshot().config.context, followRadio: true },
    });
    expect(monitor.applyFollowFilters({ band: "20m", mode: "FT8" })).toBe(true);
    expect(monitor.getSnapshot().config.spots.filters.bands).toEqual([]);
    expect(monitor.effectiveSpots({ band: "20m", mode: "FT8" }).filters.bands).toEqual(["20m"]);
    expect(wall.getSnapshot().config.context.followRadio).toBe(false);
    expect(wall.getSnapshot().config.spots.filters.bands).toEqual([]);
    const spots = JSON.parse(JSON.stringify(monitor.getSnapshot().config.spots));
    spots.filters.bands = ["40m"];
    spots.filters.modes = {
      all: false, categories: [], modes: ["CW"],
      includeUnknown: true, includeInferred: true,
    };
    monitor.updateWorkingView({ spots });
    expect(monitor.getSnapshot().config.context.followRadio).toBe(false);
    expect(wall.getSnapshot().config.context.followRadio).toBe(false);
    expect(tune).not.toHaveBeenCalled();
    expect(monitor.followStatus({ band: "20m", mode: "FT8" })).toBe("off");
    expect(monitor.followStatus(null)).toBe("off");
    monitor.updateWorkingView({
      context: { ...monitor.getSnapshot().config.context, followRadio: true },
    });
    expect(monitor.followStatus(null)).toBe("paused-missing-radio");
    monitor.dispose();
    wall.dispose();
  });

  it("isolates auth namespaces and preview memory from interactive recovery", () => {
    const storage = createMemoryWorkingStorage();
    const signedIn = createViewRuntime({
      binding: binding("normal", "user-1"),
      storage,
      storageNamespace: "acct:user-1",
    });
    signedIn.updateWorkingView({
      presentation: { ...presentation(signedIn.getSnapshot().config), projection: "azimuthal" },
    });
    signedIn.dispose();
    const otherOwner = createViewRuntime({
      binding: binding("normal", "user-2"),
      storage,
      storageNamespace: "acct:user-2",
      seed: createViewConfiguration("normal"),
    });
    expect(otherOwner.getSnapshot().config.presentation.projection).toBe("globe");
    otherOwner.dispose();
    const preview = createViewRuntime({
      binding: binding("preview:station", "user-1", "preview"),
      storage,
      storageNamespace: "acct:user-1",
      persistWorking: false,
    });
    preview.updateWorkingView({
      presentation: { ...presentation(preview.getSnapshot().config), projection: "flat" },
    });
    preview.dispose();
    const previewAgain = createViewRuntime({
      binding: binding("preview:station", "user-1", "preview"),
      storage,
      storageNamespace: "acct:user-1",
      persistWorking: false,
    });
    expect(previewAgain.getSnapshot().config.presentation.projection).toBe("globe");
    previewAgain.dispose();
  });

  it("treats duplicated-tab storage as a starting copy with a new instance", () => {
    const shared = new Map<string, string>();
    const tabA = createMemoryWorkingStorage(shared);
    const first = createViewRuntime({
      binding: binding("named:station"),
      storage: tabA,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "tab-a",
    });
    first.updateWorkingView({
      presentation: { ...presentation(first.getSnapshot().config), projection: "flat" },
    });
    first.dispose();
    const tabB = createMemoryWorkingStorage(new Map(shared));
    const duplicate = createViewRuntime({
      binding: binding("named:station"),
      storage: tabB,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "tab-b",
    });
    expect(duplicate.instanceId).toBe("tab-b");
    expect(duplicate.getSnapshot().config.presentation.projection).toBe("flat");
    duplicate.updateWorkingView({
      presentation: { ...presentation(duplicate.getSnapshot().config), projection: "azimuthal" },
    });
    const original = createViewRuntime({
      binding: binding("named:station"),
      storage: tabA,
      storageNamespace: "acct:owner-a",
      createInstanceId: () => "tab-a-refresh",
    });
    expect(original.getSnapshot().config.presentation.projection).toBe("flat");
    duplicate.dispose();
    original.dispose();
  });

  it("clears interaction on scene replacement and rejects invalid patches", () => {
    const runtime = createViewRuntime({ binding: binding(), persistWorking: false });
    runtime.selectSpot("spot-1", { lat: 0, lon: 0 });
    runtime.replaceWorkingView(createViewConfiguration("pro"));
    expect(runtime.getSnapshot().interaction.selectedReportId).toBeNull();
    expect(() => runtime.updateWorkingView({
      presentation: { ...presentation(runtime.getSnapshot().config), projection: "mercator" as never },
    })).toThrow(/Invalid working view patch/);
    runtime.dispose();
    expect(() => runtime.getSnapshot()).toThrow(/disposed/);
  });

  it("saves a named copy through the injected ViewRepository without activating another runtime", async () => {
    const other = createViewRuntime({ binding: binding("hamclock"), persistWorking: false });
    other.updateWorkingView({
      presentation: { ...presentation(other.getSnapshot().config), projection: "azimuthal" },
    });
    const before = other.getSnapshot();
    const runtime = createViewRuntime({ binding: binding("normal"), persistWorking: false });
    runtime.updateWorkingView({
      presentation: { ...presentation(runtime.getSnapshot().config), projection: "flat" },
    });
    const saveView = vi.fn<ViewRepository["saveView"]>(async (_owner, view, expected) => ({
      status: "saved",
      record: { ...view, ownerId: "owner-a", revision: expected + 1 },
    }));
    const result = await saveWorkingViewCopy(runtime, { saveView, getView: vi.fn(), publishDisplay: vi.fn() }, {
      id: "copy-1", name: "Night 40", expectedRevision: 0,
    });
    expect(result.status).toBe("saved");
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(other.getSnapshot()).toBe(before);
    expect(other.getSnapshot().config.presentation.projection).toBe("azimuthal");
    runtime.dispose();
    other.dispose();
  });

  it("freezes snapshots and bindings so external mutation cannot rewrite state", () => {
    const values = new Map<string, string>();
    const storage = createMemoryWorkingStorage(values);
    const source = { id: "station", revision: 1 };
    const runtime = createViewRuntime({
      binding: { ...binding("named:station"), sourceView: source },
      storage,
      storageNamespace: "acct:owner-a",
    });
    const first = runtime.getSnapshot();
    expect(runtime.getSnapshot()).toBe(first);
    expect(() => {
      (first.config.presentation as { textScale: string }).textScale = "xl";
    }).toThrow();
    expect(() => {
      (first.config.spots.filters.bands as string[]).push("20m");
    }).toThrow();
    let notified = 0;
    const stop = runtime.subscribe(() => {
      notified += 1;
    });
    source.revision = 9;
    expect(() => {
      (runtime.binding.sourceView as { revision: number }).revision = 9;
    }).toThrow();
    expect(runtime.getSnapshot().config.presentation.textScale).toBe("md");
    expect(runtime.getSnapshot().workingRevision).toBe(0);
    expect(runtime.binding.sourceView?.revision).toBe(1);
    expect(runtime.getSnapshot()).toBe(first);
    expect(notified).toBe(0);
    stop();
    runtime.selectSpot("spot-1", { lat: 10, lon: 20 });
    const afterSelect = runtime.getSnapshot();
    expect(afterSelect).not.toBe(first);
    expect(afterSelect.workingRevision).toBe(0);
    expect(() => {
      afterSelect.interaction.target!.lat = 0;
    }).toThrow();
    expect(afterSelect.interaction.target?.lat).toBe(10);
    runtime.dispose();
  });

  it("derives follow filters without persisting radio intent", async () => {
    const values = new Map<string, string>();
    const storage = createMemoryWorkingStorage(values);
    const runtime = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    runtime.updateWorkingView({
      context: { ...runtime.getSnapshot().config.context, followRadio: true },
    });
    const revision = runtime.getSnapshot().workingRevision;
    const snapshot = runtime.getSnapshot();
    expect(runtime.applyFollowFilters({ band: "20m", mode: "CW" })).toBe(true);
    expect(runtime.getSnapshot()).toBe(snapshot);
    expect(runtime.getSnapshot().workingRevision).toBe(revision);
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual([]);
    expect(runtime.effectiveSpots({ band: "20m", mode: "CW" }).filters.bands).toEqual(["20m"]);
    expect(runtime.effectiveSpots(null).filters.bands).toEqual([]);
    expect(runtime.followStatus({ band: "20m", mode: "CW" })).toBe("active");
    expect(runtime.followStatus(null)).toBe("paused-missing-radio");
    expect(runtime.followStatus({ band: "nope!", mode: "CW" })).toBe("paused-missing-radio");
    const raw = JSON.parse(values.get(workingSlotKey("acct:owner-a", "normal")) ?? "{}");
    expect(raw.config.spots.filters.bands).toEqual([]);
    const saveView = vi.fn<ViewRepository["saveView"]>(async (_owner, view, expected) => ({
      status: "saved" as const,
      record: { ...view, ownerId: "owner-a", revision: expected + 1 },
    }));
    await saveWorkingViewCopy(runtime, { saveView, getView: vi.fn(), publishDisplay: vi.fn() }, {
      id: "copy-follow", name: "Follow check", expectedRevision: 0,
    });
    expect(saveView.mock.calls[0][1].config.spots.filters.bands).toEqual([]);
    runtime.dispose();
  });

  it("recovers unsaved edits for the same source revision but honors explicit loads", () => {
    const storage = createMemoryWorkingStorage();
    const firstSeed = createViewConfiguration("pro");
    firstSeed.presentation.textScale = "md";
    const v1 = createViewRuntime({
      binding: { ...binding("named:one"), sourceView: { id: "one", revision: 1 } },
      seed: firstSeed,
      storage,
      storageNamespace: "acct:owner-a",
    });
    v1.updateWorkingView({
      presentation: { ...presentation(v1.getSnapshot().config), textScale: "lg" },
    });
    v1.dispose();
    const refreshed = createViewRuntime({
      binding: { ...binding("named:one"), sourceView: { id: "one", revision: 1 } },
      seed: firstSeed,
      storage,
      storageNamespace: "acct:owner-a",
    });
    expect(refreshed.getSnapshot().config.presentation.textScale).toBe("lg");
    refreshed.dispose();
    const newerSeed = createViewConfiguration("pro");
    newerSeed.presentation.textScale = "xl";
    const v2 = createViewRuntime({
      binding: { ...binding("named:one"), sourceView: { id: "one", revision: 2 } },
      seed: newerSeed,
      storage,
      storageNamespace: "acct:owner-a",
    });
    expect(v2.getSnapshot().config.presentation.textScale).toBe("xl");
    expect(v2.binding.sourceView?.revision).toBe(2);
    v2.dispose();
    const otherSeed = createViewConfiguration("pro");
    otherSeed.presentation.textScale = "sm";
    const other = createViewRuntime({
      binding: { ...binding("named:two"), sourceView: { id: "two", revision: 1 } },
      seed: otherSeed,
      storage,
      storageNamespace: "acct:owner-a",
    });
    expect(other.getSnapshot().config.presentation.textScale).toBe("sm");
    other.dispose();
    const family = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    family.updateWorkingView({
      presentation: { ...presentation(family.getSnapshot().config), projection: "azimuthal" },
    });
    family.dispose();
    const familyRefresh = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    expect(familyRefresh.getSnapshot().config.presentation.projection).toBe("azimuthal");
    familyRefresh.dispose();
  });

  it("disables both follow flags when applying an activity recipe", () => {
    const runtime = createViewRuntime({ binding: binding(), persistWorking: false });
    runtime.updateWorkingView({
      context: {
        ...runtime.getSnapshot().config.context,
        followRadio: true,
        followOperatingSession: true,
        scope: "logging",
      },
    });
    const spots = createSpotPreferences();
    spots.filters.bands = ["40m"];
    spots.filters.modes = {
      all: false, categories: [], modes: ["CW"],
      includeUnknown: true, includeInferred: true,
    };
    const projection = runtime.getSnapshot().config.presentation.projection;
    runtime.applyPreset({
      kind: "activity", id: "cw40", version: 1, name: "CW 40", spots,
    });
    const next = runtime.getSnapshot().config;
    expect(next.context.followRadio).toBe(false);
    expect(next.context.followOperatingSession).toBe(false);
    expect(next.context.scope).toBe("logging");
    expect(next.spots.filters.bands).toEqual(["40m"]);
    expect(next.presentation.projection).toBe(projection);
    runtime.dispose();
  });

  it("delegates preset application to applyPresetRecipe and preserves activity interaction", () => {
    const runtime = createViewRuntime({ binding: binding(), persistWorking: false });
    runtime.updateWorkingView({
      context: {
        ...runtime.getSnapshot().config.context,
        followRadio: true,
        followOperatingSession: true,
        stationId: "station-9",
      },
      presentation: { ...presentation(runtime.getSnapshot().config), projection: "azimuthal", textScale: "xl" },
    });
    runtime.selectSpot("report-keep", { lat: 41.2, lon: -74.1 });
    runtime.setExpandedGroups(["group-keep"]);
    const before = runtime.getSnapshot().config;
    const activity = getActivityRecipe("activity-cw-v1");
    const expected = applyPresetRecipe(activity, before).config;
    runtime.applyPreset(activity);
    const afterActivity = runtime.getSnapshot();
    expect(afterActivity.config).toEqual(expected);
    expect(afterActivity.config.spots).toEqual(activity.spots);
    expect(afterActivity.config.presentation.projection).toBe("azimuthal");
    expect(afterActivity.config.presentation.textScale).toBe("xl");
    expect(afterActivity.config.context.followRadio).toBe(false);
    expect(afterActivity.config.context.followOperatingSession).toBe(false);
    expect(afterActivity.config.context.stationId).toBe("station-9");
    expect(afterActivity.interaction.selectedReportId).toBe("report-keep");
    expect(afterActivity.interaction.target).toEqual({
      lat: 41.2, lon: -74.1, origin: "spot", reportId: "report-keep",
    });
    expect(afterActivity.interaction.expandedGroupIds).toEqual(["group-keep"]);

    const display = getDisplayRecipe("display-hamclock-v1");
    const expectedDisplay = applyPresetRecipe(display, afterActivity.config).config;
    runtime.applyPreset(display);
    const afterDisplay = runtime.getSnapshot();
    expect(afterDisplay.config).toEqual(expectedDisplay);
    expect(afterDisplay.config).toEqual(display.config);
    expect(afterDisplay.interaction).toEqual({
      selectedReportId: null,
      selectedPathPointId: null,
      target: null,
      expandedGroupIds: [],
    });
    runtime.dispose();
  });
});
