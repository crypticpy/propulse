import { beforeEach, describe, expect, it, vi } from "vitest";

const authHeadersMock = vi.hoisted(() => vi.fn(async () => ({})));
const mapMock = vi.hoisted(() => ({
  callbacks: new Map<string, (event?: unknown) => void>(),
  options: [] as Array<Record<string, unknown>>,
  remove: vi.fn(),
}));
const photorealisticConfigMock = vi.hoisted(() => ({
  enabled: false,
  maxDevicePixelRatio: 1.5,
  unavailableReason: "Photorealistic 3D is disabled by configuration." as
    | string
    | null,
}));
const supportsPhotorealisticMock = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/api/authFetch", () => ({ authHeaders: authHeadersMock }));
vi.mock("@/lib/map/photorealistic3d", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/map/photorealistic3d")
  >("@/lib/map/photorealistic3d");
  return {
    ...actual,
    getPhotorealistic3DConfig: () => photorealisticConfigMock,
    supportsPhotorealistic3D: () => supportsPhotorealisticMock.value,
  };
});

vi.mock("maplibre-gl", () => {
  class MockMap {
    constructor(options: Record<string, unknown>) {
      mapMock.options.push(options);
    }
    addControl = vi.fn();
    remove = mapMock.remove;
    resize = vi.fn();
    setProjection = vi.fn();
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

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("3d-tiles-renderer/r3f", () => ({
  GlobeControls: () => null,
  TilesAttributionOverlay: () => null,
  TilesPlugin: () => null,
  TilesRenderer: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("3d-tiles-renderer/plugins", () => ({
  GoogleCloudAuthPlugin: class GoogleCloudAuthPlugin {},
}));

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import Photorealistic3DPage from "./Photorealistic3DPage";

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

describe("Photorealistic3DPage", () => {
  beforeEach(() => {
    localStorage.clear();
    authHeadersMock.mockClear();
    mapMock.callbacks.clear();
    mapMock.options.length = 0;
    mapMock.remove.mockClear();
    photorealisticConfigMock.enabled = false;
    photorealisticConfigMock.unavailableReason =
      "Photorealistic 3D is disabled by configuration.";
    supportsPhotorealisticMock.value = true;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    useProfileStore.setState({ subscriptionTier: "free" });
    useKioskStore.setState({ active: true, activeSceneId: "photo" });
    useMapStore.setState({ layoutMode: "pro" });
  });

  it("falls back to the free globe instead of blocking as unavailable", async () => {
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Photorealistic 3D is unavailable/)).toBeNull();
    expect(
      await screen.findByText(/Add a Google Map Tiles API key/i),
    ).toBeTruthy();
    expect(screen.getByText(/Fallback/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Photorealistic 3D/ }),
    ).toBeTruthy();
    expect(await screen.findByText(/Powered by Esri/)).toBeTruthy();
  });

  it("keeps navigation visible in fallback/kiosk state and exits to Normal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: /Photorealistic 3D/ }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Exit to PropSphere/ }));

    expect(screen.getByLabelText("Current route").textContent).toBe("/map");
    expect(useKioskStore.getState().active).toBe(false);
    expect(useMapStore.getState().layoutMode).toBe("normal");
  });

  it("uses Escape as the same literal exit", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
        <LocationProbe />
      </MemoryRouter>,
    );
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Current route").textContent).toBe("/map");
    expect(useMapStore.getState().layoutMode).toBe("normal");
  });

  it("clears kiosk state before opening the 2D explorer", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
        <LocationProbe />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /Open 2D Explorer/ }));
    expect(screen.getByLabelText("Current route").textContent).toBe(
      "/map/explorer",
    );
    expect(useKioskStore.getState().active).toBe(false);
    expect(useMapStore.getState().layoutMode).toBe("normal");
  });

  it("retries a failed Pro key request without trapping the operator", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Provider key unavailable" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apiKey: "browser-restricted-key" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    photorealisticConfigMock.enabled = true;
    photorealisticConfigMock.unavailableReason = null;
    useProfileStore.setState({ subscriptionTier: "pro" });
    useKioskStore.setState({ active: false, activeSceneId: null });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Provider key unavailable")).toBeTruthy();
    expect(
      await screen.findByText(/Add a Google Map Tiles API key/i),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText(/Metered provider/)).toBeTruthy();
    expect(screen.getByAltText("Google Maps")).toMatchObject({
      width: 105,
      height: 22,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renders the metered Google surface when a key is delivered", async () => {
    photorealisticConfigMock.enabled = true;
    photorealisticConfigMock.unavailableReason = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiKey: "browser-restricted-key" }),
      }),
    );
    useProfileStore.setState({ subscriptionTier: "pro" });
    useKioskStore.setState({ active: false, activeSceneId: null });

    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Metered provider/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText(/Add a Google Map Tiles API key/i)).toBeNull(),
    );
  });

  it("explains missing WebGL instead of asking for another API key", async () => {
    photorealisticConfigMock.enabled = true;
    photorealisticConfigMock.unavailableReason = null;
    supportsPhotorealisticMock.value = false;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ apiKey: "browser-restricted-key" }),
      }),
    );
    useProfileStore.setState({ subscriptionTier: "pro" });
    useKioskStore.setState({ active: false, activeSceneId: null });

    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/browser or GPU/i)).toBeTruthy();
    expect(screen.queryByText(/Add a Google Map Tiles API key/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });

  it("surfaces a sustained Esri imagery outage instead of a blank globe", async () => {
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mapMock.options.length).toBeGreaterThan(0));
    act(() => {
      mapMock.callbacks.get("error")?.();
      mapMock.callbacks.get("error")?.();
      mapMock.callbacks.get("error")?.();
    });
    expect(
      await screen.findByText(/fallback globe could not load imagery/i),
    ).toBeTruthy();
  });
});
