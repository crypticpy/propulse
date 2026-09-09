import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { regionalHeatmapCells } from "@/lib/widgets/heatmap/baseline";
import { HeatMapTile } from "./HeatMapTile";

const mocks = vi.hoisted(() => ({ verdicts: vi.fn(), baseline: vi.fn() }));
vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useHeatMapBaseline", () => ({ useHeatMapBaseline: mocks.baseline }));

const previousDX = useDXStore.getState();
const previousDisplay = useHamClockDisplayStore.getState();

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-08T13:00:00Z"));
  mocks.verdicts.mockReturnValue({ bands: [] });
  mocks.baseline.mockClear();
  mocks.baseline.mockReturnValue({ regionalCells: [], available: false, unavailableLabel: "NEEDS 14 BASELINE SAMPLES" });
});

afterEach(() => {
  useDXStore.setState(previousDX, true);
  useHamClockDisplayStore.setState(previousDisplay, true);
  vi.useRealTimers();
});

it("does not collapse the grid when the client feed is 1000x smaller; only genuinely quiet regional counts read quiet", async () => {
  useDXStore.setState({ spots: [spot({})] });
  useHamClockDisplayStore.getState().setHeatmapPreset("ratioDiverging");
  const hourUtc = "2026-09-08T12:00:00.000Z";
  mocks.baseline.mockReturnValue({
    regionalCells: regionalHeatmapCells(
      new Map([["20m|EU|12", 1000], ["20m|NA|12", 1000]]),
      new Map([["20m|EU|12", 1000], ["20m|NA|12", 1]]),
      hourUtc,
    ),
    available: true, unavailableLabel: null, hourUtc,
    basisLabel: "LAST FULL HOUR vs 90-DAY MEDIAN · as of 2026-09-08 12:00 UTC",
    baselineAgeLabel: "BASELINE AS OF 2026-09-08 00:00 UTC (13 H AGO)",
  });
  const { container } = render(<HeatMapTile />);
  const tile = container.querySelector(".hc-tile") as HTMLElement;
  expect(tile.style.getPropertyValue("--hc-state")).toBe("var(--hc-good)");
  fireEvent.click(screen.getByRole("button", { name: /Band heat map:.*Open the full grid report/ }));
  await screen.findByRole("dialog", { name: "Band heat map report" });
  expect(screen.getByText("1000 / 0.00")).toBeTruthy();
  expect(screen.getByText("1 / \u2264-3.00")).toBeTruthy();
  expect(screen.getAllByText("0 / NO BASELINE").length).toBeGreaterThan(0);
  const noData = screen.getAllByText("0 / NO BASELINE")[0];
  expect(noData.getAttribute("data-no-baseline")).toBe("true");
  expect(noData.style.background).toContain("repeating-linear-gradient");
  expect(screen.getByText("1 / \u2264-3.00").hasAttribute("data-no-baseline")).toBe(false);
  expect(container.querySelector(".hcf-heatgrid-cell[data-no-baseline]")?.getAttribute("style")).toContain("repeating-linear-gradient");
  expect(screen.getByText("NO BASELINE (not measured quiet)")).toBeTruthy();
  // Nowrap and the ratio-mode font floor live in hamclock-wall-report.css
  // (DS-16, >=1.3vh) rather than inline styles now (#695 item 2).
  expect(screen.getByText("1000 / 0.00").className).toContain("hcr-heatgrid-cell--ratio");
  expect(screen.getAllByText(/LAST FULL HOUR vs 90-DAY MEDIAN/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("BASELINE AS OF 2026-09-08 00:00 UTC (13 H AGO)").length).toBeGreaterThan(0);
  expect(screen.queryByText("SAME UTC HOUR MEDIAN")).toBeNull();
});

it.each(["NEEDS 14 BASELINE SAMPLES", "REGIONAL DATA UNAVAILABLE", "NO COMPLETE-HOUR DATA (COLLECTOR GAP)"])(
  "falls back to the ladder and explains %s for a saved ratio selection",
  (unavailableLabel) => {
    useDXStore.setState({ spots: [spot({})] });
    useHamClockDisplayStore.getState().setHeatmapPreset("ratioDiverging");
    mocks.baseline.mockReturnValue({ regionalCells: [], available: false, unavailableLabel });
    const { container } = render(<HeatMapTile />);
    expect(screen.getByText(unavailableLabel)).toBeTruthy();
    const tile = container.querySelector(".hc-tile") as HTMLElement;
    expect(tile.style.getPropertyValue("--hc-state")).not.toBe("var(--hc-good)");
    expect(useHamClockDisplayStore.getState().heatmapPreset).toBe("ratioDiverging");
  },
);

it("keeps regional ratios available when the client feed is empty or unavailable", () => {
  useDXStore.setState({ spots: [], clusterFeed: { ...previousDX.clusterFeed, state: "UNAVAILABLE" } });
  useHamClockDisplayStore.getState().setHeatmapPreset("ratioDiverging");
  mocks.baseline.mockReturnValue({
    regionalCells: regionalHeatmapCells(new Map([["20m|EU|12", 1000]]), new Map([["20m|EU|12", 1000]]), "2026-09-08T12:00:00Z"),
    available: true, unavailableLabel: null,
    basisLabel: "LAST FULL HOUR vs 90-DAY MEDIAN · as of 2026-09-08 12:00 UTC",
    baselineAgeLabel: "BASELINE AS OF 2026-09-08 00:00 UTC (13 H AGO)",
  });
  render(<HeatMapTile />);
  expect(screen.getByText("20 m → EU is the hottest cell")).toBeTruthy();
  expect(screen.queryByText("UNAVAILABLE")).toBeNull();
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
  expect(mocks.baseline).not.toHaveBeenCalled();
  expect(screen.queryByText("BASELINE")).toBeNull();
  expect(screen.queryByText("NEEDS 14 BASELINE SAMPLES")).toBeNull();
});

it("mounts the regional hook only while ratio mode is selected", () => {
  useDXStore.setState({ spots: [spot({})] });
  useHamClockDisplayStore.getState().setHeatmapPreset("ladderHue");
  render(<HeatMapTile />);
  expect(mocks.baseline).not.toHaveBeenCalled();
  act(() => useHamClockDisplayStore.getState().setHeatmapPreset("ratioDiverging"));
  expect(mocks.baseline).toHaveBeenCalled();
  mocks.baseline.mockClear();
  act(() => useHamClockDisplayStore.getState().setHeatmapPreset("ladderHue"));
  expect(mocks.baseline).not.toHaveBeenCalled();
  expect(screen.queryByText("NEEDS 14 BASELINE SAMPLES")).toBeNull();
});

it("keeps the ladder's 20-minute window even when the operator's DX spot age is 5 minutes", () => {
  // Regression for #654 P1 (Codex, PR #667): a 5-minute cluster-list filter
  // must not starve the heat map's fixed 20-min ladder window — spots older
  // than 5 min (but within 20) must still be counted.
  useDXStore.setState({
    filters: { ...useDXStore.getState().filters, maxAge: 5 },
    spots: [
      spot({ id: "a", dx: "G4AAA", time: new Date("2026-09-08T12:42:00Z") }), // 18 min old
      spot({ id: "b", dx: "G4BBB", time: new Date("2026-09-08T12:48:00Z") }), // 12 min old
      spot({ id: "c", dx: "G4CCC", time: new Date("2026-09-08T12:57:00Z") }), // 3 min old
    ],
  });
  render(<HeatMapTile />);
  expect(screen.getByText(/3 DX/)).toBeTruthy();
});

it("cannot promote a cell to HOT and states the real window when the feed only spans 8 minutes", () => {
  // Regression for #654 P1 (Codex, PR #667): with less than the ladder's
  // full 20-min window available, the "prior 10 min" trend half is missing
  // data rather than genuinely quiet, so `computeTrend`'s zero-prior rule
  // would otherwise read any activity as "rising" and wrongly promote to
  // HOT. `clampInsufficientHistory` caps that at "verified" instead.
  const reporters = ["W1AW", "K1ABC", "N2XYZ", "VE3ABC", "VK2DEF", "JA1GHI"];
  useDXStore.setState({
    spots: reporters.map((reporter, index) =>
      spot({
        id: `hot-${index}`,
        dx: "G4AAA",
        spotter: reporter,
        // Oldest is 8 minutes old, so the feed's real span is 8 min — well
        // short of the ladder's 20-min assumption.
        time: new Date(new Date("2026-09-08T13:00:00Z").getTime() - (8 - index) * 60_000),
      }),
    ),
  });
  const { container } = render(<HeatMapTile />);
  // "OPEN" (verified) tone, never HOT's accent tone.
  const tile = container.querySelector(".hc-tile") as HTMLElement | null;
  expect(tile?.style.getPropertyValue("--hc-state")).toBe("var(--hc-good)");
  expect(screen.getByText(/8 MIN/)).toBeTruthy();
});
