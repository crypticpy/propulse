import { describe, expect, it, vi } from "vitest";
import { drawEarthquakesLayer } from "./earthquakesLayer";
import {
  AZIMUTHAL_LAYER_PROFILE,
  FLAT_LAYER_PROFILE,
} from "@/lib/map/mapLayerProfile";
import { createEquirectangularProjection } from "@/lib/map/projection";
import type { EquirectangularProjection } from "@/lib/map/projection";
import type { EarthquakeEvent } from "@/lib/api/earthquakes";

/** Minimal recording stub of CanvasRenderingContext2D's fill/stroke-circle surface. */
function createMockCtx() {
  const calls: string[] = [];
  const fills: Array<{
    x: number;
    y: number;
    radius: number;
    alpha: number;
    color: string;
  }> = [];
  const strokes: Array<{
    radius: number;
    alpha: number;
    color: string;
    lineWidth: number;
  }> = [];
  const texts: Array<{
    kind: "strokeText" | "fillText";
    text: string;
    x: number;
    y: number;
    font: string;
    textAlign: string;
    textBaseline: string;
    strokeStyle: string;
    fillStyle: string;
    lineWidth: number;
    globalAlpha: number;
  }> = [];
  let lastArc = { x: 0, y: 0, radius: 0 };
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(() => calls.push("beginPath")),
    arc: vi.fn((x: number, y: number, radius: number) => {
      lastArc = { x, y, radius };
      calls.push(`arc:${x},${y},${radius}`);
    }),
    fill: vi.fn(() => {
      fills.push({
        ...lastArc,
        alpha: ctx.globalAlpha,
        color: ctx.fillStyle as string,
      });
      calls.push("fill");
    }),
    stroke: vi.fn(() => {
      strokes.push({
        radius: lastArc.radius,
        alpha: ctx.globalAlpha,
        color: ctx.strokeStyle as string,
        lineWidth: ctx.lineWidth,
      });
      calls.push("stroke");
    }),
    strokeText: vi.fn((text: string, x: number, y: number) => {
      texts.push({
        kind: "strokeText",
        text,
        x,
        y,
        font: ctx.font as string,
        textAlign: ctx.textAlign as string,
        textBaseline: ctx.textBaseline as string,
        strokeStyle: ctx.strokeStyle as string,
        fillStyle: ctx.fillStyle as string,
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
      });
      calls.push("strokeText");
    }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      texts.push({
        kind: "fillText",
        text,
        x,
        y,
        font: ctx.font as string,
        textAlign: ctx.textAlign as string,
        textBaseline: ctx.textBaseline as string,
        strokeStyle: ctx.strokeStyle as string,
        fillStyle: ctx.fillStyle as string,
        lineWidth: ctx.lineWidth,
        globalAlpha: ctx.globalAlpha,
      });
      calls.push("fillText");
    }),
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    fills,
    strokes,
    texts,
  };
}

// wrapWidth/wrapHeight are unused by this layer -- any numbers satisfy the
// equirectangular branch's now-required fields (#1091 PR 7).
function fakeProjection(
  overrides: Partial<EquirectangularProjection> = {},
): EquirectangularProjection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1024,
    wrapHeight: 512,
    project: () => ({ x: 10, y: 20, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  };
}

function quake(overrides: Partial<EarthquakeEvent> = {}): EarthquakeEvent {
  return {
    id: "eq1",
    lat: 0,
    lon: 0,
    depth: 10,
    magnitude: 5,
    place: "Test",
    time: 0,
    ...overrides,
  };
}

describe("drawEarthquakesLayer", () => {
  it("draws nothing for an invisible point", () => {
    const { ctx, fills } = createMockCtx();
    const projection = fakeProjection({
      project: () => ({ x: 10, y: 20, visible: false }),
    });
    drawEarthquakesLayer(ctx, [quake()], projection, FLAT_LAYER_PROFILE);
    expect(fills).toHaveLength(0);
  });

  it("draws a glow pass then a core pass at the projected point, plus outline stroke", () => {
    const { ctx, fills, strokes } = createMockCtx();
    // (magnitude 4 - baseline 1) * pxPerMagnitude 3 = 9, within [3, 20]
    drawEarthquakesLayer(
      ctx,
      [quake({ magnitude: 4 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({ x: 10, y: 20, radius: 18, alpha: 0.15 }); // glow = core * 2
    expect(fills[1]).toMatchObject({
      x: 10,
      y: 20,
      radius: 9,
      alpha: 0.7,
      color: "#ffcc00",
    });
    expect(strokes).toHaveLength(1);
    expect(strokes[0]).toMatchObject({ radius: 9, alpha: 0.9, lineWidth: 1 });
  });

  it("resets globalAlpha to 1 and balances save/restore", () => {
    const { ctx, calls } = createMockCtx();
    drawEarthquakesLayer(
      ctx,
      [quake({ magnitude: 4 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    expect(ctx.globalAlpha).toBe(1);
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
    expect(calls.filter((c) => c === "save")).toHaveLength(1);
    expect(calls.filter((c) => c === "restore")).toHaveLength(1);
  });

  it("labels only M5+ quakes", () => {
    const below = createMockCtx();
    drawEarthquakesLayer(
      below.ctx,
      [quake({ magnitude: 4.9 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(below.calls.filter((c) => c === "fillText")).toHaveLength(0);

    const atThreshold = createMockCtx();
    drawEarthquakesLayer(
      atThreshold.ctx,
      [quake({ magnitude: 5 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(atThreshold.calls.filter((c) => c === "fillText")).toHaveLength(1);
    expect(atThreshold.calls.filter((c) => c === "strokeText")).toHaveLength(1);
  });

  it("produces zero text calls below M5 and two at M5 (threshold boundary)", () => {
    const below = createMockCtx();
    drawEarthquakesLayer(
      below.ctx,
      [quake({ magnitude: 4.9 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(below.texts).toHaveLength(0);

    const atThreshold = createMockCtx();
    drawEarthquakesLayer(
      atThreshold.ctx,
      [quake({ magnitude: 5.0 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(atThreshold.texts).toHaveLength(2);
  });

  it("captures the full label style state at strokeText/fillText call time", () => {
    const { ctx, texts } = createMockCtx();
    drawEarthquakesLayer(
      ctx,
      [quake({ magnitude: 6 })],
      fakeProjection({ screenPx: (px) => px / 2 }),
      FLAT_LAYER_PROFILE,
    );

    // radius = screenPx(min(20, (6-1)*3)) = screenPx(15) = 7.5
    // labelY = 20 - 7.5 - screenPx(2) = 20 - 7.5 - 1 = 11.5
    // fontSize = round(screenPx(7)) = round(3.5) = 4
    expect(texts).toHaveLength(2);
    expect(texts[0].kind).toBe("strokeText");
    expect(texts[1].kind).toBe("fillText");

    for (const t of texts) {
      expect(t.text).toBe("M6.0");
      expect(t.x).toBe(10);
      expect(t.y).toBe(11.5);
      expect(t.font).toBe("bold 4px monospace");
    }

    expect(texts[0]).toMatchObject({
      strokeStyle: "rgba(0,0,0,0.6)",
      lineWidth: 1,
    });
    expect(texts[1]).toMatchObject({
      fillStyle: "#ffffff",
      textAlign: "center",
      textBaseline: "bottom",
      globalAlpha: 1,
    });
  });

  describe("flat vs. azimuthal profile parity (drift is intentional, see #1091 drift census)", () => {
    it("magnitude 8 -> core radius 20 under FLAT (capped) and 15 under AZIMUTHAL (capped)", () => {
      const flat = createMockCtx();
      drawEarthquakesLayer(
        flat.ctx,
        [quake({ magnitude: 8 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[1].radius).toBe(20);
      expect(flat.fills[1].color).toBe("#ff2020");

      const az = createMockCtx();
      drawEarthquakesLayer(
        az.ctx,
        [quake({ magnitude: 8 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[1].radius).toBe(15);
      expect(az.fills[1].color).toBe("#ff2020");
    });

    it("magnitude 5 -> core radius 12 under FLAT (pxPerMagnitude 3) and 10 under AZIMUTHAL (pxPerMagnitude 2.5); this must fail if the per-magnitude constants are swapped", () => {
      const flat = createMockCtx();
      drawEarthquakesLayer(
        flat.ctx,
        [quake({ magnitude: 5 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[1].radius).toBe(12); // (5 - 1) * 3
      expect(flat.fills[1].color).toBe("#ff8800");

      const az = createMockCtx();
      drawEarthquakesLayer(
        az.ctx,
        [quake({ magnitude: 5 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[1].radius).toBe(10); // (5 - 1) * 2.5
      expect(az.fills[1].color).toBe("#ff8800");
    });

    it("magnitude 1 floors the core radius at 3 under both profiles", () => {
      const flat = createMockCtx();
      drawEarthquakesLayer(
        flat.ctx,
        [quake({ magnitude: 1 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[1].radius).toBe(3);
      expect(flat.fills[1].color).toBe("#88cc44");

      const az = createMockCtx();
      drawEarthquakesLayer(
        az.ctx,
        [quake({ magnitude: 1 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[1].radius).toBe(3);
      expect(az.fills[1].color).toBe("#88cc44");
    });

    it.each([
      { magnitude: 6.9, color: "#ff8800" },
      { magnitude: 7.0, color: "#ff2020" },
    ])(
      "colour ramp boundary: magnitude $magnitude -> $color",
      ({ magnitude, color }) => {
        const { ctx, fills } = createMockCtx();
        drawEarthquakesLayer(
          ctx,
          [quake({ magnitude })],
          fakeProjection(),
          FLAT_LAYER_PROFILE,
        );
        expect(fills[1].color).toBe(color);
      },
    );
  });

  it("applies screenPx to the clamped radius, halving both the glow and core radii", () => {
    const unscaled = createMockCtx();
    drawEarthquakesLayer(
      unscaled.ctx,
      [quake({ magnitude: 5 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    const halved = createMockCtx();
    const halvingProjection = fakeProjection({ screenPx: (px) => px / 2 });
    drawEarthquakesLayer(
      halved.ctx,
      [quake({ magnitude: 5 })],
      halvingProjection,
      FLAT_LAYER_PROFILE,
    );

    expect(halved.fills[0].radius).toBe(unscaled.fills[0].radius / 2);
    expect(halved.fills[1].radius).toBe(unscaled.fills[1].radius / 2);
    expect(halved.strokes[0].lineWidth).toBe(unscaled.strokes[0].lineWidth / 2);
  });

  it("wraps a pair of quakes straddling the antimeridian to opposite edges of the real equirectangular projection, each drawn once", () => {
    const projection = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 1,
    });

    const west = createMockCtx();
    drawEarthquakesLayer(
      west.ctx,
      [quake({ lat: 0, lon: 179.9, magnitude: 5 })],
      projection,
      FLAT_LAYER_PROFILE,
    );
    expect(west.fills).toHaveLength(2); // glow + core, no duplicate wrap-around draw
    expect(west.fills[1].x).toBeCloseTo(1023.72, 1); // near the right edge

    const east = createMockCtx();
    drawEarthquakesLayer(
      east.ctx,
      [quake({ lat: 0, lon: -179.9, magnitude: 5 })],
      projection,
      FLAT_LAYER_PROFILE,
    );
    expect(east.fills).toHaveLength(2);
    expect(east.fills[1].x).toBeCloseTo(0.28, 1); // near the left edge
  });
});
