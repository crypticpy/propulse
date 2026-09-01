import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import {
  useKioskStore,
  DEFAULT_PRESENTATION,
  DEFAULT_SCENES,
  migrateKioskState,
  type KioskScene,
} from "./kioskStore";
import { applySceneToMap } from "@/lib/kiosk/applySceneToMap";
import { useMapStore } from "./mapStore";
import { useDisplayQualityStore } from "./displayQualityStore";
import { useThemeStore } from "./themeStore";

const originalState = useKioskStore.getState();
const normalizedDefaultScenes = DEFAULT_SCENES.map((scene) => ({
  ...scene,
  enabled: true,
  transition: "fade" as const,
}));

describe("kioskStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useKioskStore.setState(originalState, true);
  });

  it("seeds default scenes", () => {
    expect(useKioskStore.getState().scenes.length).toBeGreaterThanOrEqual(3);
    expect(useKioskStore.getState().scenes[0].id).toBe(DEFAULT_SCENES[0].id);
  });

  it("start activates kiosk at the requested scene, defaulting to the first", () => {
    const { start, scenes } = useKioskStore.getState();

    const scene = start(scenes[2].id);
    expect(scene?.id).toBe(scenes[2].id);
    expect(useKioskStore.getState().active).toBe(true);
    expect(useKioskStore.getState().activeSceneId).toBe(scenes[2].id);

    const fallback = useKioskStore.getState().start("no-such-id");
    expect(fallback?.id).toBe(scenes[0].id);
  });

  it("stop leaves scenes and activeSceneId intact for resume", () => {
    const { start } = useKioskStore.getState();
    const scene = start();
    useKioskStore.getState().stop();

    expect(useKioskStore.getState().active).toBe(false);
    expect(useKioskStore.getState().activeSceneId).toBe(scene?.id);
  });

  it("advance steps forward and wraps in both directions", () => {
    const { start, scenes } = useKioskStore.getState();
    start(scenes[scenes.length - 1].id);

    const wrapped = useKioskStore.getState().advance(1);
    expect(wrapped?.id).toBe(scenes[0].id);

    const back = useKioskStore.getState().advance(-1);
    expect(back?.id).toBe(scenes[scenes.length - 1].id);
  });

  it("skips disabled scenes when starting and advancing", () => {
    const { scenes } = useKioskStore.getState();
    useKioskStore.getState().updateScene(scenes[0].id, { enabled: false });

    const started = useKioskStore.getState().start(scenes[0].id);
    expect(started?.id).toBe(scenes[1].id);

    useKioskStore.getState().updateScene(scenes[2].id, { enabled: false });
    expect(useKioskStore.getState().advance(1)?.id).toBe(scenes[3].id);
  });

  it("addScene assigns an id and removeScene refuses to empty the list", () => {
    const created = useKioskStore.getState().addScene({
      name: "Test",
      route: "/solar",
    });
    expect(created.id).toBeTruthy();
    expect(
      useKioskStore.getState().scenes.find((s) => s.id === created.id),
    ).toBeDefined();

    // Drain down to one scene; the last removal must be refused
    for (const scene of useKioskStore.getState().scenes.slice(1)) {
      useKioskStore.getState().removeScene(scene.id);
    }
    expect(useKioskStore.getState().scenes).toHaveLength(1);
    const last = useKioskStore.getState().scenes[0];
    useKioskStore.getState().removeScene(last.id);
    expect(useKioskStore.getState().scenes).toHaveLength(1);
  });

  it("removing the active scene moves activeSceneId to the first remaining", () => {
    const { start, scenes } = useKioskStore.getState();
    start(scenes[1].id);
    useKioskStore.getState().removeScene(scenes[1].id);
    expect(useKioskStore.getState().activeSceneId).toBe(scenes[0].id);
  });

  it("duplicates, reorders, and normalizes scene presentation settings", () => {
    const source = useKioskStore.getState().scenes[1];
    const duplicate = useKioskStore.getState().duplicateScene(source.id);

    expect(duplicate?.name).toBe(`${source.name} Copy`);
    expect(duplicate?.map).not.toBe(source.map);
    expect(useKioskStore.getState().scenes[2].id).toBe(duplicate?.id);

    useKioskStore.getState().moveScene(duplicate!.id, -1);
    expect(useKioskStore.getState().scenes[1].id).toBe(duplicate?.id);

    const created = useKioskStore.getState().addScene({
      name: "Detail",
      route: "/map",
      durationSec: 2,
    });
    expect(created).toMatchObject({
      durationSec: 15,
      transition: "fade",
      enabled: true,
    });
  });

  it("setRotation clamps the interval to a sane range", () => {
    useKioskStore.getState().setRotation({ intervalSec: 1 });
    expect(useKioskStore.getState().rotation.intervalSec).toBe(15);

    useKioskStore.getState().setRotation({ intervalSec: 999999 });
    expect(useKioskStore.getState().rotation.intervalSec).toBe(3600);

    useKioskStore.getState().setRotation({ intervalSec: Number.NaN });
    expect(useKioskStore.getState().rotation.intervalSec).toBe(120);

    useKioskStore.getState().setRotation({ enabled: false });
    expect(useKioskStore.getState().rotation.enabled).toBe(false);
    expect(useKioskStore.getState().rotation.intervalSec).toBe(120);
  });

  it("updates wall presentation preferences without replacing other fields", () => {
    useKioskStore.getState().setPresentation({
      headerScale: "large",
      slashedZero: true,
    });

    expect(useKioskStore.getState().presentation).toEqual({
      headerScale: "large",
      slashedZero: true,
      autoNightDim: false,
    });
  });

  it("applySceneToMap applies map side effects and ignores non-map scenes", () => {
    useMapStore.setState((state) => ({
      layers: { ...state.layers, goesCloud: false },
    }));
    const mapScene: KioskScene = {
      id: "s1",
      name: "Map",
      route: "/map",
      map: {
        layoutMode: "pro",
        viewMode: "globe",
        autoRotate: true,
        autoRotateSpeed: 900,
        quality: "extreme",
        mapStyle: "standard",
        theme: "light",
        showLiveClouds: true,
      },
    };
    applySceneToMap(mapScene);
    expect(useMapStore.getState().layoutMode).toBe("pro");
    expect(useMapStore.getState().viewMode).toBe("globe");
    expect(useMapStore.getState().autoRotate).toBe(true);
    expect(useMapStore.getState().autoRotateSpeed).toBe(900);
    expect(useDisplayQualityStore.getState().displayQuality).toBe("extreme");
    expect(useMapStore.getState().mapStyle).toBe("standard");
    expect(useMapStore.getState().layers.goesCloud).toBe(true);
    expect(useThemeStore.getState().themeId).toBe("light");

    const solarScene: KioskScene = { id: "s2", name: "Solar", route: "/solar" };
    applySceneToMap(solarScene);
    expect(useMapStore.getState().layoutMode).toBe("pro");
  });

  it("removes live clouds from projections that cannot render them", () => {
    const scene = useKioskStore.getState().addScene({
      name: "Flat wall",
      route: "/map",
      map: {
        layoutMode: "pro",
        viewMode: "flat",
        showLiveClouds: true,
      },
    });

    expect(scene.map?.showLiveClouds).toBeUndefined();
    expect(
      useKioskStore.getState().scenes.find((item) => item.id === scene.id)?.map
        ?.showLiveClouds,
    ).toBeUndefined();
  });

  it("migrates v1 state into a bounded, internally consistent v4 payload", () => {
    const migrated = migrateKioskState(
      {
        scenes: [
          {
            id: "custom-wall",
            name: "Custom Wall",
            route: "/map",
            map: {
              layoutMode: "hamclock",
              viewMode: "globe",
              preset: "dx-hunter",
            },
          },
        ],
        rotation: { enabled: false, intervalSec: 2 },
        active: true,
        activeSceneId: "removed-scene",
      },
      1,
    );

    expect(migrated.scenes).toEqual([
      {
        id: "custom-wall",
        name: "Custom Wall",
        route: "/map",
        enabled: true,
        transition: "fade",
        map: {
          layoutMode: "hamclock",
          viewMode: "globe",
          preset: "dx-hunter",
        },
      },
    ]);
    expect(migrated.rotation).toEqual({ enabled: false, intervalSec: 15 });
    expect(migrated.breakInLevel).toBe("CRITICAL");
    expect(migrated.presentation).toEqual(DEFAULT_PRESENTATION);
    expect(migrated.activeSceneId).toBe("custom-wall");
  });

  it("adds wall presentation defaults while migrating a valid v2 payload", () => {
    const migrated = migrateKioskState(
      {
        scenes: [DEFAULT_SCENES[0]],
        rotation: { enabled: false, intervalSec: 90 },
        breakInLevel: "WARNING",
        active: false,
        activeSceneId: null,
      },
      2,
    );

    expect(migrated.presentation).toEqual(DEFAULT_PRESENTATION);
    expect(migrated.scenes.map((scene) => scene.id)).toEqual([
      "default-wall",
      "default-clock",
      "default-stopwatch",
    ]);
    expect(migrated.rotation).toEqual({ enabled: false, intervalSec: 90 });
    expect(migrated.breakInLevel).toBe("WARNING");
  });

  it("repairs corrupt persisted scenes instead of hydrating unsafe values", () => {
    const migrated = migrateKioskState(
      {
        scenes: [
          { id: "bad-route", name: "Bad", route: "/settings" },
          { id: "missing-name", route: "/map" },
        ],
        rotation: { enabled: "yes", intervalSec: Number.NaN },
        breakInLevel: "EMERGENCY",
        presentation: {
          headerScale: "billboard",
          slashedZero: "yes",
          autoNightDim: 1,
        },
        active: "yes",
        activeSceneId: "bad-route",
      },
      3,
    );

    expect(migrated.scenes).toEqual(normalizedDefaultScenes);
    expect(migrated.rotation).toEqual({ enabled: true, intervalSec: 120 });
    expect(migrated.breakInLevel).toBe("CRITICAL");
    expect(migrated.presentation).toEqual(DEFAULT_PRESENTATION);
    expect(migrated.active).toBe(false);
    expect(migrated.activeSceneId).toBeNull();
  });

  it("normalizes corrupt same-version state through the real hydration path", async () => {
    localStorage.setItem(
      "propulse-kiosk",
      JSON.stringify({
        version: 3,
        state: {
          scenes: [{ id: "bad", name: "Bad", route: "/settings" }],
          rotation: { enabled: "yes", intervalSec: -50 },
          breakInLevel: "EMERGENCY",
          presentation: {
            headerScale: "huge",
            slashedZero: "yes",
            autoNightDim: null,
          },
          active: true,
          activeSceneId: "bad",
        },
      }),
    );

    await useKioskStore.persist.rehydrate();

    const hydrated = useKioskStore.getState();
    expect(hydrated.scenes).toEqual(normalizedDefaultScenes);
    expect(hydrated.rotation).toEqual({ enabled: true, intervalSec: 15 });
    expect(hydrated.breakInLevel).toBe("CRITICAL");
    expect(hydrated.presentation).toEqual(DEFAULT_PRESENTATION);
    expect(hydrated.activeSceneId).toBe(DEFAULT_SCENES[0].id);
    expect(typeof hydrated.start).toBe("function");
  });
});
