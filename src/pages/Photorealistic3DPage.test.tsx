import { beforeEach, describe, expect, it, vi } from "vitest";

const authHeadersMock = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("@/lib/api/authFetch", () => ({ authHeaders: authHeadersMock }));
vi.mock("@/lib/map/photorealistic3d", () => ({
  getPhotorealistic3DConfig: () => ({
    enabled: true,
    maxDevicePixelRatio: 1.5,
    unavailableReason: null,
  }),
  supportsPhotorealistic3D: () => true,
}));

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

import { render, screen } from "@testing-library/react";
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
    useProfileStore.setState({ subscriptionTier: "free" });
    useKioskStore.setState({ active: true, activeSceneId: "photo" });
    useMapStore.setState({ layoutMode: "pro" });
  });

  it("keeps navigation visible in unavailable/kiosk state and exits to Normal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByText("Photorealistic 3D is unavailable")).toBeTruthy();
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
    useProfileStore.setState({ subscriptionTier: "pro" });
    useKioskStore.setState({ active: false, activeSceneId: null });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/map/photorealistic"]}>
        <Photorealistic3DPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Provider key unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText(/Metered provider/)).toBeTruthy();
    expect(screen.getByAltText("Google Maps")).toMatchObject({
      width: 105,
      height: 22,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
