import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LAYER_CATEGORIES, LAYER_REGISTRY } from "@/lib/map/layerRegistry";
import { useMapStore } from "@/stores/mapStore";
import { LayersTab } from "./LayersTab";

describe("LayersTab", () => {
  beforeEach(() => {
    useMapStore.setState({ viewMode: "globe" });
  });

  it("shows one category sub-tab per registry category", () => {
    render(<LayersTab />);
    for (const category of LAYER_CATEGORIES) {
      expect(screen.getByRole("tab", { name: category.label })).toBeTruthy();
    }
  });

  it("shows every layer in the active category with its provenance line", () => {
    render(<LayersTab />);
    const firstCategory = LAYER_CATEGORIES[0];
    const entries = Object.values(LAYER_REGISTRY).filter(
      (entry) => entry.category === firstCategory.id,
    );
    for (const entry of entries) {
      expect(screen.getByText(entry.name)).toBeTruthy();
    }
  });

  it("toggles a layer live through useMapStore when its ON/OFF button is clicked", () => {
    useMapStore.setState((state) => ({
      layers: { ...state.layers, terminator: false },
    }));
    render(<LayersTab />);

    const row = screen.getByText("Day/Night Terminator").closest(".hcc-row")!;
    const toggle = row.querySelector('[role="switch"]') as HTMLElement;
    expect(toggle.textContent).toBe("OFF");

    fireEvent.click(toggle);

    expect(useMapStore.getState().layers.terminator).toBe(true);
  });

  it("disables a row the current projection cannot show, with the reason in the caveat slot", () => {
    useMapStore.setState({ viewMode: "azimuthal" });
    render(<LayersTab />);

    // greyline is not supported in azimuthal view (layerCapabilities.ts).
    const greylineTab = screen.getByRole("tab", { name: "Illumination & Reference" });
    fireEvent.click(greylineTab);

    const row = screen.getByText("Greyline").closest(".hcc-row")!;
    const toggle = row.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(row.textContent).toMatch(/azimuthal/i);
  });
});
