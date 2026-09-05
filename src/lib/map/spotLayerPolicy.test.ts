import { describe, expect, it } from "vitest";
import { getSpotLayerPolicy } from "./spotLayerPolicy";

describe("getSpotLayerPolicy", () => {
  it.each([
    ["spots", true, false, false, true, true],
    ["traces", false, true, false, true, false],
    ["grid activity", false, false, true, false, false],
    ["none", false, false, false, false, false],
  ])(
    "%s keeps path endpoints and label hit targets in sync",
    (_name, spots, spotTraces, gridActivity, endpoints, labels) => {
      const policy = getSpotLayerPolicy({ spots, spotTraces, gridActivity });

      expect(policy.pathsVisible).toBe(endpoints);
      expect(policy.endpointsInteractive).toBe(endpoints);
      expect(policy.labelsInteractive).toBe(labels);
      expect(policy.gridCollectionsInteractive).toBe(gridActivity);
      expect(policy.selectedTargetVisible).toBe(true);
    },
  );

  it("hides every other path overlay while the targeted path is isolated", () => {
    const policy = getSpotLayerPolicy(
      { spots: true, spotTraces: true, gridActivity: true },
      { isolateTargetPath: true, hasTarget: true },
    );

    expect(policy.pathsVisible).toBe(false);
    expect(policy.endpointsInteractive).toBe(false);
    expect(policy.labelsInteractive).toBe(false);
    expect(policy.gridCollectionsInteractive).toBe(false);
    expect(policy.selectedTargetVisible).toBe(false);
  });
});
