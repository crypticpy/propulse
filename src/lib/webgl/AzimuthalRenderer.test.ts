import { describe, expect, it, vi } from "vitest";
import {
  AzimuthalRenderer,
  fitAzimuthalTextureDimensions,
  resolveAzimuthalDayTextureUrls,
  resolveAzimuthalNightTexture,
} from "./AzimuthalRenderer";

describe("AzimuthalRenderer texture policy", () => {
  it("keeps explicit seasonal candidates in fallback order", () => {
    expect(
      resolveAzimuthalDayTextureUrls({
        highRes: true,
        dayTextureUrls: ["seasonal-4k.jpg", "seasonal-local.jpg", "base.jpg"],
      }),
    ).toEqual(["seasonal-4k.jpg", "seasonal-local.jpg", "base.jpg"]);
  });

  it("clamps oversized imagery to the GPU while preserving aspect ratio", () => {
    expect(fitAzimuthalTextureDimensions(8_192, 4_096, 4_096)).toEqual({
      width: 4_096,
      height: 2_048,
    });
    expect(fitAzimuthalTextureDimensions(2_048, 1_024, 4_096)).toEqual({
      width: 2_048,
      height: 1_024,
    });
  });

  it("keeps texture ownership distinct when night imagery falls back", () => {
    const dayTexture = { id: "day" } as WebGLTexture;
    const nightTexture = { id: "night-placeholder" } as WebGLTexture;
    expect(resolveAzimuthalNightTexture(dayTexture, nightTexture, true)).toBe(
      dayTexture,
    );

    const deleteTexture = vi.fn();
    const renderer = new AzimuthalRenderer();
    Object.assign(renderer, {
      gl: {
        deleteTexture,
        deleteBuffer: vi.fn(),
        deleteProgram: vi.fn(),
      } as unknown as WebGLRenderingContext,
      dayTexture,
      nightTexture,
    });
    renderer.dispose();
    expect(deleteTexture).toHaveBeenCalledTimes(2);
    expect(deleteTexture).toHaveBeenCalledWith(dayTexture);
    expect(deleteTexture).toHaveBeenCalledWith(nightTexture);
  });

  it("cancels pending image callbacks before disposing the GL context", () => {
    const renderer = new AzimuthalRenderer();
    const image = {
      onload: vi.fn(),
      onerror: vi.fn(),
      src: "/textures/seasonal-4k.jpg",
    };
    const pendingImages = new Set([image]);
    Object.assign(renderer, { pendingImages });

    renderer.dispose();

    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.src).toBe("");
    expect(pendingImages.size).toBe(0);
  });
});
