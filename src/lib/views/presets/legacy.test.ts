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
});
