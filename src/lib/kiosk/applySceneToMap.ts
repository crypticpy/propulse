import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import {
  getKioskRouteCapabilities,
  kioskSceneSupportsLiveClouds,
  type KioskScene,
  type KioskSceneHamClockConfig,
} from "@/stores/kioskStore";
import {
  useHamClockDisplayStore,
  type HamClockDensity,
  type HamClockRailSide,
  type HamClockTheme,
} from "@/stores/hamclockDisplayStore";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";

interface HamClockDisplaySnapshot {
  density: HamClockDensity;
  theme: HamClockTheme;
  pageIndex: Record<HamClockRailSide, number>;
}

/**
 * What the operator had before the first pinned scene took the wall over.
 * Module state rather than store state: it describes one kiosk run, and must
 * not survive a reload that the operator did not ask for.
 */
let displayBeforePin: HamClockDisplaySnapshot | null = null;

/** Put the HamClock display back the way the operator left it. Safe to call
 * when nothing was pinned. */
export function restoreHamClockDisplay(): void {
  const snapshot = displayBeforePin;
  if (!snapshot) return;
  displayBeforePin = null;
  const display = useHamClockDisplayStore.getState();
  display.setDensity(snapshot.density);
  display.setTheme(snapshot.theme);
  display.setPage("left", snapshot.pageIndex.left);
  display.setPage("right", snapshot.pageIndex.right);
}

function applyHamClockPin(pin: KioskSceneHamClockConfig | undefined): void {
  if (!pin) {
    restoreHamClockDisplay();
    return;
  }
  const display = useHamClockDisplayStore.getState();
  if (!displayBeforePin) {
    displayBeforePin = {
      density: display.density,
      theme: display.theme,
      pageIndex: { ...display.pageIndex },
    };
  }
  // A pinned page only means something at wall density.
  display.setDensity("wall");
  if (pin.theme) display.setTheme(pin.theme);
  if (pin.leftPage !== undefined) display.setPage("left", pin.leftPage);
  if (pin.rightPage !== undefined) display.setPage("right", pin.rightPage);
}

/** Apply only the presentation controls supported by a wall scene's route. */
export function applySceneToMap(scene: KioskScene): void {
  const capabilities = getKioskRouteCapabilities(scene.route);
  // Runs before the early return so that stepping onto any unpinned scene —
  // including one with no map config at all — hands the display back.
  applyHamClockPin(
    capabilities.mapConfig && scene.map?.layoutMode === "hamclock"
      ? scene.map.hamclock
      : undefined,
  );
  if (!capabilities.mapConfig || !scene.map) return;

  // Set HamClock mode before layout enter so beauty/mode presets use it.
  if (
    scene.map.layoutMode === "hamclock" &&
    scene.map.hamclockMode
  ) {
    useHamClockStore.getState().setHamclockMode(scene.map.hamclockMode);
  }

  const map = useMapStore.getState();
  if (capabilities.layoutMode) map.setLayoutMode(scene.map.layoutMode);
  if (capabilities.viewMode && scene.map.viewMode) {
    map.setViewMode(scene.map.viewMode);
  }
  if (capabilities.preset && scene.map.preset) {
    map.applyPreset(scene.map.preset);
  }
  if (capabilities.autoRotate && scene.map.autoRotate !== undefined) {
    map.setAutoRotate(scene.map.autoRotate);
  }
  if (
    capabilities.autoRotateSpeed &&
    scene.map.autoRotateSpeed !== undefined
  ) {
    map.setAutoRotateSpeed(scene.map.autoRotateSpeed);
  }
  if (capabilities.mapStyle && scene.map.mapStyle) {
    map.setMapStyle(scene.map.mapStyle);
  }
  if (capabilities.quality && scene.map.quality) {
    useDisplayQualityStore.getState().setDisplayQuality(scene.map.quality);
  }

  // A projection change is an explicit cloud-layer decision: non-globe map
  // scenes turn the globe-only layer off, while globe scenes opt in explicitly.
  const layoutSelectsFlatProjection =
    scene.map.layoutMode === "hamclock" && scene.map.viewMode === undefined;
  const controlsClouds =
    capabilities.liveClouds &&
    (scene.map.showLiveClouds !== undefined ||
      scene.map.viewMode !== undefined ||
      layoutSelectsFlatProjection);
  if (controlsClouds) {
    const desiredClouds =
      !layoutSelectsFlatProjection &&
      kioskSceneSupportsLiveClouds(scene.route, scene.map) &&
      scene.map.showLiveClouds === true;
    if (useMapStore.getState().layers.goesCloud !== desiredClouds) {
      map.toggleLayer("goesCloud");
    }
  }

  if (capabilities.theme && scene.map.theme) {
    useThemeStore.getState().setTheme(scene.map.theme);
  }
}

export default applySceneToMap;
