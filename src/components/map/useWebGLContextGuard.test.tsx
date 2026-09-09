import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWebGLContextGuard,
  WebGLContextGuard,
  type UseWebGLContextGuardOptions,
} from "./useWebGLContextGuard";

const CONTEXT_RELEASE_DELAY_MS = 50;
const CONTEXT_LOST_GRACE_MS = 550;

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

  it("does not release a canvas that StrictMode is about to reattach", () => {
    const sharedCanvas = document.createElement("canvas");
    const glFirst = makeFakeGl(sharedCanvas);
    const glSecond = makeFakeGl(sharedCanvas);
    mocks.gl = glFirst;

    const view = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    // StrictMode's simulated mount → cleanup → mount swaps the renderer while
    // keeping the same canvas element.
    mocks.gl = glSecond;
    view.rerender(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
    expect(glFirst.forceContextLoss).not.toHaveBeenCalled();
    expect(glSecond.forceContextLoss).not.toHaveBeenCalled();

    const onLost = vi.fn();
    view.rerender(
      <StrictMode>
        <Harness onLost={onLost} />
      </StrictMode>,
    );
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

  it("calls onLost for a genuine context loss after the mount grace window", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    render(<Harness onLost={onLost} />);
    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("ignores context loss during the mount grace window", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    render(<Harness onLost={onLost} />);
    dispatchLost(gl.domElement);
    expect(onLost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it("does not call onLost for the self-inflicted loss on unmount", () => {
    const gl = mocks.gl!;
    const onLost = vi.fn();
    const view = render(<Harness onLost={onLost} />);
    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
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
    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
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
    vi.advanceTimersByTime(CONTEXT_LOST_GRACE_MS);
    dispatchLost(gl.domElement);
    expect(onLost).toHaveBeenCalledTimes(1);
  });
});
