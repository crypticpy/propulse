import { beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaders } from "@/lib/api/authFetch";
import { ALL_PROVIDERS } from "./providers";
import { createFlatTileLayer } from "./flatTileLayer";

vi.mock("@/lib/api/authFetch", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer test-token" })),
}));

class FakeImage {
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
  beforeEach(() => {
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

    await vi.waitFor(() => expect(onProviderUnavailable).toHaveBeenCalledOnce());
    layer.dispose();
  });
});
