import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawLightningLayer } from "./lightningLayer";
import { createEquirectangularProjection } from "@/lib/map/projection";
import type { EquirectangularProjection } from "@/lib/map/projection";
import type { LightningStrike } from "@/lib/api/lightning";

/** Minimal recording stub of CanvasRenderingContext2D's fill-circle surface.
 * Modeled on `earthquakesLayer.test.ts`'s mock ctx. */
function createMockCtx() {
  const calls: string[] = [];
  const fills: Array<{
    x: number;
    y: number;
    radius: number;
    alpha: number;
    color: string;
  }> = [];
  let lastArc = { x: 0, y: 0, radius: 0 };
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
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
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, fills };
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

function strike(overrides: Partial<LightningStrike> = {}): LightningStrike {
  return {
    lat: 0,
    lon: 0,
    time: Date.now(),
    currentKA: 100,
    ...overrides,
  };
}

const NOW = new Date("2026-09-11T12:00:00.000Z");

describe("drawLightningLayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a fresh 100 kA strike gives glow radius 3 and core radius 1.5 at alphas 0.3 and 0.8 (intensity 0.5, at the LIGHTNING_STRONG_KA boundary)", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 100, time: NOW.getTime() })],
      fakeProjection(),
    );

    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({
      x: 10,
      y: 20,
      radius: 3,
      alpha: 0.3,
      color: "#ffe566",
    });
    expect(fills[1]).toMatchObject({
      x: 10,
      y: 20,
      radius: 1.5,
      alpha: 0.8,
      // Exactly at LIGHTNING_STRONG_KA (100): the comparison is strict `>`,
      // so this strike does NOT get the strong colour.
      color: "#ffe566",
    });
  });

  it("a 101 kA strike (just above LIGHTNING_STRONG_KA) picks the strong colour", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 101, time: NOW.getTime() })],
      fakeProjection(),
    );
    expect(fills[1].color).toBe("#ffffff");
  });

  it("a 400 kA strike clamps intensity to 1 and picks LIGHTNING_COLOR_STRONG", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 400, time: NOW.getTime() })],
      fakeProjection(),
    );

    // glow = 6 * intensity(1); the glow keeps the flat colour even above the strong threshold
    expect(fills[0]).toMatchObject({ radius: 6, alpha: 0.3, color: "#ffe566" });
    expect(fills[1]).toMatchObject({
      radius: 3, // core = 3 * intensity(1)
      alpha: 0.8,
      color: "#ffffff",
    });
  });

  it("a 20 kA strike floors intensity at 0.3", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 20, time: NOW.getTime() })],
      fakeProjection(),
    );

    // intensity = max(0.3, min(1, 20/200=0.1)) = 0.3
    expect(fills[0].radius).toBeCloseTo(1.8, 10); // 6 * 0.3
    expect(fills[1].radius).toBeCloseTo(0.9, 10); // 3 * 0.3
    expect(fills[1].color).toBe("#ffe566");
  });

  it("a 5-minute-old strike halves the alphas", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 100, time: NOW.getTime() - 5 * 60 * 1000 })],
      fakeProjection(),
    );

    // age/window = 5min/10min = 0.5 -> alpha = 1 - 0.5 = 0.5, half of the
    // fresh-strike alphas (0.3 and 0.8).
    expect(fills[0].alpha).toBeCloseTo(0.15, 10);
    expect(fills[1].alpha).toBeCloseTo(0.4, 10);
  });

  it("a 30-minute-old strike floors alpha at 0.1", () => {
    const { ctx, fills } = createMockCtx();
    drawLightningLayer(
      ctx,
      [strike({ currentKA: 100, time: NOW.getTime() - 30 * 60 * 1000 })],
      fakeProjection(),
    );

    // age/window = 30min/10min = 3 -> 1 - 3 = -2, floored at 0.1
    expect(fills[0].alpha).toBeCloseTo(0.03, 10); // 0.1 * 0.3
    expect(fills[1].alpha).toBeCloseTo(0.08, 10); // 0.1 * 0.8
  });

  it("a halving projection halves both radii, and only the radii", () => {
    const unscaled = createMockCtx();
    drawLightningLayer(
      unscaled.ctx,
      [strike({ currentKA: 150, time: NOW.getTime() })],
      fakeProjection(),
    );

    const halved = createMockCtx();
    drawLightningLayer(
      halved.ctx,
      [strike({ currentKA: 150, time: NOW.getTime() })],
      fakeProjection({ screenPx: (px) => px / 2 }),
    );

    expect(halved.fills[0].radius).toBe(unscaled.fills[0].radius / 2);
    expect(halved.fills[1].radius).toBe(unscaled.fills[1].radius / 2);
    // alpha and color are not run through screenPx and must be unaffected.
    expect(halved.fills[0].alpha).toBe(unscaled.fills[0].alpha);
    expect(halved.fills[1].alpha).toBe(unscaled.fills[1].alpha);
    expect(halved.fills[0].color).toBe(unscaled.fills[0].color);
    expect(halved.fills[1].color).toBe(unscaled.fills[1].color);
  });

  it("draws nothing for an invisible point", () => {
    const { ctx, fills } = createMockCtx();
    const projection = fakeProjection({
      project: () => ({ x: 10, y: 20, visible: false }),
    });
    drawLightningLayer(ctx, [strike()], projection);
    expect(fills).toHaveLength(0);
  });

  it("resets globalAlpha to 1 and balances save/restore", () => {
    const { ctx, calls } = createMockCtx();
    drawLightningLayer(ctx, [strike()], fakeProjection());

    expect(ctx.globalAlpha).toBe(1);
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
    expect(calls.filter((c) => c === "save")).toHaveLength(1);
    expect(calls.filter((c) => c === "restore")).toHaveLength(1);
  });

  it("wraps a pair of strikes straddling the antimeridian to opposite edges of the real equirectangular projection, each drawn once", () => {
    const projection = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 1,
    });

    const west = createMockCtx();
    drawLightningLayer(
      west.ctx,
      [strike({ lat: 0, lon: 179.9, currentKA: 100, time: NOW.getTime() })],
      projection,
    );
    expect(west.fills).toHaveLength(2); // glow + core, no duplicate wrap-around draw
    expect(west.fills[1].x).toBeCloseTo(1023.72, 1); // near the right edge

    const east = createMockCtx();
    drawLightningLayer(
      east.ctx,
      [strike({ lat: 0, lon: -179.9, currentKA: 100, time: NOW.getTime() })],
      projection,
    );
    expect(east.fills).toHaveLength(2);
    expect(east.fills[1].x).toBeCloseTo(0.28, 1); // near the left edge
  });
});
