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
  args: number[];
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
    arc: vi.fn((...args: number[]) => {
      shapes.push({ name: "arc", args });
      ops.push("arc");
    }),
    rect: vi.fn((...args: number[]) => {
      shapes.push({ name: "rect", args });
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

  it("floors the azimuthal branch at 32 samples, higher than the flat map's 8 (#1247 item 2)", () => {
    const projection = fakeAzimuthalProjection();
    const shortSegments = spotArcSegments(0, 0, 0, 1, projection);

    expect(shortSegments.length).toBe(1);
    expect(shortSegments[0].length).toBe(33); // 32-step floor + 1
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

describe("spotArcSegments (ported from the deleted flatSpotPath.test.ts, #1247 item 10)", () => {
  it("keeps equatorial paths straight and follows a spherical plane for ordinary paths", () => {
    const projection = createEquirectangularProjection({
      width: 360,
      height: 180,
      zoomScale: 1,
    });
    const equator = spotArcSegments(0, -60, 0, 60, projection);
    expect(equator).toHaveLength(1);
    for (const point of equator[0]) expect(point.y).toBeCloseTo(90, 10);

    const path = spotArcSegments(40, -74, 51, 0, projection)[0];
    expect(path[0]).toEqual({ x: 106, y: 50 });
    expect(path.at(-1)).toEqual({ x: 180, y: 39 });

    const vector = (lat: number, lon: number) => {
      const a = (lat * Math.PI) / 180;
      const b = (lon * Math.PI) / 180;
      return [
        Math.cos(a) * Math.cos(b),
        Math.cos(a) * Math.sin(b),
        Math.sin(a),
      ];
    };
    const a = vector(40, -74);
    const b = vector(51, 0);
    const normal = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    for (const point of path) {
      const v = vector(90 - point.y, point.x - 180);
      expect(v.reduce((sum, n, i) => sum + n * normal[i], 0)).toBeCloseTo(
        0,
        10,
      );
    }

    const south = spotArcSegments(-35, -50, -35, 50, projection)[0];
    expect(Math.max(...south.map((p) => p.y))).toBeGreaterThan(130);
  });

  it.each([
    [20, 170, 40, -170],
    [40, -170, 20, 170],
  ])(
    "splits date-line crossings at matching map edges (%s)",
    (lat1, lon1, lat2, lon2) => {
      const projection = createEquirectangularProjection({
        width: 360,
        height: 180,
        zoomScale: 1,
      });
      const segments = spotArcSegments(lat1, lon1, lat2, lon2, projection);
      expect(segments).toHaveLength(2);
      expect(Math.abs(segments[0].at(-1)!.x - segments[1][0].x)).toBe(360);
      expect(segments[0].at(-1)!.y).toBe(segments[1][0].y);
      for (const segment of segments)
        for (let i = 1; i < segment.length; i++)
          expect(Math.abs(segment[i].x - segment[i - 1].x)).toBeLessThanOrEqual(
            180,
          );
    },
  );

  it.each([
    [0, 180, 0, -180],
    [30, 10, 30, 10],
    [0, 0, 0, 180],
    [90, 0, -90, 180],
    [20, 180, 40, -180],
    [89.9, -90, 89.9, 90],
  ])(
    "keeps degenerate/polar paths finite and on canvas (%s)",
    (lat1, lon1, lat2, lon2) => {
      const projection = createEquirectangularProjection({
        width: 1920,
        height: 1080,
        zoomScale: 1,
      });
      const segments = spotArcSegments(lat1, lon1, lat2, lon2, projection);
      expect(segments.length).toBeGreaterThan(0);
      for (const point of segments.flat()) {
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(-1e-8);
        expect(point.x).toBeLessThanOrEqual(1920 + 1e-8);
        expect(point.y).toBeGreaterThanOrEqual(-1e-8);
        expect(point.y).toBeLessThanOrEqual(1080 + 1e-8);
      }
    },
  );

  it.each([
    [80, 0, 80, 180, 0],
    [-80, 0, -80, 180, 180],
    [45, -90, 30, 90, 0],
  ])(
    "splits opposite meridians at the pole boundary (%s)",
    (lat1, lon1, lat2, lon2, poleY) => {
      const projection = createEquirectangularProjection({
        width: 360,
        height: 180,
        zoomScale: 1,
      });
      const segments = spotArcSegments(lat1, lon1, lat2, lon2, projection);
      expect(segments).toHaveLength(2);
      expect(segments[0].at(-1)!.y).toBe(poleY);
      expect(segments[1][0].y).toBe(poleY);
      for (const segment of segments) {
        expect(segment.every((point) => point.x === segment[0].x)).toBe(true);
      }
    },
  );

  it.each([
    [90, 12, 60, 80],
    [-50, 20, -90, -30],
    [90, 0, -90, 180],
  ])(
    "keeps a polar endpoint on the path meridian without an interior chord (%s)",
    (lat1, lon1, lat2, lon2) => {
      const projection = createEquirectangularProjection({
        width: 360,
        height: 180,
        zoomScale: 1,
      });
      const segments = spotArcSegments(lat1, lon1, lat2, lon2, projection);
      for (const segment of segments) {
        expect(segment.every((point) => point.x === segment[0].x)).toBe(true);
      }
      expect(segments[0][0]).toEqual({ x: lon1 + 180, y: 90 - lat1 });
      expect(segments.at(-1)!.at(-1)).toEqual({
        x: lon2 + 180,
        y: 90 - lat2,
      });
    },
  );

  it("rejects invalid coordinates and bounds its immutable geometry cache", () => {
    const projection = createEquirectangularProjection({
      width: 360,
      height: 180,
      zoomScale: 1,
    });
    expect(spotArcSegments(NaN, 0, 0, 0, projection)).toEqual([]);
    expect(spotArcSegments(91, 0, 0, 0, projection)).toEqual([]);
    const zeroWidth = createEquirectangularProjection({
      width: 0,
      height: 180,
      zoomScale: 1,
    });
    expect(spotArcSegments(0, 0, 0, 0, zeroWidth)).toEqual([]);

    const initial = spotArcSegments(10, 12, 30, 40, projection);
    expect(spotArcSegments(10, 12, 30, 40, projection)).toBe(initial);
    // Frozen-geometry contract restored from the deleted flatSpotPath.ts:
    // the outer segments array, each segment array, and each point object
    // (#1247 item 8).
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial[0])).toBe(true);
    expect(Object.isFrozen(initial[0][0])).toBe(true);

    for (let i = 0; i < 520; i++)
      spotArcSegments(20, -170 + i * 0.5, 30, 40, projection);
    expect(spotArcSegments(10, 12, 30, 40, projection)).not.toBe(initial);
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

  it("draws exact rect/arc glyph arguments at the projected endpoint (#1247 item 10)", () => {
    const { ctx, shapes } = createMockCtx();
    // Identity project (x = lon, y = lat) so the projected endpoint
    // coordinates are the arc's raw lat/lon, and identity screenPx so the
    // glyph radii are exactly the layer's own size constants.
    const projection = fakeFlatProjection({
      project: (lat, lon) => ({ x: lon, y: lat, visible: true }),
    });
    const arc = makeArc({
      from: { lat: 20, lon: 30 },
      to: { lat: 40, lon: 50 },
    });
    drawSpotArcsLayer(ctx, projection, [arc], baseStyle());

    const rect = shapes.find((s) => s.name === "rect")!;
    // RX square (highViz off, scale 1): radius 3.5, centered on (30, 20).
    expect(rect.args).toEqual([30 - 3.5, 20 - 3.5, 7, 7]);

    const arcs = shapes.filter((s) => s.name === "arc");
    // TX filled circle (radius 4) then the white ring (radius 5.5), both
    // centered on (50, 40).
    expect(arcs[0].args).toEqual([50, 40, 4, 0, Math.PI * 2]);
    expect(arcs[1].args).toEqual([50, 40, 5.5, 0, Math.PI * 2]);
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
