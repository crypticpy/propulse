import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
    onSelectNode,
  }: {
    onAddEquipmentAtPosition: (index: number) => void;
    onSelectNode: (index: number) => void;
  }) => (
    <>
      <button onClick={() => onAddEquipmentAtPosition(1)}>
        Add in first gap
      </button>
      <button onClick={() => onSelectNode(0)}>Inspect first radio</button>
    </>
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

it("replaces the inspector with removal confirmation so one Escape cancels without removing equipment", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Inspect first radio" }));
  const inspector = screen.getByRole("dialog", { name: "Radio in this path" });
  fireEvent.click(
    within(inspector).getByRole("button", { name: "Remove from path" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  const confirmation = screen.getByRole("alertdialog", {
    name: "Remove from Signal Path?",
  });
  act(() => vi.advanceTimersByTime(0));
  expect(document.activeElement).toBe(
    within(confirmation).getByRole("button", { name: "Remove" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(useShackStore.getState().stationChains[0].nodes).toEqual(chain.nodes);

  fireEvent.click(screen.getByRole("button", { name: "Inspect first radio" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove from path" }));
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }),
  );
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(useShackStore.getState().stationChains[0].nodes).toEqual(
    chain.nodes.slice(1),
  );
});
