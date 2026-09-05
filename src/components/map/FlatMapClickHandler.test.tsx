import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFlatMapClickHandler } from "./FlatMapClickHandler";

function Harness({
  onQuickClick,
  onDoubleClick,
}: {
  onQuickClick: (
    position: { x: number; y: number },
    lat: number,
    lon: number,
  ) => boolean;
  onDoubleClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useFlatMapClickHandler({
    canvasRef,
    zoom: { scale: 1, offsetX: 0, offsetY: 0 },
    displaySize: { width: 200, height: 100 },
    onQuickClick,
    onDoubleClick,
  });
  return <canvas ref={canvasRef} data-testid="map" />;
}

function mockBounds(canvas: HTMLCanvasElement) {
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFlatMapClickHandler overlay click ownership", () => {
  it("clears an existing geographic hover when entering a letterbox margin", () => {
    vi.useFakeTimers();
    const onLocationHover = vi.fn();
    const onHoverEnd = vi.fn();
    function LetterboxHover() {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      useFlatMapClickHandler({
        canvasRef,
        zoom: { scale: 0.5, offsetX: 50, offsetY: 25 },
        displaySize: { width: 200, height: 100 },
        onLocationHover,
        onHoverEnd,
      });
      return <canvas ref={canvasRef} data-testid="hover-map" />;
    }
    const { getByTestId } = render(<LetterboxHover />);
    const canvas = getByTestId("hover-map") as HTMLCanvasElement;
    mockBounds(canvas);
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 50 });
    vi.advanceTimersByTime(1000);
    expect(onLocationHover).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(1000);
    expect(onLocationHover).toHaveBeenCalledTimes(1);
    expect(onHoverEnd).toHaveBeenCalledTimes(1);
  });
  it("ignores letterbox margins and suppresses selection during a visual camera gesture", () => {
    const onQuickClick = vi.fn(() => true);
    const navigating = { current: false };
    function LetterboxHarness() {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      useFlatMapClickHandler({
        canvasRef,
        zoom: { scale: 0.5, offsetX: 50, offsetY: 25 },
        displaySize: { width: 200, height: 100 },
        onQuickClick,
        isGesturing: navigating,
      });
      return <canvas ref={canvasRef} data-testid="letterbox" />;
    }
    const { getByTestId } = render(<LetterboxHarness />);
    const canvas = getByTestId("letterbox") as HTMLCanvasElement;
    mockBounds(canvas);
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(document, { clientX: 10, clientY: 10 });
    expect(onQuickClick).not.toHaveBeenCalled();
    navigating.current = true;
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.pointerUp(document, { clientX: 100, clientY: 50 });
    expect(onQuickClick).not.toHaveBeenCalled();
    navigating.current = false;
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50 });
    fireEvent.pointerUp(document, { clientX: 100, clientY: 50 });
    expect(onQuickClick).toHaveBeenCalledWith({ x: 100, y: 50 }, 0, 0);
  });
  it("does not promote consumed label clicks into a surface double-click", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const onQuickClick = vi.fn(() => true);
    const onDoubleClick = vi.fn();
    const { getByTestId } = render(
      <Harness onQuickClick={onQuickClick} onDoubleClick={onDoubleClick} />,
    );
    const canvas = getByTestId("map") as HTMLCanvasElement;
    mockBounds(canvas);
    for (let index = 0; index < 2; index++) {
      fireEvent.pointerDown(canvas, { clientX: 80, clientY: 40 });
      fireEvent.pointerUp(document, { clientX: 80, clientY: 40 });
      vi.advanceTimersByTime(80);
    }
    expect(onQuickClick).toHaveBeenCalledTimes(2);
    expect(onQuickClick).toHaveBeenNthCalledWith(1, { x: 80, y: 40 }, 18, -36);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it("reserves completed press-and-hold gestures for the map surface", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const onQuickClick = vi.fn(() => true);
    const onDoubleClick = vi.fn();
    const onLocationClick = vi.fn();
    function HoldHarness() {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      useFlatMapClickHandler({
        canvasRef,
        zoom: { scale: 1, offsetX: 0, offsetY: 0 },
        displaySize: { width: 200, height: 100 },
        holdDurationMs: 100,
        onQuickClick,
        onDoubleClick,
        onLocationClick,
      });
      return <canvas ref={canvasRef} data-testid="hold-map" />;
    }
    const { getByTestId } = render(<HoldHarness />);
    const canvas = getByTestId("hold-map") as HTMLCanvasElement;
    mockBounds(canvas);
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 40 });
    vi.advanceTimersByTime(250);
    fireEvent.pointerUp(document, { clientX: 80, clientY: 40 });
    expect(onQuickClick).not.toHaveBeenCalled();
    expect(onLocationClick).toHaveBeenCalledWith(18, -36, { x: 80, y: 40 });
  });

  it("offers a deliberate incomplete hold to painted overlays", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const onQuickClick = vi.fn(() => true);
    const onDoubleClick = vi.fn();
    const { getByTestId } = render(
      <Harness onQuickClick={onQuickClick} onDoubleClick={onDoubleClick} />,
    );
    const canvas = getByTestId("map") as HTMLCanvasElement;
    mockBounds(canvas);

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 40 });
    vi.advanceTimersByTime(450);
    fireEvent.pointerUp(document, { clientX: 80, clientY: 40 });

    expect(onQuickClick).toHaveBeenCalledOnce();
    expect(onQuickClick).toHaveBeenCalledWith({ x: 80, y: 40 }, 18, -36);
    expect(onDoubleClick).not.toHaveBeenCalled();
  });
});
