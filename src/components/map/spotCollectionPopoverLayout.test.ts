import { describe, expect, it } from "vitest";
import {
  computeSpotCollectionPopoverLayout,
  deriveWallVisibleSpotCount,
  EDGE_PADDING,
  mergeMeasuredRowHeights,
  resolveSpotCollectionPortalElement,
  readRootFontPx,
  readWallListContentHeight,
  resolveWallRowHeights,
  ROOT_FONT_PX_DEFAULT,
  spotRowKey,
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM,
  SPOT_COLLECTION_WALL_ROW_REM,
  SPOT_COLLECTION_WALL_WRAP_REM,
  wallRowHeight,
} from "./spotCollectionPopoverLayout";

/* The budgets are rem; these are their pixel values at the default root font
 * size, which is what the cases below reason in. */
const SPOT_COLLECTION_WALL_ROW_HEIGHT =
  (SPOT_COLLECTION_WALL_ROW_REM + SPOT_COLLECTION_WALL_WRAP_REM) *
  ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT =
  (SPOT_COLLECTION_WALL_DETAIL_ROW_REM + SPOT_COLLECTION_WALL_WRAP_REM) *
  ROOT_FONT_PX_DEFAULT;

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

describe("deriveWallVisibleSpotCount (#879, #1065)", () => {
  it("returns all spots when the measured list body fits them", () => {
    const listBodyHeight = SPOT_COLLECTION_WALL_ROW_HEIGHT * 3;
    expect(deriveWallVisibleSpotCount(listBodyHeight, plainRows(3))).toBe(3);
  });

  it("caps rows to the measured list body when the collection overflows", () => {
    const listBodyHeight = SPOT_COLLECTION_WALL_ROW_HEIGHT * 6;
    expect(deriveWallVisibleSpotCount(listBodyHeight, plainRows(80))).toBe(6);
  });

  it("shrinks the visible row count when the list body is tight", () => {
    const listBodyHeight = SPOT_COLLECTION_WALL_ROW_HEIGHT * 2;
    expect(deriveWallVisibleSpotCount(listBodyHeight, plainRows(80))).toBe(2);
  });

  it("always shows at least one row when spots exist", () => {
    expect(deriveWallVisibleSpotCount(1, plainRows(10))).toBe(1);
  });

  it("returns zero when there are no spots", () => {
    expect(deriveWallVisibleSpotCount(1000, [])).toBe(0);
  });

  it("shows every row while the list body is not measured yet", () => {
    expect(deriveWallVisibleSpotCount(0, plainRows(10))).toBe(10);
  });

  it("budgets grid/comment rows at their taller height (#879 review)", () => {
    const listBodyHeight = SPOT_COLLECTION_WALL_ROW_HEIGHT * 6;
    const visible = deriveWallVisibleSpotCount(listBodyHeight, detailRows(80));
    expect(visible).toBe(4);
    expect(visible * SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT).toBeLessThanOrEqual(
      listBodyHeight,
    );
  });

  it("measures mixed rows in render order, not by an average", () => {
    const listBodyHeight =
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT * 2 +
      SPOT_COLLECTION_WALL_ROW_HEIGHT;
    const rows = [
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
      SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT,
      SPOT_COLLECTION_WALL_ROW_HEIGHT,
    ];
    expect(deriveWallVisibleSpotCount(listBodyHeight, rows)).toBe(3);
  });
});

describe("wallRowHeight estimate (#879 review)", () => {
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

describe("the frame is locked to the portal (#879 review round 4)", () => {
  it("keeps the viewport frame when the host becomes usable after the lock", () => {
    const host = makeHost(8, 8);
    const locked = resolveSpotCollectionPortalElement(host);
    expect(locked).toBeNull();

    host.getBoundingClientRect = makeHost(400, 600, 120, 80)
      .getBoundingClientRect;
    const layout = computeSpotCollectionPopoverLayout(
      { x: 100, y: 300 },
      locked,
      undefined,
      1,
    );

    expect(layout.frame.position).toBe("fixed");
    expect(layout.frame.width).toBe(window.innerWidth);
    expect(layout.portalElement).toBeNull();
  });

  it("keeps host-local coordinates when a locked host degenerates", () => {
    const host = makeHost(400, 600, 120, 80);
    const locked = resolveSpotCollectionPortalElement(host);
    expect(locked).toBe(host);

    host.getBoundingClientRect = makeHost(8, 8).getBoundingClientRect;
    const layout = computeSpotCollectionPopoverLayout(
      { x: 100, y: 300 },
      locked,
      undefined,
      1,
    );

    expect(layout.frame.position).toBe("absolute");
    expect(layout.screenLeft).toBe(layout.adjustedPosition.x);
    expect(layout.portalElement).toBe(host);
  });
});

describe("wall row budgets follow the root font size (#879 review round 3)", () => {
  const XL_ROOT_PX = 22;

  it("derives fewer rows at the xl text scale than at the default root", () => {
    const listBodyHeight = 320;
    const spots = Array.from({ length: 40 }, () => ({ dxGrid: "DM79" }));

    const atDefault = deriveWallVisibleSpotCount(
      listBodyHeight,
      spots.map((spot) => wallRowHeight(spot, ROOT_FONT_PX_DEFAULT)),
    );
    const atXl = deriveWallVisibleSpotCount(
      listBodyHeight,
      spots.map((spot) => wallRowHeight(spot, XL_ROOT_PX)),
    );

    expect(atDefault).toBeGreaterThan(atXl);
  });

  it("never accumulates past the measured list body at either root size", () => {
    const listBodyHeight = 320;
    for (const rootPx of [ROOT_FONT_PX_DEFAULT, XL_ROOT_PX]) {
      const rowHeights = Array.from({ length: 40 }, () =>
        wallRowHeight({ dxGrid: "DM79" }, rootPx),
      );
      const visible = deriveWallVisibleSpotCount(listBodyHeight, rowHeights);
      const used = visible * wallRowHeight({ dxGrid: "DM79" }, rootPx);
      expect(used).toBeLessThanOrEqual(listBodyHeight);
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

describe("measured row heights beat the estimate (#879 review round 4)", () => {
  const spots = Array.from({ length: 40 }, (_unused, index) => ({
    id: `spot-${index}`,
    dxGrid: "DM79",
  }));
  const listBodyHeight = 320;

  const measureRows = (
    rows: readonly { id?: string | null }[],
    count: number,
    height: number,
  ): Record<string, number> =>
    Object.fromEntries(
      rows
        .slice(0, count)
        .map((spot, index) => [spotRowKey(spot, index), height]),
    );

  it("reduces the count when the rendered rows are taller than the estimate", () => {
    const estimated = deriveWallVisibleSpotCount(
      listBodyHeight,
      resolveWallRowHeights(spots, {}, ROOT_FONT_PX_DEFAULT),
    );
    const taller = wallRowHeight(spots[0], ROOT_FONT_PX_DEFAULT) + 24;
    const measured = measureRows(spots, estimated, taller);
    const withMeasurements = deriveWallVisibleSpotCount(
      listBodyHeight,
      resolveWallRowHeights(spots, measured, ROOT_FONT_PX_DEFAULT),
    );

    expect(withMeasurements).toBeLessThan(estimated);
  });

  it("never accumulates past the list body with measured heights", () => {
    const taller = 96;
    let heights = resolveWallRowHeights(spots, {}, ROOT_FONT_PX_DEFAULT);
    let visible = deriveWallVisibleSpotCount(listBodyHeight, heights);
    for (let pass = 0; pass < 2; pass += 1) {
      const measured = measureRows(spots, visible, taller);
      heights = resolveWallRowHeights(spots, measured, ROOT_FONT_PX_DEFAULT);
      visible = deriveWallVisibleSpotCount(listBodyHeight, heights);
    }

    expect(visible * taller).toBeLessThanOrEqual(listBodyHeight);
  });

  it("gives an unmeasured row the tallest measured height of its own kind", () => {
    const mixed = [
      { id: "a", dxGrid: "DM79" },
      { id: "b" },
      { id: "c", dxGrid: "DM79" },
      { id: "d" },
    ];
    const heights = resolveWallRowHeights(
      mixed,
      { a: 90, b: 60 },
      ROOT_FONT_PX_DEFAULT,
    );

    expect(heights).toEqual([90, 60, 90, 60]);
  });

  it("falls back to the estimate only while nothing is measured", () => {
    expect(resolveWallRowHeights(spots, {}, ROOT_FONT_PX_DEFAULT)[0]).toBe(
      wallRowHeight(spots[0], ROOT_FONT_PX_DEFAULT),
    );
    expect(
      resolveWallRowHeights(
        spots,
        { "spot-0": 0, "spot-1": 0 },
        ROOT_FONT_PX_DEFAULT,
      )[0],
    ).toBe(wallRowHeight(spots[0], ROOT_FONT_PX_DEFAULT));
  });
});

describe("retained measurements converge (#879 review round 5)", () => {
  const spots = Array.from({ length: 6 }, (_unused, index) => ({
    id: `spot-${index}`,
  }));
  const SHORT = 60;
  const TALL = 120;
  const rowHeight = (index: number) => (index === 5 ? TALL : SHORT);
  const listBodyHeight = SHORT * 6;

  const pass = (
    retained: Record<string, number>,
    visible: number,
  ): { retained: Record<string, number>; visible: number } => {
    const measured: Record<string, number> = {};
    for (let index = 0; index < visible; index += 1) {
      measured[spotRowKey(spots[index], index)] = rowHeight(index);
    }
    const next = mergeMeasuredRowHeights(
      retained,
      measured,
      new Set(spots.map((spot, index) => spotRowKey(spot, index))),
    );
    return {
      retained: next,
      visible: deriveWallVisibleSpotCount(
        listBodyHeight,
        resolveWallRowHeights(spots, next, ROOT_FONT_PX_DEFAULT),
      ),
    };
  };

  it("settles in at most two effect passes and never oscillates", () => {
    let retained: Record<string, number> = {};
    let visible = deriveWallVisibleSpotCount(
      listBodyHeight,
      resolveWallRowHeights(spots, retained, ROOT_FONT_PX_DEFAULT),
    );

    const counts: number[] = [];
    let passes = 0;
    let previousRetained = retained;
    for (let index = 0; index < 8; index += 1) {
      const result = pass(retained, visible);
      if (result.retained === previousRetained && result.visible === visible) {
        break;
      }
      passes += 1;
      previousRetained = retained = result.retained;
      visible = result.visible;
      counts.push(visible);
    }

    expect(passes).toBeLessThanOrEqual(2);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
    }
    expect(visible).toBe(5);
  });

  it("keeps the tall row's height after the rendered count shrinks", () => {
    const first = pass({}, 6);
    expect(first.visible).toBeLessThan(6);

    const second = pass(first.retained, first.visible);
    expect(second.retained[spotRowKey(spots[5], 5)]).toBe(TALL);
    expect(second.visible).toBe(first.visible);
  });

  it("drops only the measurements whose spot left the collection", () => {
    const retained = { "spot-0": SHORT, "spot-5": TALL, stale: 999 };
    const merged = mergeMeasuredRowHeights(
      retained,
      {},
      new Set(spots.map((spot, index) => spotRowKey(spot, index))),
    );

    expect(merged).toEqual({ "spot-0": SHORT, "spot-5": TALL });
  });

  it("returns the same record when nothing moved, so setState is a no-op", () => {
    const retained = { "spot-0": SHORT };
    const liveKeys = new Set(spots.map((spot, index) => spotRowKey(spot, index)));

    expect(mergeMeasuredRowHeights(retained, { "spot-0": SHORT }, liveKeys)).toBe(
      retained,
    );
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
      resolveSpotCollectionPortalElement(host),
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


describe("wall list content budget (#1065)", () => {
  it("reveals all rows when removing the overflow affordance makes them fit", () => {
    expect(deriveWallVisibleSpotCount(140, [50, 50, 50], 30)).toBe(3);
    expect(deriveWallVisibleSpotCount(170, [50, 50, 50], 0)).toBe(3);
  });

  it("keeps the affordance space reserved while some rows still cannot fit", () => {
    expect(deriveWallVisibleSpotCount(110, [50, 50, 50], 30)).toBe(2);
  });

  it("does not count list padding as space for an additional row", () => {
    const list = document.createElement("div");
    list.style.padding = "4px";
    document.body.appendChild(list);
    Object.defineProperty(list, "clientHeight", { value: 100 });
    try {
      expect(readWallListContentHeight(list)).toBe(92);
      expect(deriveWallVisibleSpotCount(readWallListContentHeight(list), [50, 50])).toBe(1);
    } finally {
      list.remove();
    }
  });
});
