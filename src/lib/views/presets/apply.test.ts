import { describe, expect, it } from "vitest";
import { createViewConfiguration } from "../defaults";
import {
  activityRecipeFromWorkingSpots,
  applyPresetRecipe,
  copyPresetRecipe,
  copyViewConfiguration,
  describeFieldChanges,
  displayRecipeFromWorkingConfiguration,
  getActivityRecipe,
  getDisplayRecipe,
  isActivityCustomized,
  isDisplayCustomized,
  resetBuiltInRecipe,
} from "./index";
import type { FeedAvailability } from "./sources";

const UNAVAILABLE_CLUSTER: FeedAvailability[] = [
  { source: "PSKReporter", enabled: true, authorized: true, connected: true },
  { source: "RBN", enabled: true, authorized: true, connected: false, reason: "Listener idle" },
  { source: "Cluster", enabled: false, authorized: false, connected: false, reason: "Not configured" },
  { source: "WSJT-X", enabled: true, authorized: true, connected: false, reason: "App not running" },
];

describe("copy and apply isolation", () => {
  it("copies recipes and configurations without aliasing", () => {
    const recipe = getActivityRecipe("activity-ft8-v1");
    const copy = copyPresetRecipe(recipe);
    expect(copy).toEqual(recipe);
    expect(copy).not.toBe(recipe);
    if (copy.kind === "activity") copy.spots.filters.spotLimit = 10;
    expect(recipe.spots.filters.spotLimit).toBe(100);
    const config = createViewConfiguration("pro");
    const cloned = copyViewConfiguration(config);
    cloned.presentation.projection = "azimuthal";
    expect(config.presentation.projection).toBe("globe");
  });

  it("preserves projection, layout, camera and unrelated presentation for activity recipes", () => {
    const current = createViewConfiguration("hamclock");
    current.presentation.projection = "azimuthal";
    current.presentation.cameraHomes.globe.center.lat = 59.9;
    current.presentation.cameraHomes.flat.zoom = 4;
    current.presentation.textScale = "xl";
    current.presentation.hamclock.theme = "brass";
    current.presentation.hamclock.mode = "satellites";
    current.presentation.panels = [{
      id: "band-conditions", visible: true, collapsed: false, x: 8, y: 16, width: 256, height: 400,
      dockedEdge: "right", dockedOrder: 0,
    }];
    current.context.followRadio = true;
    current.context.stationId = "station-1";
    current.presentation.autoRotate.enabled = true;
    const snapshot = copyViewConfiguration(current);
    const recipe = getActivityRecipe("activity-ssb-v1");
    const result = applyPresetRecipe(recipe, current);
    expect(result.config.spots).toEqual(recipe.spots);
    expect(result.config.presentation.projection).toBe("azimuthal");
    expect(result.config.presentation.cameraHomes).toEqual(snapshot.presentation.cameraHomes);
    expect(result.config.presentation.panels).toEqual(snapshot.presentation.panels);
    expect(result.config.presentation.textScale).toBe("xl");
    expect(result.config.presentation.hamclock.theme).toBe("brass");
    expect(result.config.presentation.hamclock.mode).toBe("satellites");
    expect(result.config.presentation.autoRotate.enabled).toBe(true);
    expect(result.config.family).toBe("hamclock");
    expect(result.config.context.followRadio).toBe(false);
    expect(result.config.context.followOperatingSession).toBe(false);
    expect(result.config.context.stationId).toBe("station-1");
    expect(result.config.context.scope).toBe(snapshot.context.scope);
    expect(result.config.context.radioId).toBe(snapshot.context.radioId);
    expect(result.config.context.displayTime).toEqual(snapshot.context.displayTime);
    expect(result.changes.some((change) => change.path.startsWith("spots."))).toBe(true);
    expect(result.changes.some((change) => change.path.startsWith("presentation."))).toBe(false);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "context.followRadio", before: true, after: false }),
    ]));
    current.presentation.cameraHomes.globe.center.lat = 0;
    recipe.spots.filters.spotLimit = 10;
    expect(result.config.presentation.cameraHomes.globe.center.lat).toBe(59.9);
    expect(result.config.spots.filters.spotLimit).toBe(50);
    expect(snapshot.presentation.cameraHomes.globe.center.lat).toBe(59.9);
  });

  it("replaces the complete snapshot for display templates", () => {
    const current = createViewConfiguration("pro");
    current.presentation.projection = "azimuthal";
    current.presentation.textScale = "sm";
    current.spots.filters.spotLimit = 200;
    current.context.followRadio = true;
    current.presentation.hamclock.theme = "classic";
    const result = applyPresetRecipe(getDisplayRecipe("display-hamclock-v1"), current);
    const template = getDisplayRecipe("display-hamclock-v1");
    expect(result.config).toEqual(template.config);
    expect(result.config.presentation.projection).toBe("flat");
    expect(result.config.family).toBe("hamclock");
    expect(result.config.spots).toEqual(getActivityRecipe("activity-quiet-v1").spots);
    expect(result.config.context.followRadio).toBe(false);
    expect(current.presentation.projection).toBe("azimuthal");
    expect(current.context.followRadio).toBe(true);
  });

  it("does not start connections or substitute feeds when sources are unavailable", () => {
    const current = createViewConfiguration();
    const clusterRecipe = activityRecipeFromWorkingSpots({
      id: "custom-cluster",
      name: "Cluster only",
      spots: { ...getActivityRecipe("activity-balanced-v1").spots, filters: {
        ...getActivityRecipe("activity-balanced-v1").spots.filters, sources: ["Cluster"],
      } },
    });
    const allEnabled = applyPresetRecipe(getActivityRecipe("activity-balanced-v1"), current, {
      feedAvailability: UNAVAILABLE_CLUSTER,
    });
    expect(allEnabled.config.spots.filters.sources).toEqual([]);
    expect(allEnabled.sourceNotes.every((note) => note.substituted === false && note.connectionStarted === false)).toBe(true);
    expect(allEnabled.sourceNotes.some((note) => note.source === "Cluster" && note.available === false)).toBe(true);
    expect(allEnabled.sourceNotes.some((note) => /does not start a connection/.test(note.message))).toBe(true);

    const clusterOnly = applyPresetRecipe(clusterRecipe, current, { feedAvailability: UNAVAILABLE_CLUSTER });
    expect(clusterOnly.config.spots.filters.sources).toEqual(["Cluster"]);
    expect(clusterOnly.sourceNotes.some((note) => note.source === "PSKReporter")).toBe(false);
    expect(clusterOnly.sourceNotes).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "Cluster", available: false, substituted: false, connectionStarted: false }),
    ]));

    const multi = activityRecipeFromWorkingSpots({
      id: "custom-multi",
      name: "Cluster and RBN",
      spots: { ...getActivityRecipe("activity-balanced-v1").spots, filters: {
        ...getActivityRecipe("activity-balanced-v1").spots.filters, sources: ["Cluster", "RBN"],
      } },
    });
    const unknown = applyPresetRecipe(multi, current);
    expect(unknown.sourceNotes.map((note) => note.source)).toEqual(["Cluster", "RBN"]);
    expect(unknown.sourceNotes.every((note) => note.substituted === false && note.connectionStarted === false)).toBe(true);
  });

  it("clears both follow flags on activity apply without touching other context", () => {
    const current = createViewConfiguration("pro");
    current.context.followRadio = true;
    current.context.followOperatingSession = true;
    current.context.scope = "logging";
    current.context.stationId = "station-9";
    current.context.radioId = "radio-2";
    current.context.displayTime = { kind: "offset", hours: -1 };
    current.presentation.projection = "flat";
    const result = applyPresetRecipe(getActivityRecipe("activity-cw-v1"), current);
    expect(result.config.context).toEqual({
      scope: "logging",
      followRadio: false,
      followOperatingSession: false,
      stationId: "station-9",
      radioId: "radio-2",
      displayTime: { kind: "offset", hours: -1 },
    });
    expect(result.config.presentation.projection).toBe("flat");
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "context.followRadio", before: true, after: false }),
      expect.objectContaining({ path: "context.followOperatingSession", before: true, after: false }),
    ]));
    expect(current.context.followRadio).toBe(true);
    expect(current.context.followOperatingSession).toBe(true);
  });

  it("snapshots array field-change values so later config edits cannot rewrite history", () => {
    const current = createViewConfiguration();
    const result = applyPresetRecipe(getActivityRecipe("activity-ssb-v1"), current);
    const modesChange = result.changes.find((change) => change.path === "spots.filters.modes.modes");
    expect(modesChange?.after).toEqual(["SSB"]);
    result.config.spots.filters.modes.modes.push("AM");
    expect(modesChange?.after).toEqual(["SSB"]);
  });
});

describe("field-change and customization helpers", () => {
  it("reports only changed fields and detects customization against a built-in", () => {
    const recipe = getActivityRecipe("activity-balanced-v1");
    const working = copyViewConfiguration(createViewConfiguration());
    expect(isActivityCustomized(working.spots, recipe)).toBe(false);
    working.spots.filters.spotLimit = 80;
    working.spots.filters.modes.includeInferred = false;
    expect(isActivityCustomized(working.spots, recipe)).toBe(true);
    const applied = applyPresetRecipe(recipe, working);
    expect(applied.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "spots.filters.spotLimit", before: 80, after: 50 }),
      expect.objectContaining({ path: "spots.filters.modes.includeInferred", before: false, after: true }),
    ]));
    const custom = activityRecipeFromWorkingSpots({ id: "custom-balanced", name: "My balanced", spots: working.spots });
    expect(custom.spots.filters.spotLimit).toBe(80);
    working.spots.filters.spotLimit = 10;
    expect(custom.spots.filters.spotLimit).toBe(80);
    expect(resetBuiltInRecipe("activity-balanced-v1")).toEqual(recipe);
  });

  it("copies a display snapshot for later UI save-as without writing libraries", () => {
    const template = getDisplayRecipe("display-station-v1");
    const edited = copyViewConfiguration(template.config);
    edited.presentation.textScale = "xl";
    const draft = displayRecipeFromWorkingConfiguration({
      id: "custom-station", name: "Night station", config: edited,
    });
    expect(isDisplayCustomized(edited, template)).toBe(true);
    expect(draft.config.presentation.textScale).toBe("xl");
    edited.presentation.textScale = "sm";
    expect(draft.config.presentation.textScale).toBe("xl");
    expect(template.config.presentation.textScale).toBe("md");
    expect(describeFieldChanges(template.config, draft.config)).toEqual([
      { path: "presentation.textScale", before: "md", after: "xl" },
    ]);
  });
});
