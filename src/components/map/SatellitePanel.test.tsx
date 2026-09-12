import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SatellitePanel } from "./SatellitePanel";
import { useMapStore } from "@/stores/mapStore";
import { useSatellitePrefsStore } from "@/stores/satellitePrefsStore";
import type { SatelliteInfoExtended } from "@/types/satellite";

const { useSatellitesMock } = vi.hoisted(() => ({
  useSatellitesMock: vi.fn(),
}));

vi.mock("@/hooks/useSatellites", () => ({
  useSatellites: useSatellitesMock,
}));

vi.mock("@/hooks/useSatelliteAlerts", () => ({
  useSatelliteAlerts: () => ({
    alertsEnabled: false,
    notificationSupported: false,
    requestPermission: vi.fn(),
    alertCount: 0,
  }),
}));

vi.mock("@/hooks/useSatelliteTransponders", () => ({
  useSatelliteTransponders: () => ({
    transponders: [],
    isLoading: false,
    error: null,
    isAvailable: false,
  }),
}));

const SO_124: SatelliteInfoExtended = {
  name: "SO-124",
  line1:
    "1 56207U 00000A   26001.00000000  .00000000  00000-0  00000-0 0  9990",
  line2:
    "2 56207  00.0000 000.0000 0000000 000.0000 000.0000 15.00000000000010",
  noradId: 56207,
  position: { lat: 10, lon: 20, alt: 500, velocity: 7.5 },
  isVisible: true,
  category: "fm",
  tleAge: "fresh",
  isCustom: false,
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <SatellitePanel />
    </MemoryRouter>,
  );
}

describe("SatellitePanel row Map orbit (#1083)", () => {
  afterEach(() => {
    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
    useSatellitePrefsStore.setState({
      trackedNoradIds: "all",
      hasCustomized: false,
    });
    useSatellitesMock.mockReset();
  });

  it("shows a spelled-out Map orbit control on each list row", () => {
    const selectSatellite = vi.fn();
    useSatellitesMock.mockReturnValue({
      satellites: [SO_124],
      selectedSatellite: null,
      selectSatellite,
      isLoading: false,
      nextPasses: [],
      isAvailable: true,
      refetch: vi.fn(),
    });

    renderPanel();

    expect(screen.getByText("SO-124")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Map orbit" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("Orbit mapped")).toBeNull();
  });

  it("clicking Map orbit calls setSatelliteTrack and does not select the row", () => {
    const selectSatellite = vi.fn();
    useSatellitesMock.mockReturnValue({
      satellites: [SO_124],
      selectedSatellite: null,
      selectSatellite,
      isLoading: false,
      nextPasses: [],
      isAvailable: true,
      refetch: vi.fn(),
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Map orbit" }));

    expect(selectSatellite).not.toHaveBeenCalled();
    expect(useMapStore.getState().satelliteTracks["56207"]).toEqual({
      orbitsAhead: 1,
      showPast: false,
      showFootprint: false,
      name: "SO-124",
    });
    expect(screen.getByRole("button", { name: "Clear orbit" })).toBeTruthy();
    expect(screen.getByText("Orbit mapped")).toBeTruthy();
  });

  it("clicking Clear orbit calls clearSatelliteTrack", () => {
    const selectSatellite = vi.fn();
    useSatellitesMock.mockReturnValue({
      satellites: [SO_124],
      selectedSatellite: null,
      selectSatellite,
      isLoading: false,
      nextPasses: [],
      isAvailable: true,
      refetch: vi.fn(),
    });
    act(() => {
      useMapStore.getState().setSatelliteTrack(56207, { name: "SO-124" });
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Clear orbit" }));

    expect(useMapStore.getState().satelliteTracks["56207"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "Map orbit" })).toBeTruthy();
  });
});
