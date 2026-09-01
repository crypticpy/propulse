import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import type { ThemeId } from "@/lib/themes";

export const STANDARD_MAP_CANVAS_WIDTH = 2048;
export const STANDARD_MAP_CANVAS_HEIGHT = 1024;

interface StandardMapPalette {
  ocean: string;
  land: string;
  border: string;
}

const STANDARD_MAP_PALETTES: Record<ThemeId, StandardMapPalette> = {
  light: { ocean: "#dce9ee", land: "#aeb9b2", border: "#7d8c86" },
  dark: { ocean: "#101827", land: "#35423d", border: "#65736d" },
  midnight: { ocean: "#050b18", land: "#202d32", border: "#50616a" },
  "high-contrast": { ocean: "#000000", land: "#f4f4f4", border: "#000000" },
};

const standardMapCanvasCache = new Map<string, HTMLCanvasElement>();
const STANDARD_MAP_CACHE_LIMIT = 2;

function addWrappedRingPath(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  width: number,
  height: number,
): void {
  if (ring.length < 2) return;

  const baseXs: number[] = new Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const lon = ring[i][1];
    baseXs[i] = ((lon + 180) / 360) * width;
  }

  // If the anti-meridian crossing happens at the ring closure, rotate the ring
  // so the largest longitude jump is handled by the unwrap loop (avoids a long
  // closing segment that creates visible artifacts).
  let maxDelta = 0;
  let rotateStart = 0;
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    const delta = Math.abs(baseXs[next] - baseXs[i]);
    if (delta > maxDelta) {
      maxDelta = delta;
      rotateStart = i;
    }
  }

  const needsRotation = maxDelta > width / 2 && rotateStart !== 0;
  const points = needsRotation
    ? [...ring.slice(rotateStart), ...ring.slice(0, rotateStart)]
    : ring;
  const pointsBaseXs = needsRotation
    ? [...baseXs.slice(rotateStart), ...baseXs.slice(0, rotateStart)]
    : baseXs;

  const xs: number[] = new Array(points.length);
  let prevX = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  // Unwrap longitudes into a continuous x-space to avoid anti-meridian "stitch" lines
  for (let i = 0; i < points.length; i++) {
    let x = pointsBaseXs[i];
    if (i > 0) {
      const delta = x - prevX;
      if (delta > width / 2) x -= width;
      else if (delta < -width / 2) x += width;
    }
    xs[i] = x;
    prevX = x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }

  // Draw up to 3 wrapped copies so polygons that cross the anti-meridian render correctly
  const offsets = [-width, 0, width] as const;
  for (const offset of offsets) {
    if (maxX + offset < 0 || minX + offset > width) continue;
    for (let i = 0; i < points.length; i++) {
      const [lat] = points[i];
      const y = ((90 - lat) / 180) * height;
      const x = xs[i] + offset;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}

/**
 * Returns a cached "standard" map canvas: lightweight land/ocean fills with no
 * topographic shading. Intended to be used as a base texture in both 2D and 3D
 * views.
 */
export function getStandardMapCanvas(
  width: number = STANDARD_MAP_CANVAS_WIDTH,
  height: number = STANDARD_MAP_CANVAS_HEIGHT,
  theme: ThemeId = "light",
): HTMLCanvasElement {
  const palette = STANDARD_MAP_PALETTES[theme];
  const key = `${width}x${height}:${theme}`;
  const cached = standardMapCanvasCache.get(key);
  if (cached) {
    // Refresh insertion order so the cache behaves as a tiny LRU. UHD canvases
    // are expensive (a 4096x2048 RGBA surface is roughly 32 MiB), so retaining
    // every theme/quality combination for the life of the app is not safe.
    standardMapCanvasCache.delete(key);
    standardMapCanvasCache.set(key, cached);
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    standardMapCanvasCache.set(key, canvas);
    return canvas;
  }

  // Ocean/background
  ctx.fillStyle = palette.ocean;
  ctx.fillRect(0, 0, width, height);

  // Land fills (per-country, even-odd to support holes when present)
  ctx.fillStyle = palette.land;
  for (const country of WORLD_COUNTRIES) {
    if (!country.borders?.length) continue;
    ctx.beginPath();
    for (const ring of country.borders) {
      addWrappedRingPath(ctx, ring, width, height);
    }
    ctx.fill("evenodd");
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = Math.max(0.5, width / 4096);
    ctx.stroke();
  }

  standardMapCanvasCache.set(key, canvas);
  while (standardMapCanvasCache.size > STANDARD_MAP_CACHE_LIMIT) {
    const oldestKey = standardMapCanvasCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = standardMapCanvasCache.get(oldestKey);
    standardMapCanvasCache.delete(oldestKey);
    if (evicted) {
      evicted.width = 1;
      evicted.height = 1;
    }
  }
  return canvas;
}
