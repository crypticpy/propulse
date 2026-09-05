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
  DEFAULT_PRESENTATION,
  DEFAULT_SCENES,
  KIOSK_ROUTES,
  getKioskRouteCapabilities,
  isKioskMapRoute,
  migrateKioskState,
  useKioskStore,
} from "./kioskStore";

const originalState = useKioskStore.getState();
const normalizedDefaultScenes = DEFAULT_SCENES.map((scene) => ({
  ...scene,
  ...(scene.map ? { map: { ...scene.map } } : {}),
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

  it("declares dedicated explorer and photorealistic route capabilities", () => {
    expect(KIOSK_ROUTES.map(({ route }) => route)).toEqual(
      expect.arrayContaining(["/map/explorer", "/map/photorealistic"]),
    );
    expect(isKioskMapRoute("/map/explorer")).toBe(true);
    expect(isKioskMapRoute("/map/photorealistic")).toBe(true);
    expect(getKioskRouteCapabilities("/map")).toMatchObject({
      viewMode: true,
      preset: true,
      liveClouds: true,
    });
    expect(getKioskRouteCapabilities("/map/explorer")).toMatchObject({
      mapConfig: true,
      quality: true,
      theme: true,
      viewMode: false,
      mapStyle: false,
      liveClouds: false,
    });
    expect(getKioskRouteCapabilities("/solar").mapConfig).toBe(false);
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

  it("skips disabled scenes for start, advance, and active lookup", () => {
    const { scenes } = useKioskStore.getState();
    useKioskStore.getState().updateScene(scenes[0].id, { enabled: false });

    const started = useKioskStore.getState().start(scenes[0].id);
    expect(started?.id).toBe(scenes[1].id);
    expect(useKioskStore.getState().getActiveScene()?.id).toBe(scenes[1].id);

    useKioskStore.getState().updateScene(scenes[2].id, { enabled: false });
    expect(useKioskStore.getState().advance(1)?.id).toBe(scenes[3].id);

    for (const scene of useKioskStore.getState().scenes) {
      useKioskStore.getState().updateScene(scene.id, { enabled: false });
    }
    expect(useKioskStore.getState().start()).toBeNull();
    expect(useKioskStore.getState().advance(1)).toBeNull();
    expect(useKioskStore.getState().getActiveScene()).toBeNull();

    useKioskStore.getState().updateScene(scenes[4].id, { enabled: true });
    expect(useKioskStore.getState().activeSceneId).toBe(scenes[4].id);
    expect(useKioskStore.getState().getActiveScene()?.id).toBe(scenes[4].id);
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

  it("duplicates and reorders scenes without sharing nested map config", () => {
    const source = useKioskStore.getState().scenes[1];
    const duplicate = useKioskStore.getState().duplicateScene(source.id);

    expect(duplicate?.name).toBe(`${source.name} Copy`);
    expect(duplicate?.map).toEqual(source.map);
    expect(duplicate?.map).not.toBe(source.map);
    expect(useKioskStore.getState().scenes[2].id).toBe(duplicate?.id);

    useKioskStore.getState().moveScene(duplicate!.id, -1);
    expect(useKioskStore.getState().scenes[1].id).toBe(duplicate?.id);
    useKioskStore.getState().moveScene(duplicate!.id, -1);
    expect(useKioskStore.getState().scenes[0].id).toBe(duplicate?.id);
    useKioskStore.getState().moveScene(duplicate!.id, -1);
    expect(useKioskStore.getState().scenes[0].id).toBe(duplicate?.id);
  });

  it("sanitizes and deep-clones replacement assignments", () => {
    const remote = [
      {
        id: "remote-map",
        name: "Remote map",
        route: "/map",
        enabled: true,
        durationSec: 2,
        transition: "cut",
        ignored: "remove me",
        map: {
          layoutMode: "pro",
          viewMode: "globe",
          preset: "dx-hunter",
          autoRotate: true,
          autoRotateSpeed: 999_999,
          quality: "extreme",
          mapStyle: "standard",
          theme: "light",
          showLiveClouds: true,
          ignored: "remove me",
        },
      },
      {
        id: "remote-explorer",
        name: "Remote explorer",
        route: "/map/explorer",
        map: {
          layoutMode: "pro",
          viewMode: "flat",
          preset: "science",
          autoRotate: true,
          quality: "uhd",
          mapStyle: "satellite",
          theme: "midnight",
          showLiveClouds: true,
        },
      },
      { id: "remote-map", name: "Duplicate", route: "/solar" },
      { id: "unsafe", name: "Unsafe", route: "/settings" },
    ] as const;

    useKioskStore.getState().replaceScenes(remote);

    const scenes = useKioskStore.getState().scenes;
    expect(scenes).toEqual([
      {
        id: "remote-map",
        name: "Remote map",
        route: "/map",
        enabled: true,
        durationSec: 15,
        transition: "cut",
        map: {
          layoutMode: "pro",
          viewMode: "globe",
          preset: "dx-hunter",
          autoRotate: true,
          autoRotateSpeed: 86_400,
          quality: "extreme",
          mapStyle: "standard",
          theme: "light",
          showLiveClouds: true,
        },
      },
      {
        id: "remote-explorer",
        name: "Remote explorer",
        route: "/map/explorer",
        enabled: true,
        transition: "fade",
        map: {
          layoutMode: "pro",
          quality: "uhd",
          theme: "midnight",
        },
      },
    ]);
    expect(scenes[0]).not.toBe(remote[0]);
    expect(scenes[0].map).not.toBe(remote[0].map);
  });

  it("uses cloned defaults when a replacement is empty or wholly invalid", () => {
    useKioskStore.getState().replaceScenes([
      { id: "stale", name: "Stale", route: "/solar" },
    ]);
    useKioskStore.getState().replaceScenes([]);
    const emptyReplacement = useKioskStore.getState().scenes;
    expect(emptyReplacement).toEqual(normalizedDefaultScenes);
    expect(emptyReplacement[0]).not.toBe(DEFAULT_SCENES[0]);
    expect(emptyReplacement[0].map).not.toBe(DEFAULT_SCENES[0].map);

    useKioskStore.getState().replaceScenes([
      { id: "unsafe", name: "Unsafe", route: "/settings" },
    ]);
    expect(useKioskStore.getState().scenes).toEqual(normalizedDefaultScenes);
  });

  it("strips stale map fields when a scene route changes or clears its map", () => {
    const source = useKioskStore.getState().scenes[1];

    useKioskStore.getState().updateScene(source.id, {
      route: "/map/explorer",
      map: {
        layoutMode: "pro",
        viewMode: "globe",
        preset: "dx-hunter",
        quality: "uhd",
      },
    });
    expect(
      useKioskStore.getState().scenes.find((scene) => scene.id === source.id)
        ?.map,
    ).toEqual({ layoutMode: "pro", quality: "uhd" });

    useKioskStore.getState().updateScene(source.id, { map: undefined });
    expect(
      useKioskStore.getState().scenes.find((scene) => scene.id === source.id),
    ).not.toHaveProperty("map");
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
    // v3 still extends a legacy-default payload with the new wall clock
    // routes, but v6 no longer resurrects a shipped default (like
    // default-hamclock-weather) that was never in the persisted payload.
    expect(migrated.scenes.map((scene) => scene.id)).toEqual([
      "default-wall",
      "default-clock",
      "default-stopwatch",
    ]);
    expect(migrated.rotation).toEqual({ enabled: false, intervalSec: 90 });
    expect(migrated.breakInLevel).toBe("WARNING");
  });

  it("normalizes the enhanced scene schema while migrating v3 to v4", () => {
    const migrated = migrateKioskState(
      {
        scenes: [
          {
            id: "v3-map",
            name: "V3 map",
            route: "/map",
            enabled: false,
            durationSec: 99_999,
            transition: "wipe",
            map: {
              layoutMode: "pro",
              autoRotateSpeed: 1,
              preset: "dx-hunter",
              unknown: true,
            },
            unknown: true,
          },
        ],
        rotation: { enabled: true, intervalSec: 120 },
        breakInLevel: "CRITICAL",
        presentation: DEFAULT_PRESENTATION,
        active: true,
        activeSceneId: "v3-map",
      },
      3,
    );

    expect(migrated.scenes).toEqual([
      {
        id: "v3-map",
        name: "V3 map",
        route: "/map",
        enabled: false,
        durationSec: 3600,
        transition: "fade",
        map: {
          layoutMode: "pro",
          autoRotateSpeed: 60,
          preset: "dx-hunter",
        },
      },
    ]);
    expect(migrated.activeSceneId).toBeNull();
  });

  it("does not hydrate active kiosk mode when every persisted scene is disabled", () => {
    const migrated = migrateKioskState(
      {
        scenes: [
          {
            id: "disabled-only",
            name: "Disabled only",
            route: "/solar",
            enabled: false,
          },
        ],
        active: true,
        activeSceneId: "disabled-only",
      },
      4,
    );

    expect(migrated.active).toBe(false);
    expect(migrated.activeSceneId).toBeNull();
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
      4,
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
        version: 4,
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
  it("keeps only usable HamClock wall pins on a scene", () => {
    const store = useKioskStore.getState();
    const pinned = store.addScene({
      name: "Pinned wall",
      route: "/map",
      map: {
        layoutMode: "hamclock",
        hamclock: {
          leftPage: "solar",
          rightPage: "",
          theme: "brass",
        },
      },
    });
    // B4/HW-27: a page pin is a page id (string), validated for shape only —
    // an empty string is not a usable id, so it is dropped like any other
    // malformed value while a valid sibling field survives.
    expect(pinned.map?.hamclock).toEqual({ leftPage: "solar", theme: "brass" });

    const garbage = useKioskStore.getState().addScene({
      name: "Garbage pin",
      route: "/map",
      map: {
        layoutMode: "hamclock",
        hamclock: {
          leftPage: 1.5,
          rightPage: "x".repeat(65),
          theme: "neon",
        } as never,
      },
    });
    expect(garbage.map?.hamclock).toBeUndefined();

    // A pin only means something to the HamClock layout.
    const proScene = useKioskStore.getState().addScene({
      name: "Pro wall",
      route: "/map",
      map: {
        layoutMode: "pro",
        hamclock: { leftPage: "solar" },
      },
    });
    expect(proScene.map?.hamclock).toBeUndefined();
  });

  it("pins the shipped HamClock wall scenes to their pages when migrating v5 without discarding user edits", () => {
    const migrated = migrateKioskState(
      {
        scenes: [
          {
            id: "default-wall",
            name: "My Custom Wall",
            route: "/map",
            enabled: false,
            durationSec: 45,
            map: {
              layoutMode: "hamclock",
              viewMode: "flat",
              mapStyle: "satellite",
              hamclockMode: "traffic",
            },
          },
          { id: "custom", name: "Mine", route: "/solar" },
        ],
        rotation: { enabled: true, intervalSec: 120 },
        breakInLevel: "CRITICAL",
        presentation: { ...DEFAULT_PRESENTATION },
        active: false,
        activeSceneId: null,
      },
      5,
    );

    const wall = migrated.scenes.find((scene) => scene.id === "default-wall");
    // The user's edits (name/enabled/durationSec) survive the pin merge.
    expect(wall?.name).toBe("My Custom Wall");
    expect(wall?.enabled).toBe(false);
    expect(wall?.durationSec).toBe(45);
    expect(wall?.map?.hamclock).toEqual({
      leftPage: "spots",
      rightPage: "spots",
    });

    // default-hamclock-weather was never in the persisted payload (the user
    // deleted it) and must not be resurrected by the migration.
    expect(
      migrated.scenes.find((scene) => scene.id === "default-hamclock-weather"),
    ).toBeUndefined();

    // A hand-made scene is never rewritten by the refresh.
    expect(migrated.scenes.find((scene) => scene.id === "custom")).toMatchObject(
      { route: "/solar" },
    );
  });
});
