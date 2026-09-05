import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import {
  getKioskRouteCapabilities,
  kioskSceneSupportsLiveClouds,
  type KioskScene,
  type KioskSceneHamClockConfig,
} from "@/stores/kioskStore";
import {
  HAMCLOCK_DENSITIES,
  HAMCLOCK_THEMES,
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

/**
 * The pin overrides live in the (sessionStorage-persisted) display store, so
 * a reload while pinned would otherwise keep the overrides while losing this
 * module-only baseline. Mirror it into sessionStorage so a reload can still
 * recover the operator's pre-pin display.
 */
const PREPIN_STORAGE_KEY = "propulse-hamclock-prepin";

function isValidSnapshot(value: unknown): value is HamClockDisplaySnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const pageIndex = candidate.pageIndex;
  return (
    HAMCLOCK_DENSITIES.includes(candidate.density as HamClockDensity) &&
    HAMCLOCK_THEMES.includes(candidate.theme as HamClockTheme) &&
    typeof pageIndex === "object" &&
    pageIndex !== null &&
    typeof (pageIndex as Record<string, unknown>).left === "number" &&
    typeof (pageIndex as Record<string, unknown>).right === "number"
  );
}

function readStoredSnapshot(): HamClockDisplaySnapshot | null {
  try {
    const raw = sessionStorage.getItem(PREPIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredSnapshot(snapshot: HamClockDisplaySnapshot): void {
  try {
    sessionStorage.setItem(PREPIN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures (e.g. private mode); the module-level
    // snapshot still covers the common case of restoring within the tab.
  }
}

function clearStoredSnapshot(): void {
  try {
    sessionStorage.removeItem(PREPIN_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Test-only: simulates a page reload wiping the module-level snapshot while
 * leaving sessionStorage (and hence the persisted display overrides) intact.
 */
export function __resetHamClockPinForTests(): void {
  displayBeforePin = null;
}

/** Put the HamClock display back the way the operator left it. Safe to call
 * when nothing was pinned. */
export function restoreHamClockDisplay(): void {
  const snapshot = displayBeforePin ?? readStoredSnapshot();
  if (!snapshot) return;
  displayBeforePin = null;
  clearStoredSnapshot();
  const display = useHamClockDisplayStore.getState();
  display.setDensity(snapshot.density);
  display.setTheme(snapshot.theme);
  // Both rails follow one page (HW-54): `setPage` writes the same index to
  // both keys, so restoring from `left` alone is correct even for a legacy
  // snapshot captured before paging was synchronized (`{left, right}` split).
  // Calling `setPage` a second time with `right` would just overwrite `left`
  // right back to the stale `right` value.
  display.setPage("left", snapshot.pageIndex.left);
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
    writeStoredSnapshot(displayBeforePin);
  }
  // A pinned page only means something at wall density.
  display.setDensity("wall");
  if (pin.theme) display.setTheme(pin.theme);
  // Both rails follow one page (HW-54), so a pin is one index: leftPage is
  // canonical and rightPage only counts when leftPage is absent. B4 collapses
  // the two fields into a page id.
  const page = pin.leftPage ?? pin.rightPage;
  if (page !== undefined) display.setPage("left", page);
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
