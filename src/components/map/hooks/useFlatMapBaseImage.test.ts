import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MapStyle } from "@/stores/mapStore";
import { useFlatMapBaseImage } from "./useFlatMapBaseImage";

const NativeImage = globalThis.Image;

class MockImage {
  onload: (() => void) | null = null;
  crossOrigin = "";
  complete = false;
  src = "";
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.Image = NativeImage;
});

describe("useFlatMapBaseImage", () => {
  it("does not request or retain satellite imagery in Standard mode", () => {
    const imageConstructor = vi.fn(() => new MockImage());
    vi.stubGlobal("Image", imageConstructor);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useFlatMapBaseImage("standard", true, "extreme"),
    );

    expect(result.current).toBeNull();
    expect(imageConstructor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears imagery and aborts an in-flight UHD probe on Standard switch", () => {
    const images: MockImage[] = [];
    vi.stubGlobal(
      "Image",
      vi.fn(() => {
        const image = new MockImage();
        images.push(image);
        return image;
      }),
    );
    let probeSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        probeSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    );

    const { result, rerender } = renderHook(
      ({ style }: { style: MapStyle }) =>
        useFlatMapBaseImage(style, true, "uhd"),
      { initialProps: { style: "satellite" as MapStyle } },
    );
    act(() => images[0].onload?.());
    expect(result.current).toBe(images[0]);
    expect(probeSignal?.aborted).toBe(false);

    rerender({ style: "standard" });
    expect(result.current).toBeNull();
    expect(probeSignal?.aborted).toBe(true);
    expect(images[0].onload).toBeNull();
  });

  it("probes UHD imagery even when the legacy manual toggle is off", () => {
    vi.stubGlobal("Image", vi.fn(() => new MockImage()));
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useFlatMapBaseImage("satellite", false, "uhd"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
