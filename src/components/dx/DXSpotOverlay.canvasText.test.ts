import { afterEach, expect, it, vi } from "vitest";
import { drawDXSpots } from "./DXSpotOverlay";
import type { DXSpot } from "@/types/dxcluster";

afterEach(() => vi.restoreAllMocks());
it.each([16, 18, 20, 32])(
  "scales both canvas tooltip rows and their containing box at root %ipx",
  (rootFont) => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: `${rootFont}px`,
    } as CSSStyleDeclaration);
    let font = "";
    const rows: Array<{ font: string; y: number }> = [];
    const boxes: Array<{ y: number; height: number }> = [];
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "font"
            ? font
            : key === "measureText"
              ? (text: string) => ({ width: text.length * rootFont })
              : key === "fillText"
                ? (_text: string, _x: number, y: number) =>
                    rows.push({ font, y })
                : key === "fillRect"
                  ? (_x: number, y: number, _w: number, height: number) =>
                      boxes.push({ y, height })
                  : () => {},
        set: (_target, key, value) => {
          if (key === "font") font = value;
          return true;
        },
      },
    ) as CanvasRenderingContext2D;
    const spot = {
      id: "fixture",
      dx: "W0TEST",
      dxLat: 10,
      dxLon: 10,
      frequency: 14074,
      mode: "FT8",
      band: "20m",
    } as DXSpot;
    drawDXSpots(ctx, [spot], spot);
    expect(rows).toHaveLength(2);
    const size = rootFont * 0.75;
    for (const row of rows) {
      expect(row.font).toContain(`${size}px`);
      expect(row.y - size).toBeGreaterThanOrEqual(boxes[0].y);
      expect(row.y).toBeLessThan(boxes[0].y + boxes[0].height);
    }
    expect(rows[1].y - size).toBeGreaterThan(rows[0].y);
  },
);
