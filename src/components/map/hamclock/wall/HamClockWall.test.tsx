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
  reliability: vi.fn(),
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
    selector({
      spotFilters: { bands: [], modes: [] },
      timeOffset: 0,
      absoluteTime: null,
    }),
}));
// Page 0's right rail now carries Reliability (spec §4); the tile's own
// fixtures live in tiles.test.tsx / wallTiles.test.tsx, so here it only needs
// to mount without the hook's real station/solar dependency chain.
vi.mock("./tiles/useWallReliability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tiles/useWallReliability")>()),
  useWallReliability: mocks.reliability,
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
    mocks.reliability.mockReturnValue({
      status: "no-station",
      cells: new Map(),
      hour: 0,
      hourIndex: 0,
      targetLabel: "",
      mode: "SSB",
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

  it("renders the page-0 tiles, each rail showing its own set with no repeats", () => {
    renderWall();
    const left = screen.getByRole("complementary", { name: "Left tile rail" });
    const right = screen.getByRole("complementary", { name: "Right tile rail" });
    const leftTitles = ["DX cluster", "Band activity", "Recent contacts"];
    const rightTitles = [
      "Best band now",
      "Grey line",
      "MUF",
      "24h reliability",
      "Emcomm",
    ];
    for (const title of leftTitles) {
      expect(within(left).getByText(title)).toBeTruthy();
      expect(within(right).queryByText(title)).toBeNull();
    }
    for (const title of rightTitles) {
      expect(within(right).getByText(title)).toBeTruthy();
      expect(within(left).queryByText(title)).toBeNull();
    }
  });

  it("steps the whole wall together with either arrow key (both rails follow one page)", () => {
    renderWall();
    expect(screen.getAllByText("SPOTS & ACTIVITY")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 1,
      right: 1,
    });
    // Both footer pagers show the same page — there is only one page.
    expect(screen.getAllByText("SOLAR & SPACE WX")).toHaveLength(2);

    // Shift no longer targets a single rail; it still steps the shared page.
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 0,
      right: 0,
    });
    expect(screen.getAllByText("SPOTS & ACTIVITY")).toHaveLength(2);
  });

  it("stepping from either pager's arrow moves both rails' tiles together", () => {
    renderWall();
    const left = screen.getByRole("complementary", { name: "Left tile rail" });
    const right = screen.getByRole("complementary", {
      name: "Right tile rail",
    });
    expect(within(left).getByText("DX cluster")).toBeTruthy();
    expect(within(right).getByText("Best band now")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Next left rail page" }),
    );

    expect(useHamClockDisplayStore.getState().pageIndex).toEqual({
      left: 1,
      right: 1,
    });
    expect(within(left).queryByText("DX cluster")).toBeNull();
    expect(within(left).getByText("X-ray flux")).toBeTruthy();
    expect(within(right).queryByText("Best band now")).toBeNull();
    expect(within(right).getByText("Moon")).toBeTruthy();
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

  it("switches density from the footer WALL/DESK control", () => {
    renderWall();
    useHamClockDisplayStore.getState().setDensity("wall");
    fireEvent.click(screen.getByRole("button", { name: "DESK" }));
    expect(useHamClockDisplayStore.getState().density).toBe("desk");
  });
});
