import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import {
  isKioskMapRoute,
  kioskSceneSupportsLiveClouds,
  type KioskScene,
} from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useThemeStore } from "@/stores/themeStore";

/** Apply a wall scene's map side effects before navigating to its route. */
export function applySceneToMap(scene: KioskScene): void {
  if (!isKioskMapRoute(scene.route) || !scene.map) return;

  const map = useMapStore.getState();
  map.setLayoutMode(scene.map.layoutMode);
  if (scene.map.viewMode) map.setViewMode(scene.map.viewMode);
  if (scene.map.preset) map.applyPreset(scene.map.preset);
  if (scene.map.autoRotate !== undefined) {
    map.setAutoRotate(scene.map.autoRotate);
  }
  if (scene.map.autoRotateSpeed !== undefined) {
    map.setAutoRotateSpeed(scene.map.autoRotateSpeed);
  }
  if (scene.map.mapStyle) map.setMapStyle(scene.map.mapStyle);
  if (scene.map.quality) {
    useDisplayQualityStore.getState().setDisplayQuality(scene.map.quality);
  }

  const controlsClouds =
    scene.map.showLiveClouds !== undefined || scene.map.viewMode !== undefined;
  if (controlsClouds) {
    const desiredClouds =
      kioskSceneSupportsLiveClouds(scene.route, scene.map) &&
      scene.map.showLiveClouds === true;
    if (useMapStore.getState().layers.goesCloud !== desiredClouds) {
      map.toggleLayer("goesCloud");
    }
  }

  if (scene.map.theme) useThemeStore.getState().setTheme(scene.map.theme);
}
