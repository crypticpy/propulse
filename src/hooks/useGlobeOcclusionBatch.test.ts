import { describe, expect, it } from "vitest";
import { shouldPublishGlobeOcclusionOpacity } from "./useGlobeOcclusionBatch";

describe("shouldPublishGlobeOcclusionOpacity", () => {
  it("accumulates gradual movement against the last published opacity", () => {
    const published = 1;

    expect(shouldPublishGlobeOcclusionOpacity(0.96, published)).toBe(false);
    expect(shouldPublishGlobeOcclusionOpacity(0.92, published)).toBe(true);
  });

  it("publishes the first value for a position", () => {
    expect(shouldPublishGlobeOcclusionOpacity(0.4, undefined)).toBe(true);
  });

  it("always publishes a crossing of the interaction cutoff", () => {
    expect(shouldPublishGlobeOcclusionOpacity(0.049, 0.09)).toBe(true);
    expect(shouldPublishGlobeOcclusionOpacity(0.051, 0.02)).toBe(true);
  });
});
