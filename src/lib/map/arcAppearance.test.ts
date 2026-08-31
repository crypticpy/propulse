import { describe, expect, it } from "vitest";
import { getArcOpacity } from "./arcAppearance";

describe("getArcOpacity", () => {
  it("keeps age-faded arcs legible without overriding filter de-emphasis", () => {
    expect(getArcOpacity(0.4, true, 1)).toBeCloseTo(0.55);
    expect(getArcOpacity(1, true, 0.09)).toBeCloseTo(0.09);
  });

  it("still applies profile filtering when age visualization is disabled", () => {
    expect(getArcOpacity(0.4, false, 0.25)).toBeCloseTo(0.25);
  });
});
