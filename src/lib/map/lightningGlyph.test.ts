import { describe, expect, it, vi } from "vitest";
import {
  LIGHTNING_BOLT_PATH,
  drawLightningBolt,
  getLightningGlyphImageData,
  getLightningGlyphTexture,
  resolveLightningTone,
} from "./lightningGlyph";

/** Minimal recording stub of CanvasRenderingContext2D's path/fill surface. */
function createMockCtx() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: "",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(() => calls.push("beginPath")),
    closePath: vi.fn(() => calls.push("closePath")),
    fill: vi.fn(() => calls.push("fill")),
    moveTo: vi.fn((x: number, y: number) => calls.push(`moveTo:${x},${y}`)),
    lineTo: vi.fn((x: number, y: number) => calls.push(`lineTo:${x},${y}`)),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("LIGHTNING_BOLT_PATH", () => {
  it("is a closed zig-zag with at least five vertices, all within the unit box", () => {
    expect(LIGHTNING_BOLT_PATH.length).toBeGreaterThanOrEqual(5);
    for (const [x, y] of LIGHTNING_BOLT_PATH) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe("drawLightningBolt", () => {
  it("moves to the first point, lines through the rest, closes, and fills in the given colour", () => {
    const { ctx, calls } = createMockCtx();
    drawLightningBolt(ctx, 40, "rgb(1 2 3)");

    expect(ctx.fillStyle).toBe("rgb(1 2 3)");
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
    expect(calls).toContain("beginPath");
    expect(calls).toContain("closePath");
    expect(calls).toContain("fill");

    const [first, ...rest] = LIGHTNING_BOLT_PATH;
    expect(calls).toContain(`moveTo:${first[0] * 40},${first[1] * 40}`);
    for (const [x, y] of rest) {
      expect(calls).toContain(`lineTo:${x * 40},${y * 40}`);
    }
  });

  it("scales the path linearly with size", () => {
    const small = createMockCtx();
    const large = createMockCtx();
    drawLightningBolt(small.ctx, 10, "#fff");
    drawLightningBolt(large.ctx, 20, "#fff");

    const [firstPoint] = LIGHTNING_BOLT_PATH;
    expect(small.calls).toContain(
      `moveTo:${firstPoint[0] * 10},${firstPoint[1] * 10}`,
    );
    expect(large.calls).toContain(
      `moveTo:${firstPoint[0] * 20},${firstPoint[1] * 20}`,
    );
  });
});

describe("resolveLightningTone", () => {
  it("falls back to the caution default when no stylesheet declares --hc-warn", () => {
    // jsdom runs with no compiled CSS, so both --hc-warn and --hc-warn-rgb
    // resolve empty here and the hard-coded fallback (matching
    // --color-caution-rgb's own default) applies.
    expect(resolveLightningTone()).toBe("rgb(255 210 63)");
  });
});

describe("getLightningGlyphTexture", () => {
  it("returns null when canvas 2D rendering isn't available (jsdom default)", () => {
    expect(getLightningGlyphTexture("rgb(9 9 9)")).toBeNull();
  });
});

describe("getLightningGlyphImageData", () => {
  it("returns null when canvas 2D rendering isn't available (jsdom default)", () => {
    expect(getLightningGlyphImageData("rgb(9 9 9)")).toBeNull();
  });
});
