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

export interface OverlayFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  /** `absolute` when the overlay is portaled into a map-owned layer. */
  position: "fixed" | "absolute";
}

export interface PlaceAnchoredOverlayOptions {
  axis?: "vertical" | "horizontal";
  gap?: number;
  padding?: number;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Viewport box for an overlay portal. Map-owned layers (the globe overlay
 * sibling that sits above Drei Html labels) are `position: absolute; inset: 0`
 * inside a clipped, isolated globe container. `position: fixed` descendants of
 * that box are containing-blocked to the globe, so client coordinates must be
 * converted into the portal's local space or the preview jumps into the
 * adjacent HamClock panel.
 */
export function resolveOverlayFrame(
  portal: Element | null | undefined,
): OverlayFrame {
  if (
    typeof document !== "undefined" &&
    portal instanceof Element &&
    portal !== document.body &&
    portal !== document.documentElement
  ) {
    const rect = portal.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      position: "absolute",
    };
  }
  return {
    left: 0,
    top: 0,
    width: typeof window === "undefined" ? 1920 : window.innerWidth,
    height: typeof window === "undefined" ? 1080 : window.innerHeight,
    position: "fixed",
  };
}

/** Place a viewport-space anchor inside a portal or the window. */
export function placeAnchoredOverlayInFrame(
  anchor: ScreenAnchor,
  overlay: OverlaySize,
  frame: Pick<OverlayFrame, "left" | "top" | "width" | "height">,
  options: PlaceAnchoredOverlayOptions = {},
): AnchoredOverlayPosition {
  return placeAnchoredOverlay(
    {
      x: anchor.x - frame.left,
      y: anchor.y - frame.top,
      width: anchor.width,
      height: anchor.height,
    },
    overlay,
    { width: frame.width, height: frame.height },
    options,
  );
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
  options: PlaceAnchoredOverlayOptions = {},
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
