import { afterEach, describe, expect, it, vi } from "vitest";
import { isWebGLSupported, probeWebGLSupport } from "./webglSupport";

function stubCreateElement(
  getContext: (contextId: string) => unknown,
) {
  const original = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName) => {
    if (tagName === "canvas") {
      return { getContext } as unknown as HTMLCanvasElement;
    }
    return original(tagName);
  });
}

describe("probeWebGLSupport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports no-document when document is unavailable", () => {
    const original = globalThis.document;
    // @ts-expect-error simulating an SSR/non-DOM environment
    delete globalThis.document;
    try {
      expect(probeWebGLSupport()).toEqual({
        supported: false,
        reason: "no-document",
      });
    } finally {
      globalThis.document = original;
    }
  });

  it("reports no-context when both webgl2 and webgl return null", () => {
    stubCreateElement(() => null);
    expect(probeWebGLSupport()).toEqual({
      supported: false,
      reason: "no-context",
    });
  });

  it("reports threw when getContext throws", () => {
    stubCreateElement(() => {
      throw new Error("BindToCurrentSequence failed");
    });
    expect(probeWebGLSupport()).toEqual({
      supported: false,
      reason: "threw",
    });
  });

  it("reports supported and releases the probe context", () => {
    const loseContext = vi.fn();
    const context = {
      getExtension: (name: string) =>
        name === "WEBGL_lose_context" ? { loseContext } : null,
    };
    stubCreateElement((contextId) => (contextId === "webgl2" ? context : null));
    expect(probeWebGLSupport()).toEqual({ supported: true, reason: null });
    expect(loseContext).toHaveBeenCalledTimes(1);
    expect(isWebGLSupported()).toBe(true);
  });

  it("falls back to webgl when webgl2 is unavailable", () => {
    const context = { getExtension: () => null };
    stubCreateElement((contextId) => (contextId === "webgl" ? context : null));
    expect(probeWebGLSupport()).toEqual({ supported: true, reason: null });
  });
});
