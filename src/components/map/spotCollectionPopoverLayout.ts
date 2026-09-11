import {
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
  type OverlayFrame,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";

export const POPOVER_WIDTH = 330;
export const POPOVER_HEIGHT = 430;
export const EDGE_PADDING = 10;

/** Root font size when nothing has been measured yet (Tailwind default). */
export const ROOT_FONT_PX_DEFAULT = 16;

/* Row budgets are expressed in rem, never in px: the popover rows are built
 * from rem-based type and padding, and the app scales the document root font
 * size with the text-scale control (`:root[data-text-scale]`, 14.4px at sm up
 * to 22px at xl, `src/styles/globals.css`). Fixed pixel budgets derived the
 * row count for a 16px root and overfilled the `overflow-hidden` wall body at
 * lg/xl (#879 review round 3). Callers multiply by the measured root font
 * size and re-derive when the scale changes. */

/** Header, footer, and borders -- excludes the scrollable/capped list body. */
export const SPOT_COLLECTION_POPOVER_CHROME_REM = 6;
/** A two-line row: callsign/frequency line plus the badge line. */
export const SPOT_COLLECTION_WALL_ROW_REM = 3.375;
/** The same row with the grid/comment third line (and its `mt-1`). A spot
 * carrying `dxGrid` or `comment` renders this taller variant, so a cap that
 * budgeted every row at the short height over-rendered the list: the wall body
 * is `overflow-hidden`, so the extra rows were silently clipped while the aria
 * label and the `+N more` count still claimed them as visible (#879 review
 * round). Rows are budgeted individually at their own height instead. */
export const SPOT_COLLECTION_WALL_DETAIL_ROW_REM = 4.5;
export const SPOT_COLLECTION_WALL_MORE_ROW_REM = 2.25;

/** The document root font size in px, or the default when it cannot be read.
 * This is what turns the rem budgets above into real pixels at the operator's
 * current text scale. */
export function readRootFontPx(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return ROOT_FONT_PX_DEFAULT;
  }
  const parsed = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ROOT_FONT_PX_DEFAULT;
}

/** The height the wall list must reserve for `spot`, matching the row markup
 * in `SpotCollectionPopover`: the grid/comment line renders whenever either
 * field is present (it prints "Grid unavailable" for a bare comment). */
export function wallRowHeight(
  spot: {
    dxGrid?: string | null;
    comment?: string | null;
  },
  rootFontPx: number = ROOT_FONT_PX_DEFAULT,
): number {
  const rem =
    spot.dxGrid || spot.comment
      ? SPOT_COLLECTION_WALL_DETAIL_ROW_REM
      : SPOT_COLLECTION_WALL_ROW_REM;
  return rem * rootFontPx;
}

export interface SpotCollectionPopoverLayout {
  frame: OverlayFrame;
  overlaySize: { width: number; height: number };
  adjustedPosition: { x: number; y: number };
  maxHeight: number;
  screenLeft: number;
  screenTop: number;
  portalElement: Element | null;
}

function isUsableHostRect(width: number, height: number): boolean {
  return width >= EDGE_PADDING * 2 && height >= EDGE_PADDING * 2;
}

/** How many of `rowHeights` (in render order) fit in `budget`. */
function countRowsThatFit(
  rowHeights: readonly number[],
  budget: number,
): number {
  let used = 0;
  let count = 0;
  for (const height of rowHeights) {
    const next = used + Math.max(1, height);
    if (next > budget) break;
    used = next;
    count += 1;
  }
  return count;
}

/**
 * The wall never scrolls, so the list is capped instead. Rows are measured
 * one by one from their own height (see `wallRowHeight`) rather than from a
 * single average: a collection of grid-carrying spots is a third taller a row,
 * and budgeting it at the short height rendered rows the clipped body could
 * not show while still counting them as visible.
 *
 * `rootFontPx` scales the chrome and "+N more" budgets to the operator's text
 * scale; `rowHeights` must already be in the same pixel space (pass heights
 * from `wallRowHeight(spot, rootFontPx)` or real measured row heights).
 */
export function deriveWallVisibleSpotCount(
  maxHeight: number,
  rowHeights: readonly number[],
  rootFontPx: number = ROOT_FONT_PX_DEFAULT,
): number {
  const totalSpots = rowHeights.length;
  if (totalSpots <= 0) return 0;

  const listBudget = Math.max(
    0,
    maxHeight - SPOT_COLLECTION_POPOVER_CHROME_REM * rootFontPx,
  );

  if (countRowsThatFit(rowHeights, listBudget) >= totalSpots) {
    return totalSpots;
  }

  // At least one row: a popover that shows only "+N more" tells the operator
  // nothing, and the header already names the collection.
  return Math.max(
    1,
    Math.min(
      totalSpots,
      countRowsThatFit(
        rowHeights,
        listBudget - SPOT_COLLECTION_WALL_MORE_ROW_REM * rootFontPx,
      ),
    ),
  );
}

/**
 * The container the popover renders into: the map's own portal host when it
 * has a usable rect, else `null` (the caller falls back to `document.body`).
 *
 * Callers must resolve this ONCE per open session. React recreates a portal's
 * children when its container changes, so re-resolving it on every host
 * resize would remount the open popover the moment a host dipped below the
 * usability threshold mid-drag, dropping keyboard focus to `<body>` (#879
 * review round). The frame math above may fall back to the viewport on the
 * same dip; that is a positioning change, not a remount.
 */
export function resolveSpotCollectionPortalElement(
  portalTarget: Element | null | undefined,
): Element | null {
  if (
    !(portalTarget instanceof Element) ||
    portalTarget === document.body ||
    portalTarget === document.documentElement
  ) {
    return null;
  }
  const rect = portalTarget.getBoundingClientRect();
  return isUsableHostRect(rect.width, rect.height) ? portalTarget : null;
}

export function computeSpotCollectionPopoverLayout(
  position: ScreenAnchor,
  portalTarget: Element | null | undefined,
  boundsHost: Element | null | undefined,
  /** Bumps when host geometry changes so callers can invalidate memoized layout. */
  layoutEpoch = 0,
): SpotCollectionPopoverLayout {
  void layoutEpoch;
  const measuredHost = portalTarget ?? boundsHost;
  let rawFrame = resolveOverlayFrame(measuredHost);

  if (
    measuredHost instanceof Element &&
    measuredHost !== document.body &&
    measuredHost !== document.documentElement &&
    !isUsableHostRect(rawFrame.width, rawFrame.height)
  ) {
    rawFrame = resolveOverlayFrame(null);
  }

  const frame: OverlayFrame =
    !portalTarget && boundsHost ? { ...rawFrame, position: "fixed" } : rawFrame;

  const overlaySize = {
    width: Math.min(POPOVER_WIDTH, frame.width - EDGE_PADDING * 2),
    height: Math.min(POPOVER_HEIGHT, frame.height - EDGE_PADDING * 2),
  };
  const adjustedPosition = placeAnchoredOverlayInFrame(
    position,
    overlaySize,
    frame,
    { axis: "horizontal", gap: 12, padding: EDGE_PADDING },
  );
  const maxHeight = Math.max(
    0,
    frame.height - adjustedPosition.y - EDGE_PADDING,
  );
  const screenLeft =
    frame.position === "fixed"
      ? frame.left + adjustedPosition.x
      : adjustedPosition.x;
  const screenTop =
    frame.position === "fixed"
      ? frame.top + adjustedPosition.y
      : adjustedPosition.y;

  const portalElement = resolveSpotCollectionPortalElement(portalTarget);

  return {
    frame,
    overlaySize,
    adjustedPosition,
    maxHeight,
    screenLeft,
    screenTop,
    portalElement,
  };
}
