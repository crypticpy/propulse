import { describe, expect, it } from "vitest";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "./globeOcclusion";

describe("globe occlusion", () => {
  it("keeps front- and far-side behavior unchanged when tilt is zero", () => {
    const frame = createGlobeOcclusionFrame({ x: 3, y: 0, z: 0 }, 0);
    expect(frame).not.toBeNull();
    expect(getGlobeOcclusionOpacity(0, 0, frame!)).toBe(1);
    expect(getGlobeOcclusionOpacity(0, 180, frame!)).toBe(0);
  });

  it("evaluates markers against the world-space globe after parent tilt", () => {
    // Geographic north is +Y in globe-local space. A +90 degree parent
    // rotation moves it to -X in world space, where this camera is located.
    const tiltedFrame = createGlobeOcclusionFrame(
      { x: -3, y: 0, z: 0 },
      90,
    );
    const unrotatedFrame = createGlobeOcclusionFrame(
      { x: -3, y: 0, z: 0 },
      0,
    );

    expect(tiltedFrame).not.toBeNull();
    expect(unrotatedFrame).not.toBeNull();
    expect(getGlobeOcclusionOpacity(90, 0, tiltedFrame!)).toBe(1);
    expect(getGlobeOcclusionOpacity(90, 0, unrotatedFrame!)).toBe(0);
  });

  it("rejects an invalid camera at the globe origin", () => {
    expect(createGlobeOcclusionFrame({ x: 0, y: 0, z: 0 }, 23.5)).toBeNull();
  });
});
