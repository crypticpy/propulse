import { describe, expect, it } from "vitest";
import {
  GLOBE_DEPTH_DOME_RADIUS,
  GLOBE_LAYER_ORDER,
  GLOBE_LAYER_SLOTS,
  GLOBE_MIN_OVERLAY_RADIUS,
  GLOBE_OVERLAY_MATERIAL,
  GLOBE_SURFACE_MARKER_MATERIAL,
} from "./globeRenderOrder";

describe("GLOBE_LAYER_ORDER", () => {
  it("covers every slot exactly once in the paint sequence", () => {
    expect([...GLOBE_LAYER_SLOTS].sort()).toEqual(
      Object.keys(GLOBE_LAYER_ORDER).sort(),
    );
    expect(new Set(GLOBE_LAYER_SLOTS).size).toBe(GLOBE_LAYER_SLOTS.length);
  });

  it("is strictly monotonic in paint order", () => {
    const values = GLOBE_LAYER_SLOTS.map((slot) => GLOBE_LAYER_ORDER[slot]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("keeps the opaque base at renderOrder 0", () => {
    expect(GLOBE_LAYER_ORDER.base).toBe(0);
  });

  it("disables depth test and write for sphere texture drapes", () => {
    expect(GLOBE_OVERLAY_MATERIAL).toEqual({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  });

  it("keeps CPU-occluded surface markers out of the depth buffer", () => {
    expect(GLOBE_SURFACE_MARKER_MATERIAL).toEqual({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  });

  it("paints every data layer above the night shade", () => {
    // The terminator dims the planet, not the information drawn on it.
    // Anything below this line goes dark on the night side and becomes hard
    // to read at exactly the times it matters most.
    const aboveNight = [
      "surfaceArea",
      "referenceLines",
      "arcs",
      "volumes",
      "markers",
      "hud",
    ] as const;

    for (const slot of aboveNight) {
      expect(GLOBE_LAYER_ORDER[slot]).toBeGreaterThan(
        GLOBE_LAYER_ORDER.nightShade,
      );
      expect(GLOBE_LAYER_ORDER[slot]).toBeGreaterThan(
        GLOBE_LAYER_ORDER.nightLights,
      );
    }
  });

  it("keeps the night shade above the planet surface it dims", () => {
    expect(GLOBE_LAYER_ORDER.nightShade).toBeGreaterThan(
      GLOBE_LAYER_ORDER.base,
    );
    expect(GLOBE_LAYER_ORDER.nightShade).toBeGreaterThan(
      GLOBE_LAYER_ORDER.tileLabels,
    );
    expect(GLOBE_LAYER_ORDER.nightShade).toBeGreaterThan(
      GLOBE_LAYER_ORDER.surfaceTexture,
    );
  });

  it("keeps the depth dome above the tile surface and below overlays", () => {
    expect(GLOBE_DEPTH_DOME_RADIUS).toBeGreaterThan(1.0);
    expect(GLOBE_DEPTH_DOME_RADIUS).toBeLessThan(GLOBE_MIN_OVERLAY_RADIUS);
  });
});
