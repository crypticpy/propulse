import { describe, expect, it } from "vitest";
import {
  getLunarMarkerDimensions,
  LUNAR_SUBPOINT_COLOR,
} from "./lunarSubpointMarker";

describe("lunar subpoint marker", () => {
  it("uses the documented moon-white legend color", () => {
    expect(LUNAR_SUBPOINT_COLOR).toBe("#d9e8ff");
  });

  it("keeps its apparent size constant as a transformed canvas zooms", () => {
    const normal = getLunarMarkerDimensions(1);
    const zoomed = getLunarMarkerDimensions(4);

    expect(zoomed.radius * 4).toBe(normal.radius);
    expect(zoomed.ringRadius * 4).toBe(normal.ringRadius);
    expect(zoomed.fontSize * 4).toBe(normal.fontSize);
  });

  it("makes the high-visibility marker larger", () => {
    expect(getLunarMarkerDimensions(1, true).radius).toBeGreaterThan(
      getLunarMarkerDimensions(1, false).radius,
    );
  });
});
