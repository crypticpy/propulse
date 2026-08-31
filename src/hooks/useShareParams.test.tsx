import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { useShareParams } from "./useShareParams";

function ShareParamsHarness() {
  useShareParams();
  return null;
}

const originalState = useMapStore.getState();

afterEach(() => {
  useMapStore.setState({
    layers: { ...originalState.layers },
    activePreset: originalState.activePreset,
    activeProfile: originalState.activeProfile,
  });
});

describe("useShareParams", () => {
  it("does not let recipient-local persisted layers leak into a shared view", async () => {
    useMapStore.setState((state) => ({
      layers: {
        ...state.layers,
        spots: false,
        weather: true,
        radar: true,
        satellites: true,
      },
    }));

    render(
      <MemoryRouter initialEntries={["/map?v=g&l=32"]}>
        <ShareParamsHarness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const layers = useMapStore.getState().layers;
      // Bit 5 is the only flag in this URL, so spots are on and every layer
      // not represented by the legacy eight-bit format returns to baseline.
      expect(layers.spots).toBe(true);
      expect(layers.terminator).toBe(false);
      expect(layers.weather).toBe(false);
      expect(layers.radar).toBe(false);
      expect(layers.satellites).toBe(false);
    });
  });
});
