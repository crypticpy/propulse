import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import {
  getKioskRouteCapabilities,
  kioskSceneSupportsLiveClouds,
  type KioskScene,
} from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";

/** Apply only the presentation controls supported by a wall scene's route. */
export function applySceneToMap(scene: KioskScene): void {
  const capabilities = getKioskRouteCapabilities(scene.route);
  if (!capabilities.mapConfig || !scene.map) return;

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
