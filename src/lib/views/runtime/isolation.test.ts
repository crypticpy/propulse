import { describe, expect, it } from "vitest";
import type { ViewBinding, ViewConfiguration } from "../contracts";
import { createSpotPreferences, createViewConfiguration } from "../defaults";
import { getActivityRecipe, getDisplayRecipe } from "../presets/catalog";
import { createViewRuntime } from "./createViewRuntime";
import {
  createViewScopedStore,
  selectConfiguredSpots,
  selectEffectiveSpots,
  selectFollowStatus,
  selectInteraction,
  selectPresentation,
} from "./createViewScopedStore";
import { createMemoryWorkingStorage } from "./workingStorage";
import { displaySlotId, namedSlotId } from "./slots";
import { useDXStore } from "@/stores/dxStore";

function binding(
  slot: ViewBinding["slotId"],
  kind: ViewBinding["kind"] = "interactive",
  extras: Partial<ViewBinding> = {},
): ViewBinding {
  return {
    ownerId: "owner-a",
    slotId: slot,
    kind,
    sourceView: null,
    displayId: kind === "display" ? slot.replace("display:", "") : null,
    ...extras,
  };
}

function clonePresentation(config: ViewConfiguration) {
  return JSON.parse(JSON.stringify(config.presentation)) as ViewConfiguration["presentation"];
}

function cloneSpots(config: ViewConfiguration) {
  return JSON.parse(JSON.stringify(config.spots)) as ViewConfiguration["spots"];
}

describe("view-scoped isolation", () => {
  it("keeps normal vs HamClock filters, follow, selection, and presentation independent", () => {
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
    const monitorStore = createViewScopedStore(monitor);
    monitorStore.ensureSubscribed();
    const wallStore = createViewScopedStore(wall, { band: "20m", mode: "CW" });
    wallStore.ensureSubscribed();

    monitorStore.updateWorkingView({
      context: { ...monitor.getSnapshot().config.context, followRadio: true },
    });
    monitorStore.setRadio({ band: "20m", mode: "CW" });
    const spots = cloneSpots(wall.getSnapshot().config);
    spots.filters.bands = ["40m"];
    spots.filters.modes = {
      all: false, categories: [], modes: ["FT8"],
      includeUnknown: true, includeInferred: true,
    };
    wallStore.updateWorkingView({ spots });
    wallStore.updateWorkingView({
      presentation: { ...clonePresentation(wall.getSnapshot().config), textScale: "xl" },
    });
    monitorStore.selectSpot("spot-mon", { lat: 10, lon: 20 });
    wallStore.selectSpot("spot-wall", { lat: -33, lon: 18 });

    expect(selectFollowStatus(monitorStore.store.getState())).toBe("active");
    expect(selectEffectiveSpots(monitorStore.store.getState()).filters.bands).toEqual(["20m"]);
    expect(selectConfiguredSpots(monitorStore.store.getState()).filters.bands).toEqual([]);
    expect(selectFollowStatus(wallStore.store.getState())).toBe("off");
    expect(selectEffectiveSpots(wallStore.store.getState()).filters.bands).toEqual(["40m"]);
    expect(selectPresentation(wallStore.store.getState()).textScale).toBe("xl");
    expect(selectPresentation(monitorStore.store.getState()).textScale).toBe("md");
    expect(selectInteraction(monitorStore.store.getState()).selectedReportId).toBe("spot-mon");
    expect(selectInteraction(wallStore.store.getState()).selectedReportId).toBe("spot-wall");

    // mapStore.spotFilters was the third leg of this cross-store isolation
    // check; it was removed entirely in #756 (zero live readers), so only the
    // dxStore leak-check remains here.
    const dxSelected = useDXStore.getState().selectedSpot;
    monitorStore.clearSelection();
    expect(selectInteraction(monitorStore.store.getState()).selectedReportId).toBeNull();
    expect(selectInteraction(wallStore.store.getState()).selectedReportId).toBe("spot-wall");
    expect(useDXStore.getState().selectedSpot).toBe(dxSelected);

    monitor.dispose();
    expect(() => monitorStore.updateWorkingView({
      presentation: clonePresentation(wall.getSnapshot().config),
    })).toThrow(/disposed/);
    expect(wall.getSnapshot().config.presentation.textScale).toBe("xl");
    wall.dispose();
    monitorStore.destroy();
    wallStore.destroy();
  });

  it("keeps two named copies and two display instances independent, including recovery", () => {
    const storage = createMemoryWorkingStorage();
    const one = createViewRuntime({
      binding: { ...binding(namedSlotId("one")), sourceView: { id: "one", revision: 1 } },
      seed: createViewConfiguration("pro"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    const two = createViewRuntime({
      binding: { ...binding(namedSlotId("two")), sourceView: { id: "two", revision: 1 } },
      seed: createViewConfiguration("pro"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    const storeOne = createViewScopedStore(one);
    storeOne.ensureSubscribed();
    const storeTwo = createViewScopedStore(two);
    storeTwo.ensureSubscribed();
    storeOne.updateWorkingView({
      presentation: { ...clonePresentation(one.getSnapshot().config), projection: "azimuthal" },
    });
    storeTwo.updateWorkingView({
      presentation: { ...clonePresentation(two.getSnapshot().config), projection: "flat" },
    });
    storeOne.selectSpot("named-one", { lat: 1, lon: 2 });
    expect(two.getSnapshot().config.presentation.projection).toBe("flat");
    expect(two.getSnapshot().interaction.selectedReportId).toBeNull();
    one.dispose();
    storeOne.destroy();
    const recovered = createViewRuntime({
      binding: { ...binding(namedSlotId("one")), sourceView: { id: "one", revision: 1 } },
      seed: createViewConfiguration("pro"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    expect(recovered.getSnapshot().config.presentation.projection).toBe("azimuthal");
    expect(recovered.getSnapshot().interaction.selectedReportId).toBeNull();
    expect(two.getSnapshot().config.presentation.projection).toBe("flat");
    recovered.dispose();
    two.dispose();
    storeTwo.destroy();

    const tv1 = createViewRuntime({
      binding: binding(displaySlotId("tv1"), "display"),
    });
    const tv2 = createViewRuntime({
      binding: binding(displaySlotId("tv2"), "display"),
    });
    const d1 = createViewScopedStore(tv1);
    d1.ensureSubscribed();
    const d2 = createViewScopedStore(tv2);
    d2.ensureSubscribed();
    d1.updateWorkingView({
      presentation: { ...clonePresentation(tv1.getSnapshot().config), textScale: "sm" },
    });
    d1.selectSpot("tv1-spot", { lat: 40, lon: -74 });
    expect(selectPresentation(d2.store.getState()).textScale).not.toBe("sm");
    expect(selectInteraction(d2.store.getState()).selectedReportId).toBeNull();
    tv1.dispose();
    expect(tv2.getSnapshot().interaction.selectedReportId).toBeNull();
    tv2.dispose();
    d1.destroy();
    d2.destroy();
  });

  it("does not persist derived radio filters through the scoped store", () => {
    const values = new Map<string, string>();
    const storage = createMemoryWorkingStorage(values);
    const runtime = createViewRuntime({
      binding: binding("normal"),
      storage,
      storageNamespace: "acct:owner-a",
    });
    const handle = createViewScopedStore(runtime);
    handle.ensureSubscribed();
    handle.updateWorkingView({
      context: { ...runtime.getSnapshot().config.context, followRadio: true },
    });
    const revision = runtime.getSnapshot().workingRevision;
    handle.setRadio({ band: "15m", mode: "FT8" });
    expect(selectEffectiveSpots(handle.store.getState()).filters.bands).toEqual(["15m"]);
    expect(runtime.getSnapshot().workingRevision).toBe(revision);
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual([]);
    const recipe = createSpotPreferences();
    recipe.filters.bands = ["80m"];
    recipe.filters.modes = {
      all: false, categories: [], modes: ["SSB"],
      includeUnknown: true, includeInferred: true,
    };
    handle.applyPreset({ kind: "activity", id: "ssb80", version: 1, name: "SSB 80", spots: recipe });
    expect(runtime.getSnapshot().config.context.followRadio).toBe(false);
    expect(runtime.getSnapshot().config.spots.filters.bands).toEqual(["80m"]);
    handle.destroy();
    runtime.dispose();
  });

  it("applies activity and display presets to one runtime without mutating the other", () => {
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
    monitor.updateWorkingView({
      context: { ...monitor.getSnapshot().config.context, followRadio: true, followOperatingSession: true },
      presentation: { ...clonePresentation(monitor.getSnapshot().config), projection: "azimuthal", textScale: "xl" },
    });
    wall.updateWorkingView({
      context: { ...wall.getSnapshot().config.context, followRadio: true, stationId: "wall-station" },
      presentation: { ...clonePresentation(wall.getSnapshot().config), projection: "flat", textScale: "sm" },
    });
    monitor.selectSpot("monitor-spot", { lat: 10, lon: 20 });
    wall.selectSpot("wall-spot", { lat: 51, lon: 0 });
    const wallBefore = {
      config: JSON.parse(JSON.stringify(wall.getSnapshot().config)),
      interaction: JSON.parse(JSON.stringify(wall.getSnapshot().interaction)),
      revision: wall.getSnapshot().workingRevision,
    };

    monitor.applyPreset(getActivityRecipe("activity-ssb-v1"));
    expect(monitor.getSnapshot().config.spots.filters.modes.modes).toEqual(["SSB"]);
    expect(monitor.getSnapshot().config.context.followRadio).toBe(false);
    expect(monitor.getSnapshot().interaction.selectedReportId).toBe("monitor-spot");
    expect(wall.getSnapshot().config).toEqual(wallBefore.config);
    expect(wall.getSnapshot().interaction).toEqual(wallBefore.interaction);
    expect(wall.getSnapshot().workingRevision).toBe(wallBefore.revision);

    monitor.applyPreset(getDisplayRecipe("display-hamclock-v1"));
    expect(monitor.getSnapshot().config.family).toBe("hamclock");
    expect(monitor.getSnapshot().interaction.selectedReportId).toBeNull();
    expect(wall.getSnapshot().config).toEqual(wallBefore.config);
    expect(wall.getSnapshot().interaction.selectedReportId).toBe("wall-spot");
    expect(wall.getSnapshot().config.context.stationId).toBe("wall-station");
    expect(wall.getSnapshot().config.presentation.textScale).toBe("sm");
    expect(wall.getSnapshot().workingRevision).toBe(wallBefore.revision);
    monitor.dispose();
    wall.dispose();
  });
});
