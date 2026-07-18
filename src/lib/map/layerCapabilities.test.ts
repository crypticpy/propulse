import { describe, expect, it } from "vitest";
import {
  getLayerAvailability,
  toggleExclusiveLayer,
} from "./layerCapabilities";

describe("PropSphere renderer capability matrix", () => {
  it("prevents globe-only overlays from becoming silent no-ops", () => {
    expect(getLayerAvailability("radar", "flat")).toEqual({
      available: false,
      reason: "Available in Globe view",
    });
    expect(getLayerAvailability("spectrumRing", "azimuthal").available).toBe(
      false,
    );
  });

  it("allows layers implemented by the selected renderer", () => {
    expect(getLayerAvailability("radar", "globe")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("earthquakes", "flat")).toEqual({
      available: true,
    });
  });

  it("keeps only one full-globe surface data overlay active", () => {
    const next = toggleExclusiveLayer(
      { radar: false, goesCloud: true, muf: true, spots: true },
      "radar",
    );
    expect(next).toEqual({
      radar: true,
      goesCloud: false,
      muf: false,
      spots: true,
    });
  });
});
