import { describe, expect, it } from "vitest";
import {
  GLOBE_LAYER_ORDER,
  GLOBE_LAYER_SLOTS,
  GLOBE_OVERLAY_MATERIAL,
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

  it("disables depth test and write for transparent overlays", () => {
    expect(GLOBE_OVERLAY_MATERIAL).toEqual({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  });
});
