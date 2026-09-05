import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFlatMapGestures } from "./useFlatMapGestures";

function GestureHarness({
  onActiveChange,
  onPan = vi.fn(),
}: {
  onActiveChange: (active: boolean) => void;
  onPan?: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFlatMapGestures({
    canvasRef,
    coordinateSurfaceRef: surfaceRef,
    onPan,
    onPinchZoom: vi.fn(),
    onActiveChange,
  });
  return (
    <div ref={surfaceRef}>
      <canvas ref={canvasRef} data-testid="map" />
    </div>
  );
}

describe("useFlatMapGestures navigation phase", () => {
  it("keeps pan deltas stable while the canvas moves under the pointer", () => {
    const onPan = vi.fn();
    const { getByTestId } = render(
      <GestureHarness onPan={onPan} onActiveChange={vi.fn()} />,
    );
    const canvas = getByTestId("map");
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 10,
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: -100,
      top: -50,
    } as DOMRect);
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 30,
      clientY: 15,
    });
    expect(onPan).toHaveBeenCalledExactlyOnceWith(10, 5);
  });
  it("reports one active and idle transition for a drag", () => {
    const onActiveChange = vi.fn();
    const { getByTestId } = render(
      <GestureHarness onActiveChange={onActiveChange} />,
    );
    const canvas = getByTestId("map");

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 30,
      clientY: 10,
    });
    fireEvent.pointerUp(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 30,
      clientY: 10,
    });

    expect(onActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it("does not report navigation for an unmoved click", () => {
    const onActiveChange = vi.fn();
    const { getByTestId } = render(
      <GestureHarness onActiveChange={onActiveChange} />,
    );
    const canvas = getByTestId("map");

    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(canvas, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });

    expect(onActiveChange).not.toHaveBeenCalled();
  });
});
