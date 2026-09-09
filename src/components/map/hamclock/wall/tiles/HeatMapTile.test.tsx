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
