import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIGHTNING_BOLT_PATH,
  drawLightningBolt,
  getLightningGlyphImageData,
  getLightningGlyphTexture,
  observeLightningTone,
  resolveLightningGlow,
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

  it("draws only the solid bolt when glow is 0 (the default)", () => {
    const { ctx, calls } = createMockCtx();
    drawLightningBolt(ctx, 40, "rgb(1 2 3)");
    expect(calls.filter((c) => c === "fill")).toHaveLength(1);
  });

  it("draws a soft halo pass before the solid bolt when glow > 0", () => {
    const { ctx, calls } = createMockCtx();
    drawLightningBolt(ctx, 40, "rgb(1 2 3)", 0.5);

    // Halo pass, then the solid bolt — two full save/fill/restore cycles.
    expect(calls.filter((c) => c === "fill")).toHaveLength(2);
    expect(calls.filter((c) => c === "save")).toHaveLength(2);
    expect(calls.filter((c) => c === "restore")).toHaveLength(2);
    expect(ctx.shadowColor).toBe("rgb(1 2 3)");
    expect(ctx.shadowBlur).toBe(0.5 * 40 * 0.25);
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

describe("resolveLightningTone / resolveLightningGlow (themed element)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("read --hc-warn/--hc-glow from the nearest [data-hamclock-theme] element rather than <html>", () => {
    // In hamclock-themes.css, classic/brass overrides are scoped to
    // [data-hamclock-theme="..."], and HamClockView.tsx sets that attribute
    // on a div inside the view, never on document.documentElement. If the
    // resolvers read document.documentElement (as before this fix), they'd
    // see jsdom's blank <html> and fall back to the pulse defaults
    // regardless of the theme.
    const themed = document.createElement("div");
    themed.setAttribute("data-hamclock-theme", "classic");
    themed.style.setProperty("--hc-warn", "rgb(10 20 30)");
    themed.style.setProperty("--hc-glow", "0");
    document.body.appendChild(themed);

    expect(resolveLightningTone()).toBe("rgb(10 20 30)");
    expect(resolveLightningGlow()).toBe(0);
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

describe("resolveLightningGlow", () => {
  it("falls back to no halo when no stylesheet declares --hc-glow", () => {
    // jsdom runs with no compiled CSS, so --hc-glow resolves empty here and
    // the fallback (matching the var(--hc-glow, 0) default baked into
    // hamclock-themes.css) applies.
    expect(resolveLightningGlow()).toBe(0);
  });
});

describe("observeLightningTone", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-color-blind");
    document.documentElement.removeAttribute("data-hamclock-theme");
  });

  it("fires the callback when a watched attribute changes, and stops once disposed", async () => {
    const callback = vi.fn();
    const dispose = observeLightningTone(callback);

    document.documentElement.setAttribute("data-color-blind", "deuteranopia");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalledTimes(1);

    dispose();
    document.documentElement.setAttribute("data-hamclock-theme", "brass");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("returns a no-op disposer when MutationObserver isn't available", () => {
    const original = globalThis.MutationObserver;
    // @ts-expect-error -- simulating an environment without MutationObserver
    delete globalThis.MutationObserver;

    const dispose = observeLightningTone(vi.fn());
    expect(() => dispose()).not.toThrow();

    globalThis.MutationObserver = original;
  });

  it("fires when data-hamclock-theme changes on a descendant div, not only on <html>", async () => {
    // HamClockView.tsx sets data-hamclock-theme on a div inside the view,
    // not on document.documentElement — the observer must watch the subtree
    // to see it.
    const themed = document.createElement("div");
    document.body.appendChild(themed);

    const callback = vi.fn();
    const dispose = observeLightningTone(callback);

    themed.setAttribute("data-hamclock-theme", "brass");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalledTimes(1);

    dispose();
    themed.remove();
  });
});
