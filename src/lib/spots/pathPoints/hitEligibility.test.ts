import { describe, expect, it } from "vitest";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "@/lib/map/globeOcclusion";
import {
  PATH_POINT_HIT_MIN_OPACITY,
  pathPointAcceptsPointer,
} from "./hitEligibility";

describe("pathPointAcceptsPointer", () => {
  it("rejects far-side and fully hidden points", () => {
    expect(pathPointAcceptsPointer(0)).toBe(false);
    expect(pathPointAcceptsPointer(PATH_POINT_HIT_MIN_OPACITY - 0.001)).toBe(
      false,
    );
    expect(pathPointAcceptsPointer(PATH_POINT_HIT_MIN_OPACITY)).toBe(true);
    expect(pathPointAcceptsPointer(1)).toBe(true);
  });

  it("treats the far side of the globe as ineligible", () => {
    const frame = createGlobeOcclusionFrame({ x: 3, y: 0, z: 0 }, 0);
    expect(frame).not.toBeNull();
    const near = getGlobeOcclusionOpacity(0, 0, frame!);
    const far = getGlobeOcclusionOpacity(0, 180, frame!);
    expect(pathPointAcceptsPointer(near)).toBe(true);
    expect(pathPointAcceptsPointer(far)).toBe(false);
  });
});
