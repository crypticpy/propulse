import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMapStore } from "@/stores/mapStore";
import { CloudImageryAttribution } from "./CloudImageryAttribution";

describe("CloudImageryAttribution", () => {
  const originalLayers = useMapStore.getState().layers;

  beforeEach(() => {
    useMapStore.setState({
      layers: { ...originalLayers, goesCloud: true },
    });
  });

  afterEach(() => {
    useMapStore.setState({ layers: originalLayers });
  });

  it("shows renderer-observed partial and unavailable states", () => {
    const { rerender } = render(
      <CloudImageryAttribution status="partial" />,
    );
    expect(screen.getByText(/partial coverage/)).toBeTruthy();

    rerender(<CloudImageryAttribution status="unavailable" />);
    expect(screen.getByText(/unavailable/)).toBeTruthy();
  });
});
