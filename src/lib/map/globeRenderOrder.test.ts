import { describe, expect, it } from "vitest";
import {
  GLOBE_DEPTH_DOME_RADIUS,
  GLOBE_DOM_LAYER_BANDS,
  GLOBE_DOM_LAYER_ORDER,
  GLOBE_LAYER_ORDER,
  GLOBE_LAYER_SLOTS,
  MAP_PAGE_CHROME_TIERS,
  MAP_PAGE_CHROME_Z,
  GLOBE_MIN_OVERLAY_RADIUS,
  GLOBE_OVERLAY_MATERIAL,
  GLOBE_SURFACE_MARKER_MATERIAL,
  getGlobeLayerSlotForRenderOrder,
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

  it("classifies fractional component orders under their owning slot", () => {
    expect(
      getGlobeLayerSlotForRenderOrder(GLOBE_LAYER_ORDER.markers + 0.25),
    ).toBe("markers");
    expect(getGlobeLayerSlotForRenderOrder(GLOBE_LAYER_ORDER.hud)).toBe("hud");
    expect(
      getGlobeLayerSlotForRenderOrder(GLOBE_LAYER_ORDER.nightShade - 0.1),
    ).toBe("nightShade");
  });

  it("orders the map-host chrome tiers, lowest first (#930)", () => {
    // legend < mapOverlayPortal < interactiveChrome < activityDrawer.
    // The middle pair is the whole point: a detail popup covers a legend,
    // never a control someone is about to click.
    const values = MAP_PAGE_CHROME_TIERS.map((t) => MAP_PAGE_CHROME_Z[t]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    expect([...MAP_PAGE_CHROME_TIERS].sort()).toEqual(
      Object.keys(MAP_PAGE_CHROME_Z).sort(),
    );
  });

  it("keeps the overlay portal above the legend and below every control (#930)", () => {
    expect(MAP_PAGE_CHROME_Z.mapOverlayPortal).toBeGreaterThan(
      MAP_PAGE_CHROME_Z.legend,
    );
    expect(MAP_PAGE_CHROME_Z.mapOverlayPortal).toBeLessThan(
      MAP_PAGE_CHROME_Z.interactiveChrome,
    );
  });

  it("keeps the escaped portal below the nearby-activity drawer (#930)", () => {
    // The drawer covers nearly the whole map: while it is open it must
    // paint over the path inspector, the cluster popover and every other
    // child of the overlay portal.
    expect(MAP_PAGE_CHROME_Z.activityDrawer).toBeGreaterThan(
      MAP_PAGE_CHROME_Z.mapOverlayPortal,
    );
  });

  it("clears every in-scene DOM band structurally, not numerically (#930)", () => {
    // The portal no longer needs a huge value: drei's <Html> bands live
    // inside the <Canvas> wrapper's own `isolate` at z-0, so any positive
    // level clears all of them. The wrapper's isolation is asserted in
    // globeDomZBands.test.ts; here we only pin that the portal is positive.
    expect(MAP_PAGE_CHROME_Z.mapOverlayPortal).toBeGreaterThan(0);
    expect(GLOBE_DOM_LAYER_ORDER).not.toHaveProperty("mapOverlayPortal");
    expect(GLOBE_DOM_LAYER_ORDER.pinLabel[1]).toBeGreaterThan(
      GLOBE_DOM_LAYER_ORDER.passiveSpotLabel[0],
    );
  });

  it("covers every DOM band exactly once in the paint sequence", () => {
    expect([...GLOBE_DOM_LAYER_BANDS].sort()).toEqual(
      Object.keys(GLOBE_DOM_LAYER_ORDER).sort(),
    );
    expect(new Set(GLOBE_DOM_LAYER_BANDS).size).toBe(
      GLOBE_DOM_LAYER_BANDS.length,
    );
  });

  it("keeps every DOM band non-overlapping and in ascending paint order", () => {
    // Each range band's low bound must clear the previous band's high bound.
    let previousHigh = -Infinity;
    for (const band of GLOBE_DOM_LAYER_BANDS) {
      const value = GLOBE_DOM_LAYER_ORDER[band];
      if (Array.isArray(value)) {
        const [high, low] = value;
        expect(high).toBeGreaterThan(low);
        expect(low).toBeGreaterThan(previousHigh);
        previousHigh = high;
      } else {
        expect(value).toBeGreaterThan(previousHigh);
        previousHigh = value;
      }
    }
  });
});
