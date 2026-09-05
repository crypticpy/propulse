import { describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import {
  LAYER_CATEGORIES,
  LAYER_REGISTRY,
  effectiveLayerCaveat,
  formatLayerProvenance,
  layersInCategory,
} from "./layerRegistry";

describe("LAYER_REGISTRY", () => {
  const storeLayerKeys = Object.keys(useMapStore.getState().layers).sort();

  it("has exactly one entry per MapState.layers key — no gaps, no orphans", () => {
    const registryKeys = Object.keys(LAYER_REGISTRY).sort();
    expect(registryKeys).toEqual(storeLayerKeys);
  });

  it("every entry's own `key` field matches the record key it is stored under", () => {
    for (const [recordKey, entry] of Object.entries(LAYER_REGISTRY)) {
      expect(entry.key).toBe(recordKey);
    }
  });

  it("every entry belongs to a declared category", () => {
    const categoryIds = new Set(LAYER_CATEGORIES.map((c) => c.id));
    for (const entry of Object.values(LAYER_REGISTRY)) {
      expect(categoryIds.has(entry.category)).toBe(true);
    }
  });

  it("no category exceeds eight rows", () => {
    for (const category of LAYER_CATEGORIES) {
      expect(layersInCategory(category.id).length).toBeLessThanOrEqual(8);
    }
  });

  it("every category has at least one row (no dead sub-tab)", () => {
    for (const category of LAYER_CATEGORIES) {
      expect(layersInCategory(category.id).length).toBeGreaterThan(0);
    }
  });

  it("every row has a non-empty name, source, cadence and coverage", () => {
    for (const entry of Object.values(LAYER_REGISTRY)) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.source.length).toBeGreaterThan(0);
      expect(entry.cadence.length).toBeGreaterThan(0);
      expect(entry.coverage.length).toBeGreaterThan(0);
    }
  });

  it("formats the provenance line as source · cadence · coverage", () => {
    expect(formatLayerProvenance(LAYER_REGISTRY.terminator)).toBe(
      "Local solar-position astronomy · Real-time · Global",
    );
  });
});

describe("effectiveLayerCaveat", () => {
  it("prefers the projection-availability reason over the registry caveat", () => {
    // greyline has no static caveat but is unavailable in azimuthal.
    expect(effectiveLayerCaveat("greyline", "azimuthal")).toBe(
      "Not available in Azimuthal view",
    );
  });

  it("falls back to the registry's evergreen caveat when the layer is available", () => {
    expect(effectiveLayerCaveat("wspr", "globe")).toBe(
      "Disabled pending WSPR.live usage permission",
    );
  });

  it("is undefined when a layer has no caveat and is available", () => {
    expect(effectiveLayerCaveat("terminator", "globe")).toBeUndefined();
  });
});
