import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivationProgram } from "@/types/activationSpots";
import { ActivationMarkers3D } from "./ActivationMarkers3D";
import { ActivationPillButtons } from "./ActivationPillButtons";

vi.mock("@react-three/fiber", async () => {
  const actual = await vi.importActual<typeof import("@react-three/fiber")>(
    "@react-three/fiber",
  );
  return { ...actual, useFrame: vi.fn() };
});

vi.mock("@/hooks/useGlobeOcclusionBatch", () => ({
  useGlobeOcclusionBatch: () => ({ getOpacity: () => 1 }),
}));

vi.mock("../SpotLabel", () => ({
  SpotLabel: ({
    callsign,
    ariaLabel,
    onHover,
    onHoverEnd,
    onSelect,
  }: {
    callsign: string;
    ariaLabel?: string;
    onHover?: (position: { x: number; y: number }) => void;
    onHoverEnd?: () => void;
    onSelect?: (position: { x: number; y: number }) => void;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerEnter={() => onHover?.({ x: 10, y: 20 })}
      onPointerLeave={onHoverEnd}
      onClick={() => onSelect?.({ x: 10, y: 20 })}
    >
      {callsign}
    </button>
  ),
}));

const SPOT = {
  id: "pota-1",
  program: "POTA" as const,
  callsign: "K5ABC",
  reference: "US-1234",
  referenceName: "Test Park",
  frequencyKHz: 14074,
  mode: "FT8",
  comments: "QRP",
  spotter: "W1AW",
  spottedAt: "2026-08-31T13:59:00.000Z",
  latitude: 30.25,
  longitude: -97.75,
  grid: "EM10df",
};

describe("activation label selections", () => {
  it("routes 3D hover and selection through the canonical parent callbacks", () => {
    const onSpotHover = vi.fn();
    const onSpotHoverEnd = vi.fn();
    const onSpotSelect = vi.fn();
    render(
      <ActivationMarkers3D
        spots={[{ ...SPOT, frequencyKHz: 14074.5 }]}
        onSpotHover={onSpotHover}
        onSpotHoverEnd={onSpotHoverEnd}
        onSpotSelect={onSpotSelect}
      />,
    );

    const button = screen.getByRole("button", {
      name: /K5ABC.*14\.0745 megahertz.*open station details/i,
    });
    fireEvent.pointerEnter(button);
    fireEvent.pointerLeave(button);
    fireEvent.click(button);
    expect(screen.getByText("K5ABC 14.0745")).toBeTruthy();

    expect(onSpotHover).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "pota-1",
        dx: "K5ABC",
        source: "Cluster",
        activation: expect.objectContaining({
          program: "POTA",
          reference: "US-1234",
          referenceName: "Test Park",
        }),
      }),
      { x: 10, y: 20 },
      {
        surface: "label",
        interactionId: "activation:pota-1:label",
      },
    );
    expect(onSpotHoverEnd).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pota-1", dx: "K5ABC" }),
      {
        surface: "label",
        interactionId: "activation:pota-1:label",
      },
    );
    expect(onSpotSelect).toHaveBeenCalledWith(
      expect.objectContaining({ dxLat: 30.25, dxLon: -97.75 }),
      { x: 10, y: 20 },
    );
  });

  it.each(["POTA", "SOTA", "WWFF"] satisfies ActivationProgram[])(
    "gives a %s 2D pill identical hover and select ownership",
    (program) => {
      const onSpotHover = vi.fn();
      const onSpotHoverEnd = vi.fn();
      const onSpotSelect = vi.fn();
      render(
        <ActivationPillButtons
          placements={[
            {
              spot: { ...SPOT, program },
              left: 10,
              top: 20,
              width: 80,
              height: 22,
            },
          ]}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />,
      );

      const button = screen.getByRole("button", {
        name: /K5ABC.*select as target/i,
      });
      expect(button.getAttribute("tabindex")).not.toBe("-1");

      fireEvent.pointerEnter(button);
      fireEvent.pointerLeave(button);
      fireEvent.click(button);
      expect(onSpotHover).toHaveBeenCalledWith(
        expect.objectContaining({
          dx: "K5ABC",
          activation: expect.objectContaining({ program }),
        }),
        expect.objectContaining({ width: expect.any(Number) }),
      );
      expect(onSpotHoverEnd).toHaveBeenCalledOnce();
      expect(onSpotSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          dx: "K5ABC",
          activation: expect.objectContaining({ program }),
        }),
        expect.any(Object),
      );
    },
  );

  it("releases activation hover ownership when a pill disappears", () => {
    const onSpotHoverEnd = vi.fn();
    const { rerender } = render(
      <ActivationPillButtons
        placements={[
          { spot: SPOT, left: 10, top: 20, width: 80, height: 22 },
        ]}
        onSpotHoverEnd={onSpotHoverEnd}
      />,
    );
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: /K5ABC.*select as target/i }),
    );

    rerender(
      <ActivationPillButtons
        placements={[]}
        onSpotHoverEnd={onSpotHoverEnd}
      />,
    );

    expect(onSpotHoverEnd).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pota-1", dx: "K5ABC" }),
    );
  });

  it("does not release hover for a pill that was never active", () => {
    const onSpotHoverEnd = vi.fn();
    const { rerender } = render(
      <ActivationPillButtons
        placements={[
          { spot: SPOT, left: 10, top: 20, width: 80, height: 22 },
        ]}
        onSpotHoverEnd={onSpotHoverEnd}
      />,
    );

    rerender(
      <ActivationPillButtons
        placements={[]}
        onSpotHoverEnd={onSpotHoverEnd}
      />,
    );

    expect(onSpotHoverEnd).not.toHaveBeenCalled();
  });
});
