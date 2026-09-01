export interface ScreenAnchor {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export type OverlayPlacement = "above" | "below" | "left" | "right";

export interface AnchoredOverlayPosition {
  x: number;
  y: number;
  placement: OverlayPlacement;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Places an overlay against a screen-space anchor while keeping the complete
 * surface inside the viewport. Hover previews use vertical placement so they
 * read as an expansion of the tag; deliberate cards prefer the side so the
 * selected route stays visible.
 */
export function placeAnchoredOverlay(
  anchor: ScreenAnchor,
  overlay: OverlaySize,
  viewport: ViewportSize,
  options: {
    axis?: "vertical" | "horizontal";
    gap?: number;
    padding?: number;
  } = {},
): AnchoredOverlayPosition {
  const axis = options.axis ?? "vertical";
  const gap = options.gap ?? 12;
  const padding = options.padding ?? 10;
  const anchorWidth = anchor.width ?? 0;
  const anchorHeight = anchor.height ?? 0;
  const centerX = anchor.x + anchorWidth / 2;
  const centerY = anchor.y + anchorHeight / 2;

  if (axis === "horizontal") {
    const rightX = anchor.x + anchorWidth + gap;
    const leftX = anchor.x - overlay.width - gap;
    const fitsRight = rightX + overlay.width <= viewport.width - padding;
    const placement: OverlayPlacement = fitsRight ? "right" : "left";
    return {
      x: clamp(
        fitsRight ? rightX : leftX,
        padding,
        viewport.width - overlay.width - padding,
      ),
      y: clamp(
        centerY - overlay.height / 2,
        padding,
        viewport.height - overlay.height - padding,
      ),
      placement,
    };
  }

  const aboveY = anchor.y - overlay.height - gap;
  const belowY = anchor.y + anchorHeight + gap;
  const fitsAbove = aboveY >= padding;
  const placement: OverlayPlacement = fitsAbove ? "above" : "below";

  return {
    x: clamp(
      centerX - overlay.width / 2,
      padding,
      viewport.width - overlay.width - padding,
    ),
    y: clamp(
      fitsAbove ? aboveY : belowY,
      padding,
      viewport.height - overlay.height - padding,
    ),
    placement,
  };
}
