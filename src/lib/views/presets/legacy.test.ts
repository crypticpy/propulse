import { describe, expect, it } from "vitest";
import { createViewConfiguration } from "../defaults";
import {
  activityRecipeFromLegacyInput,
  hamclockDisplayRecipeFromLegacyWall,
  recipesFromLegacyOperatingProfile,
} from "./legacy";

describe("pure legacy adapters", () => {
  it("maps USB/LSB aliases to SSB without mutating the input or starting feeds", () => {
    const modes = ["usb", "LSB", "SSB"];
    const bands = ["20m"];
    const recipe = activityRecipeFromLegacyInput({
      id: "legacy-ssb",
      name: "Legacy SSB",
      modes,
      bands,
      sources: ["PSKReporter"],
      maxAgeMinutes: 15,
      spotLimit: 50,
    });
    expect(recipe.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["SSB"], includeUnknown: false, includeInferred: true,
    });
    expect(recipe.spots.filters.bands).toEqual(["20m"]);
    expect(recipe.spots.filters.sources).toEqual(["PSKReporter"]);
    expect(modes).toEqual(["usb", "LSB", "SSB"]);
    expect(bands).toEqual(["20m"]);
  });

  it("builds a HamClock display recipe from an explicit wall snapshot", () => {
    const seed = createViewConfiguration("hamclock");
    const railLayout = seed.presentation.hamclock.railLayout;
    railLayout.left[0].pageId = "spots";
    const recipe = hamclockDisplayRecipeFromLegacyWall({
      id: "legacy-wall",
      name: "Classic wall",
      theme: "classic",
      railLayout,
      autoPage: { enabled: true, dwellSeconds: 45 },
      initialPageId: "solar",
    });
    expect(recipe.kind).toBe("display");
    expect(recipe.config.family).toBe("hamclock");
    expect(recipe.config.presentation.hamclock.theme).toBe("classic");
    expect(recipe.config.presentation.hamclock.autoPage).toEqual({ enabled: true, dwellSeconds: 45 });
    expect(recipe.config.presentation.hamclock.initialPageId).toBe("solar");
    expect(recipe.config.context.followRadio).toBe(false);
    railLayout.left[0].pageId = "mutated";
    expect(recipe.config.presentation.hamclock.railLayout.left[0].pageId).toBe("spots");
    expect(seed.presentation.hamclock.theme).toBe("pulse");
  });

  it("defaults the initial wall page from the supplied layout when spots is absent", () => {
    const recipe = hamclockDisplayRecipeFromLegacyWall({
      id: "legacy-solar-wall",
      name: "Solar only",
      theme: "classic",
      railLayout: {
        left: [{ pageId: "solar", tileIds: ["xray", "solarWind"] }],
        right: [{ pageId: "solar", tileIds: ["moon", "muf"] }],
      },
      autoPage: { enabled: false, dwellSeconds: 120 },
    });
    expect(recipe.config.presentation.hamclock.initialPageId).toBe("solar");
  });

  it("preserves operating-profile ids from an explicit captured baseline", () => {
    const captured = createViewConfiguration("pro");
    captured.presentation.layers.muf = false;
    captured.context.followRadio = true;
    const converted = recipesFromLegacyOperatingProfile({
      capturedConfig: captured,
      profile: {
        id: "dx-hunter",
        name: "DX Hunter",
        spotFilters: { bands: [], modes: [] },
        layers: { muf: true, spots: true, labels: false },
        spotColorMode: "band",
        autoFollow: true,
        panelConfig: { bandConditions: { visible: true, collapsed: false } },
        suggestedLayoutMode: "pro",
        defaultZoomLevel: 2,
        shortLabel: "DX",
      },
    });
    expect(converted.activity.id).toBe("dx-hunter");
    expect(converted.display.id).toBe("dx-hunter");
    expect(converted.display.config.presentation.layers.muf).toBe(true);
    expect(converted.display.config.presentation.spotColorMode).toBe("band");
    expect(converted.display.config.context.followRadio).toBe(false);
    expect(converted.omitted.map((item) => item.field)).toEqual(expect.arrayContaining([
      "autoFollow", "panelConfig", "suggestedLayoutMode", "defaultZoomLevel", "shortLabel",
    ]));
    expect(captured.presentation.layers.muf).toBe(false);
    expect(captured.context.followRadio).toBe(true);
  });

  it("overlays only legacy band/mode onto captured spots without resetting age, sources, grouping or motion", () => {
    const captured = createViewConfiguration("pro");
    captured.spots.filters.maxAgeMinutes = 7;
    captured.spots.filters.spotLimit = 120;
    captured.spots.filters.sources = ["RBN"];
    captured.spots.filters.modes.includeInferred = false;
    captured.spots.grouping = { enabled: false, detail: "grid4", minGroupSize: 8 };
    captured.spots.paths.background.style = "off";
    captured.spots.paths.animate = "selected-only";
    captured.spots.paths.reduceMotion = true;
    captured.context.followRadio = true;
    const bands = ["20m"];
    const modes = ["SSB"];
    const converted = recipesFromLegacyOperatingProfile({
      capturedConfig: captured,
      profile: { id: "ssb-20", name: "20m SSB", spotFilters: { bands, modes } },
    });

    expect(converted.activity.spots.filters.maxAgeMinutes).toBe(7);
    expect(converted.activity.spots.filters.spotLimit).toBe(120);
    expect(converted.activity.spots.filters.sources).toEqual(["RBN"]);
    expect(converted.activity.spots.filters.bands).toEqual(["20m"]);
    expect(converted.activity.spots.filters.modes).toEqual({
      all: false, categories: [], modes: ["SSB"], includeUnknown: false, includeInferred: false,
    });
    expect(converted.activity.spots.grouping).toEqual({ enabled: false, detail: "grid4", minGroupSize: 8 });
    expect(converted.activity.spots.paths.background.style).toBe("off");
    expect(converted.activity.spots.paths.animate).toBe("selected-only");
    expect(converted.activity.spots.paths.reduceMotion).toBe(true);
    expect(converted.display.config.spots).toEqual(converted.activity.spots);
    expect(converted.display.config.spots).not.toBe(converted.activity.spots);
    expect(converted.display.config.context.followRadio).toBe(false);
    expect(converted.omitted).toEqual([]);

    captured.spots.filters.maxAgeMinutes = 30;
    captured.spots.filters.sources.push("PSKReporter");
    captured.spots.grouping.enabled = true;
    captured.spots.paths.background.style = "quick-sweep";
    bands.push("40m");
    modes.push("CW");
    converted.activity.spots.filters.spotLimit = 10;
    converted.display.config.spots.grouping.enabled = true;
    converted.display.config.spots.paths.animate = "all-displayed";

    expect(converted.activity.spots.filters.maxAgeMinutes).toBe(7);
    expect(converted.activity.spots.filters.sources).toEqual(["RBN"]);
    expect(converted.activity.spots.filters.bands).toEqual(["20m"]);
    expect(converted.activity.spots.filters.modes.modes).toEqual(["SSB"]);
    expect(converted.activity.spots.grouping.enabled).toBe(false);
    expect(converted.display.config.spots.filters.spotLimit).toBe(120);
    expect(converted.display.config.spots.filters.maxAgeMinutes).toBe(7);
    expect(converted.activity.spots.paths.animate).toBe("selected-only");
  });

  it("still default-seeds activityRecipeFromLegacyInput when callers choose that path", () => {
    const recipe = activityRecipeFromLegacyInput({
      id: "legacy-defaults",
      name: "Filters only",
      bands: ["20m"],
      modes: ["SSB"],
    });
    expect(recipe.spots.filters.maxAgeMinutes).toBe(30);
    expect(recipe.spots.filters.spotLimit).toBe(50);
    expect(recipe.spots.filters.sources).toEqual([]);
    expect(recipe.spots.grouping.enabled).toBe(true);
    expect(recipe.spots.paths.background.style).toBe("quick-sweep");
    expect(recipe.spots.filters.bands).toEqual(["20m"]);
    expect(recipe.spots.filters.modes.modes).toEqual(["SSB"]);
  });
});
