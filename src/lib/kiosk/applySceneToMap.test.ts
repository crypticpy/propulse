import { beforeEach, describe, expect, it } from "vitest";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import type { KioskScene } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import {
  __resetHamClockPinForTests,
  applySceneToMap,
  restoreHamClockDisplay,
} from "./applySceneToMap";

function mapPresentationState() {
  const map = useMapStore.getState();
  return {
    layoutMode: map.layoutMode,
    viewMode: map.viewMode,
    activePreset: map.activePreset,
    autoRotate: map.autoRotate,
    autoRotateSpeed: map.autoRotateSpeed,
    mapStyle: map.mapStyle,
    goesCloud: map.layers.goesCloud,
  };
}

describe("applySceneToMap", () => {
  beforeEach(() => {
    useMapStore.setState((state) => ({
      layoutMode: "normal",
      viewMode: "flat",
      activePreset: null,
      autoRotate: false,
      autoRotateSpeed: 86_400,
      mapStyle: "satellite",
      layers: {
        ...state.layers,
        muf: false,
        beacons: false,
        ft8Spotter: false,
        goesCloud: false,
      },
    }));
    useDisplayQualityStore.setState({ displayQuality: "auto" });
    useThemeStore.setState({ themeId: "dark" });
    restoreHamClockDisplay();
    useHamClockDisplayStore.getState().resetDisplay();
  });

  it("applies the full PropSphere map scene contract", () => {
    const scene: KioskScene = {
      id: "map",
      name: "Map",
      route: "/map",
      map: {
        layoutMode: "pro",
        viewMode: "globe",
        preset: "dx-hunter",
        autoRotate: true,
        autoRotateSpeed: 900,
        quality: "extreme",
        mapStyle: "standard",
        theme: "light",
        showLiveClouds: true,
      },
    };

    applySceneToMap(scene);

    expect(mapPresentationState()).toMatchObject({
      layoutMode: "pro",
      viewMode: "globe",
      // Enabling clouds is an explicit override of the preset, so the map
      // store correctly marks the resulting layer mix as custom.
      activePreset: null,
      autoRotate: true,
      autoRotateSpeed: 900,
      mapStyle: "standard",
      goesCloud: true,
    });
    expect(useMapStore.getState().layers).toMatchObject({
      beacons: true,
      ft8Spotter: true,
    });
    expect(useDisplayQualityStore.getState().displayQuality).toBe("extreme");
    expect(useThemeStore.getState().themeId).toBe("light");
  });

  it("turns off globe-only clouds when a map scene selects another projection", () => {
    useMapStore.setState((state) => ({
      layers: { ...state.layers, goesCloud: true },
    }));

    applySceneToMap({
      id: "flat",
      name: "Flat",
      route: "/map",
      map: {
        layoutMode: "pro",
        viewMode: "flat",
        showLiveClouds: true,
      },
    });

    expect(useMapStore.getState().viewMode).toBe("flat");
    expect(useMapStore.getState().layers.goesCloud).toBe(false);
  });

  it("turns off globe-only clouds when HamClock implicitly selects flat view", () => {
    useMapStore.setState((state) => ({
      viewMode: "globe",
      layers: { ...state.layers, goesCloud: true },
    }));

    applySceneToMap({
      id: "hamclock",
      name: "HamClock",
      route: "/map",
      map: { layoutMode: "hamclock" },
    });

    expect(useMapStore.getState().viewMode).toBe("flat");
    expect(useMapStore.getState().layers.goesCloud).toBe(false);
  });

  it.each(["/map/explorer", "/map/photorealistic"])(
    "applies only presentation controls supported by %s",
    (route) => {
      const before = mapPresentationState();
      applySceneToMap({
        id: route,
        name: route,
        route,
        // Deliberately include unsupported fields to verify the applicator is
        // a defense-in-depth boundary even before a remote scene is sanitized.
        map: {
          layoutMode: "pro",
          viewMode: "globe",
          preset: "dx-hunter",
          autoRotate: true,
          autoRotateSpeed: 900,
          quality: "uhd",
          mapStyle: "standard",
          theme: "midnight",
          showLiveClouds: true,
        },
      });

      expect(mapPresentationState()).toEqual({
        ...before,
        layoutMode: "pro",
      });
      expect(useDisplayQualityStore.getState().displayQuality).toBe("uhd");
      expect(useThemeStore.getState().themeId).toBe("midnight");
    },
  );

  it("ignores map configuration on non-map scenes", () => {
    const beforeMap = mapPresentationState();
    const beforeQuality = useDisplayQualityStore.getState().displayQuality;
    const beforeTheme = useThemeStore.getState().themeId;

    applySceneToMap({
      id: "solar",
      name: "Solar",
      route: "/solar",
      map: {
        layoutMode: "pro",
        viewMode: "globe",
        quality: "extreme",
        theme: "light",
      },
    });

    expect(mapPresentationState()).toEqual(beforeMap);
    expect(useDisplayQualityStore.getState().displayQuality).toBe(beforeQuality);
    expect(useThemeStore.getState().themeId).toBe(beforeTheme);
  });

  it("pins the HamClock wall to a scene's pages and hands it back afterwards", () => {
    const display = useHamClockDisplayStore.getState();
    display.setDensity("desk");
    display.setTheme("classic");
    display.setPage("left", 4);

    applySceneToMap({
      id: "wall",
      name: "Wall",
      route: "/map",
      map: {
        layoutMode: "hamclock",
        hamclock: { leftPage: 1, rightPage: 2, theme: "brass" },
      },
    });

    // Both rails follow one page, so a pin is one index: leftPage is
    // canonical when a scene still sets both.
    expect(useHamClockDisplayStore.getState()).toMatchObject({
      density: "wall",
      theme: "brass",
      pageIndex: { left: 1, right: 1 },
    });

    // Any scene that does not pin the wall returns the operator's own setup,
    // including one with no map configuration at all.
    applySceneToMap({ id: "solar", name: "Solar", route: "/solar" });

    expect(useHamClockDisplayStore.getState()).toMatchObject({
      density: "desk",
      theme: "classic",
      pageIndex: { left: 4, right: 4 },
    });
  });

  it("snapshots the operator's display once across consecutive pinned scenes", () => {
    useHamClockDisplayStore.getState().setTheme("pulse");
    useHamClockDisplayStore.getState().setPage("right", 3);

    applySceneToMap({
      id: "wall-a",
      name: "A",
      route: "/map",
      map: { layoutMode: "hamclock", hamclock: { leftPage: 1, rightPage: 1 } },
    });
    applySceneToMap({
      id: "wall-b",
      name: "B",
      route: "/map",
      map: { layoutMode: "hamclock", hamclock: { leftPage: 2, rightPage: 2 } },
    });

    restoreHamClockDisplay();

    expect(useHamClockDisplayStore.getState()).toMatchObject({
      theme: "pulse",
      pageIndex: { left: 3, right: 3 },
    });
    // Nothing is pinned any more, so a second restore changes nothing.
    useHamClockDisplayStore.getState().setPage("right", 1);
    restoreHamClockDisplay();
    expect(useHamClockDisplayStore.getState().pageIndex.right).toBe(1);
  });

  it("recovers the pre-pin baseline from sessionStorage after a simulated reload", () => {
    useHamClockDisplayStore.getState().setDensity("desk");
    useHamClockDisplayStore.getState().setTheme("classic");
    useHamClockDisplayStore.getState().setPage("left", 4);

    applySceneToMap({
      id: "wall",
      name: "Wall",
      route: "/map",
      map: {
        layoutMode: "hamclock",
        hamclock: { leftPage: 1, rightPage: 2, theme: "brass" },
      },
    });

    expect(useHamClockDisplayStore.getState()).toMatchObject({
      density: "wall",
      theme: "brass",
    });

    // A reload wipes the module-level snapshot but not sessionStorage, which
    // still holds both the pin overrides (via the display store's own
    // persistence) and the pre-pin baseline this module mirrored there.
    __resetHamClockPinForTests();

    restoreHamClockDisplay();

    expect(useHamClockDisplayStore.getState()).toMatchObject({
      density: "desk",
      theme: "classic",
      pageIndex: { left: 4, right: 4 },
    });
    expect(sessionStorage.getItem("propulse-hamclock-prepin")).toBeNull();
  });

  it("restores from the left page of a legacy pre-sync split snapshot", () => {
    // A snapshot written before paging was synchronized (HW-54) could have
    // `left` and `right` diverge. `left` is canonical, so restoring must use
    // it alone rather than letting a second `setPage("right", …)` call clobber
    // it back to the stale `right` value.
    sessionStorage.setItem(
      "propulse-hamclock-prepin",
      JSON.stringify({
        density: "wall",
        theme: "pulse",
        pageIndex: { left: 4, right: 0 },
      }),
    );

    restoreHamClockDisplay();

    expect(useHamClockDisplayStore.getState()).toMatchObject({
      density: "wall",
      theme: "pulse",
      pageIndex: { left: 4, right: 4 },
    });
  });
});
