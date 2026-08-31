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
    // These four have globe implementations only — FlatMapView has no
    // hooks or draw code for them, so claiming flat support was a lie.
    for (const key of ["repeaters", "riverGauges", "aprs", "tropical"]) {
      expect(getLayerAvailability(key, "flat").available).toBe(false);
    }
  });

  it("allows layers implemented by the selected renderer", () => {
    expect(getLayerAvailability("radar", "globe")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("earthquakes", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("activations", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("activations", "azimuthal")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "globe")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "azimuthal")).toEqual({
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

  it("keeps live-source layers enabled without env flags", () => {
    for (const key of ["repeaters", "aprs", "wspr", "lightning", "tec"]) {
      expect(getLayerAvailability(key, "globe")).toEqual({ available: true });
    }
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
