/**
 * One coordinate model for BuilderCanvas pan/zoom/fit.
 *
 * Screen pointers are mapped into the SVG viewBox (user units). The viewBox
 * already fits layout extents into the viewport, so Fit is a reset to zoom 1
 * rather than a second containerWidth/svgWidth ratio.
 */

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.5;
export const ZOOM_BUTTON_STEP = 0.2;
export const WHEEL_ZOOM_STEP = 0.1;
export const FIT_ZOOM = 1;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Keep the cursor on the same content point after zoom (pan + scale model). */
export function panAfterZoomAt(
  cursor: { x: number; y: number },
  prevPan: { x: number; y: number },
  scaleRatio: number,
): { x: number; y: number } {
  return {
    x: cursor.x - scaleRatio * (cursor.x - prevPan.x),
    y: cursor.y - scaleRatio * (cursor.y - prevPan.y),
  };
}

/**
 * CSS-pixel pointer → viewBox user units under default SVG
 * preserveAspectRatio="xMidYMid meet".
 */
export function clientToViewBox(
  clientX: number,
  clientY: number,
  viewport: { left: number; top: number; width: number; height: number },
  viewBox: { width: number; height: number },
): { x: number; y: number } {
  const { width: vpW, height: vpH, left, top } = viewport;
  const { width: vbW, height: vbH } = viewBox;
  if (vpW <= 0 || vpH <= 0 || vbW <= 0 || vbH <= 0) {
    return { x: clientX - left, y: clientY - top };
  }
  const scale = Math.min(vpW / vbW, vpH / vbH);
  const offsetX = (vpW - vbW * scale) / 2;
  const offsetY = (vpH - vbH * scale) / 2;
  return {
    x: (clientX - left - offsetX) / scale,
    y: (clientY - top - offsetY) / scale,
  };
}

export function readViewBoxSize(svg: SVGSVGElement): {
  width: number;
  height: number;
} {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { width: vb.width, height: vb.height };
  }
  const attr = svg.getAttribute("viewBox");
  if (attr) {
    const parts = attr.trim().split(/[\s,]+/).map(Number);
    if (
      parts.length === 4 &&
      Number.isFinite(parts[2]) &&
      Number.isFinite(parts[3]) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const rect = svg.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/**
 * Pointer → viewBox units via the live CTM when the browser provides one,
 * otherwise the meet-ratio model (jsdom has no CTM).
 */
export function pointerToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  try {
    const ctm = svg.getScreenCTM?.();
    if (ctm && typeof svg.createSVGPoint === "function") {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const mapped = pt.matrixTransform(ctm.inverse());
      if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
        return { x: mapped.x, y: mapped.y };
      }
    }
  } catch {
    // jsdom / incomplete SVG implementations
  }
  return clientToViewBox(
    clientX,
    clientY,
    svg.getBoundingClientRect(),
    readViewBoxSize(svg),
  );
}
