/**
 * firesLayer -- shared Canvas 2D draw function for NASA FIRMS fire hotspots.
 *
 * Renders fire detections as orange/red dots scaled by FRP (fire radiative
 * power), against a shared `Projection` so both the flat map and the
 * azimuthal disc call the same draw code with per-view `MapLayerProfile`
 * constants (#1091).
 */

import { FIRE_GLOW_COLOR, FIRE_CORE_COLOR } from "@/lib/colors/palettes/fire";
import type { FireHotspot } from "@/lib/api/fires";
import type { Projection } from "@/lib/map/projection";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";

const FIRE_GLOW_RADIUS_SCALE = 2; // outer glow radius as a multiple of the core radius; equal on both maps
const FIRE_CORE_ALPHA = 0.7; // equal on both maps

export function drawFiresLayer(
  ctx: CanvasRenderingContext2D,
  hotspots: FireHotspot[],
  projection: Projection,
  profile: MapLayerProfile,
): void {
  ctx.save();
  for (const hp of hotspots) {
    if (hp.confidence === "low") continue;

    const point = projection.project(hp.lat, hp.lon);
    if (!point.visible) continue;

    const radius = projection.screenPx(
      Math.max(
        profile.fires.minRadiusPx,
        Math.min(
          profile.fires.maxRadiusPx,
          hp.frp / profile.fires.frpPerRadiusPx,
        ),
      ),
    );

    // Outer glow
    ctx.globalAlpha = profile.fires.glowAlpha;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * FIRE_GLOW_RADIUS_SCALE, 0, Math.PI * 2);
    ctx.fillStyle = FIRE_GLOW_COLOR;
    ctx.fill();

    // Inner core
    ctx.globalAlpha = FIRE_CORE_ALPHA;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = FIRE_CORE_COLOR;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
