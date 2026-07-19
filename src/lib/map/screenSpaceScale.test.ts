import { describe, expect, it } from "vitest";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";

describe("getScreenSpaceScale", () => {
  it("keeps overview markers at their authored size", () => {
    expect(getScreenSpaceScale(1.5)).toBe(1);
    expect(getScreenSpaceScale(3)).toBe(1);
  });

  it("shrinks markers in proportion to close camera distance", () => {
    expect(getScreenSpaceScale(0.15)).toBeCloseTo(0.1);
    expect(getScreenSpaceScale(0.0015)).toBeCloseTo(0.001);
  });

  it("keeps an elevated trace head bounded at street-level distance", () => {
    expect(getScreenSpaceScale(0.008)).toBeCloseTo(0.005333, 6);
  });
});
