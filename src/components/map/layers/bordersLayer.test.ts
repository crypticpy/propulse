import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as standardMap from "@/lib/utils/standardMap";
import {
  traceRing,
  drawCountryBordersLayer,
  drawStateBordersLayer,
  drawBoostedCountryBordersLayer,
  drawBoostedStateBordersLayer,
} from "./bordersLayer";
import {
  AZIMUTHAL_LAYER_PROFILE,
  FLAT_LAYER_PROFILE,
} from "@/lib/map/mapLayerProfile";
import type { Projection, ProjectedPoint } from "@/lib/map/projection";

/** Minimal recording stub of the path-tracing subset of
 * CanvasRenderingContext2D that `bordersLayer.ts` uses: `beginPath`,
 * `moveTo`, `lineTo`, `closePath`, `stroke`, plus the `strokeStyle`/
 * `lineWidth` properties it sets right before each pass. Modeled on
 * `weatherAlertsLayer.test.ts`'s mock ctx. */
function createMockCtx() {
  const ops: string[] = [];
  const moveTos: Array<[number, number]> = [];
  const lineTos: Array<[number, number]> = [];
  const strokeStyles: string[] = [];
  const lineWidths: number[] = [];
  const ctx = {
    strokeStyle: "",
    lineWidth: 1,
    beginPath: vi.fn(() => ops.push("beginPath")),
    closePath: vi.fn(() => ops.push("closePath")),
    moveTo: vi.fn((x: number, y: number) => {
      moveTos.push([x, y]);
      ops.push(`moveTo:${x},${y}`);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      lineTos.push([x, y]);
      ops.push(`lineTo:${x},${y}`);
    }),
    stroke: vi.fn(() => {
      strokeStyles.push(ctx.strokeStyle as string);
      lineWidths.push(ctx.lineWidth as number);
      ops.push("stroke");
    }),
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    moveTos,
    lineTos,
    strokeStyles,
    lineWidths,
  };
}

function fakeFlatProjection(overrides: Partial<Projection> = {}): Projection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1024,
    wrapHeight: 512,
    discRadiusPx: undefined,
    project: () => ({ x: 0, y: 0, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  };
}

/** A ring's points are keyed by their exact [lat, lon] tuple so tests can
 * control the projected `x`/`y`/`rim` for each vertex independently of the
 * real azimuthal math. */
function fakeAzimuthalProjection(
  points: Map<string, ProjectedPoint>,
  discRadiusPx = 260,
): Projection {
  return {
    kind: "azimuthal",
    zoomScale: 1,
    wrapWidth: undefined,
    wrapHeight: undefined,
    discRadiusPx,
    project: (lat, lon) => {
      const point = points.get(`${lat},${lon}`);
      if (!point) {
        throw new Error(`fakeAzimuthalProjection: no point for ${lat},${lon}`);
      }
      return point;
    },
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
  };
}

describe("traceRing", () => {
  describe("equirectangular seam", () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      spy = vi
        .spyOn(standardMap, "addWrappedRingPath")
        .mockImplementation(() => {});
    });
    afterEach(() => {
      spy.mockRestore();
    });

    it("delegates to addWrappedRingPath with the projection's wrapWidth/wrapHeight", () => {
      const { ctx } = createMockCtx();
      const projection = fakeFlatProjection({
        wrapWidth: 1024,
        wrapHeight: 512,
      });
      const ring: [number, number][] = [
        [0, 0],
        [10, 10],
      ];
      traceRing(ctx, ring, projection, FLAT_LAYER_PROFILE);
      expect(spy).toHaveBeenCalledWith(ctx, ring, 1024, 512);
    });

    it("passes a ring with fewer than two points straight through", () => {
      const { ctx } = createMockCtx();
      const projection = fakeFlatProjection();
      const ring: [number, number][] = [[5, 5]];
      traceRing(ctx, ring, projection, FLAT_LAYER_PROFILE);
      expect(spy).toHaveBeenCalledWith(ctx, ring, 1024, 512);
    });
  });

  describe("azimuthal seam", () => {
    it("keeps a vertex at rim exactly 0.99 and drops one at 0.991", () => {
      const { ctx, moveTos, lineTos } = createMockCtx();
      const points = new Map<string, ProjectedPoint>([
        ["0,0", { x: 10, y: 10, visible: true, rim: 0.99 }],
        ["1,1", { x: 20, y: 20, visible: true, rim: 0.991 }],
      ]);
      const projection = fakeAzimuthalProjection(points);
      traceRing(
        ctx,
        [
          [0, 0],
          [1, 1],
        ],
        projection,
        AZIMUTHAL_LAYER_PROFILE,
      );
      // The 0.99 vertex stays (moveTo, since it's first); the 0.991 vertex
      // is dropped, so no second op of any kind is emitted for it.
      expect(moveTos).toEqual([[10, 10]]);
      expect(lineTos).toEqual([]);
    });

    it("re-enters with moveTo (not lineTo) after a dropped vertex", () => {
      const { ctx, ops } = createMockCtx();
      const points = new Map<string, ProjectedPoint>([
        ["0,0", { x: 10, y: 10, visible: true, rim: 0.5 }],
        ["1,1", { x: 500, y: 500, visible: false, rim: 1.5 }],
        ["2,2", { x: 30, y: 30, visible: true, rim: 0.5 }],
      ]);
      const projection = fakeAzimuthalProjection(points);
      traceRing(
        ctx,
        [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
        projection,
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(ops).toEqual(["moveTo:10,10", "moveTo:30,30"]);
    });

    it("jump-breaks with moveTo just above the threshold, lineTo just below it", () => {
      // discRadiusPx = 10, jumpBreakFraction = 0.25 -> threshold = 100*0.25 = 25.
      // A dx/dy pair of (4.9, 0) -> 24.01 (below); (5.1, 0) -> 26.01 (above).
      const belowPoints = new Map<string, ProjectedPoint>([
        ["0,0", { x: 0, y: 0, visible: true, rim: 0 }],
        ["1,1", { x: 4.9, y: 0, visible: true, rim: 0 }],
      ]);
      const { ctx: ctxBelow, ops: opsBelow } = createMockCtx();
      traceRing(
        ctxBelow,
        [
          [0, 0],
          [1, 1],
        ],
        fakeAzimuthalProjection(belowPoints, 10),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(opsBelow).toEqual(["moveTo:0,0", "lineTo:4.9,0"]);

      const abovePoints = new Map<string, ProjectedPoint>([
        ["0,0", { x: 0, y: 0, visible: true, rim: 0 }],
        ["1,1", { x: 5.1, y: 0, visible: true, rim: 0 }],
      ]);
      const { ctx: ctxAbove, ops: opsAbove } = createMockCtx();
      traceRing(
        ctxAbove,
        [
          [0, 0],
          [1, 1],
        ],
        fakeAzimuthalProjection(abovePoints, 10),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(opsAbove).toEqual(["moveTo:0,0", "moveTo:5.1,0"]);
    });

    it("never calls closePath", () => {
      const { ctx } = createMockCtx();
      const points = new Map<string, ProjectedPoint>([
        ["0,0", { x: 0, y: 0, visible: true, rim: 0 }],
        ["1,1", { x: 1, y: 1, visible: true, rim: 0 }],
      ]);
      traceRing(
        ctx,
        [
          [0, 0],
          [1, 1],
        ],
        fakeAzimuthalProjection(points),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(ctx.closePath).not.toHaveBeenCalled();
    });

    it("handles a ring with fewer than two points without crashing", () => {
      const { ctx, ops } = createMockCtx();
      const points = new Map<string, ProjectedPoint>([
        ["0,0", { x: 1, y: 2, visible: true, rim: 0 }],
      ]);
      traceRing(
        ctx,
        [[0, 0]],
        fakeAzimuthalProjection(points),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(ops).toEqual(["moveTo:1,2"]);

      const { ctx: ctxEmpty, ops: opsEmpty } = createMockCtx();
      traceRing(
        ctxEmpty,
        [],
        fakeAzimuthalProjection(points),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(opsEmpty).toEqual([]);
    });
  });
});

describe("colour/width tables", () => {
  const style = (standardMode: boolean, lightTheme: boolean) => ({
    standardMode,
    lightTheme,
  });

  it.each([
    {
      label: "country standard, dark theme",
      draw: drawCountryBordersLayer,
      style: style(true, false),
      strokeStyle: "rgba(255, 255, 255, 0.65)",
      lineWidth: 1.0,
    },
    {
      label: "country non-standard",
      draw: drawCountryBordersLayer,
      style: style(false, false),
      strokeStyle: "rgba(255, 255, 255, 0.3)",
      lineWidth: 0.8,
    },
    {
      label: "country standard, light theme",
      draw: drawCountryBordersLayer,
      style: style(true, true),
      strokeStyle: "rgba(15, 23, 42, 0.6)",
      lineWidth: 1.0,
    },
    {
      label: "state standard, dark theme",
      draw: drawStateBordersLayer,
      style: style(true, false),
      strokeStyle: "rgba(255, 255, 255, 0.45)",
      lineWidth: 0.7,
    },
    {
      label: "state non-standard",
      draw: drawStateBordersLayer,
      style: style(false, false),
      strokeStyle: "rgba(255, 255, 255, 0.2)",
      lineWidth: 0.5,
    },
    {
      label: "state standard, light theme",
      draw: drawStateBordersLayer,
      style: style(true, true),
      strokeStyle: "rgba(15, 23, 42, 0.5)",
      lineWidth: 0.7,
    },
  ])(
    "$label: $strokeStyle width $lineWidth",
    ({ draw, style, strokeStyle, lineWidth }) => {
      const { ctx, strokeStyles, lineWidths } = createMockCtx();
      draw(ctx, fakeFlatProjection(), FLAT_LAYER_PROFILE, style);
      expect(strokeStyles).toEqual([strokeStyle]);
      expect(lineWidths).toEqual([lineWidth]);
    },
  );

  it("boosted country pass: rgba(255, 255, 255, 0.55) width 1.0", () => {
    const { ctx, strokeStyles, lineWidths } = createMockCtx();
    drawBoostedCountryBordersLayer(
      ctx,
      fakeFlatProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(strokeStyles).toEqual(["rgba(255, 255, 255, 0.55)"]);
    expect(lineWidths).toEqual([1.0]);
  });

  it("boosted state pass: rgba(255, 255, 255, 0.4) width 0.7", () => {
    const { ctx, strokeStyles, lineWidths } = createMockCtx();
    drawBoostedStateBordersLayer(ctx, fakeFlatProjection(), FLAT_LAYER_PROFILE);
    expect(strokeStyles).toEqual(["rgba(255, 255, 255, 0.4)"]);
    expect(lineWidths).toEqual([0.7]);
  });

  it("the disc's template colour matches the flat literals bit for bit", () => {
    const cases: [number, string][] = [
      [0.65, "rgba(255, 255, 255, 0.65)"],
      [0.3, "rgba(255, 255, 255, 0.3)"],
      [0.45, "rgba(255, 255, 255, 0.45)"],
      [0.2, "rgba(255, 255, 255, 0.2)"],
      [0.55, "rgba(255, 255, 255, 0.55)"],
      [0.4, "rgba(255, 255, 255, 0.4)"],
    ];
    for (const [opacity, expected] of cases) {
      expect(`rgba(255, 255, 255, ${opacity})`).toBe(expected);
    }
  });
});

describe("draw*BordersLayer batching", () => {
  it("drawCountryBordersLayer calls beginPath and stroke exactly once regardless of ring count", () => {
    const { ctx, ops } = createMockCtx();
    drawCountryBordersLayer(ctx, fakeFlatProjection(), FLAT_LAYER_PROFILE, {
      standardMode: true,
      lightTheme: false,
    });
    expect(ops.filter((o) => o === "beginPath")).toHaveLength(1);
    expect(ops.filter((o) => o === "stroke")).toHaveLength(1);
  });

  it("drawStateBordersLayer calls beginPath and stroke exactly once regardless of ring count", () => {
    const { ctx, ops } = createMockCtx();
    drawStateBordersLayer(ctx, fakeFlatProjection(), FLAT_LAYER_PROFILE, {
      standardMode: true,
      lightTheme: false,
    });
    expect(ops.filter((o) => o === "beginPath")).toHaveLength(1);
    expect(ops.filter((o) => o === "stroke")).toHaveLength(1);
  });

  it("drawBoostedCountryBordersLayer and drawBoostedStateBordersLayer call beginPath/stroke exactly once", () => {
    const { ctx: ctxCountry, ops: opsCountry } = createMockCtx();
    drawBoostedCountryBordersLayer(
      ctxCountry,
      fakeFlatProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(opsCountry.filter((o) => o === "beginPath")).toHaveLength(1);
    expect(opsCountry.filter((o) => o === "stroke")).toHaveLength(1);

    const { ctx: ctxState, ops: opsState } = createMockCtx();
    drawBoostedStateBordersLayer(
      ctxState,
      fakeFlatProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(opsState.filter((o) => o === "beginPath")).toHaveLength(1);
    expect(opsState.filter((o) => o === "stroke")).toHaveLength(1);
  });
});
