import { describe, expect, it } from "vitest";
import { screenPxToCanvas } from "./projection";
import { flatMapDxCallsignPillWidthRatio } from "./flatMapSpotCallsignPillSizing";

describe("screenPxToCanvas", () => {
  it("floors at 1 screen px before converting back at high zoom", () => {
    expect(screenPxToCanvas(10, 32)).toBeCloseTo(10 / 32, 6);
    expect(screenPxToCanvas(0.25, 32)).toBeCloseTo(1 / 32, 6);
  });

  it("leaves sub-unity zoom undamped on the flat map", () => {
    expect(screenPxToCanvas(8, 0.5)).toBe(8);
  });
});

describe("flatMapDxCallsignPillWidthRatio", () => {
  it("binding: pill fillRect width / text width stays within the zoom-1 ratio at zoom 32", () => {
    const textWidthAtZoom1 = 42;
    const textWidthAtZoom32 = textWidthAtZoom1 / 32;
    const zoom1Ratio = flatMapDxCallsignPillWidthRatio(textWidthAtZoom1, 1);
    const zoom32Ratio = flatMapDxCallsignPillWidthRatio(
      textWidthAtZoom32,
      32,
    );
    expect(zoom32Ratio).toBeCloseTo(zoom1Ratio, 6);
  });
});
