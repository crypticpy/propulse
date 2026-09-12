import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FramedGlobeSatellitesPanel } from "./FramedGlobeSatellitesPanel";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";
import { useMapStore } from "@/stores/mapStore";

vi.mock("./SatellitePanel", () => ({
  SatellitePanel: () => <div>Satellite panel stub</div>,
}));

function setMap(patch: {
  layoutMode?: "normal" | "lite" | "pro" | "hamclock";
  viewMode?: "globe" | "flat" | "azimuthal";
  satellites?: boolean;
}) {
  useMapStore.setState((s) => ({
    layoutMode: patch.layoutMode ?? "normal",
    viewMode: patch.viewMode ?? "globe",
    isLiteMode: (patch.layoutMode ?? "normal") === "lite",
    isFullscreen: (patch.layoutMode ?? "normal") === "pro",
    layers: {
      ...s.layers,
      satellites: patch.satellites ?? false,
    },
  }));
}

describe("FramedGlobeSatellitesPanel (#1083)", () => {
  afterEach(() => {
    setMap({ layoutMode: "normal", viewMode: "globe", satellites: false });
  });

  it("mounts the Satellites FloatingPanel when the satellites layer is on in the non-pro globe", () => {
    setMap({ layoutMode: "normal", viewMode: "globe", satellites: true });
    render(<FramedGlobeSatellitesPanel />);

    expect(document.getElementById("floating-panel-satellites")).not.toBeNull();
    expect(screen.getByText("Satellites")).toBeTruthy();
    expect(screen.getByText("Satellite panel stub")).toBeTruthy();
  });

  it("escapes the map Card's clipped containing block and stays below drawers", () => {
    setMap({ satellites: true });
    const { container } = render(
      <div style={{ overflow: "hidden", backdropFilter: "blur(12px)" }}>
        <FramedGlobeSatellitesPanel />
      </div>,
    );
    const panel = document.getElementById("floating-panel-satellites")!;
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
    expect(Number(panel.style.zIndex)).toBe(MAP_PAGE_CHROME_Z.interactiveChrome);
    expect(Number(panel.style.zIndex)).toBeLessThan(MAP_PAGE_CHROME_Z.activityDrawer);
  });

  it("also mounts in lite 3D globe when the satellites layer is on", () => {
    setMap({ layoutMode: "lite", viewMode: "globe", satellites: true });
    render(<FramedGlobeSatellitesPanel />);

    expect(document.getElementById("floating-panel-satellites")).not.toBeNull();
  });

  it("does not mount when the satellites layer is off", () => {
    setMap({ layoutMode: "normal", viewMode: "globe", satellites: false });
    const { container } = render(<FramedGlobeSatellitesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("does not mount in pro mode (FullscreenPropSphere owns that panel)", () => {
    setMap({ layoutMode: "pro", viewMode: "globe", satellites: true });
    const { container } = render(<FramedGlobeSatellitesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("does not mount on the flat map", () => {
    setMap({ layoutMode: "normal", viewMode: "flat", satellites: true });
    const { container } = render(<FramedGlobeSatellitesPanel />);
    expect(container.firstChild).toBeNull();
  });
});
