import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
      }),
    { getState: () => ({ setLayoutMode: vi.fn() }) },
  ),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ station: null }),
}));

vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      spotsSide: "left",
      setSpotsSide: vi.fn(),
      spotsSidebarCollapsed: false,
      infoSidebarCollapsed: false,
      toggleSpotsSidebar: vi.fn(),
      toggleInfoSidebar: vi.fn(),
      panelCollapsed: {},
      togglePanel: vi.fn(),
    }),
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
vi.mock("./hamclock/HamClockProjectionSwitch", () => ({
  HamClockProjectionSwitch: () => <div />,
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

describe("HamClockView", () => {
  it("keeps the alert and news crawl mounted below the wall display", () => {
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <HamClockView displayTime={new Date(0)} />
      </MemoryRouter>,
    );

    const crawl = screen.getByRole("marquee", { name: /alert crawl/i });
    expect(crawl.parentElement?.style.gridArea).toBe("ticker");
  });
});
