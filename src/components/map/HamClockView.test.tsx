import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockView } from "./HamClockView";

vi.mock("@/stores/mapStore", () => ({
  useMapStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        layoutMode: "hamclock",
        setLayoutMode: vi.fn(),
        viewMode: "flat",
        setViewMode: vi.fn(),
        target: null,
        layers: {
          muf: false,
          aurora: false,
          drap: false,
          weather: false,
        },
        toggleLayer: vi.fn(),
        spotFilters: { bands: [] },
        setSpotFilters: vi.fn(),
      }),
    {
      getState: () => ({
        setLayoutMode: vi.fn(),
        layers: {
          muf: false,
          aurora: false,
          drap: false,
          weather: false,
        },
        spotFilters: { bands: [] },
        setSpotFilters: vi.fn(),
      }),
      setState: vi.fn(),
    },
  ),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ station: null }),
}));

vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        spotsSide: "left",
        setSpotsSide: vi.fn(),
        spotsSidebarCollapsed: false,
        infoSidebarCollapsed: false,
        toggleSpotsSidebar: vi.fn(),
        toggleInfoSidebar: vi.fn(),
        panelCollapsed: {},
        togglePanel: vi.fn(),
        hamclockMode: "traffic",
        setHamclockMode: vi.fn(),
        setPreferredViewMode: vi.fn(),
        setFiltersBeforeBands: vi.fn(),
        bandFocus: [],
        filtersBeforeBands: null,
      }),
    {
      getState: () => ({
        hamclockMode: "traffic",
        bandFocus: [],
        filtersBeforeBands: null,
      }),
    },
  ),
}));

vi.mock("@/hooks/useUTCClock", () => ({ useUTCClock: () => new Date(0) }));
vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => null }));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [] }),
  useSolarFlux: () => ({ data: [] }),
  useSunspots: () => ({ data: [], isLoading: false }),
  useMagnetometer: () => ({ data: [], isLoading: false }),
}));

vi.mock("./FlatMapView", () => ({ FlatMapView: () => <div>Flat map</div> }));
vi.mock("./BandConditionsPanel", () => ({
  BandConditionsPanel: () => <div />,
}));
vi.mock("@/components/map/LayersPopover", () => ({
  LayersPopover: () => <div />,
}));
vi.mock("@/components/map/WatchStatusPill", () => ({
  WatchStatusPill: () => <div />,
}));
vi.mock("./hamclock/HamClockSidebar", () => ({
  HamClockSidebar: ({ children }: { children: React.ReactNode }) => (
    <aside>{children}</aside>
  ),
}));
vi.mock("./hamclock/HamClockInfoPanel", () => ({
  HamClockInfoPanel: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
}));
vi.mock("./hamclock/HamClockSpotsSidebar", () => ({
  HamClockSpotsSidebar: () => <div>Spots</div>,
}));
vi.mock("./hamclock/HamClockBestBandHero", () => ({
  HamClockBestBandHero: () => <div />,
}));
vi.mock("./hamclock/HamClockContestsPanel", () => ({
  HamClockContestsPanel: () => <div />,
}));
vi.mock("./hamclock/HamClockDxpeditionsPanel", () => ({
  HamClockDxpeditionsPanel: () => <div />,
}));
vi.mock("./hamclock/HamClockReliabilityPanel", () => ({
  HamClockReliabilityPanel: () => <div />,
}));
vi.mock("./hamclock/HamClockMoonPanel", () => ({
  HamClockMoonPanel: () => <div />,
}));
vi.mock("./hamclock/HamClockLocationConditions", () => ({
  HamClockLocationConditions: () => <div />,
}));
vi.mock("./DXNewsTicker", () => ({
  DXNewsTicker: () => (
    <div role="marquee" aria-label="Alert crawl">
      Alert crawl
    </div>
  ),
}));

/** True when `a` appears before `b` in document order. */
function isBefore(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("HamClockView", () => {
  it("keeps the alert and news crawl mounted below the wall display", () => {
    // Desk density owns the grid-area layout this assertion describes; wall
    // density has its own shell and is covered by HamClockWall.test.tsx.
    useHamClockDisplayStore.getState().setDensity("desk");
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    const crawl = screen.getByRole("marquee", { name: /alert crawl/i });
    expect(crawl.parentElement?.style.gridArea).toBe("ticker");
  });

  it("shows WALL in the header without opening a menu, and orders mode, density, projection and the settings trigger consistently with the wall header (B1/HW-22)", () => {
    useHamClockDisplayStore.getState().setDensity("desk");
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    // WALL is directly visible — no menu needs opening. Previously the only
    // way back to wall density was a <select> buried in Display settings.
    const wall = screen.getByRole("button", { name: "WALL" });
    expect(wall).toBeTruthy();

    const mode = screen.getByRole("group", { name: "HamClock mode" });
    const density = screen.getByRole("group", { name: "HamClock density" });
    const projection = screen.getByRole("group", { name: "Map projection" });
    const settingsTrigger = screen.getByRole("button", { name: "SETTINGS" });

    expect(isBefore(mode, density)).toBe(true);
    expect(isBefore(density, projection)).toBe(true);
    expect(isBefore(projection, settingsTrigger)).toBe(true);
  });
});
