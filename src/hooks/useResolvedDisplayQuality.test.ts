import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResolvedDisplayQuality } from "./useResolvedDisplayQuality";

const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
const originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
const originalDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
const originalConnection = Object.getOwnPropertyDescriptor(
  navigator,
  "connection",
);

function setDisplay(width: number, height: number, dpr: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: dpr,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
  if (originalHeight) {
    Object.defineProperty(window, "innerHeight", originalHeight);
  }
  if (originalDpr) {
    Object.defineProperty(window, "devicePixelRatio", originalDpr);
  }
  if (originalConnection) {
    Object.defineProperty(navigator, "connection", originalConnection);
  } else {
    Reflect.deleteProperty(navigator, "connection");
  }
});

describe("useResolvedDisplayQuality", () => {
  it("re-resolves Auto after display and Save-Data changes", () => {
    const connection = Object.assign(new EventTarget(), { saveData: false });
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: connection,
    });
    setDisplay(1280, 720, 1);

    const { result } = renderHook(() => useResolvedDisplayQuality("auto"));
    expect(result.current.effective).toBe("balanced");

    act(() => {
      setDisplay(3840, 2160, 1);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.effective).toBe("uhd");

    act(() => {
      connection.saveData = true;
      connection.dispatchEvent(new Event("change"));
    });
    expect(result.current.effective).toBe("data-saver");
  });

  it("re-resolves Auto on a DPR-only monitor change and removes its listener", () => {
    let resolutionListener: EventListener | null = null;
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(
          (_type: string, listener: EventListener) => {
            resolutionListener = listener;
          },
        ),
        removeEventListener,
      })),
    );
    setDisplay(1920, 1080, 1);

    const { result, unmount } = renderHook(() =>
      useResolvedDisplayQuality("auto"),
    );
    expect(result.current.effective).toBe("balanced");

    act(() => {
      setDisplay(1920, 1080, 2);
      resolutionListener?.(new Event("change"));
    });
    expect(result.current.effective).toBe("uhd");

    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it("propagates DPR-only changes that remain in the Balanced tier", () => {
    let resolutionListener: EventListener | null = null;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(
          (_type: string, listener: EventListener) => {
            resolutionListener = listener;
          },
        ),
        removeEventListener: vi.fn(),
      })),
    );
    setDisplay(1280, 720, 1);
    const { result } = renderHook(() => useResolvedDisplayQuality("auto"));
    expect(result.current.effective).toBe("balanced");
    expect(result.current.renderDevicePixelRatio).toBe(1);

    act(() => {
      setDisplay(1280, 720, 1.5);
      resolutionListener?.(new Event("change"));
    });

    expect(result.current.effective).toBe("balanced");
    expect(result.current.renderDevicePixelRatio).toBe(1.5);
  });

  it("keeps explicit quality fixed while updating its live render DPR", () => {
    let resolutionListener: EventListener | null = null;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addEventListener: vi.fn(
          (_type: string, listener: EventListener) => {
            resolutionListener = listener;
          },
        ),
        removeEventListener: vi.fn(),
      })),
    );
    setDisplay(640, 480, 1);
    const { result } = renderHook(() => useResolvedDisplayQuality("extreme"));
    expect(result.current.renderDevicePixelRatio).toBe(1);

    act(() => {
      setDisplay(640, 480, 2);
      resolutionListener?.(new Event("change"));
    });

    expect(result.current.effective).toBe("extreme");
    expect(result.current.renderDevicePixelRatio).toBe(2);
  });

  it.each([
    ["data-saver", 2, 1],
    ["uhd", 3, 2],
    ["extreme", 4, 3],
  ] as const)(
    "caps %s rendering at its preset DPR limit",
    (quality, browserDpr, expectedDpr) => {
      setDisplay(1920, 1080, browserDpr);
      const { result } = renderHook(() =>
        useResolvedDisplayQuality(quality),
      );

      expect(result.current.renderDevicePixelRatio).toBe(expectedDpr);
    },
  );
});
