/**
 * lightningLayer -- shared Canvas 2D draw function for lightning strike
 * markers.
 *
 * Renders each strike as an outer glow plus an inner core, both scaled by
 * peak current (currentKA) and faded by age, against a shared `Projection`
 * so both the flat map and the azimuthal disc call the same draw code
 * (#1091). No per-view constants: the flat map's old `drawLightning` and the
 * azimuthal disc's old `drawAzLightning` were the identical algorithm with
 * identical constants -- the flat map's division by `zoomDamp` is exactly
 * what `projection.screenPx` gives on each view (the azimuthal projection is
 * always built with `zoomDamp: 1`) -- so the profile parameter is
 * deliberately absent; add one only when a measured difference appears.
 */

import type { LightningStrike } from "@/lib/api/lightning";
import type { Projection } from "@/lib/map/projection";
import {
  LIGHTNING_COLOR_FLAT,
  LIGHTNING_COLOR_STRONG,
  LIGHTNING_STRONG_KA,
} from "@/lib/map/lightningColors";

const FADE_WINDOW_MS = 10 * 60 * 1000; // strike alpha reaches the floor after this age; equal on both maps
const ALPHA_FLOOR = 0.1; // equal on both maps
const INTENSITY_FLOOR = 0.3; // equal on both maps
const INTENSITY_KA_DIVISOR = 200; // peak current (kA) that maps to intensity 1; equal on both maps
const GLOW_RADIUS_SCALE = 6; // outer glow radius as a multiple of intensity; equal on both maps
const GLOW_ALPHA_FACTOR = 0.3; // outer glow alpha as a multiple of the age-based alpha; equal on both maps
const CORE_RADIUS_SCALE = 3; // inner core radius as a multiple of intensity; equal on both maps
const CORE_ALPHA_FACTOR = 0.8; // inner core alpha as a multiple of the age-based alpha; equal on both maps

export function drawLightningLayer(
  ctx: CanvasRenderingContext2D,
  strikes: LightningStrike[],
  projection: Projection,
): void {
  ctx.save();
  const now = Date.now();
  for (const strike of strikes) {
    const point = projection.project(strike.lat, strike.lon);
    if (!point.visible) continue;

    // Fade based on age (full opacity for recent, fade over FADE_WINDOW_MS)
    const age = now - strike.time;
    const alpha = Math.max(ALPHA_FLOOR, 1 - age / FADE_WINDOW_MS);

    // Intensity based on peak current
    const intensity = Math.max(
      INTENSITY_FLOOR,
      Math.min(1, strike.currentKA / INTENSITY_KA_DIVISOR),
    );

    // Outer glow -- scaled by intensity
    ctx.globalAlpha = alpha * GLOW_ALPHA_FACTOR;
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      projection.screenPx(GLOW_RADIUS_SCALE * intensity),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = LIGHTNING_COLOR_FLAT;
    ctx.fill();

    // Inner core -- scaled by intensity, brighter white for strong strikes
    ctx.globalAlpha = alpha * CORE_ALPHA_FACTOR;
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      projection.screenPx(CORE_RADIUS_SCALE * intensity),
      0,
      Math.PI * 2,
    );
    ctx.fillStyle =
      strike.currentKA > LIGHTNING_STRONG_KA
        ? LIGHTNING_COLOR_STRONG
        : LIGHTNING_COLOR_FLAT;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
