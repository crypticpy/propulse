import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StationProvider } from "@/components/station-ui";
import { useShackStore } from "@/stores/shackStore";
import type { StationChain } from "@/types/stationChain";
import { SignalPathList } from "./SignalPathList";

const chain: StationChain = {
  id: "path",
  name: "Home HF",
  nodes: [
    { type: "radio", radioId: "missing-radio" },
    { type: "antenna", antennaId: "antenna" },
  ],
  feedlineRuns: [],
  operatingPowerWatts: 100,
  shackAccessoryIds: [],
  createdAt: "2026-09-06T00:00:00Z",
};
const initial = useShackStore.getState();
beforeEach(() => {
  useShackStore.setState({
    ...initial,
    stationChains: [structuredClone(chain)],
    radios: [],
    antennas: [
      {
        id: "antenna",
        name: "Garden dipole",
        antennaType: "dipole",
        gainPatternType: "dipole",
        bands: ["20m"],
        heightMeters: 10,
        polarization: "horizontal",
        mounting: "tree",
        addedAt: chain.createdAt,
      },
    ],
  });
});
function Harness({ onSelect = vi.fn(), onSwap = vi.fn(), onRemove = vi.fn() }) {
  const current = useShackStore((s) => s.stationChains[0]);
  return (
    <StationProvider>
      <SignalPathList chain={current} {...{ onSelect, onSwap, onRemove }} />
    </StationProvider>
  );
}
describe("non-drag signal-path editing", () => {
  it("reorders the actual persisted path and keeps its equipment and cable definitions", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Move Radio unavailable earlier" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Move Garden dipole later" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("button", { name: "Move Garden dipole earlier" }),
    );
    expect(useShackStore.getState().stationChains[0].nodes).toEqual([
      chain.nodes[1],
      chain.nodes[0],
    ]);
    expect(useShackStore.getState().antennas[0].name).toBe("Garden dipole");
    expect(useShackStore.getState().stationChains[0].feedlineRuns).toEqual([]);
    expect(
      screen.getByRole("button", { name: "Move Garden dipole earlier" }),
    ).toHaveProperty("disabled", true);
    expect(
      JSON.parse(localStorage.getItem("propulse-shack")!).state.stationChains[0]
        .nodes,
    ).toEqual([chain.nodes[1], chain.nodes[0]]);
  });
  it("keeps keyboard focus attached to the moved equipment rather than its previous position", () => {
    const threeNodes: StationChain = {
      ...chain,
      nodes: [
        chain.nodes[0],
        { type: "accessory", accessoryId: "accessory" },
        chain.nodes[1],
      ],
    };
    useShackStore.setState({ stationChains: [threeNodes] });
    render(<Harness />);
    const move = screen.getByRole("button", {
      name: "Move Garden dipole earlier",
    });
    move.focus();
    fireEvent.click(move);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Move Garden dipole earlier" }),
    );
    expect(document.activeElement).toBe(move);
    expect(useShackStore.getState().stationChains[0].nodes[1]).toEqual(
      chain.nodes[1],
    );
  });
  it("advances the same occurrence past duplicate equipment references on repeated activation", async () => {
    useShackStore.setState({
      stationChains: [
        {
          ...chain,
          nodes: [
            chain.nodes[0],
            chain.nodes[0],
            chain.nodes[1],
            { type: "accessory", accessoryId: "last" },
          ],
        },
      ],
    });
    render(<Harness />);
    const moves = () =>
      screen.getAllByRole("button", { name: "Move Radio unavailable later" });
    moves()[0].focus();
    fireEvent.click(document.activeElement!);
    await vi.waitFor(() => expect(document.activeElement).toBe(moves()[1]));
    fireEvent.click(document.activeElement!);
    await vi.waitFor(() =>
      expect(document.activeElement?.closest("li")).toBe(
        screen.getAllByRole("listitem")[2],
      ),
    );
    expect(useShackStore.getState().stationChains[0].nodes).toEqual([
      chain.nodes[0],
      chain.nodes[1],
      chain.nodes[0],
      { type: "accessory", accessoryId: "last" },
    ]);
  });
  it("returns focus to the moved item's Configure action when its reorder button becomes disabled", async () => {
    render(<Harness />);
    const move = screen.getByRole("button", {
      name: "Move Garden dipole earlier",
    });
    move.focus();
    fireEvent.click(move);
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Configure Garden dipole" }),
      ),
    );
  });
  it("uses current ordered positions for configure, swap and confirmed removal requests", () => {
    const callbacks = { onSelect: vi.fn(), onSwap: vi.fn(), onRemove: vi.fn() };
    render(<Harness {...callbacks} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Configure Garden dipole" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Swap Garden dipole" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Garden dipole from path" }),
    );
    expect(callbacks.onSelect).toHaveBeenCalledWith(1);
    expect(callbacks.onSwap).toHaveBeenCalledWith(1);
    expect(callbacks.onRemove).toHaveBeenCalledWith(1, "Garden dipole");
    expect(useShackStore.getState().stationChains[0].nodes).toHaveLength(2);
  });
});
