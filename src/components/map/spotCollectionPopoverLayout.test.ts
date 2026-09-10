import { describe, expect, it } from "vitest";
import {
  computeSpotCollectionPopoverLayout,
  deriveWallVisibleSpotCount,
  EDGE_PADDING,
  SPOT_COLLECTION_POPOVER_CHROME_HEIGHT,
  SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT,
  SPOT_COLLECTION_WALL_ROW_HEIGHT,
} from "./spotCollectionPopoverLayout";

function makeHost(width: number, height: number, left = 0, top = 0) {
  const host = document.createElement("div");
  host.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      x: left,
      y: top,
      toJSON() {},
    }) as DOMRect;
  return host;
}

describe("deriveWallVisibleSpotCount (#879)", () => {
  it("returns all spots when the list budget fits them without a +N row", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT + SPOT_COLLECTION_WALL_ROW_HEIGHT * 3;
    expect(deriveWallVisibleSpotCount(maxHeight, 3)).toBe(3);
  });

  it("reserves space for the +N more row when the collection overflows", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_ROW_HEIGHT * 6 +
      SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;
    expect(deriveWallVisibleSpotCount(maxHeight, 80)).toBe(6);
  });

  it("shrinks the visible row count when maxHeight is tight", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_ROW_HEIGHT * 2 +
      SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;
    expect(deriveWallVisibleSpotCount(maxHeight, 80)).toBe(2);
  });

  it("always shows at least one row when spots exist", () => {
    expect(
      deriveWallVisibleSpotCount(SPOT_COLLECTION_POPOVER_CHROME_HEIGHT + 1, 10),
    ).toBe(1);
  });
});

describe("computeSpotCollectionPopoverLayout (#879)", () => {
  it("falls back to the viewport frame when the portal host rect is degenerate", () => {
    const host = makeHost(8, 8);
    const layout = computeSpotCollectionPopoverLayout(
      { x: 100, y: 300 },
      host,
      undefined,
    );

    expect(layout.frame.position).toBe("fixed");
    expect(layout.frame.width).toBe(window.innerWidth);
    expect(layout.frame.height).toBe(window.innerHeight);
    expect(layout.portalElement).toBeNull();
    expect(layout.maxHeight).toBeGreaterThan(0);
  });

  it("falls back to the viewport frame when boundsHost rect is degenerate", () => {
    const host = makeHost(12, 12, 40, 20);
    const layout = computeSpotCollectionPopoverLayout(
      { x: 100, y: 300 },
      undefined,
      host,
    );

    expect(layout.frame.position).toBe("fixed");
    expect(layout.frame.width).toBe(window.innerWidth);
    expect(layout.screenLeft).toBeGreaterThanOrEqual(EDGE_PADDING);
    expect(layout.portalElement).toBeNull();
  });

  it("uses a usable portal host for absolute placement", () => {
    const host = makeHost(400, 600);
    const layout = computeSpotCollectionPopoverLayout(
      { x: 100, y: 300 },
      host,
      undefined,
    );

    expect(layout.frame.position).toBe("absolute");
    expect(layout.portalElement).toBe(host);
    expect(layout.maxHeight).toBe(505);
  });
});
