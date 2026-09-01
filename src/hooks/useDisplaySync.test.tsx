import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn(),
  isSupabaseConfigured: false,
}));

import { useDisplaySync } from "./useDisplaySync";
import { useDisplayStore } from "@/stores/displayStore";
import {
  DEFAULT_SCENES,
  useKioskStore,
  type KioskScene,
} from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";

function SyncHarness() {
  useDisplaySync();
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}</output>;
}

function responseWith(sceneConfig: Record<string, unknown> | null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      paired: true,
      name: "Shack Wall",
      sceneConfig,
      updatedAt: crypto.randomUUID(),
    }),
  } as Response;
}

describe("useDisplaySync scene assignments", () => {
  beforeEach(() => {
    localStorage.clear();
    useDisplayStore.setState({
      displayId: "display-1",
      deviceToken: "device-token",
      pairedName: null,
      syncActive: true,
    });
    useKioskStore.setState({
      scenes: [{ id: "stale", name: "Stale", route: "/solar" }],
      rotation: { enabled: true, intervalSec: 120 },
      breakInLevel: "CRITICAL",
      active: false,
      activeSceneId: null,
    });
    useMapStore.getState().setLayoutMode("normal");
    useDisplayQualityStore.getState().setDisplayQuality("auto");
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("restores cloned defaults when the remote assignment is cleared", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseWith({ scenes: [] })));

    render(
      <MemoryRouter initialEntries={["/display/view"]}>
        <SyncHarness />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current route").textContent).toBe("/map"),
    );
    const state = useKioskStore.getState();
    expect(state.scenes.map((scene) => scene.id)).toEqual(
      DEFAULT_SCENES.map((scene) => scene.id),
    );
    expect(state.scenes.every((scene) => scene.enabled !== false)).toBe(true);
    expect(state.scenes).not.toBe(DEFAULT_SCENES);
    expect(state.scenes[0]).not.toBe(DEFAULT_SCENES[0]);
    expect(state.activeSceneId).toBe(DEFAULT_SCENES[0].id);
    expect(state.active).toBe(true);
  });

  it("restores defaults when a paired display has no assignment object", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => responseWith(null)));

    render(
      <MemoryRouter initialEntries={["/display/view"]}>
        <SyncHarness />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current route").textContent).toBe("/map"),
    );
    expect(useKioskStore.getState().activeSceneId).toBe(
      DEFAULT_SCENES[0].id,
    );
  });

  it("falls back safely when every remotely assigned scene is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        responseWith({
          scenes: [
            {
              id: "disabled",
              name: "Disabled Solar",
              route: "/solar",
              enabled: false,
            },
          ],
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/display/view"]}>
        <SyncHarness />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current route").textContent).toBe("/map"),
    );
    const state = useKioskStore.getState();
    expect(state.scenes.map((scene) => scene.id)).toEqual(
      DEFAULT_SCENES.map((scene) => scene.id),
    );
    expect(state.activeSceneId).toBe(DEFAULT_SCENES[0].id);
  });

  it("sanitizes enhanced scenes and starts the first enabled entry", async () => {
    const assigned: KioskScene[] = [
      {
        id: "disabled",
        name: "Disabled Solar",
        route: "/solar",
        enabled: false,
      },
      {
        id: "deep-zoom",
        name: "Deep Zoom",
        route: "/map/explorer",
        enabled: true,
        durationSec: 45,
        transition: "fade",
        map: {
          layoutMode: "pro",
          quality: "uhd",
          // These globe-only fields must be removed for the explorer route.
          viewMode: "globe",
          showLiveClouds: true,
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        responseWith({
          scenes: assigned,
          rotation: { enabled: true, intervalSec: 45 },
          breakInLevel: "WARNING",
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/display/view"]}>
        <SyncHarness />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Current route").textContent).toBe(
        "/map/explorer",
      ),
    );
    const state = useKioskStore.getState();
    expect(state.activeSceneId).toBe("deep-zoom");
    expect(state.rotation).toEqual({ enabled: true, intervalSec: 45 });
    expect(state.breakInLevel).toBe("WARNING");
    expect(state.scenes[1].map).toEqual({
      layoutMode: "pro",
      quality: "uhd",
    });
    expect(useMapStore.getState().layoutMode).toBe("pro");
    expect(useDisplayQualityStore.getState().displayQuality).toBe("uhd");
  });
});
