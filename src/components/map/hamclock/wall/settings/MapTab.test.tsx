import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { HamClockDialog } from "../controls";
import { MapTab } from "./MapTab";

describe("MapTab", () => {
  beforeEach(() => {
    useProfileStore.setState({ subscriptionTier: "free" });
    useMapStore.setState({
      mapStyle: "satellite",
      tileProviderId: "esri-world",
      viewMode: "globe",
      activePreset: null,
      observatoryMode: false,
      observatoryPreviousState: null,
      layers: { ...useMapStore.getState().layers, nightLights: false },
    });
  });

  it("enters Observatory and closes settings so the map is visible", () => {
    const onClose = vi.fn();
    render(<MapTab onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "ENTER OBSERVATORY" }));
    expect(useMapStore.getState().observatoryMode).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exits Observatory without closing settings", () => {
    useMapStore.getState().enterObservatory();
    const onClose = vi.fn();
    render(<MapTab onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "EXIT OBSERVATORY" }));
    expect(useMapStore.getState().observatoryMode).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the current style at a glance, not a permanently-live chooser (B6 PR #222 fix #2)", () => {
    render(<MapTab />);
    expect(screen.getByText("Satellite (Esri)")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "CHANGE MAP STYLE" }),
    ).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Map style" })).toBeNull();
  });

  it("shows 'Standard (built-in)', not 'Standard (OSM)', when mapStyle is standard on Flat (B6 PR #222 fix #1, corrected)", () => {
    useMapStore.setState({
      viewMode: "flat",
      mapStyle: "standard",
      tileProviderId: "osm",
    });
    render(<MapTab />);
    expect(screen.getByText("Standard (built-in)")).toBeTruthy();
    expect(screen.queryByText("Standard (OSM)")).toBeNull();
  });

  it("renders a night lights toggle and layer presets on the main tab, not behind the chooser", () => {
    render(<MapTab />);
    const toggle = screen.getByRole("switch", { name: /night lights/i });
    expect(toggle.textContent).toBe("OFF");
    fireEvent.click(toggle);
    expect(useMapStore.getState().layers.nightLights).toBe(true);

    const dxHunter = screen.getByRole("button", { name: /dx.?hunter/i });
    fireEvent.click(dxHunter);
    expect(useMapStore.getState().activePreset).toBe("dx-hunter");
  });

  describe("style chooser", () => {
    function openChooser() {
      render(<MapTab />);
      fireEvent.click(screen.getByRole("button", { name: "CHANGE MAP STYLE" }));
    }

    it("shows all four style rows on Globe with a swatch, name and behaviour line", () => {
      openChooser();
      for (const name of [
        "Satellite (Esri)",
        "Satellite (Mapbox)",
        "Standard (OSM)",
        "Dark (CARTO)",
      ]) {
        expect(screen.getByRole("radio", { name })).toBeTruthy();
      }
    });

    it("marks the active provider selected", () => {
      openChooser();
      expect(
        screen.getByRole("radio", { name: "Satellite (Esri)" }),
      ).toHaveProperty("ariaChecked", "true");
    });

    it("disables Mapbox and shows a Pro caveat on the free tier", () => {
      openChooser();
      const mapboxRow = screen.getByRole("radio", {
        name: "Satellite (Mapbox)",
      }) as HTMLButtonElement;
      expect(mapboxRow.disabled).toBe(true);
      expect(mapboxRow.textContent).toMatch(/pro plan required/i);
    });

    it("collapses OSM/CARTO into one enabled 'Standard (built-in)' row on Flat, with the reason as detail text (B6 PR #222 fix #1, corrected)", () => {
      useMapStore.setState({ viewMode: "flat" });
      openChooser();
      expect(screen.queryByRole("radio", { name: "Standard (OSM)" })).toBeNull();
      expect(screen.queryByRole("radio", { name: "Dark (CARTO)" })).toBeNull();
      const builtInRow = screen.getByRole("radio", {
        name: "Standard (built-in)",
      }) as HTMLButtonElement;
      expect(builtInRow.disabled).toBe(false);
      expect(builtInRow.textContent).toMatch(
        /flat map draws its own standard basemap/i,
      );
    });

    it("collapses OSM/CARTO into one enabled 'Standard (built-in)' row on Azimuthal, with its own reason", () => {
      useMapStore.setState({ viewMode: "azimuthal" });
      openChooser();
      expect(screen.queryByRole("radio", { name: "Standard (OSM)" })).toBeNull();
      expect(screen.queryByRole("radio", { name: "Dark (CARTO)" })).toBeNull();
      const builtInRow = screen.getByRole("radio", {
        name: "Standard (built-in)",
      }) as HTMLButtonElement;
      expect(builtInRow.disabled).toBe(false);
      expect(builtInRow.textContent).toMatch(
        /azimuthal draws its own standard basemap/i,
      );
    });

    it("selecting the built-in Standard row on Flat sets mapStyle standard and clears any provider override", () => {
      useMapStore.setState({
        viewMode: "flat",
        mapStyle: "satellite",
        tileProviderId: "esri-world",
      });
      openChooser();
      fireEvent.click(
        screen.getByRole("radio", { name: "Standard (built-in)" }),
      );

      expect(useMapStore.getState().mapStyle).toBe("standard");
      expect(useMapStore.getState().tileProviderId).toBeNull();
      expect(
        screen.getByRole("button", { name: "CHANGE MAP STYLE" }),
      ).toBeTruthy();
    });

    it("marks the built-in Standard row selected on Flat even with a stale carto-dark override", () => {
      useMapStore.setState({
        viewMode: "flat",
        mapStyle: "standard",
        tileProviderId: "carto-dark",
      });
      openChooser();
      expect(
        screen.getByRole("radio", { name: "Standard (built-in)" }),
      ).toHaveProperty("ariaChecked", "true");
    });

    it("shows the keyboard hint for applying and cancelling", () => {
      openChooser();
      expect(screen.getByText(/select to apply/i)).toBeTruthy();
      expect(screen.getByText(/back to cancel/i)).toBeTruthy();
    });

    it("clicking a row commits it live and returns to the tab", () => {
      openChooser();
      fireEvent.click(screen.getByRole("radio", { name: "Dark (CARTO)" }));

      expect(useMapStore.getState().mapStyle).toBe("standard");
      expect(useMapStore.getState().tileProviderId).toBe("carto-dark");
      expect(
        screen.getByRole("button", { name: "CHANGE MAP STYLE" }),
      ).toBeTruthy();
      expect(screen.queryByRole("radiogroup")).toBeNull();
    });

    it("moving the highlight with arrow keys previews live without closing the chooser", () => {
      openChooser();
      const esri = screen.getByRole("radio", { name: "Satellite (Esri)" });
      fireEvent.keyDown(esri, { key: "ArrowRight" });

      // Mapbox is Pro-gated on the free tier, so the roving highlight skips
      // straight to the next enabled row (Standard (OSM)) and applies it.
      expect(useMapStore.getState().mapStyle).toBe("standard");
      expect(useMapStore.getState().tileProviderId).toBe("osm");
      // Still open — a preview is not a commit.
      expect(screen.getByRole("radiogroup", { name: "Map style" })).toBeTruthy();
    });

    it("BACK restores the style active when the chooser opened, discarding any preview", () => {
      openChooser();
      const esri = screen.getByRole("radio", { name: "Satellite (Esri)" });
      fireEvent.keyDown(esri, { key: "ArrowRight" });
      expect(useMapStore.getState().mapStyle).toBe("standard");

      fireEvent.click(screen.getByRole("button", { name: "BACK" }));

      expect(useMapStore.getState().mapStyle).toBe("satellite");
      expect(useMapStore.getState().tileProviderId).toBe("esri-world");
      expect(
        screen.getByRole("button", { name: "CHANGE MAP STYLE" }),
      ).toBeTruthy();
      expect(screen.queryByRole("radiogroup")).toBeNull();
    });
  });

  describe("chooser Escape (wrapped in HamClockDialog, B6 PR #222 fix #2)", () => {
    it("cancels the chooser and restores the preview instead of closing the settings dialog", () => {
      const onClose = vi.fn();
      render(
        <HamClockDialog open onClose={onClose} title="SETTINGS">
          <MapTab />
        </HamClockDialog>,
      );
      fireEvent.click(screen.getByRole("button", { name: "CHANGE MAP STYLE" }));
      const esri = screen.getByRole("radio", { name: "Satellite (Esri)" });
      fireEvent.keyDown(esri, { key: "ArrowRight" });
      expect(useMapStore.getState().mapStyle).toBe("standard");

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
      expect(useMapStore.getState().mapStyle).toBe("satellite");
      expect(useMapStore.getState().tileProviderId).toBe("esri-world");
      expect(
        screen.getByRole("button", { name: "CHANGE MAP STYLE" }),
      ).toBeTruthy();
    });

    it("closes the settings dialog normally on Escape when the chooser is not open", () => {
      const onClose = vi.fn();
      render(
        <HamClockDialog open onClose={onClose} title="SETTINGS">
          <MapTab />
        </HamClockDialog>,
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
