/**
 * Exercises the real r3f `<Canvas>` root boundary under StrictMode. Unit tests
 * mock `useThree`, so they cannot observe r3f's own 500ms teardown timer.
 */
import { StrictMode } from "react";
import { Canvas } from "@react-three/fiber";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebGLContextGuard } from "./useWebGLContextGuard";

const CONTEXT_LOST_GRACE_MS = 550;

function installMinimalWebGLStub(): void {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (tagName !== "canvas") return element;

    const canvas = element as HTMLCanvasElement;
    const getContext = vi.spyOn(canvas, "getContext");
    getContext.mockImplementation(((contextId: string) => {
      if (contextId !== "webgl2" && contextId !== "webgl") return null;
      return {
        canvas,
        drawingBufferWidth: 1,
        drawingBufferHeight: 1,
        getExtension: (name: string) => {
          if (name === "WEBGL_lose_context") {
            return {
              loseContext: () => {
                canvas.dispatchEvent(
                  new Event("webglcontextlost", { cancelable: true }),
                );
              },
            };
          }
          return null;
        },
        getParameter: () => 0,
        getShaderPrecisionFormat: () => ({ precision: 1, rangeMin: 1, rangeMax: 1 }),
        createBuffer: () => ({}),
        bindBuffer: () => {},
        bufferData: () => {},
        createProgram: () => ({}),
        createShader: () => ({}),
        shaderSource: () => {},
        compileShader: () => {},
        attachShader: () => {},
        linkProgram: () => {},
        useProgram: () => {},
        getProgramParameter: () => true,
        getShaderParameter: () => true,
        getAttribLocation: () => 0,
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        viewport: () => {},
        clearColor: () => {},
        clear: () => {},
      } as unknown as WebGLRenderingContext;
    }) as HTMLCanvasElement["getContext"]);
    return canvas;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  installMinimalWebGLStub();
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useWebGLContextGuard integration", () => {
  it("ignores r3f's StrictMode teardown loss without flipping to onLost", () => {
    const onLost = vi.fn();
    render(
      <StrictMode>
        <Canvas>
          <WebGLContextGuard onLost={onLost} />
        </Canvas>
      </StrictMode>,
    );

    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
    expect(onLost).not.toHaveBeenCalled();
  });
});
