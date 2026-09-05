import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { MapTab } from "./MapTab";

describe("MapTab", () => {
  beforeEach(() => {
    useProfileStore.setState({ subscriptionTier: "free" });
    useMapStore.setState({
      mapStyle: "satellite",
      tileProviderId: "esri-world",
      viewMode: "globe",
      activePreset: null,
      layers: { ...useMapStore.getState().layers, nightLights: false },
    });
  });

  it("shows all four style rows with a swatch, name and behaviour line", () => {
    render(<MapTab />);
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
    render(<MapTab />);
    expect(screen.getByRole("radio", { name: "Satellite (Esri)" })).toHaveProperty(
      "ariaChecked",
      "true",
    );
  });

  it("disables Mapbox and shows a Pro caveat on the free tier", () => {
    render(<MapTab />);
    const mapboxRow = screen.getByRole("radio", {
      name: "Satellite (Mapbox)",
    }) as HTMLButtonElement;
    expect(mapboxRow.disabled).toBe(true);
    expect(mapboxRow.textContent).toMatch(/pro plan required/i);
  });

  it("applies a style selection live, without a separate save step", () => {
    render(<MapTab />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark (CARTO)" }));

    expect(useMapStore.getState().mapStyle).toBe("standard");
    expect(useMapStore.getState().tileProviderId).toBe("carto-dark");
  });

  it("restores the style active when the tab opened when BACK is pressed", () => {
    render(<MapTab />);
    fireEvent.click(screen.getByRole("radio", { name: "Standard (OSM)" }));
    expect(useMapStore.getState().mapStyle).toBe("standard");

    fireEvent.click(screen.getByRole("button", { name: "BACK" }));

    expect(useMapStore.getState().mapStyle).toBe("satellite");
    expect(useMapStore.getState().tileProviderId).toBe("esri-world");
  });

  it("shows the keyboard hint for applying and cancelling", () => {
    render(<MapTab />);
    expect(screen.getByText(/select to apply/i)).toBeTruthy();
    expect(screen.getByText(/back to cancel/i)).toBeTruthy();
  });

  it("renders a night lights toggle bound to the layer store", () => {
    render(<MapTab />);
    const toggle = screen.getByRole("switch", { name: /night lights/i });
    expect(toggle.textContent).toBe("OFF");

    fireEvent.click(toggle);
    expect(useMapStore.getState().layers.nightLights).toBe(true);
  });

  it("renders every layer preset as a button that applies it", () => {
    render(<MapTab />);
    const dxHunter = screen.getByRole("button", { name: /dx.?hunter/i });
    fireEvent.click(dxHunter);
    expect(useMapStore.getState().activePreset).toBe("dx-hunter");
  });
});
