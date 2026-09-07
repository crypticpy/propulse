import { describe, expect, it } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { createSpotPreferences } from "../defaults";
import {
  dxFiltersFromViewSpots,
  dxSpotMatchesViewFilters,
  filterDxSpotsForView,
} from "./dxFilters";

const NOW = Date.parse("2026-09-07T19:00:00Z");

function dxSpot(overrides: Partial<DXSpot> & { source?: string; modeProvenance?: string } = {}): DXSpot {
  return {
    id: overrides.id ?? "spot",
    dx: "K1ABC",
    spotter: "K2ABC",
    frequency: 14000,
    comment: "",
    time: new Date(NOW),
    band: "20m",
    mode: "USB",
    ...overrides,
  };
}

describe("dxFiltersFromViewSpots", () => {
  it("forwards age and bands only, never modes or sources", () => {
    const spots = createSpotPreferences();
    spots.filters.bands = ["20m", "40m"];
    spots.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: ["CW", "FT8"],
      includeUnknown: true,
      includeInferred: true,
    };
    spots.filters.sources = ["Cluster"];
    spots.filters.maxAgeMinutes = 15;
    expect(dxFiltersFromViewSpots(spots)).toEqual({
      bands: ["20m", "40m"],
      modes: undefined,
      sources: undefined,
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

describe("filterDxSpotsForView", () => {
  it("keeps USB under phone and drops CW", () => {
    const spots = createSpotPreferences();
    spots.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: [],
      includeUnknown: false,
      includeInferred: true,
    };
    const { matching } = filterDxSpotsForView(
      [dxSpot({ id: "USB", mode: "USB" }), dxSpot({ id: "CW", mode: "CW" })],
      spots,
      NOW,
    );
    expect(matching.map((spot) => spot.mode)).toEqual(["USB"]);
  });

  it("keeps USB when the selection is explicit SSB", () => {
    const spots = createSpotPreferences();
    spots.filters.modes = {
      all: false,
      categories: [],
      modes: ["SSB"],
      includeUnknown: false,
      includeInferred: true,
    };
    expect(dxSpotMatchesViewFilters(dxSpot({ mode: "USB" }), spots, NOW)).toBe(true);
  });

  it("honors unknown and inferred flags", () => {
    const spots = createSpotPreferences();
    spots.filters.modes = {
      all: false,
      categories: ["phone"],
      modes: [],
      includeUnknown: false,
      includeInferred: false,
    };
    expect(dxSpotMatchesViewFilters(dxSpot({ mode: "" }), spots, NOW)).toBe(false);
    expect(dxSpotMatchesViewFilters(
      dxSpot({ mode: "USB", modeProvenance: "inferred" }),
      spots,
      NOW,
    )).toBe(false);
    spots.filters.modes.includeUnknown = true;
    spots.filters.modes.includeInferred = true;
    expect(dxSpotMatchesViewFilters(dxSpot({ mode: "" }), spots, NOW)).toBe(true);
    expect(dxSpotMatchesViewFilters(
      dxSpot({ mode: "USB", modeProvenance: "inferred" }),
      spots,
      NOW,
    )).toBe(true);
  });

  it("intersects authorized sources and separates list totals from the map budget", () => {
    const spots = createSpotPreferences();
    spots.filters.sources = ["RBN"];
    spots.filters.spotLimit = 10;
    const rows = [
      dxSpot({ id: "cluster", mode: "CW", source: "Cluster" }),
      ...Array.from({ length: 12 }, (_, index) => dxSpot({
        id: `rbn-${index}`,
        mode: "CW",
        source: "RBN",
        time: new Date(NOW - index * 1000),
      })),
    ];
    const { matching, mapBudgeted } = filterDxSpotsForView(rows, spots, NOW);
    expect(matching).toHaveLength(12);
    expect(mapBudgeted).toHaveLength(10);
    expect(matching.some((spot) => spot.id === "cluster")).toBe(false);
    expect(mapBudgeted[0]?.id).toBe("rbn-0");
  });

  it("applies a stable report-ID tie-break so equal-time membership ignores input order", () => {
    const spots = createSpotPreferences();
    spots.filters.spotLimit = 10;
    const rows = Array.from({ length: 11 }, (_, index) => dxSpot({
      id: `report-${String(index).padStart(2, "0")}`,
    }));
    const forward = filterDxSpotsForView(rows, spots, NOW).mapBudgeted.map((spot) => spot.id);
    const reversed = filterDxSpotsForView([...rows].reverse(), spots, NOW).mapBudgeted.map((spot) => spot.id);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(rows.slice(0, 10).map((spot) => spot.id));
  });

  it("rejects invalid and far-future timestamps against an explicit clock", () => {
    const spots = createSpotPreferences();
    const rows = [
      dxSpot({ id: "invalid", time: new Date("invalid") }),
      dxSpot({ id: "future", time: new Date(NOW + 86_400_000) }),
    ];
    expect(filterDxSpotsForView(rows, spots, NOW).matching).toEqual([]);
  });

  it("preserves explicit future-time tolerance without admitting arbitrary future rows", () => {
    const spots = createSpotPreferences();
    const skew = dxSpot({ id: "skew", time: new Date(NOW + 30_000) });
    const far = dxSpot({ id: "far", time: new Date(NOW + 86_400_000) });
    expect(filterDxSpotsForView([skew, far], spots, NOW, 60_000).matching.map((spot) => spot.id))
      .toEqual(["skew"]);
    expect(filterDxSpotsForView([skew], spots, NOW, 0).matching).toEqual([]);
  });
});
