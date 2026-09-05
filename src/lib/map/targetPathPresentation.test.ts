import { describe, expect, it } from "vitest";
import {
  cyclePathMode,
  hopQualityColor,
  pathEmphasis,
  pathModesToRender,
  resolveTraceFrequencyMHz,
  shouldHideOtherPaths,
} from "./targetPathPresentation";

describe("targetPathPresentation", () => {
  it("renders one or both legs from pathMode", () => {
    expect(pathModesToRender("short")).toEqual(["short"]);
    expect(pathModesToRender("long")).toEqual(["long"]);
    expect(pathModesToRender("both")).toEqual(["short", "long"]);
  });

  it("cycles short → long → both → short", () => {
    expect(cyclePathMode("short")).toBe("long");
    expect(cyclePathMode("long")).toBe("both");
    expect(cyclePathMode("both")).toBe("short");
  });

  it("only hides other traces when a target is isolated", () => {
    expect(shouldHideOtherPaths(true, true)).toBe(true);
    expect(shouldHideOtherPaths(true, false)).toBe(false);
    expect(shouldHideOtherPaths(false, true)).toBe(false);
  });

  it("treats the long leg as secondary when both paths are shown", () => {
    expect(pathEmphasis("both", "short")).toBe("primary");
    expect(pathEmphasis("both", "long")).toBe("secondary");
    expect(pathEmphasis("long", "long")).toBe("primary");
  });

  it("prefers the selected spot frequency when the target matches", () => {
    expect(resolveTraceFrequencyMHz(0, 21074, true)).toBeCloseTo(21.074);
    expect(resolveTraceFrequencyMHz(14_074_000, 21074, false)).toBeCloseTo(
      14.074,
    );
    expect(resolveTraceFrequencyMHz(0, null, false)).toBeCloseTo(14.074);
  });

  it("maps hop quality to the same green/yellow/orange/red ramp", () => {
    expect(hopQualityColor(90)).toBe("#22c55e");
    expect(hopQualityColor(65)).toBe("#eab308");
    expect(hopQualityColor(40)).toBe("#f97316");
    expect(hopQualityColor(10)).toBe("#ef4444");
  });
});
