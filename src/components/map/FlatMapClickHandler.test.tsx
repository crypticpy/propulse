import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFlatMapClickHandler } from "./FlatMapClickHandler";

function Harness({ onQuickClick, onDoubleClick }: {
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
    x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 100,
    width: 200, height: 100, toJSON: () => ({}),
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFlatMapClickHandler overlay click ownership", () => {
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
    expect(onQuickClick).toHaveBeenNthCalledWith(
      1,
      { x: 80, y: 40 },
      18,
      -36,
    );
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
});
