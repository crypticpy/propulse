import { describe, expect, it } from "vitest";
import {
  computeSpotCollectionPopoverLayout,
  deriveWallVisibleSpotCount,
  EDGE_PADDING,
  mergeMeasuredRowHeights,
  resolveSpotCollectionPortalElement,
  readRootFontPx,
  resolveWallRowHeights,
  ROOT_FONT_PX_DEFAULT,
  spotRowKey,
  SPOT_COLLECTION_POPOVER_CHROME_REM,
  SPOT_COLLECTION_WALL_DETAIL_ROW_REM,
  SPOT_COLLECTION_WALL_MORE_ROW_REM,
  SPOT_COLLECTION_WALL_ROW_REM,
  SPOT_COLLECTION_WALL_WRAP_REM,
  wallRowHeight,
} from "./spotCollectionPopoverLayout";

/* The budgets are rem; these are their pixel values at the default root font
 * size, which is what the cases below reason in. */
const SPOT_COLLECTION_POPOVER_CHROME_HEIGHT =
  SPOT_COLLECTION_POPOVER_CHROME_REM * ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_ROW_HEIGHT =
  (SPOT_COLLECTION_WALL_ROW_REM + SPOT_COLLECTION_WALL_WRAP_REM) *
  ROOT_FONT_PX_DEFAULT;
const SPOT_COLLECTION_WALL_DETAIL_ROW_HEIGHT =
  (SPOT_COLLECTION_WALL_DETAIL_ROW_REM + SPOT_COLLECTION_WALL_WRAP_REM) *
  ROOT_FONT_PX_DEFAULT;
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
    // Session opened while the host was unusable: the portal is `body`, so
    // the frame must stay fixed/viewport for the whole session even though
    // the host now measures fine. Recomputing from the host would place the
    // panel in host-local coordinates while its children hang off `body`.
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

describe("measured row heights beat the estimate (#879 review round 4)", () => {
  const spots = Array.from({ length: 40 }, (_unused, index) => ({
    id: `spot-${index}`,
    dxGrid: "DM79",
  }));
  const maxHeight = 520;

  /* Measurements arrive keyed by spot identity; the helper spells the first
   * `count` rows, which is what a render pass can measure. */
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
      maxHeight,
      resolveWallRowHeights(spots, {}, ROOT_FONT_PX_DEFAULT),
      ROOT_FONT_PX_DEFAULT,
    );
    // The badge line wrapped: every rendered row measures taller than the
    // pre-paint estimate, so fewer rows fit.
    const taller = wallRowHeight(spots[0], ROOT_FONT_PX_DEFAULT) + 24;
    const measured = measureRows(spots, estimated, taller);
    const withMeasurements = deriveWallVisibleSpotCount(
      maxHeight,
      resolveWallRowHeights(spots, measured, ROOT_FONT_PX_DEFAULT),
      ROOT_FONT_PX_DEFAULT,
    );

    expect(withMeasurements).toBeLessThan(estimated);
  });

  it("never accumulates past the budget with measured heights", () => {
    const taller = 96;
    let heights = resolveWallRowHeights(spots, {}, ROOT_FONT_PX_DEFAULT);
    let visible = deriveWallVisibleSpotCount(
      maxHeight,
      heights,
      ROOT_FONT_PX_DEFAULT,
    );
    // Two measure/derive passes, the way the layout effect re-runs when the
    // rendered row count changes.
    for (let pass = 0; pass < 2; pass += 1) {
      const measured = measureRows(spots, visible, taller);
      heights = resolveWallRowHeights(spots, measured, ROOT_FONT_PX_DEFAULT);
      visible = deriveWallVisibleSpotCount(
        maxHeight,
        heights,
        ROOT_FONT_PX_DEFAULT,
      );
    }

    const used =
      visible * taller + SPOT_COLLECTION_WALL_MORE_ROW_REM * ROOT_FONT_PX_DEFAULT;
    expect(used).toBeLessThanOrEqual(
      maxHeight - SPOT_COLLECTION_POPOVER_CHROME_REM * ROOT_FONT_PX_DEFAULT,
    );
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
    // jsdom and any pre-layout pass report 0; that is "not measured", not
    // "zero tall".
    expect(
      resolveWallRowHeights(
        spots,
        { "spot-0": 0, "spot-1": 0 },
        ROOT_FONT_PX_DEFAULT,
      )[0],
    ).toBe(
      wallRowHeight(spots[0], ROOT_FONT_PX_DEFAULT),
    );
  });
});

describe("retained measurements converge (#879 review round 5)", () => {
  /* The reported scenario: five short rows and a sixth whose badges wrap, in a
   * budget that fits six short rows but only five once the sixth is measured
   * tall. Keyed by render index, the sixth row's measurement was discarded the
   * moment the cap dropped it, so it was re-estimated short, came back, and
   * the cap oscillated forever. */
  const spots = Array.from({ length: 6 }, (_unused, index) => ({
    id: `spot-${index}`,
  }));
  const SHORT = 60;
  const TALL = 120;
  const rowHeight = (index: number) => (index === 5 ? TALL : SHORT);
  /* A list budget that fits all six rows at the short estimate but not once
   * the sixth measures tall (and not with the "+N more" row either). */
  const maxHeight = SPOT_COLLECTION_POPOVER_CHROME_HEIGHT + SHORT * 6 + 40;

  /* One effect pass: measure exactly the rendered rows, merge into what is
   * retained, then derive the next visible count. */
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
        maxHeight,
        resolveWallRowHeights(spots, next, ROOT_FONT_PX_DEFAULT),
        ROOT_FONT_PX_DEFAULT,
      ),
    };
  };

  it("settles in at most two effect passes and never oscillates", () => {
    let retained: Record<string, number> = {};
    let visible = deriveWallVisibleSpotCount(
      maxHeight,
      resolveWallRowHeights(spots, retained, ROOT_FONT_PX_DEFAULT),
      ROOT_FONT_PX_DEFAULT,
    );

    // Counts produced BY the measuring passes; the pre-paint estimate is a
    // guess and is allowed to be wrong in either direction.
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
    // Monotonically non-increasing: a count that went back up would be the
    // oscillation.
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
    }
    expect(visible).toBe(5);
  });

  it("keeps the tall row's height after the rendered count shrinks", () => {
    const first = pass({}, 6);
    expect(first.visible).toBeLessThan(6);

    // The tall row is no longer rendered, so this pass cannot measure it. Its
    // height has to survive anyway, or the cap expands again.
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
    // The caller passes the LOCKED container, which a degenerate host never
    // becomes -- so the frame is the viewport one that matches the body
    // portal the popover will actually use.
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
