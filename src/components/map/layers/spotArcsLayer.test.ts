/**
 * spotArcsLayer -- shared spot-arc geometry and draw code (#1247). Modeled
 * on `terminatorLayer.test.ts`'s hand-rolled recording ctx and fake
 * `Projection` builders, extended with `arc`/`rect`/`fill`/`globalAlpha`
 * tracking since spot arcs draw glyphs and vary opacity per-arc.
 */
import { describe, expect, it, vi } from "vitest";
import {
  drawSpotArcsLayer,
  spotArcSegments,
  SPOT_ARC_SELECTED_COLOR,
  SPOT_ARC_SELECTED_GLOW_COLOR,
} from "./spotArcsLayer";
import type { SpotArcInput, SpotArcsLayerStyle } from "./spotArcsLayer";
import { createEquirectangularProjection } from "@/lib/map/projection";
import type {
  AzimuthalProjection,
  EquirectangularProjection,
} from "@/lib/map/projection";

interface RecordedStroke {
  globalAlpha: number;
  strokeStyle: string;
  lineWidth: number;
}
interface RecordedFill {
  globalAlpha: number;
  fillStyle: string;
}
interface RecordedShape {
  name: "arc" | "rect";
}

function createMockCtx() {
  const ops: string[] = [];
  const strokes: RecordedStroke[] = [];
  const fills: RecordedFill[] = [];
  const shapes: RecordedShape[] = [];
  const ctx = {
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "",
    shadowColor: "",
    shadowBlur: 0,
    save: vi.fn(() => ops.push("save")),
    restore: vi.fn(() => ops.push("restore")),
    beginPath: vi.fn(() => ops.push("beginPath")),
    moveTo: vi.fn(() => ops.push("moveTo")),
    lineTo: vi.fn(() => ops.push("lineTo")),
    arc: vi.fn(() => {
      shapes.push({ name: "arc" });
      ops.push("arc");
    }),
    rect: vi.fn(() => {
      shapes.push({ name: "rect" });
      ops.push("rect");
    }),
    stroke: vi.fn(() => {
      strokes.push({
        globalAlpha: ctx.globalAlpha as number,
        strokeStyle: ctx.strokeStyle as string,
        lineWidth: ctx.lineWidth as number,
      });
      ops.push("stroke");
    }),
    fill: vi.fn(() => {
      fills.push({
        globalAlpha: ctx.globalAlpha as number,
        fillStyle: ctx.fillStyle as string,
      });
      ops.push("fill");
    }),
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    strokes,
    fills,
    shapes,
  };
}

function fakeFlatProjection(
  overrides: Partial<EquirectangularProjection> = {},
): EquirectangularProjection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1000,
    wrapHeight: 500,
    discRadiusPx: undefined,
    discCenterPx: undefined,
    project: (lat, lon) => ({
      x: ((lon + 180) / 360) * 1000,
      y: ((90 - lat) / 180) * 500,
      visible: true,
    }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  };
}

function fakeAzimuthalProjection(
  overrides: Partial<AzimuthalProjection> = {},
): AzimuthalProjection {
  return {
    kind: "azimuthal",
    zoomScale: 1,
    wrapWidth: undefined,
    wrapHeight: undefined,
    discRadiusPx: 100,
    discCenterPx: { x: 100, y: 100 },
    project: (lat, lon) => ({ x: lon, y: lat, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  };
}

function makeArc(overrides: Partial<SpotArcInput> = {}): SpotArcInput {
  return {
    id: "spot-1",
    from: { lat: 10, lon: 10 },
    to: { lat: -10, lon: 20 },
    colour: "#00ff00",
    isWatched: true,
    ageOpacity: 1,
    ...overrides,
  };
}

function baseStyle(
  overrides: Partial<SpotArcsLayerStyle> = {},
): SpotArcsLayerStyle {
  return {
    highViz: false,
    spotDotScale: 1,
    watchDimming: false,
    ageFade: false,
    ...overrides,
  };
}

describe("spotArcSegments", () => {
  it("grows the step count with arc length, with an 8-sample floor", () => {
    const projection = fakeFlatProjection();
    const shortSegments = spotArcSegments(0, 0, 0, 1, projection);
    const longSegments = spotArcSegments(0, 0, 0, 170, projection);

    expect(shortSegments.length).toBe(1);
    expect(shortSegments[0].length).toBe(9); // 8-step floor + 1
    expect(longSegments.length).toBe(1);
    expect(longSegments[0].length).toBeGreaterThan(shortSegments[0].length);
  });

  it("returns the same segments reference on a cache hit (equirectangular)", () => {
    const projection = fakeFlatProjection();
    const first = spotArcSegments(10, 20, -10, 30, projection);
    const second = spotArcSegments(10, 20, -10, 30, projection);
    expect(second).toBe(first);

    const different = spotArcSegments(11, 20, -10, 30, projection);
    expect(different).not.toBe(first);
  });

  it("splits the path across the antimeridian on the flat projection", () => {
    const projection = createEquirectangularProjection({
      width: 1000,
      height: 500,
      zoomScale: 1,
    });
    const segments = spotArcSegments(0, 170, 0, -170, projection);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    // Every emitted segment stays within one canvas width -- no wrapped chord.
    for (const segment of segments) {
      for (const point of segment) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("breaks into a new sub-path when a sample exits the visible rim (azimuthal)", () => {
    const projection = fakeAzimuthalProjection({
      project: (lat, lon) => ({ x: lon, y: lat, visible: Math.abs(lon) >= 20 }),
    });
    const segments = spotArcSegments(0, -60, 0, 60, projection);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const segment of segments) {
      for (const point of segment) {
        expect(Math.abs(point.x)).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe("drawSpotArcsLayer -- normal arcs", () => {
  it("scales the stroke width by screenPx and uses the arc's colour", () => {
    const { ctx, strokes } = createMockCtx();
    const projection = fakeFlatProjection({ screenPx: (px) => px / 2 });
    drawSpotArcsLayer(
      ctx,
      projection,
      [makeArc({ colour: "#123456" })],
      baseStyle({ highViz: false }),
    );
    expect(strokes[0].lineWidth).toBeCloseTo(1.5 / 2);
    expect(strokes[0].strokeStyle).toBe("#123456");
  });

  it("uses the highViz-scaled width when highViz is on", () => {
    const { ctx, strokes } = createMockCtx();
    const projection = fakeFlatProjection({ screenPx: (px) => px / 2 });
    drawSpotArcsLayer(
      ctx,
      projection,
      [makeArc()],
      baseStyle({ highViz: true }),
    );
    expect(strokes[0].lineWidth).toBeCloseTo(3 / 2);
  });

  it("dims an unmatched arc to 0.3 alpha only while watch dimming is active", () => {
    const { ctx, strokes } = createMockCtx();
    const projection = fakeFlatProjection();
    const watched = makeArc({ id: "watched", isWatched: true });
    const unmatched = makeArc({ id: "unmatched", isWatched: false });
    // Each arc emits 3 strokes (path, RX ring, TX ring); index 0 of each
    // arc's triplet is the arc-path stroke this assertion cares about.

    drawSpotArcsLayer(
      ctx,
      projection,
      [watched, unmatched],
      baseStyle({ watchDimming: true }),
    );
    expect(strokes[0].globalAlpha).toBe(1);
    expect(strokes[3].globalAlpha).toBeCloseTo(0.3);

    strokes.length = 0;
    drawSpotArcsLayer(
      ctx,
      projection,
      [watched, unmatched],
      baseStyle({ watchDimming: false }),
    );
    expect(strokes[0].globalAlpha).toBe(1);
    expect(strokes[3].globalAlpha).toBe(1);
  });

  it("applies ageOpacity only when ageFade is on", () => {
    const { ctx, strokes } = createMockCtx();
    const projection = fakeFlatProjection();
    const arc = makeArc({ ageOpacity: 0.4 });

    drawSpotArcsLayer(ctx, projection, [arc], baseStyle({ ageFade: false }));
    expect(strokes[0].globalAlpha).toBe(1);

    strokes.length = 0;
    drawSpotArcsLayer(ctx, projection, [arc], baseStyle({ ageFade: true }));
    expect(strokes[0].globalAlpha).toBeCloseTo(0.4);
  });

  it("draws the RX endpoint as a rect and the TX endpoint as an arc (filled + ring)", () => {
    const { ctx, shapes } = createMockCtx();
    const projection = fakeFlatProjection();
    drawSpotArcsLayer(ctx, projection, [makeArc()], baseStyle());
    expect(shapes.filter((s) => s.name === "rect")).toHaveLength(1);
    // TX draws twice: filled circle, then a white ring -- both `arc()` calls.
    expect(shapes.filter((s) => s.name === "arc")).toHaveLength(2);
  });

  it("skips the DX (TX) endpoint glyph for a grouped member", () => {
    const { ctx, shapes } = createMockCtx();
    const projection = fakeFlatProjection();
    drawSpotArcsLayer(
      ctx,
      projection,
      [makeArc({ skipDxEndpoint: true })],
      baseStyle(),
    );
    expect(shapes.filter((s) => s.name === "arc")).toHaveLength(0);
    expect(shapes.filter((s) => s.name === "rect")).toHaveLength(1);
  });

  it("skips the spotter (RX) endpoint glyph when requested", () => {
    const { ctx, shapes } = createMockCtx();
    const projection = fakeFlatProjection();
    drawSpotArcsLayer(
      ctx,
      projection,
      [makeArc({ skipSpotterEndpoint: true })],
      baseStyle(),
    );
    expect(shapes.filter((s) => s.name === "rect")).toHaveLength(0);
    expect(shapes.filter((s) => s.name === "arc")).toHaveLength(2);
  });
});

describe("drawSpotArcsLayer -- selected arc", () => {
  it("strokes the glow pass (width 6, damped) then the main pass (width 3, damped)", () => {
    const { ctx, strokes } = createMockCtx();
    const projection = fakeFlatProjection({ screenPx: (px) => px / 2 });
    drawSpotArcsLayer(
      ctx,
      projection,
      [makeArc({ selected: true })],
      baseStyle(),
    );
    expect(strokes[0].strokeStyle).toBe(SPOT_ARC_SELECTED_GLOW_COLOR);
    expect(strokes[0].lineWidth).toBeCloseTo(6 / 2);
    expect(strokes[1].strokeStyle).toBe(SPOT_ARC_SELECTED_COLOR);
    expect(strokes[1].lineWidth).toBeCloseTo(3 / 2);
  });
});
