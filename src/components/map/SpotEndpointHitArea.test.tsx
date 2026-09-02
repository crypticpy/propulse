import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotEndpointHitArea } from "./SpotEndpointHitArea";
import type { ResolvedSpot } from "./LiveSpotArcs";

vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual<typeof import("@react-three/fiber")>(
    "@react-three/fiber",
  );
  return { ...actual, useFrame: vi.fn() };
});

function resolvedSpot(): ResolvedSpot {
  const originalSpot = {
    id: "spot-1",
    spotter: "K1ABC",
    spotterGrid: "FN42",
    dx: "PY2ABC",
    dxGrid: "GG87",
    frequency: 14074,
    mode: "FT8",
    comment: "",
    time: new Date("2026-08-31T12:00:00Z"),
    band: "20m",
    dxLat: -22.5,
    dxLon: -43,
    source: "PSKReporter" as const,
  };
  return {
    id: "spot-1",
    spotterLat: 42,
    spotterLon: -71,
    dxLat: -22.5,
    dxLon: -43,
    mode: "FT8",
    frequency: 14074,
    time: new Date("2026-08-31T12:00:00Z"),
    callsign: "PY2ABC",
    spotter: "K1ABC",
    source: "PSKReporter",
    spotterLocApprox: false,
    dxLocApprox: false,
    originalSpot,
  };
}

describe("SpotEndpointHitArea selection", () => {
  it("returns the exact rendered report snapshot on hover", () => {
    const spot = resolvedSpot();
    const onHover = vi.fn();
    const { container } = render(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={spot}
        onHover={onHover}
      />,
    );

    fireEvent.pointerEnter(container.querySelector("mesh")!, {
      clientX: 120,
      clientY: 80,
    });
    expect(onHover).toHaveBeenCalledWith(
      spot.originalSpot,
      { x: 120, y: 80 },
      {
        surface: "endpoint",
        interactionId: "PSKReporter:spot-1:endpoint:-22.50000:-43.00000",
      },
    );
  });

  it("does not reclaim hover on every pointer movement", () => {
    const onHover = vi.fn();
    const { container } = render(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        onHover={onHover}
      />,
    );
    const endpoint = container.querySelector("mesh")!;
    fireEvent.pointerEnter(endpoint, { clientX: 120, clientY: 80 });
    fireEvent.pointerMove(endpoint, { clientX: 122, clientY: 82 });
    fireEvent.pointerMove(endpoint, { clientX: 124, clientY: 84 });

    expect(onHover).toHaveBeenCalledOnce();
  });

  it("selects the endpoint without allowing the globe surface to handle it", () => {
    const onSelect = vi.fn();
    const onParentClick = vi.fn();
    const onParentDoubleClick = vi.fn();
    const { container } = render(
      <div onClick={onParentClick} onDoubleClick={onParentDoubleClick}>
        <SpotEndpointHitArea
          lat={-22.5}
          lon={-43}
          spot={resolvedSpot()}
          onSelect={onSelect}
        />
      </div>,
    );
    const endpoint = container.querySelector("mesh")!;
    fireEvent.click(endpoint);
    fireEvent.doubleClick(endpoint);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(onParentDoubleClick).not.toHaveBeenCalled();
  });

  it("does not expose a raycast mesh for a far-side endpoint", () => {
    const onHover = vi.fn();
    const onHoverEnd = vi.fn();
    const { container, rerender } = render(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        occlusionOpacity={1}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector("mesh")).not.toBeNull();
    rerender(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        occlusionOpacity={0}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );
    expect(container.querySelector("mesh")).toBeNull();
    expect(onHoverEnd).not.toHaveBeenCalled();

    rerender(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        occlusionOpacity={1}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.pointerEnter(container.querySelector("mesh")!, {
      clientX: 120,
      clientY: 80,
    });
    rerender(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        occlusionOpacity={0}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );
    expect(onHoverEnd).toHaveBeenCalledOnce();
    expect(onHoverEnd).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-1", dx: "PY2ABC" }),
      expect.objectContaining({
        surface: "endpoint",
        interactionId: "PSKReporter:spot-1:endpoint:-22.50000:-43.00000",
      }),
    );
  });

  it("ends hover on unmount only when this endpoint owns it", () => {
    const inactiveHoverEnd = vi.fn();
    const inactive = render(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        onHover={vi.fn()}
        onHoverEnd={inactiveHoverEnd}
      />,
    );
    inactive.unmount();
    expect(inactiveHoverEnd).not.toHaveBeenCalled();

    const activeHoverEnd = vi.fn();
    const active = render(
      <SpotEndpointHitArea
        lat={-22.5}
        lon={-43}
        spot={resolvedSpot()}
        onHover={vi.fn()}
        onHoverEnd={activeHoverEnd}
      />,
    );
    fireEvent.pointerEnter(active.container.querySelector("mesh")!, {
      clientX: 120,
      clientY: 80,
    });
    active.unmount();
    expect(activeHoverEnd).toHaveBeenCalledOnce();
    expect(activeHoverEnd).toHaveBeenCalledWith(
      expect.objectContaining({ id: "spot-1", dx: "PY2ABC" }),
      expect.objectContaining({
        surface: "endpoint",
        interactionId: "PSKReporter:spot-1:endpoint:-22.50000:-43.00000",
      }),
    );
  });
});
