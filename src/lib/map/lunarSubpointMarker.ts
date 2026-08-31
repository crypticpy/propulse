export const LUNAR_SUBPOINT_COLOR = "#d9e8ff";

interface LunarSubpointMarkerOptions {
  zoomScale?: number;
  highViz?: boolean;
}

export interface LunarMarkerDimensions {
  radius: number;
  ringRadius: number;
  fontSize: number;
}

/** Keep the marker legible and screen-consistent while a canvas is zoomed. */
export function getLunarMarkerDimensions(
  zoomScale = 1,
  highViz = false,
): LunarMarkerDimensions {
  const zoomDamp = Math.max(zoomScale, 0.01);
  return {
    radius: (highViz ? 8 : 7) / zoomDamp,
    ringRadius: (highViz ? 13 : 11) / zoomDamp,
    fontSize: (highViz ? 11 : 9) / zoomDamp,
  };
}

/** Draw the same unmistakable lunar-overhead marker in both 2D projections. */
export function drawLunarSubpointMarker(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  options: LunarSubpointMarkerOptions = {},
) {
  const zoomScale = Math.max(options.zoomScale ?? 1, 0.01);
  const { radius, ringRadius, fontSize } = getLunarMarkerDimensions(
    zoomScale,
    options.highViz,
  );

  ctx.save();
  ctx.shadowColor = "rgba(217, 232, 255, 0.8)";
  ctx.shadowBlur = 8 / zoomScale;
  ctx.strokeStyle = LUNAR_SUBPOINT_COLOR;
  ctx.lineWidth = (options.highViz ? 2 : 1.25) / zoomScale;
  ctx.beginPath();
  ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // A filled disc plus a dark offset disc reads as a crescent without relying
  // on platform-specific emoji fonts or compositing through the basemap.
  ctx.shadowBlur = 0;
  ctx.fillStyle = LUNAR_SUBPOINT_COLOR;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a0a1a";
  ctx.beginPath();
  ctx.arc(
    point.x + radius * 0.42,
    point.y - radius * 0.12,
    radius * 0.83,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = LUNAR_SUBPOINT_COLOR;
  ctx.fillText("LUNAR", point.x, point.y + ringRadius + 3 / zoomScale);
  ctx.restore();
}
