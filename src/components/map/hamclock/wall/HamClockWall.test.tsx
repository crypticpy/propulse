import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockWall } from "./HamClockWall";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
  ladder: vi.fn(),
  cluster: vi.fn(),
  location: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", () => ({ useBandActivity: mocks.activity }));
vi.mock("@/hooks/useBandLadder", () => ({
  canonicalKey: (scope: string, key: string, band: string) =>
    `${scope}:${key}:${band}`,
  useBandLadder: mocks.ladder,
}));
vi.mock("@/hooks/useDXCluster", () => ({ useDXCluster: mocks.cluster }));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/stores/userStore", () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ station: { callsign: "W5XYZ", grid: "EM10dg" } }),
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({ spotFilters: { bands: [], modes: [] } }),
}));
// The solar and logbook tiles are exercised in tiles.test.tsx; here they only
// need to mount without opening a network or IndexedDB connection.
vi.mock("@/hooks/useSolarResource", () => ({
  useSolarResource: () => ({ data: undefined, isError: false, isPending: true }),
}));
vi.mock("@/hooks/useLocalWeather", () => ({
  useLocationWeather: () => ({
    weather: null,
    isLoading: true,
    error: null,
    hasLocation: true,
  }),
}));
vi.mock("@/lib/hamclock/recentContacts", () => ({
  readHamClockContacts: vi.fn(async () => []),
}));
vi.mock("@/components/map/DXNewsTicker", () => ({
  DXNewsTicker: () => <div data-testid="dx-news-ticker" />,
}));
vi.mock("./HamClockWallControls", () => ({
  HamClockWallControls: () => <div data-testid="wall-controls" />,
}));

describe("HamClockWall", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useHamClockDisplayStore.getState().resetDisplay();
    mocks.verdicts.mockReturnValue({
      bands: [],
      ready: false,
      scope: { id: "regional:NA", type: "regional", continent: "NA", label: "North America" },
      activityScope: { type: "regional", continent: "NA" },
    });
    mocks.activity.mockReturnValue({ data: new Map() });
    mocks.ladder.mockReturnValue({ data: new Map() });
    mocks.cluster.mockReturnValue({
      allSpots: [],
      source: "rest",
      isLoading: false,
    });
    mocks.location.mockReturnValue({
      id: "home",
      name: "Austin",
      grid: "EM10dg",
      lat: 30.27,
      lon: -97.74,
      type: "home",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  function renderWall() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <HamClockWall>
          <div data-testid="map-stage" />
        </HamClockWall>
      </QueryClientProvider>,
    );
  }

  it("shows the callsign hero, station identity and both clocks", () => {
    renderWall();
    expect(screen.getByText("W5XYZ")).toBeTruthy();
    expect(screen.getByText(/EM10DG · AUSTIN · 30\.27N 97\.74W/)).toBeTruthy();
    expect(screen.getByText("UTC")).toBeTruthy();
    // Local + UTC clocks both render an HH:MM:SS readout.
    expect(
      document.querySelectorAll(".hc-clock-tm").length,
    ).toBe(2);
  });

  it("renders the page-0 tiles in both rails", () => {
    renderWall();
    const left = screen.getByRole("complementary", { name: "Left tile rail" });
    const right = screen.getByRole("complementary", { name: "Right tile rail" });
    for (const title of ["Best band now", "DX cluster", "Band activity"]) {
      expect(within(left).getByText(title)).toBeTruthy();
      expect(within(right).getByText(title)).toBeTruthy();
    }
    expect(within(left).getByText("Grey line")).toBeTruthy();
    expect(within(right).getByText("Recent contacts")).toBeTruthy();
  });

  it("pages the right rail with ArrowRight and the left rail with Shift+ArrowRight", () => {
    renderWall();
    expect(screen.getAllByText("SPOTS & ACTIVITY")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 0,
      right: 1,
    });
    expect(screen.getByText("SOLAR & SPACE WX")).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 1,
      right: 1,
    });
  });

  it("ignores arrow keys while a report dialog is open", () => {
    renderWall();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useHamClockDisplayStore.getState().pageIndex.right).toBe(0);
    dialog.remove();
  });

  it("no longer renders a footer WALL/DESK control — it moved to the header", () => {
    // The header's HamClockDensitySwitch (rendered by the real, unmocked
    // HamClockWallHeader) is the only WALL/DESK toggle now; see
    // HamClockWallHeader.test.tsx for its coverage. HamClockWallControls is
    // stubbed out above, so this asserts the footer copy was removed rather
    // than merely hidden.
    renderWall();
    expect(
      screen.queryByRole("group", { name: "Layout density" }),
    ).toBeNull();
  });
});
