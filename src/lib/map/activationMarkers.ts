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

export interface ActivationMarkerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActivationPillPlacement {
  spot: MappableActivationSpot;
  bounds: ActivationMarkerBounds;
}

export interface ActivationPillScreenPlacement {
  spot: MappableActivationSpot;
  left: number;
  top: number;
  width: number;
  height: number;
}

export function sameActivationPillScreenPlacements(
  left: ActivationPillScreenPlacement[],
  right: ActivationPillScreenPlacement[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((placement, index) => {
    const other = right[index];
    return (
      placement.spot.id === other.spot.id &&
      Math.abs(placement.left - other.left) < 0.1 &&
      Math.abs(placement.top - other.top) < 0.1 &&
      Math.abs(placement.width - other.width) < 0.1 &&
      Math.abs(placement.height - other.height) < 0.1
    );
  });
}

interface DrawActivationPillsOptions {
  zoomScale?: number;
  labelScale?: number;
  highViz?: boolean;
  /** Visible map rectangle in the same logical coordinates as `project`. */
  bounds?: ActivationMarkerBounds;
}

/**
 * Keep only coordinate-bearing activations. Feed records are already ordered
 * newest-first, so the first duplicate is the useful one for a crowded map.
 */
export function resolveActivationMarkers(
  spots: ActivationSpot[],
  maxSpots?: number,
): MappableActivationSpot[] {
  if (maxSpots !== undefined && maxSpots <= 0) return [];
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

function isInside(
  candidate: ActivationMarkerBounds,
  bounds: ActivationMarkerBounds,
): boolean {
  return (
    candidate.x >= bounds.x &&
    candidate.y >= bounds.y &&
    candidate.x + candidate.width <= bounds.x + bounds.width &&
    candidate.y + candidate.height <= bounds.y + bounds.height
  );
}

function containsPoint(
  point: ActivationMarkerPoint,
  bounds: ActivationMarkerBounds,
): boolean {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Choose a collision-free position while keeping the full pill visible. When
 * every candidate collides, visibility wins and the least-surprising first
 * position is clamped to the viewport.
 */
export function placeActivationPill(
  point: ActivationMarkerPoint,
  width: number,
  height: number,
  gap: number,
  occupied: ActivationMarkerBounds[],
  bounds?: ActivationMarkerBounds,
): ActivationMarkerBounds {
  const candidates: ActivationMarkerBounds[] = [
    { x: point.x - width / 2, y: point.y - height - gap, width, height },
    { x: point.x + gap, y: point.y - height / 2, width, height },
    { x: point.x - width - gap, y: point.y - height / 2, width, height },
    { x: point.x - width / 2, y: point.y + gap, width, height },
  ];
  const available = candidates.find(
    (candidate) =>
      (!bounds || isInside(candidate, bounds)) &&
      occupied.every((placed) => !overlaps(candidate, placed)),
  );
  if (available) return available;

  const visible = bounds
    ? candidates.find((candidate) => isInside(candidate, bounds))
    : undefined;
  if (visible) return visible;

  const fallback = candidates[0];
  if (!bounds) return fallback;
  return {
    ...fallback,
    x: Math.min(
      Math.max(fallback.x, bounds.x),
      bounds.x + Math.max(0, bounds.width - width),
    ),
    y: Math.min(
      Math.max(fallback.y, bounds.y),
      bounds.y + Math.max(0, bounds.height - height),
    ),
  };
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
): ActivationPillPlacement[] {
  if (spots.length === 0) return [];

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
  const placements: ActivationPillPlacement[] = [];

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const spot of spots) {
    const point = project(spot.latitude, spot.longitude);
    if (!point) continue;
    // Bounds describe the visible map, not a request to pull every projected
    // point onto its edge. Clamping below is only for a visible anchor whose
    // pill would otherwise be clipped by the viewport.
    if (options.bounds && !containsPoint(point, options.bounds)) continue;

    ctx.font =
      `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const callWidth = ctx.measureText(spot.callsign).width;
    ctx.font = `700 ${tagFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const tagWidth = ctx.measureText(spot.program).width;
    const width = callWidth + tagWidth + padX * 3;
    const box = placeActivationPill(
      point,
      width,
      height,
      gap,
      occupied,
      options.bounds,
    );
    occupied.push(box);
    placements.push({ spot, bounds: box });

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
  return placements;
}
