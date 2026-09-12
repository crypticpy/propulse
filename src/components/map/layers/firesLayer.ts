/**
 * firesLayer -- shared Canvas 2D draw function for NASA FIRMS fire hotspots.
 *
 * Renders fire detections as orange/red dots scaled by FRP (fire radiative
 * power), against a shared `Projection` so both the flat map and the
 * azimuthal disc call the same draw code with per-view `MapLayerProfile`
 * constants (#1091).
 */

import type { FireHotspot } from "@/lib/api/fires";
import type { Projection } from "@/lib/map/projection";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";

const FIRE_GLOW_COLOR = "#ff6600"; // same on both maps, so not a profile field; do NOT import from FireOverlay3D (pulls Three.js into the 2D bundle)
const FIRE_CORE_COLOR = "#ff2200";

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
        profile.fireMinRadiusPx,
        Math.min(profile.fireMaxRadiusPx, hp.frp / profile.fireFrpPerRadiusPx),
      ),
    );

    // Outer glow
    ctx.globalAlpha = profile.fireGlowAlpha;
    ctx.beginPath();
    ctx.arc(
      point.x,
      point.y,
      radius * profile.fireGlowRadiusScale,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = FIRE_GLOW_COLOR;
    ctx.fill();

    // Inner core
    ctx.globalAlpha = profile.fireCoreAlpha;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = FIRE_CORE_COLOR;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
