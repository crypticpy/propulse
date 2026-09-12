import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrbitTrackToggleButton } from "./SatelliteOverlay";
import { useMapStore } from "@/stores/mapStore";

// Covers #994 PR B item 4: the inline marker popup's "Map orbit" button must
// mirror SatelliteDetailModal's OrbitTrackControls toggle exactly (same
// mapStore.setSatelliteTrack/clearSatelliteTrack calls, same aria-pressed
// semantics), reachable without opening the full details modal.

describe("SatelliteOverlay OrbitTrackToggleButton (#994 PR B)", () => {
  afterEach(() => {
    act(() => {
      useMapStore.getState().clearAllSatelliteTracks();
    });
  });

  it("shows 'Map orbit' when untracked and maps the track via setSatelliteTrack", () => {
    render(<OrbitTrackToggleButton noradId={25544} name="ISS (ZARYA)" />);

    const button = screen.getByRole("button", { name: "Map orbit for ISS (ZARYA)" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(useMapStore.getState().satelliteTracks["25544"]).toBeUndefined();

    fireEvent.click(button);

    expect(useMapStore.getState().satelliteTracks["25544"]).toEqual({
      orbitsAhead: 1,
      showPast: false,
      showFootprint: false,
      name: "ISS (ZARYA)",
    });
  });

  it("shows 'Clear orbit' when tracked and clears the track via clearSatelliteTrack", () => {
    act(() => {
      useMapStore.getState().setSatelliteTrack(25544, {});
    });

    render(<OrbitTrackToggleButton noradId={25544} name="ISS (ZARYA)" />);

    const button = screen.getByRole("button", { name: "Clear orbit for ISS (ZARYA)" });
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button);

    expect(useMapStore.getState().satelliteTracks["25544"]).toBeUndefined();
  });

  it("is a real, keyboard-reachable button (type=button, no href/role hack)", () => {
    render(<OrbitTrackToggleButton noradId={43137} name="NOAA 19" />);
    const button = screen.getByRole("button", { name: "Map orbit for NOAA 19" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("does not propagate its click to an ancestor (the popup card also has an onClick)", () => {
    let parentClicked = false;
    render(
      <div onClick={() => { parentClicked = true; }}>
        <OrbitTrackToggleButton noradId={7530} name="STARLINK-1007" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Map orbit for STARLINK-1007" }));
    expect(useMapStore.getState().satelliteTracks["7530"]).toBeDefined();
    expect(parentClicked).toBe(false);
  });

  it("passes its name through to setSatelliteTrack so an eviction can name the right bird (#994 PR B round 3 Codex thread 3)", () => {
    render(<OrbitTrackToggleButton noradId={57166} name="IO-117" />);
    fireEvent.click(screen.getByRole("button", { name: "Map orbit for IO-117" }));
    expect(useMapStore.getState().satelliteTracks["57166"]?.name).toBe(
      "IO-117",
    );
  });
});
