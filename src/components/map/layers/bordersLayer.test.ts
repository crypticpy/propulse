import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import * as standardMap from "@/lib/utils/standardMap";
import * as sunUtils from "@/lib/utils/sun";
import {
  traceRing,
  drawCountryBordersLayer,
  drawStateBordersLayer,
  drawBoostedCountryBordersLayer,
  drawBoostedStateBordersLayer,
  drawNightBoostedBordersLayer,
} from "./bordersLayer";
import {
  AZIMUTHAL_LAYER_PROFILE,
  FLAT_LAYER_PROFILE,
} from "@/lib/map/mapLayerProfile";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";
import {
  createEquirectangularProjection,
  createAzimuthalProjection,
} from "@/lib/map/projection";
import type { Projection, ProjectedPoint } from "@/lib/map/projection";

/** Minimal recording stub of the path-tracing subset of
 * CanvasRenderingContext2D that `bordersLayer.ts` uses: `beginPath`,
 * `moveTo`, `lineTo`, `closePath`, `stroke`, `save`, `restore`, `clip`,
 * plus the `strokeStyle`/`lineWidth` properties it sets right before each
 * pass. Modeled on `weatherAlertsLayer.test.ts`'s mock ctx. */
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
    save: vi.fn(() => ops.push("save")),
    restore: vi.fn(() => ops.push("restore")),
    clip: vi.fn(() => ops.push("clip")),
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

// The spread-of-overrides pattern below widens `kind` to the full union
// before the merge, so the object literal needs an `as Projection` cast
// (discriminated union `Omit<>`/spread doesn't distribute -- see CLAUDE.md).
function fakeFlatProjection(overrides: Partial<Projection> = {}): Projection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1024,
    wrapHeight: 512,
    discRadiusPx: undefined,
    discCenterPx: undefined,
    project: () => ({ x: 0, y: 0, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  } as Projection;
}

/** A ring's points are keyed by their exact [lat, lon] tuple so tests can
 * control the projected `x`/`y`/`rim` for each vertex independently of the
 * real azimuthal math. */
function fakeAzimuthalProjection(
  points: Map<string, ProjectedPoint>,
  discRadiusPx = 260,
  discCenterPx: { x: number; y: number } = { x: 300, y: 300 },
): Projection {
  return {
    kind: "azimuthal",
    zoomScale: 1,
    wrapWidth: undefined,
    wrapHeight: undefined,
    discRadiusPx,
    discCenterPx,
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
    {
      label: "country non-standard, light theme",
      draw: drawCountryBordersLayer,
      style: style(false, true),
      strokeStyle: "rgba(255, 255, 255, 0.3)",
      lineWidth: 0.8,
    },
    {
      label: "state non-standard, light theme",
      draw: drawStateBordersLayer,
      style: style(false, true),
      strokeStyle: "rgba(255, 255, 255, 0.2)",
      lineWidth: 0.5,
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

describe("drawNightBoostedBordersLayer", () => {
  let subsolarSpy: MockInstance<typeof sunUtils.getSubsolarPoint> | undefined;

  afterEach(() => {
    subsolarSpy?.mockRestore();
    subsolarSpy = undefined;
  });

  function mockSubsolar(lat: number, lon: number) {
    subsolarSpy = vi
      .spyOn(sunUtils, "getSubsolarPoint")
      .mockReturnValue({ lat, lon });
  }

  const FLAT_PROJECTION = createEquirectangularProjection({
    width: 1024,
    height: 512,
    zoomScale: 1,
  });

  /** Slice `ops` between the `save`/`clip` pair that brackets the clip
   * geometry, so the (irrelevant, huge) boosted stroke passes that follow
   * `clip` don't pollute the count when `draw.country`/`draw.states` are on. */
  function clipOps(ops: string[]): string[] {
    const saveIdx = ops.indexOf("save");
    const clipIdx = ops.indexOf("clip");
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(clipIdx).toBeGreaterThan(saveIdx);
    return ops.slice(saveIdx + 1, clipIdx + 1);
  }

  it("flat: samples the terminator at FLAT's stepDeg=2 -> 1 moveTo + 180 lineTo, then 4 closing lineTo, closePath, clip", () => {
    mockSubsolar(23, 10);
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-06-21T12:00:00Z"),
      FLAT_PROJECTION,
      FLAT_LAYER_PROFILE,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    expect(seg[0]).toBe("beginPath");
    expect(seg.filter((o) => o.startsWith("moveTo")).length).toBe(1);
    expect(seg.filter((o) => o.startsWith("lineTo")).length).toBe(180 + 4);
    expect(seg[seg.length - 2]).toBe("closePath");
    expect(seg[seg.length - 1]).toBe("clip");
  });

  it("flat: closes to the top corners (y=0) when the anti-subsolar point is in the northern half", () => {
    // Southern subsolar point (winter-solstice-like) -> anti-subsolar point
    // is northern -> its projected y is < height/2 -> "top" branch.
    mockSubsolar(-23, 10);
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-12-21T12:00:00Z"),
      FLAT_PROJECTION,
      FLAT_LAYER_PROFILE,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    const lineTos = seg.filter((o) => o.startsWith("lineTo"));
    const closing = lineTos.slice(-4);
    // lineTo(width, lastP.y), lineTo(width, 0), lineTo(0, 0), lineTo(0, firstP.y)
    expect(closing[1]).toBe("lineTo:1024,0");
    expect(closing[2]).toBe("lineTo:0,0");
  });

  it("flat: closes to the bottom corners (y=height) when the anti-subsolar point is in the southern half", () => {
    // Northern subsolar point (summer-solstice-like) -> anti-subsolar point
    // is southern -> its projected y is >= height/2 -> "bottom" branch.
    mockSubsolar(23, 10);
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-06-21T12:00:00Z"),
      FLAT_PROJECTION,
      FLAT_LAYER_PROFILE,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    const lineTos = seg.filter((o) => o.startsWith("lineTo"));
    const closing = lineTos.slice(-4);
    expect(closing[1]).toBe("lineTo:1024,512");
    expect(closing[2]).toBe("lineTo:0,512");
  });

  it("equinox branch: every terminator point sits at lat 0 (|tan(subsolarLat)| < 0.001)", () => {
    mockSubsolar(0, 0);
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-03-20T12:00:00Z"),
      FLAT_PROJECTION,
      FLAT_LAYER_PROFILE,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    // lat 0 on the equirectangular projection is always y = height / 2 =
    // 256, for every terminator point (the 1 moveTo + 180 lineTo, but not
    // the 4 closing corner lineTos, which are pinned to 0/height/firstP.y).
    const terminatorOps = seg.filter(
      (o) => o.startsWith("moveTo") || o.startsWith("lineTo"),
    );
    const polylinePoints = terminatorOps.slice(0, 181);
    for (const op of polylinePoints) {
      const y = Number(op.split(",")[1]);
      expect(y).toBeCloseTo(256, 6);
    }
  });

  it("reads stepDeg from the profile: nightClip.stepDeg 2 -> 3 changes the terminator point count", () => {
    mockSubsolar(23, 10);
    const stepDeg3Profile: MapLayerProfile = {
      ...FLAT_LAYER_PROFILE,
      nightClip: { stepDeg: 3 },
    };
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-06-21T12:00:00Z"),
      FLAT_PROJECTION,
      stepDeg3Profile,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    // -180 to 180 inclusive at step 3 = 121 points -> 1 moveTo + 120 lineTo,
    // + 4 closing lineTo = 124, not FLAT's 180 + 4 = 184.
    expect(seg.filter((o) => o.startsWith("moveTo")).length).toBe(1);
    expect(seg.filter((o) => o.startsWith("lineTo")).length).toBe(120 + 4);
  });

  it("disc: samples the terminator at AZIMUTHAL's stepDeg=3 -> 1 moveTo + 120 lineTo, then 37 arc lineTo, closePath, clip", () => {
    mockSubsolar(23, 10);
    const discProjection = createAzimuthalProjection({
      centerLat: 40,
      centerLon: -100,
      centerX: 300,
      centerY: 300,
      radius: 260,
      zoomScale: 1,
      zoomDamp: 1,
    });
    const { ctx, ops } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-06-21T12:00:00Z"),
      discProjection,
      AZIMUTHAL_LAYER_PROFILE,
      { country: false, states: false },
    );
    const seg = clipOps(ops);
    expect(seg[0]).toBe("beginPath");
    expect(seg.filter((o) => o.startsWith("moveTo")).length).toBe(1);
    expect(seg.filter((o) => o.startsWith("lineTo")).length).toBe(120 + 37);
    expect(seg[seg.length - 2]).toBe("closePath");
    expect(seg[seg.length - 1]).toBe("clip");
  });

  it("disc: sweeps the closing arc in opposite directions for anti-subsolar positions on opposite sides", () => {
    // Fully synthetic azimuthal projection (not the real azimuthalProject
    // math): forcing the equinox branch (subsolar lat 0) makes every
    // terminator sample project through this fake at lon -180 (first) and
    // lon 180 (last) only, plus the anti-subsolar point at lon -170 (the
    // loop's step of 3 never lands on -170), so all three points the arc
    // closure math reads are independently controlled.
    const deg = (d: number) => (d * Math.PI) / 180;
    const R = 100;
    const onCircle = (angleDeg: number): ProjectedPoint => ({
      x: R * Math.cos(deg(angleDeg)),
      y: R * Math.sin(deg(angleDeg)),
      visible: true,
    });
    const firstPoint = onCircle(170); // terminator's lon=-180 point
    const lastPoint = onCircle(10); // terminator's lon=180 point

    function fakeDiscProjection(antiPoint: ProjectedPoint): Projection {
      return {
        kind: "azimuthal",
        zoomScale: 1,
        wrapWidth: undefined,
        wrapHeight: undefined,
        discRadiusPx: R,
        discCenterPx: { x: 0, y: 0 },
        project: (_lat, lon) => {
          if (lon === -180) return firstPoint;
          if (lon === 180) return lastPoint;
          if (lon === -170) return antiPoint;
          return { x: 9999, y: 9999, visible: true };
        },
        scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
        screenPx: (px) => px,
      };
    }

    function firstArcSweepSign(antiPoint: ProjectedPoint): number {
      mockSubsolar(0, 10); // isNearEquinox; antiSubsolarLon = 10 - 180 = -170
      const { ctx, ops } = createMockCtx();
      drawNightBoostedBordersLayer(
        ctx,
        new Date("2026-01-01T00:00:00Z"),
        fakeDiscProjection(antiPoint),
        AZIMUTHAL_LAYER_PROFILE,
        { country: false, states: false },
      );
      subsolarSpy?.mockRestore();
      const lineTos = ops.filter((o) => o.startsWith("lineTo"));
      // 120 terminator lineTo + 37 arc lineTo = 157.
      const arcPoints = lineTos.slice(-37).map((op) => {
        const [x, y] = op.replace("lineTo:", "").split(",").map(Number);
        return { x, y };
      });
      const angle = (p: { x: number; y: number }) => Math.atan2(p.y, p.x);
      let delta = angle(arcPoints[1]) - angle(arcPoints[0]);
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      return Math.sign(delta);
    }

    // Anti-subsolar "up" (90 deg, between the 10 deg and 170 deg endpoints
    // the short way) needs no direction correction: positive sweep.
    expect(firstArcSweepSign(onCircle(90))).toBe(1);
    // Anti-subsolar "down" (270 deg, on the other side) triggers the
    // direction correction: negative sweep.
    expect(firstArcSweepSign(onCircle(270))).toBe(-1);
  });

  it("disc: pins the closing arc's radius at 1.5x the disc radius", () => {
    mockSubsolar(23, 10);
    const centerX = 300;
    const centerY = 300;
    const radius = 260;
    const discProjection = createAzimuthalProjection({
      centerLat: 40,
      centerLon: -100,
      centerX,
      centerY,
      radius,
      zoomScale: 1,
      zoomDamp: 1,
    });
    const { ctx, lineTos } = createMockCtx();
    drawNightBoostedBordersLayer(
      ctx,
      new Date("2026-06-21T12:00:00Z"),
      discProjection,
      AZIMUTHAL_LAYER_PROFILE,
      { country: false, states: false },
    );
    // 120 terminator lineTo + 37 arc-closure lineTo = 157 total (no
    // country/state passes are drawn, so these are the only lineTo calls).
    expect(lineTos.length).toBe(120 + 37);
    const terminatorPoints = lineTos.slice(0, 120);
    const arcPoints = lineTos.slice(-37);
    const expectedRadius = radius * 1.5;
    for (const [x, y] of arcPoints) {
      const dist = Math.hypot(x - centerX, y - centerY);
      expect(Math.abs(dist - expectedRadius)).toBeLessThan(1e-6);
    }
    // Sanity: the terminator points are NOT all sitting on that same
    // radius, so a test that always passed regardless of the arc's own
    // geometry (a tautology) is ruled out.
    const terminatorAllOnArcRadius = terminatorPoints.every(([x, y]) => {
      const dist = Math.hypot(x - centerX, y - centerY);
      return Math.abs(dist - expectedRadius) < 1e-6;
    });
    expect(terminatorAllOnArcRadius).toBe(false);
  });
});
