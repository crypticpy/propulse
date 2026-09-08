import { describe, expect, it } from "vitest";
import { createViewConfiguration } from "../defaults";
import { captureLegacyViews } from "./legacyCapture";
import { convertLegacyViewCapture } from "./legacyViewConversion";
import { convertCapturedOperatingProfiles } from "./legacyProfileConversion";

const profile = (id = "my-ssb") => ({
  id, name: "My SSB", spotFilters: { bands: ["20m"], modes: ["USB", "LSB"] },
  mapStyle: "standard", panelConfig: { bandConditions: { visible: true, collapsed: true } },
});

describe("accepted legacy profile integration", () => {
  it("keeps one complete display recipe per identity and preserves captured spot intent", () => {
    const baseline = createViewConfiguration("pro");
    baseline.spots.filters.maxAgeMinutes = 7;
    baseline.spots.filters.spotLimit = 120;
    baseline.spots.filters.sources = ["RBN"];
    baseline.spots.filters.modes.includeInferred = false;
    baseline.spots.grouping.enabled = false;
    baseline.spots.paths.background.style = "off";
    baseline.presentation.textScale = "xl";
    const input = profile();
    const before = structuredClone(baseline);
    const result = convertCapturedOperatingProfiles([input], baseline);
    expect(result.presets).toHaveLength(1);
    const recipe = result.presets[0];
    expect(recipe.id).toBe(input.id);
    expect(recipe.kind).toBe("display");
    if (recipe.kind !== "display") throw new Error("Expected display recipe");
    expect(recipe.config.spots).toMatchObject({
      filters: { maxAgeMinutes: 7, spotLimit: 120, sources: ["RBN"],
        modes: { modes: ["SSB"], includeInferred: false } },
      grouping: { enabled: false }, paths: { background: { style: "off" } },
    });
    expect(recipe.config.presentation).toMatchObject({ textScale: "xl", mapStyle: "standard" });
    expect(recipe.config.context.followRadio).toBe(false);
    expect(result.warnings.some((warning) => warning.includes("panelConfig retained in backup"))).toBe(true);
    expect(baseline).toEqual(before);
    input.spotFilters.bands.push("40m");
    baseline.spots.filters.sources.push("Cluster");
    expect(recipe.config.spots.filters.bands).toEqual(["20m"]);
    expect(recipe.config.spots.filters.sources).toEqual(["RBN"]);
  });

  it("uses the accepted adapter by default and records omissions in the captured migration", () => {
    const entries: Record<string, unknown> = {
      "propulse-custom-profiles": [profile()],
      "propulse-settings": { version: 37, state: { spotAge: { maxAgeMinutes: 7 } } },
    };
    const capture = captureLegacyViews({ getItem: (key) => key in entries ? JSON.stringify(entries[key]) : null }, { getItem: () => null });
    const plan = convertLegacyViewCapture(capture, { ownerId: "a" });
    expect(plan.presets[0]).toMatchObject({ id: "my-ssb", kind: "display", config: { spots: { filters: { maxAgeMinutes: 7 } } } });
    expect(plan.warnings.some((warning) => warning.includes("panelConfig"))).toBe(true);
    expect(plan.backup).toEqual(capture);
    expect(JSON.stringify(plan.backup)).toContain("bandConditions");
  });

  it("refuses unknown-only and mixed unsupported modes without broadening to All", () => {
    for (const modes of [["NOT-A-MODE"], ["SSB", "NOT-A-MODE"], [""]]) {
      expect(() => convertCapturedOperatingProfiles([{ ...profile(), spotFilters: { bands: [], modes } }], createViewConfiguration())).toThrow("Unsupported legacy mode");
    }
    const result = convertCapturedOperatingProfiles([{ ...profile(), spotFilters: { bands: [], modes: [] } }], createViewConfiguration());
    expect(result.presets[0]).toMatchObject({ kind: "display", config: { spots: { filters: { modes: { all: true } } } } });
  });

  it("does not alias sibling profiles and refuses malformed identity/filter input", () => {
    const result = convertCapturedOperatingProfiles([profile("one"), profile("two")], createViewConfiguration("pro"));
    const [one, two] = result.presets;
    if (one.kind !== "display" || two.kind !== "display") throw new Error("Expected displays");
    one.config.spots.filters.bands.push("80m");
    expect(two.config.spots.filters.bands).toEqual(["20m"]);
    for (const raw of [{ ...profile(), id: "" }, { ...profile(), spotFilters: null }, { ...profile(), spotFilters: { bands: [1], modes: [] } }]) {
      expect(() => convertCapturedOperatingProfiles([profile(), raw], createViewConfiguration())).toThrow();
    }
  });
});
