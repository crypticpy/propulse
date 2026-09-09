import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { HeatMapPanel } from "./HeatMapPanel";
import { HeatMapStrip } from "./HeatMapStrip";

const previousDX = useDXStore.getState();

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
});

afterEach(() => {
  useDXStore.setState(previousDX, true);
  vi.useRealTimers();
});

function spot(overrides: Partial<DXSpot>): DXSpot {
  return {
    id: overrides.id ?? "fixture",
    spotter: "W1AW",
    dx: "G4ABC",
    frequency: 14195,
    comment: "",
    time: new Date("2026-09-08T12:55:00Z"),
    band: "20m",
    ...overrides,
  };
}

it("HeatMapStrip: renders the honest empty state when no spots are in the window", () => {
  render(<HeatMapStrip />);
  expect(screen.getByText("NO SPOTS IN WINDOW")).toBeTruthy();
});

it("HeatMapStrip: renders a hottest-cell headline from fixture spots (bucketFor a real cell)", () => {
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapStrip />);
  expect(screen.getByText("20M → EU")).toBeTruthy();
  expect(screen.getByText(/1 DX in window/)).toBeTruthy();
});

it("HeatMapPanel: renders the empty grid and an honest empty inspector", () => {
  render(<HeatMapPanel />);
  expect(screen.getByText("NO SPOTS IN WINDOW")).toBeTruthy();
  expect(screen.getByText("Select a cell, or wait for activity in the window.")).toBeTruthy();
});

it("HeatMapPanel: renders a fixture cell's count in the grid and defaults the inspector to the hottest cell", () => {
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapPanel />);
  expect(screen.getByText("1 DX in window")).toBeTruthy();
  expect(screen.getByText("20M → EU")).toBeTruthy();
  expect(screen.getByText(/1 DX · 1 reporters/)).toBeTruthy();

  const cell = screen.getByRole("button", { name: /20M to EU: 1 DX, 1 reporters/ });
  expect(cell.textContent).toBe("1");
});

it("HeatMapPanel: clicking another cell moves the inspector to it", () => {
  useDXStore.setState({
    spots: [spot({}), spot({ id: "vk", dx: "VK2ABC", spotter: "VK2DEF", band: "15m" })],
  });
  render(<HeatMapPanel />);

  const ocCell = screen.getByRole("button", { name: /15M to OC: 1 DX/ });
  fireEvent.click(ocCell);

  expect(screen.getByText("15M → OC")).toBeTruthy();
  expect(ocCell.getAttribute("aria-pressed")).toBe("true");
});
