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
  };
}

describe("SpotEndpointHitArea selection", () => {
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
          spotData={{ dxGrid: "GG87" }}
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
        spotData={{ dxGrid: "GG87" }}
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
        spotData={{ dxGrid: "GG87" }}
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
        spotData={{ dxGrid: "GG87" }}
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
        spotData={{ dxGrid: "GG87" }}
        occlusionOpacity={0}
        onHover={onHover}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );
    expect(onHoverEnd).toHaveBeenCalledOnce();
  });
});
