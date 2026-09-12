import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useSatellitePrefsStore } from "@/stores/satellitePrefsStore";
import type { SatelliteInfoExtended } from "@/types/satellite";
import SatelliteFilters from "./SatelliteFilters";

const { useSatellitesMock } = vi.hoisted(() => ({
  useSatellitesMock: vi.fn(),
}));

vi.mock("@/hooks/useSatellites", () => ({
  useSatellites: useSatellitesMock,
}));

function sat(
  overrides: Partial<SatelliteInfoExtended> &
    Pick<SatelliteInfoExtended, "name" | "noradId" | "category">,
): SatelliteInfoExtended {
  return {
    line1: "1 00000U 00000A   26001.00000000  .00000000  00000-0  00000-0 0  9990",
    line2:
      "2 00000  00.0000 000.0000 0000000 000.0000 000.0000 15.00000000000010",
    position: { lat: 0, lon: 0, alt: 400, velocity: 7 },
    isVisible: false,
    tleAge: "fresh",
    isCustom: false,
    ...overrides,
  };
}

const SO_124 = sat({ name: "SO-124", noradId: 56207, category: "fm" });
const ISS = sat({ name: "ISS (ZARYA)", noradId: 25544, category: "iss" });
const NOAA = sat({ name: "NOAA 19", noradId: 33591, category: "weather" });

function renderFilters(
  props?: Partial<ComponentProps<typeof SatelliteFilters>>,
) {
  const onSeeFullList = vi.fn();
  const view = render(
    <MemoryRouter>
      <SatelliteFilters onSeeFullList={onSeeFullList} {...props} />
    </MemoryRouter>,
  );
  return { ...view, onSeeFullList };
}

describe("SatelliteFilters", () => {
  beforeEach(() => {
    useSatellitesMock.mockReturnValue({ satellites: [] });
  });

  afterEach(() => {
    useMapStore.setState({ satelliteCategoryFilter: "all" });
    useSatellitePrefsStore.setState({
      trackedNoradIds: "all",
      hasCustomized: false,
    });
  });

  it("renders category chips and the two action buttons with no satellite rows (#1085)", () => {
    useSatellitesMock.mockReturnValue({
      satellites: [SO_124, ISS, NOAA],
    });

    renderFilters();

    expect(screen.getByRole("button", { name: "See full list" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Manage satellites" }).getAttribute("href"),
    ).toBe("/satellites");
    expect(screen.queryByText("SO-124")).toBeNull();
    expect(screen.queryByText("ISS (ZARYA)")).toBeNull();
    expect(screen.queryByText("NOAA 19")).toBeNull();
    expect(screen.queryByRole("button", { name: /all satellites/i })).toBeNull();
    expect(document.querySelector(".overflow-y-auto")).toBeNull();

    expect(screen.getByRole("button", { name: "All 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "FM 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ISS 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WX 1" })).toBeTruthy();
  });

  it("opens the full list through the See full list button", async () => {
    useSatellitesMock.mockReturnValue({ satellites: [SO_124] });
    const user = userEvent.setup();
    const { onSeeFullList } = renderFilters();

    await user.click(screen.getByRole("button", { name: "See full list" }));
    expect(onSeeFullList).toHaveBeenCalledTimes(1);
  });

  it("writes the shared category filter so the Satellites panel can apply it", async () => {
    useSatellitesMock.mockReturnValue({
      satellites: [SO_124, ISS, NOAA],
    });
    const user = userEvent.setup();
    renderFilters();

    await user.click(screen.getByRole("button", { name: "FM 1" }));
    expect(useMapStore.getState().satelliteCategoryFilter).toBe("fm");
  });

  it("closes the Layers menu when Manage satellites is used", async () => {
    useSatellitesMock.mockReturnValue({ satellites: [SO_124] });
    const onManageSatellites = vi.fn();
    const user = userEvent.setup();
    renderFilters({ onManageSatellites });

    await user.click(screen.getByRole("link", { name: "Manage satellites" }));
    expect(onManageSatellites).toHaveBeenCalledTimes(1);
  });
});
