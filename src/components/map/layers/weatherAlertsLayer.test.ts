import { describe, expect, it, vi } from "vitest";
import { drawWeatherAlertsLayer } from "./weatherAlertsLayer";
import {
  AZIMUTHAL_LAYER_PROFILE,
  FLAT_LAYER_PROFILE,
} from "@/lib/map/mapLayerProfile";
import type { EquirectangularProjection } from "@/lib/map/projection";
import type { WeatherAlert } from "@/lib/api/weather";

/** Minimal recording stub of the CanvasRenderingContext2D surface
 * `drawWeatherAlertsLayer` uses: path-based triangle fill/stroke plus
 * fillText for the "!" glyph and the event label. Modeled on
 * `earthquakesLayer.test.ts`'s mock ctx. */
function createMockCtx() {
  const calls: string[] = [];
  let pathPoints: Array<{ x: number; y: number }> = [];
  const fills: Array<{
    vertices: Array<{ x: number; y: number }>;
    alpha: number;
    color: string;
  }> = [];
  const strokes: Array<{
    vertices: Array<{ x: number; y: number }>;
    alpha: number;
    color: string;
    lineWidth: number;
  }> = [];
  const texts: Array<{
    text: string;
    x: number;
    y: number;
    font: string;
    textAlign: string;
    textBaseline: string;
    fillStyle: string;
    globalAlpha: number;
    shadowColor: string;
    shadowBlur: number;
  }> = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    shadowColor: "",
    shadowBlur: 0,
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(() => {
      pathPoints = [];
      calls.push("beginPath");
    }),
    closePath: vi.fn(() => calls.push("closePath")),
    moveTo: vi.fn((x: number, y: number) => {
      pathPoints.push({ x, y });
      calls.push(`moveTo:${x},${y}`);
    }),
    lineTo: vi.fn((x: number, y: number) => {
      pathPoints.push({ x, y });
      calls.push(`lineTo:${x},${y}`);
    }),
    fill: vi.fn(() => {
      fills.push({
        vertices: [...pathPoints],
        alpha: ctx.globalAlpha,
        color: ctx.fillStyle as string,
      });
      calls.push("fill");
    }),
    stroke: vi.fn(() => {
      strokes.push({
        vertices: [...pathPoints],
        alpha: ctx.globalAlpha,
        color: ctx.strokeStyle as string,
        lineWidth: ctx.lineWidth,
      });
      calls.push("stroke");
    }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      texts.push({
        text,
        x,
        y,
        font: ctx.font as string,
        textAlign: ctx.textAlign as string,
        textBaseline: ctx.textBaseline as string,
        fillStyle: ctx.fillStyle as string,
        globalAlpha: ctx.globalAlpha,
        shadowColor: ctx.shadowColor as string,
        shadowBlur: ctx.shadowBlur as number,
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

function alert(overrides: Partial<WeatherAlert> = {}): WeatherAlert {
  return {
    id: "alert1",
    event: "Severe Thunderstorm Warning",
    headline: "Test headline",
    severity: "Severe",
    lat: 0,
    lon: 0,
    areaDesc: "Test area",
    urgency: "Immediate",
    certainty: "Observed",
    response: "Shelter",
    instruction: "Seek shelter immediately",
    polygon: null,
    ...overrides,
  };
}

describe("drawWeatherAlertsLayer", () => {
  it("draws nothing for an invisible point", () => {
    const { ctx, fills } = createMockCtx();
    const projection = fakeProjection({
      project: () => ({ x: 10, y: 20, visible: false }),
    });
    drawWeatherAlertsLayer(ctx, [alert()], projection, FLAT_LAYER_PROFILE);
    expect(fills).toHaveLength(0);
  });

  it("draws the triangle vertices at a known position on the FLAT profile", () => {
    const { ctx, fills, strokes } = createMockCtx();
    drawWeatherAlertsLayer(
      ctx,
      [alert()],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );

    // size = screenPx(8) = 8 (screenPx is identity here)
    expect(fills[0].vertices).toEqual([
      { x: 10, y: 12 }, // top: (x, y - size)
      { x: 18, y: 24.8 }, // bottom right: (x + size, y + size * 0.6)
      { x: 2, y: 24.8 }, // bottom left: (x - size, y + size * 0.6)
    ]);
    expect(fills[0].alpha).toBe(0.8);
    expect(strokes[0].color).toBe("rgba(0,0,0,0.5)");
    expect(strokes[0].lineWidth).toBe(0.5);
  });

  it("draws the triangle vertices at a known position on the AZIMUTHAL profile with a damping projection", () => {
    const { ctx, fills, strokes, texts } = createMockCtx();
    // Azimuthal always builds its Projection with zoomDamp: 1, so screenPx
    // is identity regardless of zoomScale -- modeled here with a halving
    // screenPx to prove the layer always calls through screenPx rather than
    // hardcoding the flat map's undamped triangle size.
    drawWeatherAlertsLayer(
      ctx,
      [alert()],
      fakeProjection({ screenPx: (px) => px / 2 }),
      AZIMUTHAL_LAYER_PROFILE,
    );

    // size = screenPx(8) = 4
    expect(fills[0].vertices).toEqual([
      { x: 10, y: 16 },
      { x: 14, y: 22.4 },
      { x: 6, y: 22.4 },
    ]);
    // lineWidth = screenPx(TRIANGLE_STROKE_WIDTH_PX) = screenPx(0.5) = 0.25
    expect(strokes[0].lineWidth).toBe(0.25);
    // glyphFontSize = Math.max(1, Math.round(screenPx(8))) = Math.max(1, 4) = 4
    const glyph = texts.find((t) => t.text === "!");
    expect(glyph?.font).toBe("bold 4px sans-serif");
  });

  it.each([
    { severity: "Extreme" as const, color: "#ff0040" },
    { severity: "Severe" as const, color: "#ff6600" },
    { severity: "Moderate" as const, color: "#ffaa00" },
    { severity: "Unknown" as const, color: "#ffdd44" },
  ])("maps severity $severity to fill color $color", ({ severity, color }) => {
    const { ctx, fills } = createMockCtx();
    drawWeatherAlertsLayer(
      ctx,
      [alert({ severity })],
      fakeProjection({ zoomScale: 2 }), // above FLAT's 1.5 threshold so the label paints too
      FLAT_LAYER_PROFILE,
    );
    expect(fills[0].color).toBe(color);
  });

  it("draws the '!' glyph in bold black sans-serif, centered/middle", () => {
    const { ctx, texts } = createMockCtx();
    drawWeatherAlertsLayer(
      ctx,
      [alert()],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    const glyph = texts.find((t) => t.text === "!");
    expect(glyph).toBeDefined();
    expect(glyph).toMatchObject({
      x: 10,
      y: 20,
      font: "bold 8px sans-serif",
      textAlign: "center",
      textBaseline: "middle",
      fillStyle: "#000000",
    });
  });

  describe("event label gate (labelMinZoomScale)", () => {
    it("FLAT profile at zoomScale 1.0 draws no label text", () => {
      const { ctx, texts } = createMockCtx();
      drawWeatherAlertsLayer(
        ctx,
        [alert()],
        fakeProjection({ zoomScale: 1.0 }),
        FLAT_LAYER_PROFILE,
      );
      // Only the "!" glyph should be present.
      expect(texts).toHaveLength(1);
      expect(texts[0].text).toBe("!");
    });

    it("FLAT profile at zoomScale 2.0 draws the label with font Math.max(1, Math.round(9 / 2))px", () => {
      const { ctx, texts } = createMockCtx();
      drawWeatherAlertsLayer(
        ctx,
        [alert({ event: "Tornado Warning" })],
        fakeProjection({ zoomScale: 2.0, screenPx: (px) => px / 2 }),
        FLAT_LAYER_PROFILE,
      );
      const label = texts.find((t) => t.text === "Tornado Warning");
      expect(label).toBeDefined();
      // Math.max(1, Math.round(9 / 2)) = Math.max(1, Math.round(4.5)) = 5
      expect(label?.font).toBe("5px sans-serif");
      expect(label?.textBaseline).toBe("top");
      expect(label?.fillStyle).toBe("#ff6600"); // Severe
      // y = point.y + size * 0.6 + screenPx(LABEL_OFFSET_PX)
      //   = 20 + screenPx(8) * 0.6 + screenPx(2) = 20 + 4 * 0.6 + 1 = 23.4
      expect(label?.y).toBeCloseTo(23.4);
    });

    it("FLAT profile at zoomScale exactly 1.5 draws no label text (strictly-greater-than gate)", () => {
      const { ctx, texts } = createMockCtx();
      drawWeatherAlertsLayer(
        ctx,
        [alert()],
        fakeProjection({ zoomScale: 1.5 }),
        FLAT_LAYER_PROFILE,
      );
      // Only the "!" glyph should be present; the gate is `>`, not `>=`.
      expect(texts).toHaveLength(1);
      expect(texts[0].text).toBe("!");
    });

    it("AZIMUTHAL profile draws the label at zoomScale 1.0 (always-on behaviour)", () => {
      const { ctx, texts } = createMockCtx();
      drawWeatherAlertsLayer(
        ctx,
        [alert({ event: "Flood Watch" })],
        fakeProjection({ zoomScale: 1.0 }),
        AZIMUTHAL_LAYER_PROFILE,
      );
      const label = texts.find((t) => t.text === "Flood Watch");
      expect(label).toBeDefined();
    });

    it("fails if the two labelMinZoomScale values were swapped", () => {
      // With FLAT's threshold (1.5) applied to an AZIMUTHAL-style always-on
      // call at zoomScale 1.0, the label must NOT be drawn -- pinning the
      // exact defect a swap would introduce.
      const { ctx, texts } = createMockCtx();
      drawWeatherAlertsLayer(
        ctx,
        [alert({ event: "Flood Watch" })],
        fakeProjection({ zoomScale: 1.0 }),
        {
          ...AZIMUTHAL_LAYER_PROFILE,
          weatherAlerts: FLAT_LAYER_PROFILE.weatherAlerts,
        },
      );
      expect(texts.find((t) => t.text === "Flood Watch")).toBeUndefined();
    });
  });

  it("truncates the event label at 16 chars plus an ellipsis", () => {
    const { ctx, texts } = createMockCtx();
    const longEvent = "Extreme Wind Warning For The Coast";
    drawWeatherAlertsLayer(
      ctx,
      [alert({ event: longEvent })],
      fakeProjection({ zoomScale: 2 }),
      FLAT_LAYER_PROFILE,
    );
    const label = texts.find((t) => t.text.includes("…"));
    expect(label?.text).toBe(longEvent.slice(0, 16) + "…");
    expect(label?.text.length).toBe(17); // 16 + the ellipsis character
  });

  it("does not truncate an event label of exactly 16 chars", () => {
    const { ctx, texts } = createMockCtx();
    const exact16 = "1234567890123456";
    expect(exact16).toHaveLength(16);
    drawWeatherAlertsLayer(
      ctx,
      [alert({ event: exact16 })],
      fakeProjection({ zoomScale: 2 }),
      FLAT_LAYER_PROFILE,
    );
    expect(texts.find((t) => t.text === exact16)).toBeDefined();
  });

  it("sets the label shadow then resets it, and never divides the shadowBlur literal by screenPx", () => {
    const { ctx, texts } = createMockCtx();
    drawWeatherAlertsLayer(
      ctx,
      [alert({ event: "Winter Storm Warning" })],
      fakeProjection({ zoomScale: 2, screenPx: (px) => px / 2 }),
      FLAT_LAYER_PROFILE,
    );
    const label = texts.find((t) => t.text === "Winter Storm War…");
    expect(label).toBeDefined();
    expect(label?.shadowColor).toBe("rgba(0, 0, 0, 0.8)");
    expect(label?.shadowBlur).toBe(2); // literal 2, NOT screenPx(2) = 1
    expect(ctx.shadowColor).toBe("transparent");
    expect(ctx.shadowBlur).toBe(0);
  });

  it("resets globalAlpha to 1 and balances save/restore", () => {
    const { ctx, calls } = createMockCtx();
    drawWeatherAlertsLayer(
      ctx,
      [alert()],
      fakeProjection(),
      FLAT_LAYER_PROFILE,
    );
    expect(ctx.globalAlpha).toBe(1);
    expect(calls[0]).toBe("save");
    expect(calls[calls.length - 1]).toBe("restore");
    expect(calls.filter((c) => c === "save")).toHaveLength(1);
    expect(calls.filter((c) => c === "restore")).toHaveLength(1);
  });
});
