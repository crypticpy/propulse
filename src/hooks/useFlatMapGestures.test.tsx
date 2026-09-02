import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFlatMapGestures } from "./useFlatMapGestures";

function GestureHarness({
  onActiveChange,
}: {
  onActiveChange: (active: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useFlatMapGestures({
    canvasRef,
    onPan: vi.fn(),
    onPinchZoom: vi.fn(),
    onActiveChange,
  });
  return <canvas ref={canvasRef} data-testid="map" />;
}

describe("useFlatMapGestures navigation phase", () => {
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
