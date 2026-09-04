/**
 * Shared RainViewer (+ optional NEXRAD) radar frame compositor.
 * Produces an equirectangular canvas for globe textures and flat-map overlays.
 */

import type { RadarManifest } from "@/lib/api/radar";
import { getRadarTileUrlForFrame } from "@/lib/api/radar";
import type { NexradProduct } from "@/lib/api/nexrad";
import {
  NEXRAD_FRAME_PRODUCTS,
  NEXRAD_US_BOUNDS_Z5,
  getNexradTileUrl,
} from "@/lib/api/nexrad";
import { RADAR_TEXTURE_BUDGET } from "@/lib/map/radarBudget";
import { drawMercatorAsEquirect } from "@/lib/map/mercatorReproject";

const ZOOM_LEVEL = RADAR_TEXTURE_BUDGET.zoom;
const TILES_PER_AXIS = RADAR_TEXTURE_BUDGET.tilesPerAxis;
const TILE_SIZE = RADAR_TEXTURE_BUDGET.tileSize;
export const RADAR_CANVAS_SIZE = TILES_PER_AXIS * TILE_SIZE;
const TILE_BATCH_SIZE = 8;
const NEXRAD_ZOOM = 5;
const NEXRAD_TILE_SCALE = TILE_SIZE / 2 ** (NEXRAD_ZOOM - ZOOM_LEVEL);
const NEXRAD_MAX_AGE_MINUTES = 60;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

async function loadImageWithRetry(url: string): Promise<HTMLImageElement> {
  try {
    return await loadImage(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return loadImage(url);
  }
}

async function loadInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
    if (i + batchSize < tasks.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return results;
}

/**
 * Post-process radar pixels. Keep edges relatively crisp — heavy alpha lift
 * makes precip look bloomy/low-res when draped on the globe or flat map.
 */
export function boostRadarColors(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    const gray = (r + g + b) / 3;
    const satBoost = 1.35;
    r = Math.min(255, Math.round(gray + (r - gray) * satBoost));
    g = Math.min(255, Math.round(gray + (g - gray) * satBoost));
    b = Math.min(255, Math.round(gray + (b - gray) * satBoost));

    const brightness = Math.max(r, g, b);
    if (brightness < 140) {
      const lift = 1.25;
      r = Math.min(255, Math.round(r * lift));
      g = Math.min(255, Math.round(g * lift));
      b = Math.min(255, Math.round(b * lift));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.min(255, Math.round(a * 1.1));
  }

  ctx.putImageData(imageData, 0, 0);
}

function resolveNexradProduct(frameTimeSec: number): NexradProduct | null {
  const minutesAgo = Math.round((Date.now() / 1000 - frameTimeSec) / 60);
  if (minutesAgo < -2 || minutesAgo > NEXRAD_MAX_AGE_MINUTES) return null;
  const offsetSteps = Math.min(
    NEXRAD_FRAME_PRODUCTS.length - 1,
    Math.max(0, Math.round(minutesAgo / 5)),
  );
  return NEXRAD_FRAME_PRODUCTS[NEXRAD_FRAME_PRODUCTS.length - 1 - offsetSteps];
}

async function compositeNexradOverlay(
  ctx: CanvasRenderingContext2D,
  frameTimeSec: number,
): Promise<boolean> {
  const product = resolveNexradProduct(frameTimeSec);
  if (!product) return false;

  const tiles: { x: number; y: number }[] = [];
  for (let y = NEXRAD_US_BOUNDS_Z5.yMin; y <= NEXRAD_US_BOUNDS_Z5.yMax; y++) {
    for (let x = NEXRAD_US_BOUNDS_Z5.xMin; x <= NEXRAD_US_BOUNDS_Z5.xMax; x++) {
      tiles.push({ x, y });
    }
  }

  const tasks = tiles.map((t) => {
    const url = getNexradTileUrl(product, NEXRAD_ZOOM, t.x, t.y);
    return () => loadImageWithRetry(url);
  });
  const results = await loadInBatches(tasks, TILE_BATCH_SIZE);
  let drew = false;
  results.forEach((result, i) => {
    if (result.status !== "fulfilled") return;
    const tile = tiles[i];
    ctx.drawImage(
      result.value,
      tile.x * NEXRAD_TILE_SCALE,
      tile.y * NEXRAD_TILE_SCALE,
      NEXRAD_TILE_SCALE,
      NEXRAD_TILE_SCALE,
    );
    drew = true;
  });
  return drew;
}

/**
 * Load global RainViewer tiles for a frame and composite onto an equirect
 * canvas. Optionally layers higher-fidelity IEM NEXRAD over CONUS.
 */
export async function compositeRadarTilesForFrame(
  manifest: RadarManifest,
  frame: { time: number; path: string },
  includeNexrad: boolean,
): Promise<{ canvas: HTMLCanvasElement; hasNexrad: boolean }> {
  const mercator = document.createElement("canvas");
  mercator.width = RADAR_CANVAS_SIZE;
  mercator.height = RADAR_CANVAS_SIZE;
  const ctx = mercator.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");

  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < TILES_PER_AXIS; y++) {
    for (let x = 0; x < TILES_PER_AXIS; x++) {
      tiles.push({ x, y });
    }
  }

  const tasks = tiles.map((t) => {
    const url = getRadarTileUrlForFrame(
      manifest,
      frame,
      ZOOM_LEVEL,
      t.x,
      t.y,
      TILE_SIZE as 256 | 512,
    );
    return () => loadImageWithRetry(url);
  });

  const results = await loadInBatches(tasks, TILE_BATCH_SIZE);
  const tilesTotal = tiles.length;
  const loadedTileCount = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  if (loadedTileCount === 0) {
    throw new Error("RainViewer returned no usable radar tiles");
  }

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      const tile = tiles[i];
      ctx.drawImage(
        result.value,
        tile.x * TILE_SIZE,
        tile.y * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  });

  if (loadedTileCount < tilesTotal) {
    throw new Error(
      `Incomplete radar tile coverage: ${loadedTileCount}/${tilesTotal}`,
    );
  }

  const hasNexrad = includeNexrad
    ? await compositeNexradOverlay(ctx, frame.time)
    : false;

  const canvas = document.createElement("canvas");
  canvas.width = RADAR_CANVAS_SIZE;
  canvas.height = RADAR_CANVAS_SIZE;
  const eqCtx = canvas.getContext("2d", { willReadFrequently: true });
  if (!eqCtx) throw new Error("Failed to get 2d context");
  drawMercatorAsEquirect(eqCtx, mercator, RADAR_CANVAS_SIZE, RADAR_CANVAS_SIZE);
  boostRadarColors(eqCtx, RADAR_CANVAS_SIZE, RADAR_CANVAS_SIZE);
  return { canvas, hasNexrad };
}
