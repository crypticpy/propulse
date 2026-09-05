import { describe, expect, it } from "vitest";

import {
  centeredOffsets,
  clampMapOffsets,
  computeFlatMapLayout,
  preservedCenterOffsets,
  preserveFlatMapCamera,
} from "./flatMapLayout";

describe("computeFlatMapLayout", () => {
  it("letterbox mode: map and viewport are the same fitted box", () => {
    const layout = computeFlatMapLayout(1000, 700, false, 2);
    expect(layout.map).toEqual({ width: 1000, height: 500 });
    expect(layout.viewport).toEqual({ width: 1000, height: 500 });
  });

  it("fillContainer, portrait: viewport is the container, map covers it at 2:1", () => {
    const layout = computeFlatMapLayout(390, 600, true, 2);
    expect(layout.viewport).toEqual({ width: 390, height: 600 });
    expect(layout.map).toEqual({ width: 1200, height: 600 });
  });

  it("fillContainer, wide: map spans the width and crops the poles", () => {
    const layout = computeFlatMapLayout(1920, 800, true, 2);
    expect(layout.viewport).toEqual({ width: 1920, height: 800 });
    expect(layout.map).toEqual({ width: 1920, height: 960 });
  });

  it("fillContainer never produces a map box smaller than the viewport", () => {
    for (const [w, h] of [
      [300, 150],
      [1001, 500],
      [640, 641],
      [2560, 1440],
    ]) {
      const { map, viewport } = computeFlatMapLayout(w, h, true, 2);
      expect(map.width).toBeGreaterThanOrEqual(viewport.width);
      expect(map.height).toBeGreaterThanOrEqual(viewport.height);
      expect(map.width).toBe(map.height * 2);
    }
  });
});

describe("preserveFlatMapCamera", () => {
  it("keeps regional geography the same size when a sidebar changes width", () => {
    const before = computeFlatMapLayout(1600, 600, true, 2);
    const after = computeFlatMapLayout(1200, 600, true, 2);
    const zoom = { scale: 2, offsetX: -600, offsetY: -300 };
    const result = preserveFlatMapCamera(before, after, zoom);
    expect(after.map.width * result.scale).toBeCloseTo(
      before.map.width * zoom.scale,
    );
    expect(
      (after.viewport.width / 2 - result.offsetX) /
        (after.map.width * result.scale),
    ).toBeCloseTo(
      (before.viewport.width / 2 - zoom.offsetX) /
        (before.map.width * zoom.scale),
    );
    expect(preserveFlatMapCamera(after, before, result)).toEqual(zoom);
  });

  it("does not drift through repeated resize notifications at a fixed viewport", () => {
    const layout = computeFlatMapLayout(3320, 2094, true, 2);
    const original = { scale: 3, offsetX: -3000, offsetY: -1500 };
    let zoom = original;
    for (let i = 0; i < 100; i++)
      zoom = preserveFlatMapCamera(layout, layout, zoom);
    expect(zoom.scale).toBe(original.scale);
    expect(zoom.offsetX).toBeCloseTo(original.offsetX);
    expect(zoom.offsetY).toBeCloseTo(original.offsetY);
  });

  it("respects zoom and pan limits when the whole world must cover a larger viewport", () => {
    const before = computeFlatMapLayout(600, 300, true, 2);
    const after = computeFlatMapLayout(1200, 600, true, 2);
    expect(
      preserveFlatMapCamera(before, after, {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }),
    ).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});

describe("clampMapOffsets", () => {
  it("matches the classic -(scale-1)×size bound when map equals viewport", () => {
    const layout = computeFlatMapLayout(1000, 500, false, 2);
    expect(clampMapOffsets(layout, 1, -50, 50)).toEqual({
      offsetX: 0,
      offsetY: 0,
    });
    expect(clampMapOffsets(layout, 2, -5000, -5000)).toEqual({
      offsetX: -1000,
      offsetY: -500,
    });
  });

  it("lets a cropped map pan across its hidden margin at scale 1", () => {
    const layout = computeFlatMapLayout(390, 600, true, 2);
    // Map is 1200 wide in a 390 viewport: the left edge may sit anywhere
    // from 0 (west edge flush) to -810 (east edge flush).
    expect(clampMapOffsets(layout, 1, 100, 0).offsetX).toBe(0);
    expect(clampMapOffsets(layout, 1, -5000, 0).offsetX).toBe(-810);
    expect(clampMapOffsets(layout, 1, -405, 0).offsetX).toBe(-405);
    expect(clampMapOffsets(layout, 1, 0, -20).offsetY).toBe(0);
  });
});

describe("centeredOffsets", () => {
  it("is the origin when map equals viewport", () => {
    const layout = computeFlatMapLayout(1000, 500, false, 2);
    expect(centeredOffsets(layout, 1)).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("centers the crop and stays inside the clamp", () => {
    const layout = computeFlatMapLayout(390, 600, true, 2);
    const rest = centeredOffsets(layout, 1);
    expect(rest).toEqual({ offsetX: -405, offsetY: 0 });
    expect(clampMapOffsets(layout, 1, rest.offsetX, rest.offsetY)).toEqual(
      rest,
    );
  });
});

describe("preservedCenterOffsets", () => {
  it("is a fixed point when nothing changes", () => {
    const layout = computeFlatMapLayout(390, 600, true, 2);
    const zoom = { scale: 1, ...centeredOffsets(layout, 1) };
    expect(preservedCenterOffsets(layout, layout, zoom)).toEqual({
      offsetX: zoom.offsetX,
      offsetY: zoom.offsetY,
    });
  });

  it("keeps the same longitude under the viewport center across a rotate", () => {
    const portrait = computeFlatMapLayout(390, 600, true, 2);
    const landscape = computeFlatMapLayout(600, 390, true, 2);
    // Pan so that 25% across the map (lon -90) sits under the center.
    const zoom = {
      scale: 1,
      offsetX: portrait.viewport.width / 2 - 0.25 * portrait.map.width,
      offsetY: 0,
    };
    const next = preservedCenterOffsets(portrait, landscape, zoom);
    const centerU =
      (landscape.viewport.width / 2 - next.offsetX) / landscape.map.width;
    expect(centerU).toBeCloseTo(0.25, 10);
  });
});
