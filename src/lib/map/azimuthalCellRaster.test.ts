import { describe, expect, it } from "vitest";
import {
  CELL_LUT_HEIGHT,
  CELL_LUT_WIDTH,
  buildCellColorLut,
  renderAzimuthalCellRaster,
} from "./azimuthalCellRaster";
import type { OverlayCell } from "@/types/mapOverlays";

function cell(overrides: Partial<OverlayCell>): OverlayCell {
  return {
    id: "cell",
    lat: 0,
    lon: 0,
    widthDeg: 20,
    heightDeg: 10,
    color: "#22c55e",
    opacity: 0.5,
    ...overrides,
  };
}

function lutPixel(
  lut: Uint8ClampedArray,
  lat: number,
  lon: number,
): number[] {
  const col = (((Math.floor(lon + 180) % 360) + 360) % 360);
  const row = Math.min(179, Math.max(0, Math.floor(90 - lat)));
  const index = (row * CELL_LUT_WIDTH + col) * 4;
  return Array.from(lut.slice(index, index + 4));
}

describe("buildCellColorLut", () => {
  it("paints a cell's rectangle and leaves the rest transparent", () => {
    const lut = buildCellColorLut([cell({ lat: 5, lon: 10 })]);
    expect(lut).toHaveLength(CELL_LUT_WIDTH * CELL_LUT_HEIGHT * 4);
    expect(lutPixel(lut, 5, 10)).toEqual([0x22, 0xc5, 0x5e, 128]);
    expect(lutPixel(lut, 9.5, 0.5)).toEqual([0x22, 0xc5, 0x5e, 128]);
    expect(lutPixel(lut, 11, 10)).toEqual([0, 0, 0, 0]);
    expect(lutPixel(lut, 5, 21)).toEqual([0, 0, 0, 0]);
  });

  it("lets later cells overwrite earlier ones like canvas draw order", () => {
    const lut = buildCellColorLut([
      cell({ color: "#dc2626", opacity: 1 }),
      cell({ color: "#06b6d4", opacity: 1 }),
    ]);
    expect(lutPixel(lut, 0, 0)).toEqual([0x06, 0xb6, 0xd4, 255]);
  });

  it("wraps cells across the antimeridian", () => {
    const lut = buildCellColorLut([cell({ lat: 0, lon: 170, widthDeg: 40 })]);
    expect(lutPixel(lut, 0, 175)).toEqual([0x22, 0xc5, 0x5e, 128]);
    expect(lutPixel(lut, 0, -175)).toEqual([0x22, 0xc5, 0x5e, 128]);
    expect(lutPixel(lut, 0, 140)).toEqual([0, 0, 0, 0]);
  });

  it("skips cells with unparseable colors", () => {
    const lut = buildCellColorLut([cell({ color: "not-a-color" })]);
    expect(lutPixel(lut, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe("renderAzimuthalCellRaster", () => {
  const options = {
    sizePx: 100,
    centerPx: 50,
    radiusPx: 40,
    centerLat: 25,
    centerLon: -80,
  };

  function pixel(data: Uint8ClampedArray, x: number, y: number): number[] {
    const index = (y * options.sizePx + x) * 4;
    return Array.from(data.slice(index, index + 4));
  }

  it("paints the disk center from the cell covering the QTH", () => {
    const lut = buildCellColorLut([
      cell({ lat: 25, lon: -80, color: "#06b6d4", opacity: 1 }),
    ]);
    const data = renderAzimuthalCellRaster(lut, options);
    expect(pixel(data, 50, 50)).toEqual([0x06, 0xb6, 0xd4, 255]);
  });

  it("keeps an antipodal cell out of the disk center", () => {
    // Antipode of (25, -80) is (-25, 100): it must paint only near the rim.
    const lut = buildCellColorLut([
      cell({ lat: -25, lon: 100, color: "#dc2626", opacity: 1 }),
    ]);
    const data = renderAzimuthalCellRaster(lut, options);
    expect(pixel(data, 50, 50)).toEqual([0, 0, 0, 0]);
    expect(pixel(data, 50, 30)).toEqual([0, 0, 0, 0]);
    const rim: number[][] = [];
    for (let y = 0; y < options.sizePx; y++) {
      for (let x = 0; x < options.sizePx; x++) {
        const value = pixel(data, x, y);
        if (value[3] > 0) rim.push([x, y]);
      }
    }
    expect(rim.length).toBeGreaterThan(0);
    for (const [x, y] of rim) {
      const r = Math.hypot(x + 0.5 - 50, y + 0.5 - 50) / 40;
      expect(r).toBeGreaterThan(0.8);
    }
  });

  it("leaves pixels outside the projection disk transparent", () => {
    const lut = buildCellColorLut([cell({ opacity: 1 })]);
    const data = renderAzimuthalCellRaster(lut, options);
    expect(pixel(data, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(data, 99, 50)).toEqual([0, 0, 0, 0]);
  });
});
