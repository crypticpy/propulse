import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTEXT_RELEASE_DELAY_MS,
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

function makeFakeGl(canvas = document.createElement("canvas")) {
  return {
    domElement: canvas,
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
  it("releases the context on unmount ahead of r3f's 500ms teardown", () => {
    // Every other timing assertion advances by CONTEXT_RELEASE_DELAY_MS itself,
    // so they hold for any value of it. Pin the one property that matters: the
    // release must land before r3f's own 500ms forceContextLoss, or the guard
    // buys nothing. Regression 16d85e87 was exactly this constant set to 500.
    expect(CONTEXT_RELEASE_DELAY_MS).toBeLessThan(500);

    const gl = mocks.gl!;
    const view = render(<Harness />);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    view.unmount();
    vi.advanceTimersByTime(CONTEXT_RELEASE_DELAY_MS - 1);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(gl.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("does not release when remounted before the pending release fires", () => {
    const gl = mocks.gl!;
    const View = ({ isMounted }: { isMounted: boolean }) =>
      isMounted ? <Harness /> : null;
    const view = render(<View isMounted />);

    view.rerender(<View isMounted={false} />);
    vi.advanceTimersByTime(25);
    view.rerender(<View isMounted />);
    vi.advanceTimersByTime(25);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();

    view.rerender(<View isMounted={false} />);
    vi.advanceTimersByTime(CONTEXT_RELEASE_DELAY_MS - 1);
    expect(gl.forceContextLoss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(gl.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it("an effect re-run on the same canvas cancels the pending release", () => {
    const sharedCanvas = document.createElement("canvas");
    const glFirst = makeFakeGl(sharedCanvas);
    const glSecond = makeFakeGl(sharedCanvas);
    mocks.gl = glFirst;

    const view = render(<Harness />);
    // A dependency change (gl identity) reruns the effect on the same canvas
    // element: cleanup schedules a release, but the WeakMap cancels it once
    // the effect runs again before the delay elapses.
    mocks.gl = glSecond;
    view.rerender(<Harness />);

    vi.advanceTimersByTime(CONTEXT_RELEASE_DELAY_MS);
    expect(glFirst.forceContextLoss).not.toHaveBeenCalled();
    expect(glSecond.forceContextLoss).not.toHaveBeenCalled();

    const onLost = vi.fn();
    view.rerender(<Harness onLost={onLost} />);
    dispatchLost(sharedCanvas);
    expect(onLost).toHaveBeenCalledTimes(1);

    view.unmount();
    vi.advanceTimersByTime(CONTEXT_RELEASE_DELAY_MS);
    expect(glSecond.forceContextLoss).toHaveBeenCalledTimes(1);
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
    vi.advanceTimersByTime(CONTEXT_RELEASE_DELAY_MS);
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
