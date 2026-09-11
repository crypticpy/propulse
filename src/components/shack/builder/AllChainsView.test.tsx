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
      <button onClick={() => onAddEquipmentAtPosition(0)}>Add at start</button>
      <button onClick={() => onAddEquipmentAtPosition(1)}>
        Add in first gap
      </button>
      <button onClick={() => onAddEquipmentAtPosition(2)}>
        Add after feedline
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
    validTypes,
    onAdd,
  }: {
    automaticPlacement?: boolean;
    position: number;
    validTypes: { label: string }[];
    onAdd: (type: string, id: string) => void;
  }) => (
    <div>
      <p>
        {automaticPlacement
          ? "Automatic placement"
          : `Position ${position + 1}`}
      </p>
      <ul aria-label="Insertable equipment">
        {validTypes.map((type) => (
          <li key={type.label}>{type.label}</li>
        ))}
      </ul>
      <button onClick={() => onAdd("radio", "extra")}>Add fixture radio</button>
      <button onClick={() => onAdd("accessory", "band-pass")}>
        Add fixture filter
      </button>
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

it("offers filter and tuner in an explicit feedline–antenna gap and inserts there", () => {
  useShackStore.setState({
    stationChains: [
      {
        ...chain,
        nodes: [
          chain.nodes[0],
          { type: "feedline_run", feedlineRunId: "run-1" },
          chain.nodes[2],
        ],
        feedlineRuns: [
          { id: "run-1", feedlineId: "cable", inlineComponentIds: [] },
        ],
      },
    ],
  });
  view();
  fireEvent.click(screen.getByRole("button", { name: "Add after feedline" }));
  expect(screen.getByText("Position 3")).toBeTruthy();
  expect(
    within(screen.getByRole("list", { name: "Insertable equipment" }))
      .getByText("Filter")
      .textContent,
  ).toBe("Filter");
  expect(screen.getByText("Tuner")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add fixture filter" }));
  expect(useShackStore.getState().stationChains[0].nodes).toEqual([
    chain.nodes[0],
    { type: "feedline_run", feedlineRunId: "run-1" },
    { type: "accessory", accessoryId: "band-pass" },
    chain.nodes[2],
  ]);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it.each([
  { control: "Add at start", positionLabel: "Position 1", index: 0 },
  { control: "Add in first gap", positionLabel: "Position 2", index: 1 },
])(
  "keeps canvas gap $control at its requested index",
  ({ control, positionLabel, index }) => {
    view();
    fireEvent.click(screen.getByRole("button", { name: control }));
    expect(screen.getByText(positionLabel)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add fixture radio" }));
    expect(useShackStore.getState().stationChains[0].nodes[index]).toEqual({
      type: "radio",
      radioId: "extra",
    });
  },
);
it("inserts from the path list at the named before/after gap and focuses Configure", async () => {
  vi.useRealTimers();
  view();
  fireEvent.click(screen.getByRole("button", { name: "Path list" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Insert after Radio unavailable" })[0],
  );
  expect(screen.getByText("Position 2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add fixture filter" }));
  expect(useShackStore.getState().stationChains[0].nodes[1]).toEqual({
    type: "accessory",
    accessoryId: "band-pass",
  });
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Configure Accessory unavailable" }),
    ),
  );
});
it("replaces the inspector with removal confirmation so one Escape cancels without removing equipment", () => {
  view();
  fireEvent.click(screen.getByRole("button", { name: "Inspect first radio" }));
  const inspector = screen.getByRole("dialog", { name: "Radio in this path" });
  fireEvent.click(
    within(inspector).getByRole("button", { name: "Remove from path" }),
  );
  // The inspector is gone — replaced by the removal confirmation, which is
  // an `alertdialog` now that ConfirmDialog is AccessibleDialog-based with
  // `role="alertdialog"` (#727, #773), so assert on name and role together.
  expect(
    screen.queryByRole("dialog", { name: "Radio in this path" }),
  ).toBeNull();
  const confirmation = screen.getByRole("alertdialog", {
    name: "Remove from Signal Path?",
  });
  act(() => vi.advanceTimersByTime(20));
  // ConfirmDialog is now built on AccessibleDialog (#727), which focuses its
  // own header Close button on open instead of the confirm action — see the
  // doc comment on ConfirmDialog for why that's the deliberate choice.
  expect(document.activeElement).toBe(
    within(confirmation).getByRole("button", { name: "Close dialog" }),
  );
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(
    screen.queryByRole("alertdialog", { name: "Remove from Signal Path?" }),
  ).toBeNull();
  expect(useShackStore.getState().stationChains[0].nodes).toEqual(chain.nodes);

  fireEvent.click(screen.getByRole("button", { name: "Inspect first radio" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove from path" }));
  fireEvent.click(
    within(
      screen.getByRole("alertdialog", { name: "Remove from Signal Path?" }),
    ).getByRole("button", { name: "Remove" }),
  );
  expect(
    screen.queryByRole("alertdialog", { name: "Remove from Signal Path?" }),
  ).toBeNull();
  expect(useShackStore.getState().stationChains[0].nodes).toEqual(
    chain.nodes.slice(1),
  );
});
