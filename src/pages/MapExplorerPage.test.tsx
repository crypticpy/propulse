import { beforeEach, describe, expect, it, vi } from "vitest";

const accessTokenMock = vi.hoisted(() => vi.fn(async () => "pro-token"));
const mapMock = vi.hoisted(() => ({
  callbacks: new Map<string, (event?: unknown) => void>(),
  options: [] as Array<Record<string, unknown>>,
  remove: vi.fn(),
  resize: vi.fn(),
  throwOnConstruct: false,
}));

vi.mock("@/lib/api/authFetch", () => ({ getAccessToken: accessTokenMock }));

vi.mock("maplibre-gl", () => {
  class MockMap {
    constructor(options: Record<string, unknown>) {
      if (mapMock.throwOnConstruct) throw new Error("renderer unavailable");
      mapMock.options.push(options);
    }
    addControl = vi.fn();
    flyTo = vi.fn();
    getCenter = () => ({ lat: 39.5, lng: -98.5 });
    getZoom = () => 3.4;
    remove = mapMock.remove;
    resize = mapMock.resize;
    on = vi.fn((name: string, callback: (event?: unknown) => void) => {
      mapMock.callbacks.set(name, callback);
      if (name === "load") callback();
      return this;
    });
  }
  return {
    default: {
      Map: MockMap,
      NavigationControl: class NavigationControl {},
    },
  };
});

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import MapExplorerPage from "./MapExplorerPage";
import { MAP_EXPLORER_AUTH_REFRESH_MS } from "./MapExplorerPage";
import {
  buildExplorerStyle,
  resolveExplorerProvider,
} from "@/lib/map/mapExplorerStyle";

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

describe("MapExplorerPage", () => {
  beforeEach(() => {
    localStorage.clear();
    accessTokenMock.mockClear();
    mapMock.callbacks.clear();
    mapMock.options.length = 0;
    mapMock.remove.mockClear();
    mapMock.resize.mockClear();
    mapMock.throwOnConstruct = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useProfileStore.setState({ subscriptionTier: "free" });
    useDisplayQualityStore.setState({ displayQuality: "auto" });
    useKioskStore.setState({
      active: false,
      activeSceneId: null,
      presentation: {
        headerScale: "standard",
        slashedZero: false,
        autoNightDim: false,
      },
    });
    useMapStore.setState({ layoutMode: "normal", mapStyle: "satellite" });
  });

  it("resolves de-clouded free and authenticated Pro satellite sources", () => {
    expect(resolveExplorerProvider("satellite", "free").id).toBe(
      "esri-world",
    );
    expect(resolveExplorerProvider("satellite", "pro").id).toBe(
      "mapbox-satellite",
    );
    expect(resolveExplorerProvider("dark", "free").id).toBe("osm");

    const dark = buildExplorerStyle(
      resolveExplorerProvider("dark", "free"),
      "dark",
      19,
    );
    expect(dark.layers[1]).toMatchObject({
      paint: {
        "raster-brightness-max": 0.34,
      },
    });

    const contrast = buildExplorerStyle(
      resolveExplorerProvider("light", "free"),
      "contrast",
      19,
    );
    expect(contrast.sources.basemap).toMatchObject({
      type: "raster",
      maxzoom: 19,
    });
    expect(contrast.layers[1]).not.toHaveProperty("maxzoom");
  });

  it("keeps the shared view selector and a literal return to PropSphere", async () => {
    const user = userEvent.setup();
    useKioskStore.setState({ active: true, activeSceneId: "explorer" });
    useMapStore.setState({ layoutMode: "pro" });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/map/explorer"]}>
        <MapExplorerPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: /Deep-Zoom Map/ }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Return to PropSphere/ }));
    expect(screen.getByLabelText("Current route").textContent).toBe("/map");
    expect(useKioskStore.getState().active).toBe(false);
    expect(useMapStore.getState().layoutMode).toBe("normal");

    unmount();
    expect(mapMock.remove).toHaveBeenCalled();
  });

  it("fills the viewport exactly for every kiosk header scale", async () => {
    render(
      <MemoryRouter initialEntries={["/map/explorer"]}>
        <MapExplorerPage />
      </MemoryRouter>,
    );

    const viewport = screen.getByTestId("map-explorer-viewport");
    expect(viewport.dataset.kioskHeaderScale).toBe("normal");
    expect(viewport.className).toContain("h-[calc(100dvh-4rem)]");

    const sizes = [
      ["compact", "h-[calc(100dvh-2.5rem)]"],
      ["standard", "h-[calc(100dvh-3rem)]"],
      ["large", "h-[calc(100dvh-4rem)]"],
    ] as const;

    for (const [headerScale, heightClass] of sizes) {
      const previousResizeCount = mapMock.resize.mock.calls.length;
      act(() => {
        useKioskStore.setState({
          active: true,
          presentation: {
            ...useKioskStore.getState().presentation,
            headerScale,
          },
        });
      });
      await waitFor(() => {
        expect(viewport.dataset.kioskHeaderScale).toBe(headerScale);
        expect(viewport.className).toContain(heightClass);
        expect(mapMock.resize.mock.calls.length).toBeGreaterThan(
          previousResizeCount,
        );
      });
    }
  });

  it("surfaces a constructor failure and retries the renderer", async () => {
    const user = userEvent.setup();
    mapMock.throwOnConstruct = true;
    render(
      <MemoryRouter initialEntries={["/map/explorer"]}>
        <MapExplorerPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/deep-zoom renderer could not start/i),
    ).toBeTruthy();

    mapMock.throwOnConstruct = false;
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(mapMock.options).toHaveLength(1));
  });

  it("adds the Pro bearer token and falls back after a burst of provider errors", async () => {
    useProfileStore.setState({ subscriptionTier: "pro" });
    render(
      <MemoryRouter initialEntries={["/map/explorer"]}>
        <MapExplorerPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mapMock.options.length).toBeGreaterThan(0));
    const firstOptions = mapMock.options[0] as {
      transformRequest: (url: string) => {
        headers?: Record<string, string>;
      };
    };
    expect(
      firstOptions.transformRequest("https://propulse.cloud/api/tiles/proxy")
        .headers,
    ).toEqual({ Authorization: "Bearer pro-token" });

    act(() => {
      mapMock.callbacks.get("error")?.();
      mapMock.callbacks.get("error")?.();
      mapMock.callbacks.get("error")?.();
    });
    await waitFor(() =>
      expect(
        JSON.stringify(mapMock.options.at(-1)?.style),
      ).toContain("server.arcgisonline.com"),
    );
    expect(await screen.findByText(/HD provider unavailable/)).toBeTruthy();
  });

  it("refreshes the Pro tile credential without rebuilding the map", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    useProfileStore.setState({ subscriptionTier: "pro" });
    render(
      <MemoryRouter initialEntries={["/map/explorer"]}>
        <MapExplorerPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mapMock.options).toHaveLength(1));
    const refreshCall = intervalSpy.mock.calls.find(
      ([, delay]) => delay === MAP_EXPLORER_AUTH_REFRESH_MS,
    );
    expect(refreshCall).toBeTruthy();
    accessTokenMock.mockResolvedValueOnce("renewed-token");
    await act(async () => {
      const refresh = refreshCall?.[0] as TimerHandler;
      if (typeof refresh === "function") refresh();
      await Promise.resolve();
    });

    const options = mapMock.options[0] as {
      transformRequest: (url: string) => {
        headers?: Record<string, string>;
      };
    };
    expect(
      options.transformRequest("https://propulse.cloud/api/tiles/proxy")
        .headers,
    ).toEqual({ Authorization: "Bearer renewed-token" });
    expect(mapMock.options).toHaveLength(1);
    intervalSpy.mockRestore();
  });
});
