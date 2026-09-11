import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useShackStore } from "@/stores/shackStore";
import type { StationChain } from "@/types/stationChain";
import { BuilderCanvas } from "./BuilderCanvas";

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => ({ bands: [] }),
}));

const initial = useShackStore.getState();
const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "radio" },
    { type: "antenna", antennaId: "antenna" },
  ],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  useShackStore.setState({
    ...initial,
    stationChains: [structuredClone(chain)],
    activeChainId: chain.id,
  });
});

afterEach(() => {
  useShackStore.setState(initial);
  vi.unstubAllGlobals();
});

it("does not draw Chassis GND for an unrecorded radio when the overlay is on (#373)", () => {
  render(
    <BuilderCanvas
      chain={chain}
      selectedNodeIndex={null}
      onSelectNode={vi.fn()}
      onDropEquipment={vi.fn()}
      showGroundBus
    />,
  );
  expect(screen.queryByText("Chassis GND")).toBeNull();
  expect(
    screen.queryByLabelText("Recorded ground connections"),
  ).toBeNull();
});
