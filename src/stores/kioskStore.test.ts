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
  applySceneToMap,
  DEFAULT_SCENES,
  migrateKioskState,
  type KioskScene,
} from "./kioskStore";
import { useMapStore } from "./mapStore";

const originalState = useKioskStore.getState();

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

  it("applySceneToMap applies map side effects and ignores non-map scenes", () => {
    const mapScene: KioskScene = {
      id: "s1",
      name: "Map",
      route: "/map",
      map: { layoutMode: "pro", viewMode: "flat", autoRotate: true },
    };
    applySceneToMap(mapScene);
    expect(useMapStore.getState().layoutMode).toBe("pro");
    expect(useMapStore.getState().viewMode).toBe("flat");
    expect(useMapStore.getState().autoRotate).toBe(true);

    const solarScene: KioskScene = { id: "s2", name: "Solar", route: "/solar" };
    applySceneToMap(solarScene);
    expect(useMapStore.getState().layoutMode).toBe("pro");
  });

  it("migrates v1 state into a bounded, internally consistent v2 payload", () => {
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
        map: {
          layoutMode: "hamclock",
          viewMode: "globe",
          preset: "dx-hunter",
        },
      },
    ]);
    expect(migrated.rotation).toEqual({ enabled: false, intervalSec: 15 });
    expect(migrated.breakInLevel).toBe("CRITICAL");
    expect(migrated.activeSceneId).toBe("custom-wall");
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
        active: "yes",
        activeSceneId: "bad-route",
      },
      2,
    );

    expect(migrated.scenes).toEqual(DEFAULT_SCENES);
    expect(migrated.rotation).toEqual({ enabled: true, intervalSec: 120 });
    expect(migrated.breakInLevel).toBe("CRITICAL");
    expect(migrated.active).toBe(false);
    expect(migrated.activeSceneId).toBeNull();
  });

  it("normalizes corrupt same-version state through the real hydration path", async () => {
    localStorage.setItem(
      "propulse-kiosk",
      JSON.stringify({
        version: 2,
        state: {
          scenes: [{ id: "bad", name: "Bad", route: "/settings" }],
          rotation: { enabled: "yes", intervalSec: -50 },
          breakInLevel: "EMERGENCY",
          active: true,
          activeSceneId: "bad",
        },
      }),
    );

    await useKioskStore.persist.rehydrate();

    const hydrated = useKioskStore.getState();
    expect(hydrated.scenes).toEqual(DEFAULT_SCENES);
    expect(hydrated.rotation).toEqual({ enabled: true, intervalSec: 15 });
    expect(hydrated.breakInLevel).toBe("CRITICAL");
    expect(hydrated.activeSceneId).toBe(DEFAULT_SCENES[0].id);
    expect(typeof hydrated.start).toBe("function");
  });
});
