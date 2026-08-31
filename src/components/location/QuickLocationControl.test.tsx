import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_LOCATION_ID, useProfileStore } from "@/stores/profileStore";
import { QuickLocationControl } from "./QuickLocationControl";

const originalState = useProfileStore.getState();

describe("QuickLocationControl", () => {
  beforeEach(() => {
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
    useProfileStore.setState(originalState, true);
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
});
