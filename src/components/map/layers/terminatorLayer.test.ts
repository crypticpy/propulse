import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import * as flatMapIllumination from "@/components/map/lib/flatMapIllumination";
import {
  drawTerminatorLayer,
  TERMINATOR_COLOR,
  TERMINATOR_OUTLINE_COLOR,
} from "./terminatorLayer";
import type {
  AzimuthalProjection,
  EquirectangularProjection,
} from "@/lib/map/projection";

/** Minimal recording stub of the subset of CanvasRenderingContext2D that
 * `terminatorLayer.ts` uses. Modeled on `bordersLayer.test.ts`'s
 * `createMockCtx`. */
function createMockCtx() {
  const ops: string[] = [];
  const dashes: number[][] = [];
  const strokeStyles: string[] = [];
  const lineWidths: number[] = [];
  const ctx = {
    strokeStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
    lineCap: "",
    lineJoin: "",
    save: vi.fn(() => ops.push("save")),
    restore: vi.fn(() => ops.push("restore")),
    beginPath: vi.fn(() => ops.push("beginPath")),
    moveTo: vi.fn(() => ops.push("moveTo")),
    lineTo: vi.fn(() => ops.push("lineTo")),
    setLineDash: vi.fn((d: number[]) => {
      dashes.push(d);
      ops.push(`setLineDash:${d.join(",")}`);
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
    dashes,
    strokeStyles,
    lineWidths,
  };
}

function fakeFlatProjection(
  overrides: Partial<EquirectangularProjection> = {},
): EquirectangularProjection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1024,
    wrapHeight: 512,
    discRadiusPx: undefined,
    discCenterPx: undefined,
    project: (lat, lon) => ({ x: lon, y: lat, visible: true }),
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
    discRadiusPx: 260,
    discCenterPx: { x: 300, y: 300 },
    project: (lat, lon) => ({ x: lon, y: lat, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  };
}

const SOME_DATE = new Date("2026-09-12T12:00:00Z");

describe("drawTerminatorLayer", () => {
  let coordsSpy: MockInstance<typeof flatMapIllumination.terminatorCoordinates>;

  beforeEach(() => {
    coordsSpy = vi
      .spyOn(flatMapIllumination, "terminatorCoordinates")
      .mockReturnValue([
        { lat: 0, lon: 0 },
        { lat: 0, lon: 1 },
      ]);
  });

  afterEach(() => {
    coordsSpy.mockRestore();
  });

  it("strokes the outline pass before the colour pass, with the documented colours", () => {
    const { ctx, strokeStyles } = createMockCtx();
    drawTerminatorLayer(ctx, SOME_DATE, fakeFlatProjection(), {
      highViz: false,
      dashed: false,
    });
    // Assert against literal strings (not just the imported constants) so a
    // mutation to either constant's value is actually caught here, not just
    // reflected on both sides of the comparison.
    expect(strokeStyles).toEqual(["rgba(8, 14, 25, 0.7)", "#ff6b35"]);
    expect(strokeStyles).toEqual([TERMINATOR_OUTLINE_COLOR, TERMINATOR_COLOR]);
  });

  it("uses all four widths (highViz on/off x pass) through a halving screenPx", () => {
    const halveScreenPx = (px: number) => px / 2;
    for (const highViz of [false, true]) {
      const { ctx, lineWidths } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeFlatProjection({ screenPx: halveScreenPx }),
        { highViz, dashed: false },
      );
      expect(lineWidths).toEqual([
        (highViz ? 5 : 4) / 2,
        (highViz ? 3 : 2.25) / 2,
      ]);
    }
  });

  it("sets a dash pattern through screenPx when dashed, clears it when not", () => {
    const halveScreenPx = (px: number) => px / 2;

    const { ctx: dashedCtx, dashes: dashedDashes } = createMockCtx();
    drawTerminatorLayer(
      dashedCtx,
      SOME_DATE,
      fakeFlatProjection({ screenPx: halveScreenPx }),
      { highViz: false, dashed: true },
    );
    expect(dashedDashes[0]).toEqual([4, 2]);

    const { ctx: solidCtx, dashes: solidDashes } = createMockCtx();
    drawTerminatorLayer(solidCtx, SOME_DATE, fakeFlatProjection(), {
      highViz: false,
      dashed: false,
    });
    expect(solidDashes[0]).toEqual([]);
  });

  it("balances save/restore, with restore last", () => {
    const { ctx, ops } = createMockCtx();
    drawTerminatorLayer(ctx, SOME_DATE, fakeFlatProjection(), {
      highViz: false,
      dashed: false,
    });
    expect(ops.filter((o) => o === "save").length).toBe(1);
    expect(ops.filter((o) => o === "restore").length).toBe(1);
    expect(ops[ops.length - 1]).toBe("restore");
  });

  describe("sample count from the reference px", () => {
    function samplesPassedTo(): number {
      const call = coordsSpy.mock.calls.at(-1);
      if (!call) throw new Error("terminatorCoordinates was not called");
      return call[2] as number;
    }

    it("flat: floors at 2048 when referencePx * zoomScale is small", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeFlatProjection({ wrapWidth: 100, zoomScale: 1 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(2048);
    });

    it("flat: uses the raw ceil(referencePx * zoomScale) between the floor and cap", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeFlatProjection({ wrapWidth: 2000, zoomScale: 2 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(4000);
    });

    it("flat: caps at 16384 when referencePx * zoomScale is large", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeFlatProjection({ wrapWidth: 2000, zoomScale: 20 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(16384);
    });

    it("azimuthal: floors at 2048 when 2*discRadiusPx*zoomScale is small", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeAzimuthalProjection({ discRadiusPx: 100, zoomScale: 1 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(2048);
    });

    it("azimuthal: uses the raw ceil(2*discRadiusPx*zoomScale) between the floor and cap", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeAzimuthalProjection({ discRadiusPx: 2000, zoomScale: 2 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(8000);
    });

    it("azimuthal: caps at 16384 when 2*discRadiusPx*zoomScale is large", () => {
      const { ctx } = createMockCtx();
      drawTerminatorLayer(
        ctx,
        SOME_DATE,
        fakeAzimuthalProjection({ discRadiusPx: 2000, zoomScale: 20 }),
        { highViz: false, dashed: false },
      );
      expect(samplesPassedTo()).toBe(16384);
    });
  });

  describe("path break rule by projection.kind", () => {
    it("flat: moveTo on a >180 degree longitude jump (antimeridian), lineTo otherwise", () => {
      coordsSpy.mockReturnValue([
        { lat: 0, lon: 0 },
        { lat: 1, lon: 10 },
        { lat: 2, lon: 175 },
        { lat: 3, lon: -175 }, // |−175 − 175| = 350 > 180 -> break
      ]);
      const { ctx, ops } = createMockCtx();
      drawTerminatorLayer(ctx, SOME_DATE, fakeFlatProjection(), {
        highViz: false,
        dashed: false,
      });
      expect(ops.filter((o) => o === "moveTo").length).toBe(2);
      expect(ops.filter((o) => o === "lineTo").length).toBe(2);
    });

    it("azimuthal: moveTo when the squared canvas jump exceeds discRadiusPx^2, lineTo otherwise", () => {
      coordsSpy.mockReturnValue([
        { lat: 0, lon: 0 },
        { lat: 0, lon: 10 }, // dx=10 -> 100 <= 260^2 (67600), lineTo
        // dx=400 -> 160000: > 260^2 (67600) but < (2*260)^2 (270400), so
        // this only breaks under the true `discRadiusPx^2` threshold, not
        // a looser one (e.g. `4 * discRadiusPx^2`) -- pins down the exact
        // multiplier, not just "some" threshold.
        { lat: 0, lon: 410 },
      ]);
      const { ctx, ops } = createMockCtx();
      drawTerminatorLayer(ctx, SOME_DATE, fakeAzimuthalProjection(), {
        highViz: false,
        dashed: false,
      });
      expect(ops.filter((o) => o === "moveTo").length).toBe(2);
      expect(ops.filter((o) => o === "lineTo").length).toBe(1);
    });
  });
});
