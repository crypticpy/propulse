import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivationSpotStore } from "@/stores/activationSpotStore";
import { useMapStore } from "@/stores/mapStore";
import { ActivationMarkers3D } from "./ActivationMarkers3D";

vi.mock("@/hooks/useGlobeOcclusionBatch", () => ({
  useGlobeOcclusionBatch: () => ({ getOpacity: () => 1 }),
}));

vi.mock("../SpotLabel", () => ({
  SpotLabel: ({
    callsign,
    ariaLabel,
    onClick,
  }: {
    callsign: string;
    ariaLabel?: string;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {callsign}
    </button>
  ),
}));

describe("ActivationMarkers3D", () => {
  beforeEach(() => {
    useMapStore.setState({ target: null });
    useActivationSpotStore.setState({ selectedSpot: null });
  });

  it("selects the activator as DX and opens its shared detail state", () => {
    render(
      <ActivationMarkers3D
        spots={[
          {
            id: "pota-1",
            program: "POTA",
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
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /K5ABC.*14\.074 megahertz.*open station details/i,
      }),
    );

    expect(useMapStore.getState().target).toEqual(
      expect.objectContaining({
        lat: 30.25,
        lon: -97.75,
        grid: "EM10df",
        name: "K5ABC · POTA US-1234",
      }),
    );
    expect(useActivationSpotStore.getState().selectedSpot).toEqual(
      expect.objectContaining({ id: "pota-1" }),
    );
  });
});
