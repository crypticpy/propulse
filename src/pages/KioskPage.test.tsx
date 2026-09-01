import { beforeEach, describe, expect, it, vi } from "vitest";

const applySceneToMapMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/kiosk/applySceneToMap", () => ({
  applySceneToMap: applySceneToMapMock,
}));
vi.mock("@/components/kiosk/LaunchWallSection", () => ({
  LaunchWallSection: ({ scenes }: { scenes: unknown[] }) => (
    <output data-testid="launch-wall-count">{scenes.length}</output>
  ),
}));

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useKioskStore, type KioskScene } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";
import { KioskPage } from "./KioskPage";

const scenes: KioskScene[] = [
  {
    id: "enabled",
    name: "Enabled globe",
    route: "/map",
    enabled: true,
    durationSec: 120,
    transition: "fade",
    map: { layoutMode: "pro", viewMode: "globe" },
  },
  {
    id: "disabled",
    name: "Disabled solar",
    route: "/solar",
    enabled: false,
    durationSec: 60,
    transition: "cut",
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/kiosk"]}>
      <KioskPage />
    </MemoryRouter>,
  );
}

describe("KioskPage wall display editor", () => {
  beforeEach(() => {
    localStorage.clear();
    applySceneToMapMock.mockClear();
    useKioskStore.setState({
      scenes: scenes.map((scene) => ({
        ...scene,
        map: scene.map ? { ...scene.map } : undefined,
      })),
      rotation: { enabled: true, intervalSec: 120 },
      active: false,
      activeSceneId: null,
    });
    useMapStore.setState({
      layoutMode: "pro",
      viewMode: "azimuthal",
      activePreset: "science",
      autoRotate: false,
      autoRotateSpeed: 777,
      mapStyle: "standard",
      layers: {
        ...useMapStore.getState().layers,
        goesCloud: true,
      },
    });
    useDisplayQualityStore.setState({ displayQuality: "extreme" });
    useThemeStore.setState({ themeId: "midnight" });
  });

  it("wires enable, reorder, duplicate, edit, and enabled-only launch controls", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("link", { name: /Configure paired displays/ })).toBeTruthy();
    expect(screen.getByTestId("launch-wall-count").textContent).toBe("1");
    expect(
      (
        screen.getByRole("button", {
          name: "Start wall at Disabled solar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Duplicate scene Enabled globe" }),
    );
    expect(useKioskStore.getState().scenes.map((scene) => scene.name)).toEqual([
      "Enabled globe",
      "Enabled globe Copy",
      "Disabled solar",
    ]);

    await user.click(screen.getByRole("button", { name: "Move Enabled globe down" }));
    expect(useKioskStore.getState().scenes[1].id).toBe("enabled");

    await user.click(
      screen.getByRole("button", { name: "Edit scene Enabled globe" }),
    );
    expect(screen.getByLabelText("Page")).toBeTruthy();
    expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe(
      "120",
    );

    for (const scene of useKioskStore.getState().scenes) {
      if (scene.enabled !== false) {
        await user.click(
          screen.getByRole("checkbox", { name: `Disable scene ${scene.name}` }),
        );
      }
    }
    expect(screen.getByTestId("launch-wall-count").textContent).toBe("0");
    expect(
      (
        screen.getByRole("button", {
          name: "Start Wall Display",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("adds all premium templates and exposes only route-supported controls", async () => {
    const user = userEvent.setup();
    renderPage();

    for (const name of [
      "Geochron Earth",
      "Observatory Globe",
      "HamClock Operations",
      "Photorealistic 3D",
      "Deep-Zoom Explorer",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeTruthy();
    }

    await user.click(
      screen.getByRole("button", { name: /Deep-Zoom Explorer/ }),
    );
    const created = useKioskStore.getState().scenes.at(-1)!;
    expect(created).toMatchObject({
      route: "/map/explorer",
      enabled: true,
      durationSec: 180,
      transition: "fade",
      map: { layoutMode: "pro", quality: "extreme", theme: "dark" },
    });
    const editor = document.getElementById(`scene-editor-${created.id}`)!;
    expect(editor).toBeTruthy();
    expect(within(editor).getByLabelText("Layout")).toBeTruthy();
    expect(within(editor).getByLabelText("Image quality")).toBeTruthy();
    expect(within(editor).getByLabelText("Theme")).toBeTruthy();
    expect(within(editor).queryByLabelText("Projection")).toBeNull();
    expect(within(editor).queryByLabelText("Basemap")).toBeNull();
    expect(within(editor).queryByText("Live clouds")).toBeNull();
  });

  it("captures the current PropSphere presentation as an editable scene", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Save current PropSphere view" }),
    );
    expect(useKioskStore.getState().scenes.at(-1)).toMatchObject({
      name: "Saved azimuthal view",
      route: "/map",
      enabled: true,
      durationSec: 120,
      transition: "fade",
      map: {
        layoutMode: "pro",
        viewMode: "azimuthal",
        preset: "science",
        autoRotate: false,
        autoRotateSpeed: 777,
        quality: "extreme",
        mapStyle: "standard",
        theme: "midnight",
      },
    });
  });
});
