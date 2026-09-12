import { describe, expect, it } from "vitest";
import {
  clampZoom,
  clientToViewBox,
  FIT_ZOOM,
  panAfterZoomAt,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./canvasViewport";

describe("canvasViewport", () => {
  it("clamps zoom to the existing builder limits", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });

  it("maps a 100px pan on a narrow viewport into viewBox units, not CSS pixels", () => {
    const viewport = { left: 0, top: 0, width: 400, height: 300 };
    const viewBox = { width: 1020, height: 300 };
    const origin = clientToViewBox(0, 0, viewport, viewBox);
    const moved = clientToViewBox(100, 0, viewport, viewBox);
    expect(moved.x - origin.x).toBeCloseTo(100 * (1020 / 400));
    expect(moved.x - origin.x).not.toBe(100);
  });

  it("keeps the cursor anchored when zooming around a point", () => {
    const cursor = { x: 200, y: 80 };
    const prevPan = { x: 10, y: 4 };
    const next = panAfterZoomAt(cursor, prevPan, 1.1);
    expect(next.x).toBeCloseTo(cursor.x - 1.1 * (cursor.x - prevPan.x));
    expect(next.y).toBeCloseTo(cursor.y - 1.1 * (cursor.y - prevPan.y));
  });

  it("Fit is identity zoom — viewBox already fitted the path once", () => {
    expect(FIT_ZOOM).toBe(1);
    const containerWidth = 400;
    const svgWidth = 1020;
    expect(FIT_ZOOM).not.toBe(Math.min(containerWidth / svgWidth, 1));
  });
});
