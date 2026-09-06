import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StationProvider } from "@/components/station-ui";
import { useShackStore } from "@/stores/shackStore";
import { MAX_CHAIN_NODES, type StationChain } from "@/types/stationChain";
import { AllChainsView } from "./AllChainsView";

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => ({ bands: [] }),
}));
vi.mock("./BuilderCanvas", () => ({
  BuilderCanvas: ({
    onAddEquipmentAtPosition,
  }: {
    onAddEquipmentAtPosition: (index: number) => void;
  }) => (
    <button onClick={() => onAddEquipmentAtPosition(1)}>
      Add in first gap
    </button>
  ),
}));
vi.mock("./EquipmentDrawer", () => ({ EquipmentDrawer: () => null }));
vi.mock("./AddEquipmentPanel", () => ({
  AddEquipmentPanel: ({
    automaticPlacement,
    position,
    onAdd,
  }: {
    automaticPlacement?: boolean;
    position: number;
    onAdd: (type: string, id: string) => void;
  }) => (
    <div>
      <p>
        {automaticPlacement
          ? "Automatic placement"
          : `Position ${position + 1}`}
      </p>
      <button onClick={() => onAdd("radio", "extra")}>Add fixture radio</button>
    </div>
  ),
}));
const initial = useShackStore.getState();
const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "radio" },
    { type: "radio", radioId: "second-radio" },
    { type: "antenna", antennaId: "antenna" },
  ],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};
beforeEach(() => {
  vi.useFakeTimers();
  useShackStore.setState({
    ...initial,
    stationChains: [structuredClone(chain)],
    activeChainId: chain.id,
  });
});
afterEach(() => vi.useRealTimers());
const view = () =>
  render(
    <StationProvider>
      <AllChainsView selectedBand="20m" onSelectBand={vi.fn()} />
    </StationProvider>,
  );
it("honors an explicit canvas gap and closes the picker only after success", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Add in first gap" }));
  expect(screen.getByText("Position 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add fixture radio" }));
  expect(useShackStore.getState().stationChains[0].nodes).toEqual([
    chain.nodes[0],
    { type: "radio", radioId: "extra" },
    ...chain.nodes.slice(1),
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("labels toolbar placement as automatic and leaves a failed selection open with its error", () => {
  useShackStore.setState({
    stationChains: [
      {
        ...chain,
        nodes: Array.from({ length: MAX_CHAIN_NODES }, () => chain.nodes[0]),
      },
    ],
  });
  view();
  fireEvent.click(screen.getByRole("button", { name: "Add to path" }));
  expect(screen.getByText("Automatic placement")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add fixture radio" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    `up to ${MAX_CHAIN_NODES}`,
  );
  expect(useShackStore.getState().stationChains[0].nodes).toHaveLength(
    MAX_CHAIN_NODES,
  );
});
