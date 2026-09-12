/**
 * earthquakesLayer -- shared Canvas 2D draw function for USGS earthquake
 * events.
 *
 * Renders quakes as magnitude-scaled colored circles with glow and an
 * M5+ magnitude label, against a shared `Projection` so both the flat map
 * and the azimuthal disc call the same draw code with per-view
 * `MapLayerProfile` constants (#1091).
 */

import type { EarthquakeEvent } from "@/lib/api/earthquakes";
import type { Projection } from "@/lib/map/projection";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";

const MIN_RADIUS_PX = 3; // floor for the core radius; equal on both maps
const MAGNITUDE_BASELINE = 1; // radius scales from (magnitude - this); equal on both maps
const GLOW_RADIUS_SCALE = 2; // outer glow radius as a multiple of the core radius; equal on both maps
const GLOW_ALPHA = 0.15; // equal on both maps
const CORE_ALPHA = 0.7; // equal on both maps
const OUTLINE_ALPHA = 0.9; // equal on both maps
const OUTLINE_WIDTH_PX = 1; // equal on both maps
const LABEL_MIN_MAGNITUDE = 5; // magnitude threshold to draw the "M#.#" label; equal on both maps
const LABEL_FONT_SIZE_PX = 7; // equal on both maps
const LABEL_STROKE_WIDTH_PX = 2; // equal on both maps
const LABEL_STROKE_COLOR = "rgba(0,0,0,0.6)"; // equal on both maps
const LABEL_FILL_COLOR = "#ffffff"; // equal on both maps
const LABEL_OFFSET_PX = 2; // gap between the marker and the label baseline; equal on both maps

function colorForMagnitude(magnitude: number): string {
  if (magnitude >= 7) return "#ff2020"; // Major: red
  if (magnitude >= 5) return "#ff8800"; // Strong: orange
  if (magnitude >= 4) return "#ffcc00"; // Moderate: yellow
  return "#88cc44"; // Light: green-yellow
}

export function drawEarthquakesLayer(
  ctx: CanvasRenderingContext2D,
  earthquakes: EarthquakeEvent[],
  projection: Projection,
  profile: MapLayerProfile,
): void {
  ctx.save();
  for (const eq of earthquakes) {
    const point = projection.project(eq.lat, eq.lon);
    if (!point.visible) continue;

    const radius = projection.screenPx(
      Math.max(
        MIN_RADIUS_PX,
        Math.min(
          profile.quakes.maxRadiusPx,
          (eq.magnitude - MAGNITUDE_BASELINE) * profile.quakes.pxPerMagnitude,
        ),
      ),
    );

    const color = colorForMagnitude(eq.magnitude);

    // Outer glow ring
    ctx.globalAlpha = GLOW_ALPHA;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * GLOW_RADIUS_SCALE, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner filled circle
    ctx.globalAlpha = CORE_ALPHA;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Outline (reuses the core circle's path)
    ctx.globalAlpha = OUTLINE_ALPHA;
    ctx.strokeStyle = color;
    ctx.lineWidth = projection.screenPx(OUTLINE_WIDTH_PX);
    ctx.stroke();

    // Magnitude label for M5+
    if (eq.magnitude >= LABEL_MIN_MAGNITUDE) {
      const fontSize = Math.max(
        1,
        Math.round(projection.screenPx(LABEL_FONT_SIZE_PX)),
      );
      ctx.globalAlpha = 1;
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.strokeStyle = LABEL_STROKE_COLOR;
      ctx.lineWidth = projection.screenPx(LABEL_STROKE_WIDTH_PX);
      const label = `M${eq.magnitude.toFixed(1)}`;
      const labelY = point.y - radius - projection.screenPx(LABEL_OFFSET_PX);
      ctx.strokeText(label, point.x, labelY);
      ctx.fillStyle = LABEL_FILL_COLOR;
      ctx.fillText(label, point.x, labelY);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
