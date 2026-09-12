/**
 * weatherAlertsLayer -- shared Canvas 2D draw function for NWS weather
 * alerts.
 *
 * Renders alerts as severity-colored warning triangles with an exclamation
 * mark and (above a per-view zoom threshold) a truncated event-type label,
 * against a shared `Projection` so both the flat map and the azimuthal disc
 * call the same draw code with per-view `MapLayerProfile` constants (#1091).
 */

import { getWeatherSeverityColor as colorForSeverity } from "@/lib/colors/palettes/weather";
import type { WeatherAlert } from "@/lib/api/weather";
import type { Projection } from "@/lib/map/projection";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";

const TRIANGLE_SIZE_PX = 8; // equal on both maps
const TRIANGLE_ALPHA = 0.8; // equal on both maps
const TRIANGLE_STROKE_COLOR = "rgba(0,0,0,0.5)"; // equal on both maps
const TRIANGLE_STROKE_WIDTH_PX = 0.5; // equal on both maps
const GLYPH_TEXT = "!"; // equal on both maps
const GLYPH_COLOR = "#000000"; // equal on both maps
const GLYPH_FONT_SIZE_PX = 8; // equal on both maps
const LABEL_MAX_CHARS = 16; // equal on both maps
const LABEL_ELLIPSIS = "…"; // equal on both maps
const LABEL_FONT_SIZE_PX = 9; // equal on both maps
const LABEL_OFFSET_PX = 2; // gap between the triangle and the label baseline; equal on both maps; screenPx'd
const LABEL_SHADOW_COLOR = "rgba(0, 0, 0, 0.8)"; // equal on both maps
// Literal px, NOT run through projection.screenPx -- the flat map never
// divided this by zoomDamp either, so keeping it undamped here is required
// for pixel parity, not an oversight.
const LABEL_SHADOW_BLUR_PX = 2;

export function drawWeatherAlertsLayer(
  ctx: CanvasRenderingContext2D,
  alerts: WeatherAlert[],
  projection: Projection,
  profile: MapLayerProfile,
): void {
  ctx.save();
  for (const alert of alerts) {
    const point = projection.project(alert.lat, alert.lon);
    if (!point.visible) continue;

    const color = colorForSeverity(alert.severity);
    const size = projection.screenPx(TRIANGLE_SIZE_PX);

    // Warning triangle
    ctx.globalAlpha = TRIANGLE_ALPHA;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - size); // top
    ctx.lineTo(point.x + size, point.y + size * 0.6); // bottom right
    ctx.lineTo(point.x - size, point.y + size * 0.6); // bottom left
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = TRIANGLE_STROKE_COLOR;
    ctx.lineWidth = projection.screenPx(TRIANGLE_STROKE_WIDTH_PX);
    ctx.stroke();

    // Exclamation mark inside the triangle
    ctx.fillStyle = GLYPH_COLOR;
    const glyphFontSize = Math.max(
      1,
      Math.round(projection.screenPx(GLYPH_FONT_SIZE_PX)),
    );
    ctx.font = `bold ${glyphFontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(GLYPH_TEXT, point.x, point.y);

    // Event type label (only when zoomed in enough to read)
    if (projection.zoomScale > profile.weatherAlerts.labelMinZoomScale) {
      const label =
        alert.event.length > LABEL_MAX_CHARS
          ? alert.event.slice(0, LABEL_MAX_CHARS) + LABEL_ELLIPSIS
          : alert.event;
      const labelFontSize = Math.max(
        1,
        Math.round(projection.screenPx(LABEL_FONT_SIZE_PX)),
      );
      ctx.font = `${labelFontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      ctx.shadowColor = LABEL_SHADOW_COLOR;
      ctx.shadowBlur = LABEL_SHADOW_BLUR_PX;
      ctx.fillText(
        label,
        point.x,
        point.y + size * 0.6 + projection.screenPx(LABEL_OFFSET_PX),
      );
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
