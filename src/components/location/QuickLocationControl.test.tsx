import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_LOCATION_ID, useProfileStore } from "@/stores/profileStore";
import { syncMeta } from "@/lib/sync/syncMeta";
import { LocationManager } from "@/components/settings/LocationManager";
import { QuickLocationControl } from "./QuickLocationControl";

const originalState = useProfileStore.getState();

describe("QuickLocationControl", () => {
  beforeEach(() => {
    syncMeta.clear();
    useProfileStore.setState({
      ...originalState,
      station: {
        callsign: "N0QA",
        homeLocationId: "home",
        activeLocationId: null,
        savedLocations: [
          {
            id: "home",
            name: "Home",
            grid: "EM10",
            lat: 30.5,
            lon: -97,
            timezone: "America/Chicago",
            type: "home",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        grid: "EM10",
        lat: 30.5,
        lon: -97,
        timezone: "America/Chicago",
      },
    });
  });

  afterEach(() => {
    syncMeta.clear();
    useProfileStore.setState(originalState, true);
  });

  it("announces whether Home or Travel is active", () => {
    render(<QuickLocationControl />);

    expect(
      screen.getByRole("button", {
        name: /update current operating location.*home location: EM10/i,
      }),
    ).toBeTruthy();

    act(() => {
      useProfileStore.getState().setCurrentLocation({
        grid: "DM79",
        lat: 39.5,
        lon: -105,
        timezone: "America/Denver",
      });
    });

    expect(
      screen.getByRole("button", {
        name: /update current operating location.*travel location: DM79/i,
      }),
    ).toBeTruthy();
  });

  it("applies and replaces a current-location slot without editing home", async () => {
    render(<QuickLocationControl />);

    fireEvent.click(
      screen.getByRole("button", { name: /update current operating location/i }),
    );
    fireEvent.change(await screen.findByPlaceholderText("EM10fp"), {
      target: { value: "FN31PR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use This Location" }));

    let station = useProfileStore.getState().station!;
    expect(station.activeLocationId).toBe(CURRENT_LOCATION_ID);
    expect(station.grid).toBe("FN31PR");
    expect(station.savedLocations.find((location) => location.id === "home")?.grid).toBe(
      "EM10",
    );

    useProfileStore.getState().setCurrentLocation({
      grid: "DM79",
      lat: 39.5,
      lon: -105,
      timezone: "America/Denver",
    });
    station = useProfileStore.getState().station!;
    expect(
      station.savedLocations.filter(
        (location) => location.id === CURRENT_LOCATION_ID,
      ),
    ).toHaveLength(1);
    expect(station.grid).toBe("DM79");
    expect(station.timezone).toBe("America/Denver");
  });

  it("returns to the saved home QTH", async () => {
    useProfileStore.getState().setCurrentLocation({
      grid: "DM79",
      lat: 39.5,
      lon: -105,
      timezone: "America/Denver",
    });
    render(<QuickLocationControl />);

    fireEvent.click(
      screen.getByRole("button", { name: /update current operating location/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use Home QTH" }),
    );

    const station = useProfileStore.getState().station!;
    expect(station.activeLocationId).toBeNull();
    expect(station.grid).toBe("EM10");
    expect(station.timezone).toBe("America/Chicago");
  });

  it("materializes a legacy-only Home before applying travel location", () => {
    useProfileStore.setState((state) => ({
      ...state,
      station: {
        callsign: "N0QA",
        homeLocationId: "legacy-home-id",
        activeLocationId: null,
        savedLocations: [],
        grid: "EM10",
        lat: 30.5,
        lon: -97,
        timezone: "America/Chicago",
      },
    }));

    useProfileStore.getState().setCurrentLocation({
      grid: "DM79",
      lat: 39.5,
      lon: -105,
      timezone: "America/Denver",
    });

    let station = useProfileStore.getState().station!;
    expect(station.homeLocationId).toBe("legacy-home-id");
    expect(
      station.savedLocations.find(
        (location) => location.id === "legacy-home-id",
      )?.grid,
    ).toBe("EM10");

    useProfileStore.getState().clearTemporaryLocation();
    station = useProfileStore.getState().station!;
    expect(station.activeLocationId).toBeNull();
    expect(station.grid).toBe("EM10");
    expect(station.timezone).toBe("America/Chicago");
  });

  it("shows the active quick-travel slot when older portable sites exist", () => {
    useProfileStore.setState((state) => ({
      ...state,
      station: {
        ...state.station!,
        activeLocationId: CURRENT_LOCATION_ID,
        grid: "DM79",
        lat: 39.5,
        lon: -105,
        timezone: "America/Denver",
        savedLocations: [
          ...state.station!.savedLocations,
          {
            id: "older-portable",
            name: "Old field site",
            grid: "DM12",
            lat: 32.5,
            lon: -117,
            type: "portable",
            createdAt: "2026-02-01T00:00:00.000Z",
          },
          {
            id: CURRENT_LOCATION_ID,
            name: "Current location",
            grid: "DM79",
            lat: 39.5,
            lon: -105,
            timezone: "America/Denver",
            type: "mobile",
            createdAt: "2026-03-01T00:00:00.000Z",
          },
        ],
      },
    }));

    render(<LocationManager />);

    expect(screen.getAllByText("DM79").length).toBeGreaterThan(0);
    expect(screen.queryByText("DM12")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /temporary.*DM79/i }));
    expect(useProfileStore.getState().station?.activeLocationId).toBe(
      CURRENT_LOCATION_ID,
    );
  });
});
