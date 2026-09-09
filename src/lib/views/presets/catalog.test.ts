import { describe, expect, it } from "vitest";
import { presetRecipeSchema, viewConfigurationSchema } from "../contracts";
import { createSpotPreferences } from "../defaults";
import {
  ACTIVITY_PRESET_IDS,
  DISPLAY_PRESET_IDS,
  getActivityRecipe,
  getBuiltInRecipe,
  getDisplayRecipe,
  listBuiltInRecipes,
} from "./catalog";

const ALL_MODE = {
  all: true, categories: [] as string[], modes: [] as string[], includeUnknown: true, includeInferred: true,
};

describe("built-in activity recipes", () => {
  it("ships all six immutable recipes with complete validated spots", () => {
    expect(ACTIVITY_PRESET_IDS).toEqual([
      "activity-balanced-v1", "activity-ssb-v1", "activity-cw-v1",
      "activity-ft8-v1", "activity-quiet-v1", "activity-explore-v1",
    ]);
    for (const id of ACTIVITY_PRESET_IDS) {
      const recipe = getActivityRecipe(id);
      expect(presetRecipeSchema.parse(recipe)).toEqual(recipe);
      expect(recipe.kind).toBe("activity");
      expect(recipe.version).toBe(1);
      expect(recipe.spots.filters.bands).toEqual([]);
      expect(recipe.spots.filters.sources).toEqual([]);
      expect(recipe.spots.grouping).toEqual({ enabled: true, detail: "regions", minGroupSize: 3 });
      expect(recipe.spots.paths.reduceMotion).toBe(false);
      expect(recipe.spots.paths.maxActive).toBe(12);
      expect(recipe.spots.paths.maxPending).toBe(100);
    }
  });

  it("materializes Balanced activity field-by-field", () => {
    const recipe = getActivityRecipe("activity-balanced-v1");
    const seed = createSpotPreferences();
    expect(recipe.name).toBe("Balanced activity");
    expect(recipe.spots.filters.modes).toEqual(ALL_MODE);
    expect(recipe.spots.filters.maxAgeMinutes).toBe(30);
    expect(recipe.spots.filters.spotLimit).toBe(50);
    expect(recipe.spots.paths.background).toEqual({
      shape: "simple-arc", style: "quick-sweep", travelSeconds: 0.6,
      trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3, arrivalPulse: true, bounceGlow: false,
    });
    expect(recipe.spots.paths.selected).toEqual({
      shape: "ionospheric-hops", style: "traveling-pulse", travelSeconds: 1.5,
      trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3, arrivalPulse: false, bounceGlow: true,
    });
    expect(recipe.spots.paths.animate).toBe("new-spots");
    // "Balanced activity" hardcodes spotLimit=50 as its own curated design
    // value (SP-09 round 2: this no longer coincides with the shared
    // default, 150, so the comparison below overrides just that field).
    seed.filters.spotLimit = 50;
    expect(recipe.spots).toEqual(seed);
  });

  it("stores SSB as the canonical mode and excludes unknown", () => {
    const recipe = getActivityRecipe("activity-ssb-v1");
    expect(recipe.name).toBe("SSB operating");
    expect(recipe.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["SSB"], includeUnknown: false, includeInferred: true,
    });
    expect(recipe.spots.filters.modes.modes).not.toContain("USB");
    expect(recipe.spots.filters.modes.modes).not.toContain("LSB");
    expect(recipe.spots.filters.modes.modes).not.toContain("PHONE");
    expect(recipe.spots.filters.maxAgeMinutes).toBe(15);
    expect(recipe.spots.filters.spotLimit).toBe(50);
    expect(recipe.spots.paths.background.style).toBe("quick-sweep");
    expect(recipe.spots.paths.selected?.style).toBe("traveling-pulse");
    expect(recipe.spots.paths.animate).toBe("new-spots");
  });

  it("materializes CW hunting at 15 minutes and 100 reports", () => {
    const recipe = getActivityRecipe("activity-cw-v1");
    expect(recipe.name).toBe("CW hunting");
    expect(recipe.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["CW"], includeUnknown: false, includeInferred: true,
    });
    expect(recipe.spots.filters.maxAgeMinutes).toBe(15);
    expect(recipe.spots.filters.spotLimit).toBe(100);
    expect(recipe.spots.paths.background.shape).toBe("simple-arc");
    expect(recipe.spots.paths.selected?.shape).toBe("ionospheric-hops");
  });

  it("materializes FT8 monitoring at 5 minutes and 100 reports", () => {
    const recipe = getActivityRecipe("activity-ft8-v1");
    expect(recipe.name).toBe("FT8 monitoring");
    expect(recipe.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["FT8"], includeUnknown: false, includeInferred: true,
    });
    expect(recipe.spots.filters.maxAgeMinutes).toBe(5);
    expect(recipe.spots.filters.spotLimit).toBe(100);
    expect(recipe.spots.paths.animate).toBe("new-spots");
  });

  it("turns both path styles off for Quiet monitoring", () => {
    const recipe = getActivityRecipe("activity-quiet-v1");
    expect(recipe.name).toBe("Quiet monitoring");
    expect(recipe.spots.filters.modes).toEqual(ALL_MODE);
    expect(recipe.spots.filters.maxAgeMinutes).toBe(30);
    expect(recipe.spots.filters.spotLimit).toBe(50);
    expect(recipe.spots.paths.background).toMatchObject({ shape: "simple-arc", style: "off", arrivalPulse: false, bounceGlow: false });
    expect(recipe.spots.paths.selected).toMatchObject({ shape: "simple-arc", style: "off", arrivalPulse: false, bounceGlow: false });
    expect(recipe.spots.paths.selected).not.toBeNull();
  });

  it("scopes explore motion to the selected hop path with flowing dashes", () => {
    const recipe = getActivityRecipe("activity-explore-v1");
    expect(recipe.name).toBe("Propagation exploration");
    expect(recipe.spots.filters.modes).toEqual(ALL_MODE);
    expect(recipe.spots.filters.maxAgeMinutes).toBe(30);
    expect(recipe.spots.filters.spotLimit).toBe(50);
    expect(recipe.spots.paths.animate).toBe("selected-only");
    expect(recipe.spots.paths.background).toMatchObject({ shape: "simple-arc", style: "off" });
    expect(recipe.spots.paths.selected).toEqual({
      shape: "ionospheric-hops", style: "flowing-dashes", travelSeconds: 2.5,
      trailSeconds: 1, fadeSeconds: 0.5, repeatSeconds: 3, arrivalPulse: false, bounceGlow: true,
    });
  });
});

describe("built-in display templates", () => {
  it("ships all four complete replacement snapshots", () => {
    expect(DISPLAY_PRESET_IDS).toEqual([
      "display-station-v1", "display-hamclock-v1", "display-team-v1", "display-solar-v1",
    ]);
    expect(listBuiltInRecipes()).toHaveLength(10);
    for (const id of DISPLAY_PRESET_IDS) {
      const recipe = getDisplayRecipe(id);
      expect(presetRecipeSchema.parse(recipe)).toEqual(recipe);
      expect(viewConfigurationSchema.parse(recipe.config)).toEqual(recipe.config);
      expect(recipe.version).toBe(1);
      expect(recipe.config.context.followRadio).toBe(false);
      expect(recipe.config.context.followOperatingSession).toBe(false);
      expect(recipe.config.presentation.autoRotate.enabled).toBe(false);
    }
  });

  it("configures Station Monitor as Pro globe Balanced activity", () => {
    const recipe = getDisplayRecipe("display-station-v1");
    const balanced = getActivityRecipe("activity-balanced-v1");
    expect(recipe.name).toBe("Station Monitor");
    expect(recipe.config.family).toBe("pro");
    expect(recipe.config.route).toBe("/map");
    expect(recipe.config.presentation.projection).toBe("globe");
    expect(recipe.config.presentation.textScale).toBe("md");
    expect(recipe.config.presentation.layers.spots).toBe(true);
    expect(recipe.config.presentation.controls.showHoverTooltips).toBe(true);
    expect(recipe.config.presentation.controls.flyoutAutoDismissEnabled).toBe(true);
    expect(recipe.config.spots).toEqual(balanced.spots);
    expect(recipe.config.presentation.theme.id).toBe("dark");
  });

  it("configures HamClock Wall with Quiet monitoring and independent wall theme", () => {
    const recipe = getDisplayRecipe("display-hamclock-v1");
    const quiet = getActivityRecipe("activity-quiet-v1");
    const pageIds = [
      ...recipe.config.presentation.hamclock.railLayout.left.map((page) => page.pageId),
      ...recipe.config.presentation.hamclock.railLayout.right.map((page) => page.pageId),
    ];
    expect(recipe.name).toBe("HamClock Wall");
    expect(recipe.config.family).toBe("hamclock");
    expect(recipe.config.presentation.projection).toBe("flat");
    expect(recipe.config.presentation.textScale).toBe("lg");
    expect(recipe.config.spots).toEqual(quiet.spots);
    expect(recipe.config.presentation.hamclock.theme).toBe("pulse");
    expect(recipe.config.presentation.hamclock.mode).toBe("traffic");
    expect(recipe.config.presentation.hamclock.mapContent).toBe("activity");
    expect(recipe.config.presentation.hamclock.initialPageId).toBe("spots");
    expect(pageIds).toEqual(expect.arrayContaining(["spots", "solar", "forecast"]));
    expect(recipe.config.presentation.theme.id).toBe("dark");
    expect(recipe.config.presentation.hamclock.theme).not.toBe(recipe.config.presentation.theme.id);
  });

  it("configures Team Activity TV as HamClock traffic at 100 reports", () => {
    const recipe = getDisplayRecipe("display-team-v1");
    const balanced = getActivityRecipe("activity-balanced-v1");
    expect(recipe.name).toBe("Team Activity TV");
    expect(recipe.config.family).toBe("hamclock");
    expect(recipe.config.presentation.projection).toBe("flat");
    expect(recipe.config.presentation.hamclock.mode).toBe("traffic");
    expect(recipe.config.presentation.textScale).toBe("lg");
    expect(recipe.config.spots.filters.spotLimit).toBe(100);
    expect(recipe.config.spots.filters.modes).toEqual(balanced.spots.filters.modes);
    expect(recipe.config.spots.paths).toEqual(balanced.spots.paths);
    expect(recipe.config.presentation.layers.spots).toBe(true);
    expect(recipe.config.presentation.hamclock.theme).toBe("pulse");
  });

  it("keeps a complete dormant spot configuration on Solar Conditions TV", () => {
    const recipe = getDisplayRecipe("display-solar-v1");
    expect(recipe.name).toBe("Solar Conditions TV");
    expect(recipe.config.family).toBe("route");
    expect(recipe.config.route).toBe("/solar");
    expect(recipe.config.presentation.textScale).toBe("lg");
    expect(recipe.config.presentation.layers.spots).toBe(false);
    expect(recipe.config.presentation.layers.spotTraces).toBe(false);
    expect(recipe.config.spots.filters.modes).toEqual(ALL_MODE);
    expect(recipe.config.spots.filters.maxAgeMinutes).toBe(30);
    expect(recipe.config.spots.filters.spotLimit).toBe(150);
    expect(recipe.config.spots.grouping.enabled).toBe(true);
    expect(recipe.config.spots.paths.background.style).toBe("off");
    expect(recipe.config.spots.paths.selected?.style).toBe("off");
    expect(recipe.config.spots.paths.maxActive).toBe(12);
    expect(Object.keys(recipe.config.spots)).toEqual(["filters", "grouping", "paths"]);
  });
});

describe("catalog isolation", () => {
  it("does not alias catalog entries across getters", () => {
    const a = getBuiltInRecipe("activity-balanced-v1");
    const b = getBuiltInRecipe("activity-balanced-v1");
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    if (a.kind === "activity" && b.kind === "activity") {
      a.spots.filters.spotLimit = 200;
      a.spots.filters.modes.includeUnknown = false;
      expect(b.spots.filters.spotLimit).toBe(50);
      expect(getActivityRecipe("activity-balanced-v1").spots.filters.spotLimit).toBe(50);
      expect(getActivityRecipe("activity-balanced-v1").spots.filters.modes.includeUnknown).toBe(true);
    }
  });
});
