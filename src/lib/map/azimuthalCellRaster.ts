/**
 * Rasterize overlay probability cells for the azimuthal view.
 *
 * The azimuthal equidistant projection distorts lat/lon rectangles far from
 * the center so severely that drawing a cell as a straight-edged polygon of
 * its projected corners is wrong: cells near the antipode sweep across the
 * entire disk. Instead we sample per pixel — build a 1°×1° color lookup from
 * the cells, then inverse-project each disk pixel to lat/lon and read the
 * lookup. This is exact everywhere, including the antipode annulus.
 */

import { azimuthalUnproject } from "@/lib/utils/azimuthal";
import type { OverlayCell } from "@/types/mapOverlays";

export const CELL_LUT_WIDTH = 360;
export const CELL_LUT_HEIGHT = 180;

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

function lutIndex(lat: number, lon: number): number {
  const col =
    ((Math.floor(lon + 180) % CELL_LUT_WIDTH) + CELL_LUT_WIDTH) %
    CELL_LUT_WIDTH;
  const row = Math.min(
    CELL_LUT_HEIGHT - 1,
    Math.max(0, Math.floor(90 - lat)),
  );
  return (row * CELL_LUT_WIDTH + col) * 4;
}

/**
 * Paint cells into a 360×180 RGBA lookup (1° resolution, row 0 = north).
 * Later cells overwrite earlier ones, matching canvas draw-order semantics.
 */
export function buildCellColorLut(cells: OverlayCell[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(CELL_LUT_WIDTH * CELL_LUT_HEIGHT * 4);
  for (const cell of cells) {
    const rgb = parseHexColor(cell.color);
    if (!rgb) continue;
    const alpha = Math.round(
      255 * Math.max(0, Math.min(1, cell.opacity ?? 0.45)),
    );
    const columns = Math.max(1, Math.round(cell.widthDeg));
    const rows = Math.max(1, Math.round(cell.heightDeg));
    const firstCol = Math.round(cell.lon - cell.widthDeg / 2 + 180);
    const firstRow = Math.round(90 - (cell.lat + cell.heightDeg / 2));
    for (let dr = 0; dr < rows; dr++) {
      const row = firstRow + dr;
      if (row < 0 || row >= CELL_LUT_HEIGHT) continue;
      for (let dc = 0; dc < columns; dc++) {
        const col =
          (((firstCol + dc) % CELL_LUT_WIDTH) + CELL_LUT_WIDTH) %
          CELL_LUT_WIDTH;
        const index = (row * CELL_LUT_WIDTH + col) * 4;
        lut[index] = rgb[0];
        lut[index + 1] = rgb[1];
        lut[index + 2] = rgb[2];
        lut[index + 3] = alpha;
      }
    }
  }
  return lut;
}

export interface AzimuthalRasterOptions {
  /** Square output size in pixels (canvas width and height). */
  sizePx: number;
  /** Disk center in pixels (canvas CENTER). */
  centerPx: number;
  /** Disk radius in pixels (canvas RADIUS). */
  radiusPx: number;
  centerLat: number;
  centerLon: number;
}

/**
 * Render the cell lookup as an azimuthal-equidistant RGBA raster.
 * Pixels outside the projection disk stay fully transparent.
 */
export function renderAzimuthalCellRaster(
  lut: Uint8ClampedArray,
  options: AzimuthalRasterOptions,
): Uint8ClampedArray {
  const { sizePx, centerPx, radiusPx, centerLat, centerLon } = options;
  const data = new Uint8ClampedArray(sizePx * sizePx * 4);
  for (let py = 0; py < sizePx; py++) {
    const ny = (py + 0.5 - centerPx) / radiusPx;
    for (let px = 0; px < sizePx; px++) {
      const nx = (px + 0.5 - centerPx) / radiusPx;
      if (nx * nx + ny * ny > 1) continue;
      const { lat, lon } = azimuthalUnproject(nx, ny, centerLat, centerLon);
      const source = lutIndex(lat, lon);
      if (lut[source + 3] === 0) continue;
      const target = (py * sizePx + px) * 4;
      data[target] = lut[source];
      data[target + 1] = lut[source + 1];
      data[target + 2] = lut[source + 2];
      data[target + 3] = lut[source + 3];
    }
  }
  return data;
}
