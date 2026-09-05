import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaders } from "@/lib/api/authFetch";
import { ALL_PROVIDERS } from "./providers";
import { createFlatTileLayer, getFlatTileWindow } from "./flatTileLayer";

vi.mock("@/lib/api/authFetch", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })),
}));

class FakeImage {
  static instances: FakeImage[] = [];
  constructor() {
    FakeImage.instances.push(this);
  }
  crossOrigin: string | null = null;
  naturalWidth = 512;
  naturalHeight = 512;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private value = "";

  set src(value: string) {
    this.value = value;
    if (value.startsWith("blob:")) queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this.value;
  }
}

describe("createFlatTileLayer", () => {
  const projectionDraw = vi.fn();
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    projectionDraw.mockClear();
    FakeImage.instances = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: projectionDraw,
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["tile"], { type: "image/jpeg" }),
      })),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:tile"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("loads HD imagery at the broad 4K home view and requests only the actual viewport", () => {
    const view = {
      scale: 1.3,
      offsetX: -500,
      offsetY: -200,
      renderWidth: 4188,
      renderHeight: 2094,
      viewportWidth: 3270,
      viewportHeight: 2000,
      devicePixelRatio: 1,
    };
    const window = getFlatTileWindow(ALL_PROVIDERS["mapbox-satellite"], view)!;
    expect(window.zoom).toBe(4);
    expect(window.mapBounds.right).toBeCloseTo((3270 + 500) / 1.3);
    expect(window.mapBounds.bottom).toBeCloseTo((2000 + 200) / 1.3);
  });

  it("warps each decoded tile once and reuses the projected pixels without another fetch", async () => {
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { maxConcurrentRequests: 64 },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const view = {
      scale: 64,
      offsetX: -32256,
      offsetY: -16128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    };
    layer.draw(context, view);
    await vi.waitFor(() => expect(layer.draw(context, view)).toBe(true));
    const warps = projectionDraw.mock.calls.length;
    const fetches = vi.mocked(fetch).mock.calls.length;
    expect(warps).toBeGreaterThan(0);
    const projectedSources = new Set(
      projectionDraw.mock.calls.map(([source]) => source),
    );
    for (const source of projectedSources) {
      expect(source.src).toBe("");
      expect(source.onload).toBeNull();
      expect(source.onerror).toBeNull();
    }
    for (let i = 0; i < 20; i++) layer.draw(context, view);
    expect(projectionDraw).toHaveBeenCalledTimes(warps);
    expect(fetch).toHaveBeenCalledTimes(fetches);
    layer.dispose();
  });

  it("fetches bearer-protected flat-map tiles with authorization headers", async () => {
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    layer.draw(context, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(authHeaders).toHaveBeenCalledWith(
      expect.objectContaining({ Accept: expect.stringContaining("image/") }),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tiles/proxy?provider=mapbox"),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
        signal: expect.any(AbortSignal),
      }),
    );

    layer.dispose();
  });

  it("reports whether provider imagery actually contributed to the frame", async () => {
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const view = {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    };

    expect(layer.draw(context, view)).toBe(false);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.waitFor(() => expect(layer.draw(context, view)).toBe(true));

    expect(context.drawImage).toHaveBeenCalled();
    layer.dispose();
  });

  it("does not draw or credit exact-level tiles that are only prefetched", async () => {
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { prefetchRadius: 1 },
    );
    const drawImage = vi.fn();
    const context = {
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    const view = {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    };

    layer.draw(context, view);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await vi.waitFor(() => {
      drawImage.mockClear();
      expect(layer.draw(context, view)).toBe(true);
    });

    const visibleLeft = -view.offsetX / view.scale;
    const visibleRight = (view.renderWidth - view.offsetX) / view.scale;
    for (const call of drawImage.mock.calls) {
      const destinationX = call[5] as number;
      const destinationWidth = call[7] as number;
      expect(destinationX).toBeLessThan(visibleRight);
      expect(destinationX + destinationWidth).toBeGreaterThan(visibleLeft);
    }

    layer.dispose();
  });

  it("keeps visible ancestor tiles loading for seamless zoom fallback", async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    layer.draw(context, {
      scale: 16,
      offsetX: -7_680,
      offsetY: -3_840,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    await vi.waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls).toEqual(
        expect.arrayContaining([expect.stringContaining("z=5")]),
      );
    });
    const ancestorSignals = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("z=5"))
      .map(([, init]) => init?.signal);

    layer.draw(context, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    await vi.waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls).toEqual(
        expect.arrayContaining([expect.stringContaining("z=7")]),
      );
    });
    expect(ancestorSignals).not.toHaveLength(0);
    expect(ancestorSignals.some((signal) => signal?.aborted === false)).toBe(
      true,
    );

    layer.dispose();
  });

  it("reports a protected provider unavailable after repeated tile errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);
    const onProviderUnavailable = vi.fn();
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { onProviderUnavailable },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    layer.draw(context, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    await vi.waitFor(() =>
      expect(onProviderUnavailable).toHaveBeenCalledOnce(),
    );
    layer.dispose();
  });

  it("bounds concurrent tile requests and aborts them on disposal", async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { maxConcurrentRequests: 2, prefetchRadius: 1 },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    layer.draw(context, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const signals = vi.mocked(fetch).mock.calls.map(([, init]) => init?.signal);
    expect(signals.every((signal) => signal?.aborted === false)).toBe(true);

    layer.dispose();
    expect(signals.every((signal) => signal?.aborted === true)).toBe(true);
  });

  it("waits for the view to settle before starting high-detail requests", async () => {
    vi.useFakeTimers();
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { settleDelayMs: 120, maxConcurrentRequests: 1 },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    layer.draw(context, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalled();
    layer.dispose();
    vi.useRealTimers();
  });

  it("removes the offscreen prefetch ring during active navigation", () => {
    const provider = ALL_PROVIDERS["mapbox-satellite"];
    const view = {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    };

    const settled = getFlatTileWindow(provider, view, 0, 1);
    const moving = getFlatTileWindow(
      provider,
      { ...view, navigationActive: true },
      0,
      1,
    );

    expect(settled).not.toBeNull();
    expect(moving?.requested).toEqual(moving?.visible);
    expect(settled?.requested.xStart).toBeLessThan(settled!.visible.xStart);
    expect(settled?.requested.xEnd).toBeGreaterThan(settled!.visible.xEnd);
  });

  it("keeps edge viewports inside the wrapped XYZ and Mercator limits", () => {
    const provider = ALL_PROVIDERS["mapbox-satellite"];
    const west = getFlatTileWindow(
      provider,
      {
        scale: 32,
        offsetX: 0,
        offsetY: -7_936,
        renderWidth: 1024,
        renderHeight: 512,
        devicePixelRatio: 1,
      },
      0,
      1,
    );
    const polarOnly = getFlatTileWindow(provider, {
      scale: 64,
      offsetX: 0,
      offsetY: 0,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
    });

    expect(west?.requested.xStart).toBe(0);
    expect(west?.requested.xEnd).toBeLessThan(1 << west!.zoom);
    expect(polarOnly).toBeNull();
  });

  it("coalesces a batch of tile completions into one frame invalidation", async () => {
    const scheduled: FrameRequestCallback[] = [];
    const onTileLoaded = vi.fn();
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      onTileLoaded,
      {
        maxConcurrentRequests: 4,
        scheduleFrame: (callback) => {
          scheduled.push(callback);
          return scheduled.length;
        },
        cancelFrame: vi.fn(),
      },
    );

    layer.draw({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D, {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
      navigationActive: true,
    });

    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    expect(onTileLoaded).not.toHaveBeenCalled();
    scheduled[0](performance.now());
    expect(onTileLoaded).toHaveBeenCalledOnce();
    layer.dispose();
  });

  it("cancels obsolete visible requests after a navigation change", async () => {
    vi.mocked(fetch).mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { maxConcurrentRequests: 2 },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const centeredView = {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
      navigationActive: true,
    };

    layer.draw(context, centeredView);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const obsoleteSignals = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => init?.signal);

    layer.draw(context, { ...centeredView, offsetX: -1_000 });

    expect(obsoleteSignals.every((signal) => signal?.aborted)).toBe(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    layer.dispose();
  });

  it("reuses ready cache entries after a rapid pan reversal", async () => {
    const layer = createFlatTileLayer(
      ALL_PROVIDERS["mapbox-satellite"],
      vi.fn(),
      { maxConcurrentRequests: 64 },
    );
    const context = {
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const centeredView = {
      scale: 64,
      offsetX: -32_256,
      offsetY: -16_128,
      renderWidth: 1024,
      renderHeight: 512,
      devicePixelRatio: 1,
      navigationActive: true,
    };

    const window = getFlatTileWindow(
      ALL_PROVIDERS["mapbox-satellite"],
      centeredView,
    )!;
    const visibleRequestCount =
      (window.requested.xEnd - window.requested.xStart + 1) *
      (window.requested.yEnd - window.requested.yStart + 1);

    layer.draw(context, centeredView);
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledTimes(visibleRequestCount),
    );
    await vi.waitFor(() =>
      expect(layer.draw(context, centeredView)).toBe(true),
    );
    const requestsAfterFirstView = vi.mocked(fetch).mock.calls.length;

    layer.draw(context, { ...centeredView, offsetX: -1_000 });
    layer.draw(context, centeredView);
    await Promise.resolve();

    expect(layer.draw(context, centeredView)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(requestsAfterFirstView);
    layer.dispose();
  });
});
