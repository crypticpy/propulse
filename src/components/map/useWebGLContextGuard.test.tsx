import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWebGLContextGuard,
  WebGLContextGuard,
  type UseWebGLContextGuardOptions,
} from "./useWebGLContextGuard";

const mocks = vi.hoisted(() => ({
  gl: null as {
    domElement: HTMLCanvasElement;
    forceContextLoss: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { gl: unknown }) => unknown) =>
    selector({ gl: mocks.gl }),
}));

function makeFakeGl() {
  return {
    domElement: document.createElement("canvas"),
    forceContextLoss: vi.fn(),
  };
}

function dispatchLost(canvas: HTMLCanvasElement) {
  const event = new Event("webglcontextlost", { cancelable: true });
  canvas.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.gl = makeFakeGl();
});

afterEach(() => {
  vi.useRealTimers();
  mocks.gl = null;
});

function Harness(props: UseWebGLContextGuardOptions) {
  useWebGLContextGuard(props);
  return null;
}

describe("useWebGLContextGuard", () => {
  it("releases the context on unmount without waiting for r3f's 500ms teardown", () => {
    const gl = mocks.gl!;
    const view = render(<Harness />);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    view.unmount();
    vi.advanceTimersByTime(0);
    expect(gl.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("does not release a canvas that StrictMode is about to reattach", () => {
    const gl = mocks.gl!;
    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    // StrictMode's simulated mount → cleanup → mount has already happened.
    vi.advanceTimersByTime(0);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    // The canvas still responds as a live one.
    const onLost = vi.fn();
    view.rerender(
      <StrictMode>
        <Harness onLost={onLost} />
      </StrictMode>,
    );
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
    // A real unmount still releases it.
    view.unmount();
    vi.advanceTimersByTime(0);
    expect(gl.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("preventDefaults a webglcontextlost event so the browser can restore it", () => {
    const gl = mocks.gl!;
    render(<Harness />);
    const event = dispatchLost(gl.domElement);
    expect(event.defaultPrevented).toBe(true);
  });

  it("calls onLost for a genuine context loss", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    render(<Harness onLost={onLost} />);
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("does not call onLost for the self-inflicted loss on unmount", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    const view = render(<Harness onLost={onLost} />);
    view.unmount();
    vi.advanceTimersByTime(0);
    // The loss our own forceContextLoss() call triggers.
    dispatchLost(gl.domElement);
    expect(onLost).not.toHaveBeenCalled();
  });

  it("uses the latest onLost without re-running the release effect", () => {
    const gl = mocks.gl!;
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Harness onLost={first} />);
    view.rerender(<Harness onLost={second} />);
    vi.advanceTimersByTime(0);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    dispatchLost(gl.domElement);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("WebGLContextGuard", () => {
  it("renders nothing and wires the hook through props", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    const view = render(<WebGLContextGuard onLost={onLost} />);
    expect(view.container.innerHTML).toBe("");
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
  });
});
