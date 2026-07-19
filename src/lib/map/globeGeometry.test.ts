import { describe, expect, it } from "vitest";
import { getUnitSphereScale } from "@/lib/map/globeGeometry";

describe("getUnitSphereScale", () => {
  it("normalizes both equatorial and polar radii", () => {
    const equatorialRadius = 6_378_137;
    const polarRadius = 6_356_752.314245;
    const scale = getUnitSphereScale(equatorialRadius, polarRadius);

    expect(equatorialRadius * scale[0]).toBeCloseTo(1, 12);
    expect(equatorialRadius * scale[1]).toBeCloseTo(1, 12);
    expect(polarRadius * scale[2]).toBeCloseTo(1, 12);
    expect(scale[2]).toBeGreaterThan(scale[0]);
  });
});
