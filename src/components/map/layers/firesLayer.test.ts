import { describe, expect, it, vi } from "vitest";
import { drawFiresLayer } from "./firesLayer";
import {
  AZIMUTHAL_LAYER_PROFILE,
  FLAT_LAYER_PROFILE,
} from "@/lib/map/mapLayerProfile";
import type { Projection } from "@/lib/map/projection";
import type { FireHotspot } from "@/lib/api/fires";

/** Minimal recording stub of CanvasRenderingContext2D's fill-circle surface. */
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

// The spread-of-overrides pattern below widens `kind` to the full union
// before the merge, so the object literal needs an `as Projection` cast
// (discriminated union `Omit<>`/spread doesn't distribute -- see CLAUDE.md).
// wrapWidth/wrapHeight are unused by this layer -- any numbers satisfy the
// equirectangular branch's now-required fields (#1091 PR 7).
function fakeProjection(overrides: Partial<Projection> = {}): Projection {
  return {
    kind: "equirectangular",
    zoomScale: 1,
    wrapWidth: 1024,
    wrapHeight: 512,
    project: () => ({ x: 10, y: 20, visible: true }),
    scaleAt: () => ({ pxPerKm: 1, stretch: 1 }),
    screenPx: (px) => px,
    ...overrides,
  } as Projection;
}

function hotspot(overrides: Partial<FireHotspot> = {}): FireHotspot {
  return {
    lat: 0,
    lon: 0,
    brightness: 300,
    confidence: "nominal",
    frp: 240,
    ...overrides,
  };
}

describe("drawFiresLayer", () => {
  it("draws nothing for a low-confidence hotspot", () => {
    const { ctx, calls, fills } = createMockCtx();
    drawFiresLayer(
      ctx,
      [hotspot({ confidence: "low" })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(fills).toHaveLength(0);
    expect(calls).toEqual(["save", "restore"]);
  });

  it("draws nothing for an invisible point", () => {
    const { ctx, fills } = createMockCtx();
    const projection = fakeProjection({
      project: () => ({ x: 10, y: 20, visible: false }),
    });
    drawFiresLayer(ctx, [hotspot()], projection, FLAT_LAYER_PROFILE);
    expect(fills).toHaveLength(0);
  });

  it("draws a glow pass then a core pass at the projected point", () => {
    const { ctx, fills } = createMockCtx();
    // frp 240 / fires.frpPerRadiusPx 80 = 3, within [1.5, 6]
    drawFiresLayer(
      ctx,
      [hotspot({ frp: 240 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    expect(fills).toHaveLength(2);
    expect(fills[0]).toMatchObject({
      x: 10,
      y: 20,
      radius: 6,
      alpha: 0.2,
      color: "#ff6600",
    });
    expect(fills[1]).toMatchObject({
      x: 10,
      y: 20,
      radius: 3,
      alpha: 0.7,
      color: "#ff2200",
    });
  });

  it("resets globalAlpha to 1 and balances save/restore", () => {
    const { ctx, calls } = createMockCtx();
    drawFiresLayer(
      ctx,
      [hotspot({ frp: 240 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    expect(ctx.globalAlpha).toBe(1);
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
    expect(calls.filter((c) => c === "save")).toHaveLength(1);
    expect(calls.filter((c) => c === "restore")).toHaveLength(1);
  });

  describe("flat vs. azimuthal profile parity (drift is intentional, see #1091 drift census)", () => {
    it("frp 400 -> core radius 5 under FLAT and 4 under AZIMUTHAL, with the profile's glow alpha", () => {
      const flat = createMockCtx();
      drawFiresLayer(
        flat.ctx,
        [hotspot({ frp: 400 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[0]).toMatchObject({ radius: 10, alpha: 0.2 }); // glow = core * 2
      expect(flat.fills[1]).toMatchObject({ radius: 5, alpha: 0.7 });

      const az = createMockCtx();
      drawFiresLayer(
        az.ctx,
        [hotspot({ frp: 400 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[0]).toMatchObject({ radius: 8, alpha: 0.25 }); // glow = core * 2
      expect(az.fills[1]).toMatchObject({ radius: 4, alpha: 0.7 });
    });

    it("frp 10 floors the core radius at 1.5 under both profiles", () => {
      const flat = createMockCtx();
      drawFiresLayer(
        flat.ctx,
        [hotspot({ frp: 10 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[1].radius).toBe(1.5);

      const az = createMockCtx();
      drawFiresLayer(
        az.ctx,
        [hotspot({ frp: 10 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[1].radius).toBe(1.5);
    });

    it("frp 10000 caps the core radius at 6 (FLAT) and 5 (AZIMUTHAL)", () => {
      const flat = createMockCtx();
      drawFiresLayer(
        flat.ctx,
        [hotspot({ frp: 10000 })],
        fakeProjection(),
        FLAT_LAYER_PROFILE,
      );
      expect(flat.fills[1].radius).toBe(6);

      const az = createMockCtx();
      drawFiresLayer(
        az.ctx,
        [hotspot({ frp: 10000 })],
        fakeProjection(),
        AZIMUTHAL_LAYER_PROFILE,
      );
      expect(az.fills[1].radius).toBe(5);
    });
  });

  it("applies screenPx to the clamped radius, halving both the glow and core radii", () => {
    const unscaled = createMockCtx();
    drawFiresLayer(
      unscaled.ctx,
      [hotspot({ frp: 240 })],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    const halved = createMockCtx();
    const halvingProjection = fakeProjection({ screenPx: (px) => px / 2 });
    drawFiresLayer(
      halved.ctx,
      [hotspot({ frp: 240 })],
      halvingProjection,
      FLAT_LAYER_PROFILE,
    );

    expect(halved.fills[0].radius).toBe(unscaled.fills[0].radius / 2);
    expect(halved.fills[1].radius).toBe(unscaled.fills[1].radius / 2);
  });
});
