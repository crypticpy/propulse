import { describe, expect, it } from "vitest";
import { expandModeCategory } from "@/lib/spots/presentation";
import { modeSelectionSchema, type ModeSelection } from "@/lib/views/spotContracts";
import {
  DEFAULT_SPOT_FILTERS,
  categoryState,
  defaultFilters,
  filtersAreDefault,
  isAllModesSelected,
  isModeSelected,
  modeCatalog,
  selectAllModes,
  setIncludeInferred,
  setIncludeUnknown,
  summarizeFilters,
  toggleMode,
  toggleModeCategory,
} from "./modeSelection";

const ALL: ModeSelection = {
  all: true, categories: [], modes: [], includeUnknown: true, includeInferred: true,
};

/** Every helper result must still satisfy the frozen contract schema. */
function valid(selection: ModeSelection): ModeSelection {
  return modeSelectionSchema.parse(selection);
}

describe("mode selection algebra (FILTER-01)", () => {
  it("starts from All with unknown and inferred included", () => {
    expect(valid(ALL).all).toBe(true);
    expect(categoryState(ALL, "phone")).toBe("on");
    expect(categoryState(ALL, "cw")).toBe("on");
    expect(categoryState(ALL, "digital")).toBe("on");
    expect(isModeSelected(ALL, "FT8")).toBe(true);
  });

  it("turns a category off by expanding the remaining categories, never a hidden OR", () => {
    const next = valid(toggleModeCategory(ALL, "digital"));
    expect(next.all).toBe(false);
    expect(new Set(next.categories)).toEqual(new Set(["phone", "cw"]));
    expect(next.modes).toEqual([]);
    expect(categoryState(next, "digital")).toBe("off");
    expect(isModeSelected(next, "FT8")).toBe(false);
    expect(isModeSelected(next, "SSB")).toBe(true);
  });

  it("degrades a fully selected category to a partial selection when one child is removed", () => {
    const next = valid(toggleMode(ALL, "FT8"));
    expect(next.all).toBe(false);
    expect(next.categories).not.toContain("digital");
    expect(categoryState(next, "digital")).toBe("partial");
    expect(categoryState(next, "phone")).toBe("on");
    expect(next.modes).not.toContain("FT8");
    for (const mode of expandModeCategory("digital")) {
      if (mode !== "FT8") expect(next.modes).toContain(mode);
    }
  });

  it("restores a whole category once every member is selected again", () => {
    const partial = toggleMode(ALL, "FT8");
    const restored = valid(toggleMode(partial, "FT8"));
    expect(restored.all).toBe(true);
    expect(categoryState(restored, "digital")).toBe("on");
  });

  it("normalizes an emptied selection back to All", () => {
    const cwOnly = valid(toggleModeCategory(toggleModeCategory(ALL, "digital"), "phone"));
    expect(cwOnly.categories).toEqual(["cw"]);
    const emptied = valid(toggleModeCategory(cwOnly, "cw"));
    expect(emptied.all).toBe(true);
    expect(emptied.includeUnknown).toBe(true);
  });

  it("never mixes All with specific selections", () => {
    const next = valid(toggleMode(ALL, "CW"));
    expect(next.all && (next.categories.length > 0 || next.modes.length > 0)).toBe(false);
  });

  it("aliases a reported label onto its canonical mode before toggling", () => {
    // Digital only: neither USB nor LSB is selected yet.
    const digitalOnly = toggleModeCategory(toggleModeCategory(ALL, "phone"), "cw");
    expect(isModeSelected(digitalOnly, "SSB")).toBe(false);
    // USB and LSB are the same sideband selection, so either token toggles SSB.
    const withSsb = valid(toggleMode(digitalOnly, "USB"));
    expect(withSsb.modes).toContain("SSB");
    expect(withSsb.modes).not.toContain("USB");
    expect(isModeSelected(withSsb, "LSB")).toBe(true);
    expect(valid(toggleMode(withSsb, "LSB")).modes).not.toContain("SSB");
  });

  it("ignores an unrecognizable mode token rather than corrupting the selection", () => {
    const before = toggleModeCategory(ALL, "phone");
    expect(toggleMode(before, "!!!")).toEqual(before);
  });
});

describe("unknown and inferred provenance (FILTER-02)", () => {
  it("drops Include unknown when leaving All for a specific selection", () => {
    expect(ALL.includeUnknown).toBe(true);
    expect(valid(toggleModeCategory(ALL, "digital")).includeUnknown).toBe(false);
    expect(valid(toggleMode(ALL, "FT8")).includeUnknown).toBe(false);
  });

  it("re-includes unknown when the user goes back to All", () => {
    const specific = toggleModeCategory(ALL, "digital");
    expect(valid(selectAllModes(specific)).includeUnknown).toBe(true);
  });

  it("keeps an explicit unknown choice while the selection stays specific", () => {
    const specific = setIncludeUnknown(toggleModeCategory(ALL, "digital"), true);
    expect(specific.includeUnknown).toBe(true);
    expect(valid(toggleModeCategory(specific, "cw")).includeUnknown).toBe(true);
  });

  it("carries the inferred choice through category and mode edits", () => {
    const noInferred = setIncludeInferred(ALL, false);
    expect(valid(toggleModeCategory(noInferred, "digital")).includeInferred).toBe(false);
    expect(valid(toggleMode(noInferred, "FT8")).includeInferred).toBe(false);
    expect(valid(selectAllModes(noInferred)).includeInferred).toBe(false);
  });
});

describe("catalog and summary", () => {
  it("offers every category with its recognized members", () => {
    const catalog = modeCatalog();
    expect(catalog.map((entry) => entry.key)).toEqual(["phone", "cw", "digital"]);
    expect(catalog[0].modes).toContain("SSB");
    expect(catalog[2].modes).toContain("FT8");
    expect(catalog.every((entry) => entry.modes.length > 0)).toBe(true);
  });

  it("summarizes defaults in plain language without storage vocabulary", () => {
    const summary = summarizeFilters(DEFAULT_SPOT_FILTERS);
    expect(summary).toContain("All modes");
    expect(summary).toContain("All bands");
    expect(summary).toContain("all available sources");
    expect(summary).toContain("last 30 min");
    expect(summary).toContain("up to 150 spots");
    expect(summary).not.toMatch(/spotLimit|maxAgeMinutes|schemaVersion/);
  });

  it("names the chosen bands and sources once they are narrowed", () => {
    const summary = summarizeFilters({
      ...DEFAULT_SPOT_FILTERS,
      bands: ["20m", "40m"],
      sources: ["RBN", "Cluster"],
    });
    expect(summary).toContain("20m, 40m");
    expect(summary).toContain("RBN, DX Cluster");
  });

  it("says when inferred modes are excluded", () => {
    const summary = summarizeFilters({
      ...DEFAULT_SPOT_FILTERS,
      modes: setIncludeInferred(ALL, false),
    });
    expect(summary).toContain("inferred modes excluded");
  });
});

describe("filter defaults (FILTER-04)", () => {
  it("matches the accepted contract defaults and is a fresh object each call", () => {
    expect(defaultFilters()).toEqual(DEFAULT_SPOT_FILTERS);
    expect(defaultFilters()).not.toBe(defaultFilters());
    expect(defaultFilters().maxAgeMinutes).toBe(30);
    expect(defaultFilters().spotLimit).toBe(150);
    expect(defaultFilters().bands).toEqual([]);
    expect(defaultFilters().sources).toEqual([]);
    expect(defaultFilters().modes.all).toBe(true);
    expect(defaultFilters().modes.includeUnknown).toBe(true);
    expect(defaultFilters().modes.includeInferred).toBe(true);
  });

  it("treats every category selected as All even when all is still false", () => {
    const threeCategories: ModeSelection = {
      all: false,
      categories: ["phone", "cw", "digital"],
      modes: [],
      includeUnknown: true,
      includeInferred: true,
    };
    expect(isAllModesSelected(threeCategories)).toBe(true);
    expect(isAllModesSelected(ALL)).toBe(true);
    expect(isAllModesSelected(toggleModeCategory(ALL, "digital"))).toBe(false);
  });

  it("detects a narrowed filter set", () => {
    expect(filtersAreDefault(defaultFilters())).toBe(true);
    expect(filtersAreDefault({ ...defaultFilters(), spotLimit: 100 })).toBe(false);
    expect(filtersAreDefault({ ...defaultFilters(), modes: toggleMode(ALL, "FT8") })).toBe(false);
  });
});
