import { describe, expect, it } from "vitest";
import { createSpotPreferences } from "../defaults";
import { dxFiltersFromViewSpots } from "./dxFilters";

describe("dxFiltersFromViewSpots", () => {
  it("maps configured bands and modes without implying All", () => {
    const spots = createSpotPreferences();
    spots.filters.bands = ["20m", "40m"];
    spots.filters.modes = {
      all: false,
      categories: [],
      modes: ["CW", "FT8"],
      includeUnknown: true,
      includeInferred: true,
    };
    spots.filters.sources = ["Cluster"];
    spots.filters.maxAgeMinutes = 15;
    expect(dxFiltersFromViewSpots(spots)).toEqual({
      bands: ["20m", "40m"],
      modes: ["CW", "FT8"],
      sources: ["Cluster"],
      maxAge: 15,
    });
  });

  it("omits empty All-mode filters so the shared cluster feed stays unfiltered", () => {
    expect(dxFiltersFromViewSpots(createSpotPreferences())).toEqual({
      bands: undefined,
      modes: undefined,
      sources: undefined,
      maxAge: 30,
    });
  });
});
