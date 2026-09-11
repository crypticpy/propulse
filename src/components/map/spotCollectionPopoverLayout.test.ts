import { describe, expect, it } from "vitest";
import {
  computeSpotCollectionPopoverLayout,
  deriveWallVisibleSpotCount,
  EDGE_PADDING,
  resolveSpotCollectionPortalElement,
  readRootFontPx,
  ROOT_FONT_PX_DEFAULT,
  SPOT_COLLECTION_POPOVER_CHROME_REM,
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM,
  SPOT_COLLECTION_WALL_MORE_ROW_REM,
  SPOT_COLLECTION_WALL_ROW_REM,
  wallRowHeight,
} from "./spotCollectionPopoverLayout";

/* The budgets are rem; these are their pixel values at the default root font
 * size, which is what the cases below reason in. */
const SPOT_COLLECTION_POPOVER_CHROME_HEIGHT =
  SPOT_COLLECTION_POPOVER_CHROME_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_ROW_HEIGHT =
  SPOT_COLLECTION_WALL_ROW_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT =
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT =
  SPOT_COLLECTION_WALL_MORE_ROW_REM * ROOT_FONT_PX_DEFAULT;

/** `count` plain two-line rows. */
function plainRows(count: number): number[] {
  return Array.from({ length: count }, () => SPOT_COLLECTION_WALL_ROW_HEIGHT);
}

/** `count` rows carrying a grid/comment third line. */
function detailRows(count: number): number[] {
  return Array.from(
    { length: count },
    () => SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
  );
}

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
    expect(deriveWallVisibleSpotCount(maxHeight, plainRows(3))).toBe(3);
  });

  it("reserves space for the +N more row when the collection overflows", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_ROW_HEIGHT * 6 +
      SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;
    expect(deriveWallVisibleSpotCount(maxHeight, plainRows(80))).toBe(6);
  });

  it("shrinks the visible row count when maxHeight is tight", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_ROW_HEIGHT * 2 +
      SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;
    expect(deriveWallVisibleSpotCount(maxHeight, plainRows(80))).toBe(2);
  });

  it("always shows at least one row when spots exist", () => {
    expect(
      deriveWallVisibleSpotCount(
        SPOT_COLLECTION_POPOVER_CHROME_HEIGHT + 1,
        plainRows(10),
      ),
    ).toBe(1);
  });

  it("returns zero when there are no spots", () => {
    expect(deriveWallVisibleSpotCount(1000, [])).toBe(0);
  });

  it("budgets grid/comment rows at their taller height (#879 review)", () => {
    // A budget that fits six two-line rows plus the +N row fits only four of
    // the three-line variant. Counting rows instead of measuring them let the
    // clipped body swallow the difference.
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_ROW_HEIGHT * 6 +
      SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT;
    const visible = deriveWallVisibleSpotCount(maxHeight, detailRows(80));
    expect(visible).toBe(4);
    expect(
      visible * SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT +
        SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT,
    ).toBeLessThanOrEqual(maxHeight - SPOT_COLLECTION_POPOVER_CHROME_HEIGHT);
  });

  it("measures mixed rows in render order, not by an average", () => {
    const maxHeight =
      SPOT_COLLECTION_POPOVER_CHROME_HEIGHT +
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT * 2 +
      SPOT_COLLECTION_WALL_ROW_HEIGHT;
    const rows = [
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
      SPOT_COLLECTION_WALL_ROW_HEIGHT,
    ];
    expect(deriveWallVisibleSpotCount(maxHeight, rows)).toBe(3);
  });
});

describe("wallRowHeight (#879 review)", () => {
  it("reserves the third line for a grid or a comment", () => {
    expect(wallRowHeight({ dxGrid: "DM79" })).toBe(
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
    );
    expect(wallRowHeight({ comment: "POTA K-1234" })).toBe(
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
    );
    expect(wallRowHeight({})).toBe(SPOT_COLLECTION_WALL_ROW_HEIGHT);
    expect(wallRowHeight({ dxGrid: "", comment: "" })).toBe(
      SPOT_COLLECTION_WALL_ROW_HEIGHT,
    );
  });
});

describe("wall row budgets follow the root font size (#879 review round 3)", () => {
  const XL_ROOT_PX = 22; // :root[data-text-scale="xl"] in src/styles/globals.css

  it("derives fewer rows at the xl text scale than at the default root", () => {
    // One fixed popover budget, two text scales.
    const maxHeight = 520;
    const spots = Array.from({ length: 40 }, () => ({ dxGrid: "DM79" }));

    const atDefault = deriveWallVisibleSpotCount(
      maxHeight,
      spots.map((spot) => wallRowHeight(spot, ROOT_FONT_PX_DEFAULT)),
      ROOT_FONT_PX_DEFAULT,
    );
    const atXl = deriveWallVisibleSpotCount(
      maxHeight,
      spots.map((spot) => wallRowHeight(spot, XL_ROOT_PX)),
      XL_ROOT_PX,
    );

    expect(atDefault).toBeGreaterThan(atXl);
  });

  it("never accumulates past the list budget at either root size", () => {
    const maxHeight = 520;
    for (const rootPx of [ROOT_FONT_PX_DEFAULT, XL_ROOT_PX]) {
      const rowHeights = Array.from({ length: 40 }, () =>
        wallRowHeight({ dxGrid: "DM79" }, rootPx),
      );
      const visible = deriveWallVisibleSpotCount(
        maxHeight,
        rowHeights,
        rootPx,
      );
      const used =
        visible * wallRowHeight({ dxGrid: "DM79" }, rootPx) +
        SPOT_COLLECTION_WALL_MORE_ROW_REM * rootPx;
      expect(used).toBeLessThanOrEqual(
        maxHeight - SPOT_COLLECTION_POPOVER_CHROME_REM * rootPx,
      );
    }
  });

  it("reads the live root font size", () => {
    expect(readRootFontPx()).toBe(ROOT_FONT_PX_DEFAULT);
    document.documentElement.style.fontSize = "22px";
    try {
      expect(readRootFontPx()).toBe(22);
    } finally {
      document.documentElement.style.fontSize = "";
    }
  });
});

describe("resolveSpotCollectionPortalElement (#879 review)", () => {
  it("returns the host only when its rect is usable", () => {
    expect(resolveSpotCollectionPortalElement(makeHost(400, 600))).toBeTruthy();
    expect(resolveSpotCollectionPortalElement(makeHost(8, 8))).toBeNull();
    expect(resolveSpotCollectionPortalElement(document.body)).toBeNull();
    expect(resolveSpotCollectionPortalElement(null)).toBeNull();
    expect(resolveSpotCollectionPortalElement(undefined)).toBeNull();
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
