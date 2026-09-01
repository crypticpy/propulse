import { describe, expect, it } from "vitest";
import { hasValidSpotCoordinates } from "./useSpotFocus";

describe("hasValidSpotCoordinates", () => {
  it("accepts the geographic boundaries and zero coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: 0, dxLon: 0 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: 90, dxLon: -180 })).toBe(true);
    expect(hasValidSpotCoordinates({ dxLat: -90, dxLon: 180 })).toBe(true);
  });

  it("rejects missing, non-finite, and out-of-range coordinates", () => {
    expect(hasValidSpotCoordinates({ dxLat: undefined, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: Number.NaN })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 120, dxLon: 0 })).toBe(false);
    expect(hasValidSpotCoordinates({ dxLat: 40, dxLon: 240 })).toBe(false);
  });
});
