import type { ActivationSpot } from "@/types/activationSpots";
import { getBandColor } from "@/lib/utils/spotColors";

export type MappableActivationSpot = ActivationSpot & {
  latitude: number;
  longitude: number;
};

export interface ActivationMarkerPoint {
  x: number;
  y: number;
}

interface DrawActivationPillsOptions {
  zoomScale?: number;
  labelScale?: number;
  highViz?: boolean;
}

/**
 * Keep only coordinate-bearing activations. Feed records are already ordered
 * newest-first, so the first duplicate is the useful one for a crowded map.
 */
export function resolveActivationMarkers(
  spots: ActivationSpot[],
  maxSpots?: number,
): MappableActivationSpot[] {
  const seen = new Set<string>();
  const resolved: MappableActivationSpot[] = [];

  for (const spot of spots) {
    const { latitude, longitude } = spot;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude === undefined ||
      longitude === undefined ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }

    const key = `${spot.program}:${spot.callsign}:${spot.reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push({ ...spot, latitude, longitude });
    if (maxSpots !== undefined && resolved.length >= maxSpots) break;
  }

  return resolved;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Draw screen-consistent activator pills in either 2D renderer. Projection is
 * supplied by the view so the layer has identical styling on both maps while
 * still respecting dateline wrapping and azimuthal horizon clipping.
 */
export function drawActivationPills(
  ctx: CanvasRenderingContext2D,
  spots: MappableActivationSpot[],
  project: (
    latitude: number,
    longitude: number,
  ) => ActivationMarkerPoint | null,
  options: DrawActivationPillsOptions = {},
) {
  if (spots.length === 0) return;

  const zoomDamp = Math.max(options.zoomScale ?? 1, 0.01);
  const labelScale = Math.max(options.labelScale ?? 1, 0.7);
  const fontSize = (options.highViz ? 12 : 10) * labelScale / zoomDamp;
  const tagFontSize = (options.highViz ? 9 : 8) * labelScale / zoomDamp;
  const padX = 5 / zoomDamp;
  const height = (options.highViz ? 21 : 18) * labelScale / zoomDamp;
  const gap = 4 / zoomDamp;
  const occupied: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const spot of spots) {
    const point = project(spot.latitude, spot.longitude);
    if (!point) continue;

    ctx.font =
      `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const callWidth = ctx.measureText(spot.callsign).width;
    ctx.font = `700 ${tagFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tagWidth = ctx.measureText(spot.program).width;
    const width = callWidth + tagWidth + padX * 3;
    const candidates = [
      { x: point.x - width / 2, y: point.y - height - gap },
      { x: point.x + gap, y: point.y - height / 2 },
      { x: point.x - width - gap, y: point.y - height / 2 },
      { x: point.x - width / 2, y: point.y + gap },
    ];
    const box =
      candidates.find((candidate) =>
        occupied.every((placed) =>
          !overlaps({ ...candidate, width, height }, placed),
        ),
      ) ?? candidates[0];
    const bounds = { ...box, width, height };
    occupied.push(bounds);

    const color = getBandColor(spot.frequencyKHz);
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = 6 / zoomDamp;
    ctx.fillStyle = options.highViz
      ? "rgba(2, 4, 12, 0.98)"
      : "rgba(7, 9, 22, 0.92)";
    roundedRect(ctx, box.x, box.y, width, height, 4 / zoomDamp);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = color;
    ctx.fillRect(box.x, box.y + height - 3 / zoomDamp, width, 3 / zoomDamp);

    const textY = box.y + height / 2 - 1 / zoomDamp;
    ctx.font =
      `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
    ctx.fillText(spot.callsign, box.x + padX, textY);

    ctx.font =
      `700 ${tagFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = color;
    ctx.fillText(spot.program, box.x + padX * 2 + callWidth, textY);
  }

  ctx.restore();
}
