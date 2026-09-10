import {
  placeAnchoredOverlayInFrame,
  resolveOverlayFrame,
  type OverlayFrame,
  type ScreenAnchor,
} from "@/lib/map/anchoredOverlay";

export const POPOVER_WIDTH = 330;
export const POPOVER_HEIGHT = 430;
export const EDGE_PADDING = 10;

/** Header, footer, and borders — excludes the scrollable/capped list body. */
export const SPOT_COLLECTION_POPOVER_CHROME_HEIGHT = 96;
export const SPOT_COLLECTION_WALL_ROW_HEIGHT = 54;
export const SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT = 36;

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

export function deriveWallVisibleSpotCount(
  maxHeight: number,
  totalSpots: number,
): number {
  if (totalSpots <= 0) return 0;

  const listBudget = Math.max(
    0,
    maxHeight - SPOT_COLLECTION_POPOVER_CHROME_HEIGHT,
  );
  const capWithoutMore = Math.floor(
    listBudget / SPOT_COLLECTION_WALL_ROW_HEIGHT,
  );

  if (totalSpots <= capWithoutMore) {
    return totalSpots;
  }

  const capWithMore = Math.floor(
    (listBudget - SPOT_COLLECTION_WALL_MORE_ROW_HEIGHT) /
      SPOT_COLLECTION_WALL_ROW_HEIGHT,
  );
  return Math.max(1, Math.min(totalSpots, capWithMore));
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

  const portalElement =
    portalTarget instanceof Element &&
    portalTarget !== document.body &&
    portalTarget !== document.documentElement &&
    isUsableHostRect(
      portalTarget.getBoundingClientRect().width,
      portalTarget.getBoundingClientRect().height,
    )
      ? portalTarget
      : null;

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
