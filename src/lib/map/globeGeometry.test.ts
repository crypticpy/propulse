import { describe, expect, it } from "vitest";
import { getUnitGlobeProjection } from "@/lib/map/globeGeometry";

describe("getUnitGlobeProjection", () => {
  it("uses a spherical surface and a uniform unit transform", () => {
    const radius = 6_378_137;
    const projection = getUnitGlobeProjection(radius);

    expect(projection.ellipsoidRadii).toEqual([radius, radius, radius]);
    expect(radius * projection.scale[0]).toBeCloseTo(1, 12);
    expect(projection.scale[1]).toBe(projection.scale[0]);
    expect(projection.scale[2]).toBe(projection.scale[0]);
  });

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects an invalid radius of %s",
    (radius) => {
      expect(() => getUnitGlobeProjection(radius)).toThrow(RangeError);
    },
  );
});
