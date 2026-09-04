import { describe, expect, it } from "vitest";
import {
  placeAnchoredOverlay,
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
} from "./anchoredOverlay";

describe("placeAnchoredOverlay", () => {
  it("grows a hover preview above its tag when space is available", () => {
    expect(
      placeAnchoredOverlay(
        { x: 400, y: 300, width: 80, height: 22 },
        { width: 260, height: 120 },
        { width: 1000, height: 700 },
      ),
    ).toEqual({ x: 310, y: 168, placement: "above" });
  });

  it("flips below a tag near the top and clamps to the left edge", () => {
    expect(
      placeAnchoredOverlay(
        { x: 5, y: 4, width: 40, height: 20 },
        { width: 260, height: 120 },
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 10, y: 36, placement: "below" });
  });

  it("places deliberate cards to the left when the right side is constrained", () => {
    const position = placeAnchoredOverlay(
      { x: 900, y: 300, width: 30, height: 20 },
      { width: 360, height: 500 },
      { width: 1000, height: 700 },
      { axis: "horizontal", gap: 14 },
    );
    expect(position.placement).toBe("left");
    expect(position.x).toBe(526);
    expect(position.y).toBe(60);
  });
});

describe("placeAnchoredOverlayInFrame", () => {
  it("converts viewport anchors into a HamClock globe portal instead of the window", () => {
    const globe = {
      left: 400,
      top: 80,
      width: 800,
      height: 640,
    };
    const position = placeAnchoredOverlayInFrame(
      { x: 900, y: 360, width: 80, height: 22 },
      { width: 260, height: 120 },
      globe,
      { gap: 10, padding: 10 },
    );
    expect(position.placement).toBe("above");
    expect(position.x).toBe(410);
    expect(position.y).toBe(150);
    expect(position.x + 260).toBeLessThanOrEqual(globe.width - 10);
  });

  it("clamps an east-limb hover to the globe's right edge instead of the window", () => {
    const globe = {
      left: 400,
      top: 80,
      width: 800,
      height: 640,
    };
    const position = placeAnchoredOverlayInFrame(
      { x: 1180, y: 300, width: 40, height: 20 },
      { width: 260, height: 120 },
      globe,
      { gap: 10, padding: 10 },
    );
    expect(position.x).toBe(530);
    expect(position.x + 260).toBeLessThanOrEqual(globe.width - 10);
  });

  it("treats document.body as a viewport-fixed frame", () => {
    const frame = resolveOverlayFrame(document.body);
    expect(frame.position).toBe("fixed");
    expect(frame.left).toBe(0);
    expect(frame.top).toBe(0);
  });
});
