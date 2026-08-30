import { describe, expect, it, vi } from "vitest";

import {
  MAX_MERCATOR_LAT,
  drawMercatorAsEquirect,
  latForEquirectRow,
  mercatorRowForLat,
} from "./mercatorReproject";

describe("mercatorRowForLat", () => {
  it("puts the equator at the vertical center", () => {
    expect(mercatorRowForLat(0, 1024)).toBeCloseTo(512, 9);
  });

  it("puts the Mercator limits at the image edges", () => {
    expect(mercatorRowForLat(MAX_MERCATOR_LAT, 1024)).toBeCloseTo(0, 3);
    expect(mercatorRowForLat(-MAX_MERCATOR_LAT, 1024)).toBeCloseTo(1024, 3);
  });

  it("is symmetric and increases as latitude falls", () => {
    const north = mercatorRowForLat(45, 1024);
    const south = mercatorRowForLat(-45, 1024);
    expect(north + south).toBeCloseTo(1024, 9);
    expect(mercatorRowForLat(60, 1024)).toBeLessThan(north);
  });

  it("places 40°N far below its linear (equirect) row", () => {
    // Mercator puts 40°N at row ~388 of 1024, while the sphere's linear ±90°
    // UVs would read that row as ~21.8°N — draped without resampling, US
    // mid-latitude radar lands over the Gulf of Mexico.
    expect(mercatorRowForLat(40, 1024)).toBeCloseTo(387.67, 1);
    expect(latForEquirectRow(mercatorRowForLat(40, 1024), 1024)).toBeCloseTo(
      21.8,
      0,
    );
  });
});

describe("latForEquirectRow", () => {
  it("maps the top to +90 and the bottom to -90", () => {
    expect(latForEquirectRow(0, 1024)).toBe(90);
    expect(latForEquirectRow(1024, 1024)).toBe(-90);
    expect(latForEquirectRow(512, 1024)).toBe(0);
  });
});

describe("drawMercatorAsEquirect", () => {
  function fakeContext() {
    const calls: number[][] = [];
    const ctx = {
      drawImage: vi.fn((...args: unknown[]) => {
        calls.push(args.slice(1) as number[]);
      }),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  it("skips the polar rows that have no Mercator source", () => {
    const { ctx, calls } = fakeContext();
    const src = { width: 1024, height: 1024 } as HTMLCanvasElement;
    drawMercatorAsEquirect(ctx, src, 1024, 1024);
    // ±85.05° of ±90° → (90 − 85.05) / 180 × 1024 ≈ 28 rows blank per pole.
    const drawnRows = calls.map((c) => c[5]);
    expect(Math.min(...drawnRows)).toBe(28);
    expect(Math.max(...drawnRows)).toBe(995);
  });

  it("covers the Mercator source contiguously from top to bottom", () => {
    const { ctx, calls } = fakeContext();
    const src = { width: 512, height: 512 } as HTMLCanvasElement;
    drawMercatorAsEquirect(ctx, src, 512, 512);
    // Each strip [y0, y0+h) must start where the previous one ended.
    for (let i = 1; i < calls.length; i++) {
      const [, prevY0, , prevH] = calls[i - 1];
      const [, y0] = calls[i];
      expect(y0).toBeCloseTo(prevY0 + prevH, 9);
    }
    const [, firstY0] = calls[0];
    const [, lastY0, , lastH] = calls[calls.length - 1];
    expect(firstY0).toBeCloseTo(0, 3);
    expect(lastY0 + lastH).toBeCloseTo(512, 3);
  });

  it("draws equator rows from ~half-pixel strips and high-latitude rows from taller strips", () => {
    const { ctx, calls } = fakeContext();
    const src = { width: 1024, height: 1024 } as HTMLCanvasElement;
    drawMercatorAsEquirect(ctx, src, 1024, 1024);
    const stripHeightAtRow = (row: number) =>
      calls.find((c) => c[5] === row)![3];
    expect(stripHeightAtRow(512)).toBeLessThan(0.6);
    expect(stripHeightAtRow(100)).toBeGreaterThan(1.5);
  });
});
