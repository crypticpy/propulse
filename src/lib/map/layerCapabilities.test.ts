import { describe, expect, it } from "vitest";
import {
  getLayerAvailability,
  normalizeExclusiveLayers,
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
    expect(getLayerAvailability("stateBorders", "flat")).toEqual({
      available: true,
    });
  });

  it("rejects stale or external layer keys", () => {
    expect(getLayerAvailability("not-a-layer", "globe")).toEqual({
      available: false,
      reason: "Unknown layer control",
    });
  });

  it("disables provider-backed layers until approved access is configured", () => {
    expect(getLayerAvailability("repeaters", "globe")).toEqual({
      available: false,
      reason: "RepeaterBook access is pending provider approval",
    });
    expect(getLayerAvailability("aprs", "globe")).toEqual({
      available: false,
      reason: "APRS.fi access is not configured",
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

  it("normalizes profile and preset writes with a deterministic preference", () => {
    expect(
      normalizeExclusiveLayers(
        { radar: true, goesCloud: true, muf: true, spots: true },
        "muf",
      ),
    ).toEqual({
      radar: false,
      goesCloud: false,
      muf: true,
      spots: true,
    });
  });
});
