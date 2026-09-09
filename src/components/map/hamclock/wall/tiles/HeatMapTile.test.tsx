import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { HeatMapTile } from "./HeatMapTile";

const mocks = vi.hoisted(() => ({ verdicts: vi.fn() }));
vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));

const previousDX = useDXStore.getState();

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
  mocks.verdicts.mockReturnValue({ bands: [] });
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

it("renders the honest empty state when no spots are in the window", () => {
  render(<HeatMapTile />);
  expect(screen.getByText("NO SPOTS IN WINDOW")).toBeTruthy();
});

it("renders a hot-cell headline from fixture spots", () => {
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapTile />);
  expect(screen.getByText("20 m → EU is the hottest cell")).toBeTruthy();
});

it("opens the centred report on click, nothing else", async () => {
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapTile />);
  const open = screen.getByRole("button", {
    name: /Band heat map:.*Open the full grid report/,
  });
  fireEvent.click(open);
  const dialog = await screen.findByRole("dialog", {
    name: "Band heat map report",
  });
  expect(dialog).toBeTruthy();
});
