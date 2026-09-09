import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { HeatMapPanel } from "./HeatMapPanel";
import { HeatMapStrip } from "./HeatMapStrip";

// Both widgets now source Band Health physics scores from `useBandVerdicts`
// (#686 review item 9) — mock it the same way `HeatMapTile.test.tsx` does,
// since neither widget file may import the wall tile's test setup.
const mocks = vi.hoisted(() => ({ verdicts: vi.fn() }));
vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));

const previousDX = useDXStore.getState();
const previousWorkspace = useWorkspaceStore.getState();

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
  mocks.verdicts.mockReturnValue({ bands: [] });
  // #686 review item 3 made the idle label honest about non-live feed
  // states — the store's own default ("UNKNOWN", before anything has
  // started the feed) now reads as "FEED NOT STARTED", not "NO SPOTS IN
  // WINDOW". Fixtures that want the plain no-activity reading must say the
  // feed is actually live; the "feed hasn't started" tests below override
  // this back to "UNKNOWN".
  useDXStore.setState({
    clusterFeed: { state: "CURRENT", windowMinutes: 20, fetchedAt: Date.now(), observedAt: Date.now() },
  });
});

afterEach(() => {
  useDXStore.setState(previousDX, true);
  useWorkspaceStore.setState(previousWorkspace, true);
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

it("HeatMapStrip: honest label when the feed hasn't started (item 3 regression)", () => {
  useDXStore.setState({
    clusterFeed: { state: "UNKNOWN", windowMinutes: null, fetchedAt: null, observedAt: null },
  });
  render(<HeatMapStrip />);
  expect(screen.getByText("FEED NOT STARTED")).toBeTruthy();
  expect(screen.queryByText("NO SPOTS IN WINDOW")).toBeNull();
});

it("HeatMapStrip: ratio headline rule still resolves without a baseline (item 4 regression)", () => {
  useWorkspaceStore.getState().setHeadlineRule("ratio");
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapStrip />);
  expect(screen.getByText("20M → EU")).toBeTruthy();
  expect(screen.queryByText("NO SPOTS IN WINDOW")).toBeNull();
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

it("HeatMapPanel: honest label when the feed hasn't started (item 3 regression)", () => {
  useDXStore.setState({
    clusterFeed: { state: "UNKNOWN", windowMinutes: null, fetchedAt: null, observedAt: null },
  });
  render(<HeatMapPanel />);
  expect(screen.getByText("FEED NOT STARTED")).toBeTruthy();
  expect(screen.queryByText("NO SPOTS IN WINDOW")).toBeNull();
});

it("HeatMapPanel: ratio headline rule still resolves without a baseline (item 4 regression)", () => {
  useWorkspaceStore.getState().setHeadlineRule("ratio");
  useDXStore.setState({ spots: [spot({})] });
  render(<HeatMapPanel />);
  expect(screen.getByText("20M → EU")).toBeTruthy();
});

it("HeatMapPanel: a forecast-open band with no spots is not 'closed' (item 9 regression)", () => {
  // Regression for #686 review item 9 (Codex PRRT_kwDORFr4R86ggBm7 dup —
  // physicsScores): without feeding `useBandVerdicts`' physics score into
  // `computeHeatmap`, every zero-spot cell defaults to physicsScore 0 and
  // reads Band Health "closed" even when the forecast says the band is open.
  mocks.verdicts.mockReturnValue({
    bands: [{ band: "20m", result: { inputs: { physicsScore: 0.6 } } }],
  });
  render(<HeatMapPanel />);
  const cell = screen.getByRole("button", { name: /20M to EU: 0 DX, 0 reporters, Band Health forecast/ });
  expect(cell).toBeTruthy();
});
