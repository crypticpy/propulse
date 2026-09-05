/**
 * Zustand store for Kiosk mode (wall-display Scenes + rotation)
 *
 * A Scene is a named view the kiosk can show: an app route plus, for the
 * map, layout/preset side effects applied on entry. Kiosk mode hides the
 * normal chrome (see Layout), rotates through scenes on a timer, and lets
 * critical alerts break through the rotation (see KioskChrome).
 *
 * `active` is persisted deliberately: a dedicated wall device that reloads
 * (daily kiosk-browser refresh, Pi reboot) must come back in kiosk mode.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  LAYER_PRESETS,
  type LayoutMode,
  type MapStyle,
  type ViewMode,
  type PresetName,
} from "@/stores/mapStore";
import type { DisplayQuality } from "@/stores/displayQualityStore";
import type { ThemeId } from "@/lib/themes";
import type { HamClockMode } from "@/lib/hamclock/modePresets";
import {
  HAMCLOCK_THEMES,
  type HamClockTheme,
} from "@/stores/hamclockDisplayStore";

/**
 * HamClock wall pinning for one scene.
 *
 * A rotation that stops on the wall should be able to say which page each
 * rail shows, so a playlist can walk a display through Spots, Solar and
 * Forecast without an operator touching the pagers. A pinned scene forces
 * wall density; what the operator had before the first pin is restored when
 * the rotation leaves HamClock or the wall exits.
 */
export interface KioskSceneHamClockConfig {
  /** Index into HAMCLOCK_WALL_PAGES for the left rail. */
  leftPage?: number;
  /** Index into HAMCLOCK_WALL_PAGES for the right rail. */
  rightPage?: number;
  /** HamClock presentation theme (pulse / classic / brass). */
  theme?: HamClockTheme;
}

export interface KioskSceneMapConfig {
  layoutMode: LayoutMode;
  viewMode?: ViewMode;
  preset?: PresetName;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  quality?: DisplayQuality;
  mapStyle?: MapStyle;
  theme?: ThemeId;
  showLiveClouds?: boolean;
  /** Optional HamClock product mode applied before layout enter. */
  hamclockMode?: HamClockMode;
  /** Optional HamClock wall pinning; only meaningful for the hamclock layout. */
  hamclock?: KioskSceneHamClockConfig;
}

export type KioskTransition = "fade" | "cut";

export interface KioskScene {
  id: string;
  name: string;
  /** App route this scene displays (must be one of KIOSK_ROUTES) */
  route: string;
  /** Route-supported map/presentation side effects applied before navigation. */
  map?: KioskSceneMapConfig;
  /** Disabled scenes remain editable but are skipped by wall playback. */
  enabled?: boolean;
  /** Optional scene-specific dwell time; otherwise rotation.intervalSec is used. */
  durationSec?: number;
  /** Transition used when entering this scene. */
  transition?: KioskTransition;
}

export type KioskHeaderScale = "compact" | "standard" | "large";

export interface KioskPresentation {
  /** Scale of the persistent scene/time strip at the top of a wall. */
  headerScale: KioskHeaderScale;
  /** Use the OpenType slashed-zero feature for wall-readable numerals. */
  slashedZero: boolean;
  /** Dim map/page content automatically while the QTH is on Earth's night side. */
  autoNightDim: boolean;
}

/** Minimum alert priority that interrupts the rotation */
export type BreakInLevel = "CRITICAL" | "WARNING" | "off";

/** Routes a scene may point at (kiosk-safe: no auth flows, no editors) */
export const KIOSK_ROUTES: ReadonlyArray<{ route: string; label: string }> = [
  { route: "/map", label: "PropSphere Map" },
  { route: "/map/explorer", label: "Deep-Zoom Map" },
  { route: "/map/photorealistic", label: "Photorealistic 3D (Experimental)" },
  { route: "/", label: "Dashboard" },
  { route: "/solar", label: "Solar Weather" },
  { route: "/dx", label: "DX Wizard" },
  { route: "/atmos", label: "AtmosPulse" },
  { route: "/satellites", label: "Satellites" },
  { route: "/clock", label: "Big Clock" },
  { route: "/stopwatch", label: "Stopwatch" },
];

export interface KioskRouteCapabilities {
  mapConfig: boolean;
  layoutMode: boolean;
  viewMode: boolean;
  preset: boolean;
  autoRotate: boolean;
  autoRotateSpeed: boolean;
  quality: boolean;
  mapStyle: boolean;
  theme: boolean;
  liveClouds: boolean;
}

const NO_MAP_CAPABILITIES: KioskRouteCapabilities = {
  mapConfig: false,
  layoutMode: false,
  viewMode: false,
  preset: false,
  autoRotate: false,
  autoRotateSpeed: false,
  quality: false,
  mapStyle: false,
  theme: false,
  liveClouds: false,
};

const DEDICATED_MAP_CAPABILITIES: KioskRouteCapabilities = {
  ...NO_MAP_CAPABILITIES,
  mapConfig: true,
  layoutMode: true,
  quality: true,
  theme: true,
};

/** Explicit scene controls supported by each kiosk-safe route. */
export const KIOSK_ROUTE_CAPABILITIES: Readonly<
  Record<string, KioskRouteCapabilities>
> = Object.freeze({
  "/map": Object.freeze({
    mapConfig: true,
    layoutMode: true,
    viewMode: true,
    preset: true,
    autoRotate: true,
    autoRotateSpeed: true,
    quality: true,
    mapStyle: true,
    theme: true,
    liveClouds: true,
  }),
  "/map/explorer": Object.freeze({ ...DEDICATED_MAP_CAPABILITIES }),
  "/map/photorealistic": Object.freeze({ ...DEDICATED_MAP_CAPABILITIES }),
});

export function getKioskRouteCapabilities(
  route: string,
): KioskRouteCapabilities {
  return KIOSK_ROUTE_CAPABILITIES[route] ?? NO_MAP_CAPABILITIES;
}

export function isKioskMapRoute(route: string): boolean {
  return getKioskRouteCapabilities(route).mapConfig;
}

export function kioskSceneSupportsLiveClouds(
  route: string,
  map?: Pick<KioskSceneMapConfig, "viewMode">,
): boolean {
  return (
    getKioskRouteCapabilities(route).liveClouds && map?.viewMode === "globe"
  );
}

const MIN_INTERVAL_SEC = 15;
const MAX_INTERVAL_SEC = 3600;
const MIN_AUTO_ROTATE_SPEED_SEC = 60;
const MAX_AUTO_ROTATE_SPEED_SEC = 86_400;
const DEFAULT_ROTATION = { enabled: true, intervalSec: 120 };
const DEFAULT_BREAK_IN_LEVEL: BreakInLevel = "CRITICAL";
export const DEFAULT_PRESENTATION: KioskPresentation = {
  headerScale: "standard",
  slashedZero: false,
  autoNightDim: false,
};

export const DEFAULT_SCENES: KioskScene[] = [
  {
    id: "default-wall",
    name: "HamClock Wall",
    route: "/map",
    map: {
      layoutMode: "hamclock",
      viewMode: "flat",
      mapStyle: "satellite",
      hamclockMode: "traffic",
      hamclock: { leftPage: 0, rightPage: 0 },
    },
  },
  {
    id: "default-hamclock-weather",
    name: "HamClock Weather",
    route: "/map",
    map: {
      layoutMode: "hamclock",
      viewMode: "flat",
      mapStyle: "satellite",
      hamclockMode: "weather",
      hamclock: { leftPage: 3, rightPage: 3 },
    },
  },
  {
    id: "default-globe",
    name: "Observatory Globe",
    route: "/map",
    map: { layoutMode: "pro", viewMode: "globe", autoRotate: true },
  },
  { id: "default-solar", name: "Solar Weather", route: "/solar" },
  { id: "default-dx", name: "DX Activity", route: "/dx" },
  { id: "default-storm", name: "Storm Watch", route: "/atmos" },
  { id: "default-clock", name: "Big Clock", route: "/clock" },
  { id: "default-stopwatch", name: "Stopwatch", route: "/stopwatch" },
];

const V3_WALL_SCENES = DEFAULT_SCENES.filter(
  (scene) => scene.id === "default-clock" || scene.id === "default-stopwatch",
);
const HAMCLOCK_DEFAULT_SCENES = DEFAULT_SCENES.filter(
  (scene) =>
    scene.id === "default-wall" || scene.id === "default-hamclock-weather",
);
const LEGACY_DEFAULT_SCENE_IDS = new Set([
  "default-wall",
  "default-globe",
  "default-solar",
  "default-dx",
  "default-storm",
]);

interface KioskStore {
  scenes: KioskScene[];
  rotation: { enabled: boolean; intervalSec: number };
  breakInLevel: BreakInLevel;
  presentation: KioskPresentation;
  active: boolean;
  activeSceneId: string | null;

  addScene: (scene: Omit<KioskScene, "id">) => KioskScene;
  updateScene: (id: string, patch: Partial<Omit<KioskScene, "id">>) => void;
  /** Replace a local/remote assignment through the persisted-state validator. */
  replaceScenes: (scenes: readonly unknown[]) => void;
  duplicateScene: (id: string) => KioskScene | null;
  moveScene: (id: string, direction: -1 | 1) => void;
  /** Removes a scene; the last remaining scene cannot be removed */
  removeScene: (id: string) => void;
  setRotation: (rotation: Partial<KioskStore["rotation"]>) => void;
  setBreakInLevel: (level: BreakInLevel) => void;
  setPresentation: (patch: Partial<KioskPresentation>) => void;

  /** Enter kiosk mode, optionally at a specific scene */
  start: (sceneId?: string) => KioskScene | null;
  /** Leave kiosk mode */
  stop: () => void;
  /** Step to the next/previous scene; returns the new scene */
  advance: (direction: 1 | -1) => KioskScene | null;
  getActiveScene: () => KioskScene | null;
}

type PersistedKioskState = Pick<
  KioskStore,
  | "scenes"
  | "rotation"
  | "breakInLevel"
  | "presentation"
  | "active"
  | "activeSceneId"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDefaultScenes(): KioskScene[] {
  return DEFAULT_SCENES.map(normalizeScene);
}

const VALID_ROUTES = new Set(KIOSK_ROUTES.map((entry) => entry.route));
const VALID_LAYOUT_MODES = new Set<LayoutMode>([
  "normal",
  "pro",
  "lite",
  "hamclock",
]);
const VALID_VIEW_MODES = new Set<ViewMode>([
  "globe",
  "flat",
  "azimuthal",
]);
const VALID_MAP_STYLES = new Set<MapStyle>(["satellite", "standard"]);
const VALID_DISPLAY_QUALITIES = new Set<DisplayQuality>([
  "data-saver",
  "auto",
  "uhd",
  "extreme",
]);
const VALID_THEMES = new Set<ThemeId>([
  "dark",
  "light",
  "high-contrast",
  "midnight",
]);
const VALID_HAMCLOCK_MODES = new Set<HamClockMode>([
  "traffic",
  "bands",
  "satellites",
  "weather",
]);
const VALID_HAMCLOCK_THEMES = new Set<HamClockTheme>(HAMCLOCK_THEMES);
const VALID_BREAK_IN_LEVELS = new Set<BreakInLevel>([
  "CRITICAL",
  "WARNING",
  "off",
]);
const VALID_HEADER_SCALES = new Set<KioskHeaderScale>([
  "compact",
  "standard",
  "large",
]);

function clampAutoRotateSpeed(sec: number): number {
  if (!Number.isFinite(sec)) return 900;
  return Math.min(
    MAX_AUTO_ROTATE_SPEED_SEC,
    Math.max(MIN_AUTO_ROTATE_SPEED_SEC, Math.round(sec)),
  );
}

/** The wall clamps a stale page index into range itself, so the boundary only
 * has to reject values that are not page indexes at all. The ceiling is a
 * sanity bound on hand-edited and remote payloads. */
const MAX_WALL_PAGE_INDEX = 31;

function sanitizeWallPage(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_WALL_PAGE_INDEX
    ? value
    : undefined;
}

function sanitizeHamClockConfig(
  value: unknown,
): KioskSceneHamClockConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: KioskSceneHamClockConfig = {};
  const leftPage = sanitizeWallPage(value.leftPage);
  if (leftPage !== undefined) config.leftPage = leftPage;
  const rightPage = sanitizeWallPage(value.rightPage);
  if (rightPage !== undefined) config.rightPage = rightPage;
  if (VALID_HAMCLOCK_THEMES.has(value.theme as HamClockTheme)) {
    config.theme = value.theme as HamClockTheme;
  }
  // An empty object would pin nothing while still forcing wall density.
  return Object.keys(config).length > 0 ? config : undefined;
}

function sanitizeMapConfig(
  route: string,
  value: unknown,
): KioskSceneMapConfig | undefined {
  const capabilities = getKioskRouteCapabilities(route);
  if (
    !capabilities.mapConfig ||
    !isRecord(value) ||
    !VALID_LAYOUT_MODES.has(value.layoutMode as LayoutMode)
  ) {
    return undefined;
  }

  const config: KioskSceneMapConfig = {
    layoutMode: value.layoutMode as LayoutMode,
  };
  if (
    capabilities.viewMode &&
    VALID_VIEW_MODES.has(value.viewMode as ViewMode)
  ) {
    config.viewMode = value.viewMode as ViewMode;
  }
  if (
    capabilities.preset &&
    typeof value.preset === "string" &&
    Object.prototype.hasOwnProperty.call(LAYER_PRESETS, value.preset)
  ) {
    config.preset = value.preset as PresetName;
  }
  if (capabilities.autoRotate && typeof value.autoRotate === "boolean") {
    config.autoRotate = value.autoRotate;
  }
  if (
    capabilities.autoRotateSpeed &&
    typeof value.autoRotateSpeed === "number"
  ) {
    config.autoRotateSpeed = clampAutoRotateSpeed(value.autoRotateSpeed);
  }
  if (
    capabilities.quality &&
    VALID_DISPLAY_QUALITIES.has(value.quality as DisplayQuality)
  ) {
    config.quality = value.quality as DisplayQuality;
  }
  if (
    capabilities.mapStyle &&
    VALID_MAP_STYLES.has(value.mapStyle as MapStyle)
  ) {
    config.mapStyle = value.mapStyle as MapStyle;
  }
  if (capabilities.theme && VALID_THEMES.has(value.theme as ThemeId)) {
    config.theme = value.theme as ThemeId;
  }
  if (
    VALID_HAMCLOCK_MODES.has(value.hamclockMode as HamClockMode) &&
    config.layoutMode === "hamclock"
  ) {
    config.hamclockMode = value.hamclockMode as HamClockMode;
  }
  if (config.layoutMode === "hamclock") {
    const hamclock = sanitizeHamClockConfig(value.hamclock);
    if (hamclock) config.hamclock = hamclock;
  }
  if (
    capabilities.liveClouds &&
    config.viewMode === "globe" &&
    typeof value.showLiveClouds === "boolean"
  ) {
    config.showLiveClouds = value.showLiveClouds;
  }
  return config;
}

function sanitizeScene(value: unknown): KioskScene | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    typeof value.route !== "string" ||
    !VALID_ROUTES.has(value.route)
  ) {
    return null;
  }

  const map = sanitizeMapConfig(value.route, value.map);
  return {
    id: value.id,
    name: value.name,
    route: value.route,
    ...(map ? { map } : {}),
    enabled: value.enabled !== false,
    ...(typeof value.durationSec === "number" && {
      durationSec: clampInterval(value.durationSec),
    }),
    transition: value.transition === "cut" ? "cut" : "fade",
  };
}

function normalizeScene(scene: KioskScene): KioskScene {
  const map = sanitizeMapConfig(scene.route, scene.map);
  return {
    id: scene.id,
    name: scene.name,
    route: scene.route,
    ...(map ? { map } : {}),
    enabled: scene.enabled !== false,
    ...(scene.durationSec !== undefined && {
      durationSec: clampInterval(scene.durationSec),
    }),
    transition: scene.transition === "cut" ? "cut" : "fade",
  };
}

function enabledScenes(scenes: readonly KioskScene[]): KioskScene[] {
  return scenes.filter((scene) => scene.enabled !== false);
}

function sanitizeSceneList(value: readonly unknown[]): KioskScene[] {
  const seenSceneIds = new Set<string>();
  return value.map(sanitizeScene).filter((scene): scene is KioskScene => {
    if (!scene || seenSceneIds.has(scene.id)) return false;
    seenSceneIds.add(scene.id);
    return true;
  });
}

function normalizePersistedKioskState(value: unknown): PersistedKioskState {
  const raw = isRecord(value) ? value : {};
  const scenes = sanitizeSceneList(
    Array.isArray(raw.scenes) ? raw.scenes : [],
  );
  const usableScenes = scenes.length > 0 ? scenes : cloneDefaultScenes();
  const rawRotation = isRecord(raw.rotation) ? raw.rotation : {};
  const rawPresentation = isRecord(raw.presentation) ? raw.presentation : {};
  const requestedActive = typeof raw.active === "boolean" ? raw.active : false;
  // Persisted kiosk mode is only meaningful when at least one scene can be
  // rendered. Repair hand-edited or interrupted all-disabled states at the
  // hydration boundary instead of mounting an empty wall shell.
  const active = requestedActive && enabledScenes(usableScenes).length > 0;
  const requestedActiveId =
    typeof raw.activeSceneId === "string" ? raw.activeSceneId : null;
  const activeSceneId = usableScenes.some(
    (scene) => scene.id === requestedActiveId && scene.enabled !== false,
  )
    ? requestedActiveId
    : active
      ? (enabledScenes(usableScenes)[0]?.id ?? null)
      : null;

  return {
    scenes: usableScenes,
    rotation: {
      enabled:
        typeof rawRotation.enabled === "boolean"
          ? rawRotation.enabled
          : DEFAULT_ROTATION.enabled,
      intervalSec: clampInterval(
        typeof rawRotation.intervalSec === "number"
          ? rawRotation.intervalSec
          : DEFAULT_ROTATION.intervalSec,
      ),
    },
    breakInLevel: VALID_BREAK_IN_LEVELS.has(
      raw.breakInLevel as BreakInLevel,
    )
      ? (raw.breakInLevel as BreakInLevel)
      : DEFAULT_BREAK_IN_LEVEL,
    presentation: {
      headerScale: VALID_HEADER_SCALES.has(
        rawPresentation.headerScale as KioskHeaderScale,
      )
        ? (rawPresentation.headerScale as KioskHeaderScale)
        : DEFAULT_PRESENTATION.headerScale,
      slashedZero:
        typeof rawPresentation.slashedZero === "boolean"
          ? rawPresentation.slashedZero
          : DEFAULT_PRESENTATION.slashedZero,
      autoNightDim:
        typeof rawPresentation.autoNightDim === "boolean"
          ? rawPresentation.autoNightDim
          : DEFAULT_PRESENTATION.autoNightDim,
    },
    active,
    activeSceneId,
  };
}

/**
 * v4 adds scene playback/presentation fields and the dedicated map routes.
 * v5 and v6 refresh the shipped HamClock wall templates for default-derived
 * playlists: v5 introduced them, v6 pins each one to its wall page.
 * Every version still crosses the same strict normalizer, so unsupported
 * fields from old, remote, or hand-edited payloads never reach consumers.
 */
export function migrateKioskState(
  persisted: unknown,
  version: number,
): PersistedKioskState {
  let candidate = persisted;
  if (version < 3) {
    const legacy = isRecord(candidate) ? { ...candidate } : {};
    if (version < 2) {
      legacy.rotation = isRecord(legacy.rotation)
        ? legacy.rotation
        : { ...DEFAULT_ROTATION };
      legacy.breakInLevel = legacy.breakInLevel ?? DEFAULT_BREAK_IN_LEVEL;
      legacy.active = typeof legacy.active === "boolean" ? legacy.active : false;
      legacy.activeSceneId = legacy.activeSceneId ?? null;
    }
    // v3 adds wall presentation preferences. Copy defaults rather than the
    // exported object so a hydrated store can never mutate shared constants.
    legacy.presentation = isRecord(legacy.presentation)
      ? legacy.presentation
      : { ...DEFAULT_PRESENTATION };
    if (Array.isArray(legacy.scenes)) {
      // Preserve fully custom scene lists, but extend configurations derived
      // from the shipped defaults so existing wall devices discover the new
      // clock routes without requiring a localStorage reset.
      const hasLegacyDefault = legacy.scenes.some(
        (scene) =>
          isRecord(scene) &&
          typeof scene.id === "string" &&
          LEGACY_DEFAULT_SCENE_IDS.has(scene.id),
      );
      if (hasLegacyDefault) {
        const existingIds = new Set(
          legacy.scenes.flatMap((scene) =>
            isRecord(scene) && typeof scene.id === "string" ? [scene.id] : [],
          ),
        );
        legacy.scenes = [
          ...legacy.scenes,
          ...V3_WALL_SCENES.filter((scene) => !existingIds.has(scene.id)).map(
            (scene) => ({ ...scene }),
          ),
        ];
      }
    }
    candidate = legacy;
  }
  if (version < 6) {
    const legacy = isRecord(candidate) ? { ...candidate } : {};
    if (Array.isArray(legacy.scenes)) {
      const scenes = legacy.scenes as unknown[];
      // v6 only teaches existing scenes about their shipped HamClock page
      // pin — it must never discard a user's own name/enabled/duration/
      // transition/map edits, and never resurrect a scene the user deleted.
      const byId = new Map(
        HAMCLOCK_DEFAULT_SCENES.map((scene) => [scene.id, scene] as const),
      );
      legacy.scenes = scenes.map((scene) => {
        if (!isRecord(scene) || typeof scene.id !== "string") return scene;
        const template = byId.get(scene.id);
        const templatePin = template?.map?.hamclock;
        if (!templatePin || !isRecord(scene.map)) return scene;
        return {
          ...scene,
          map: { ...scene.map, hamclock: templatePin },
        };
      });
    }
    candidate = legacy;
  }
  // Migration output is normalized here; the persist merge below repeats the
  // same boundary validation for same-version payloads because Zustand only
  // invokes migrate when the stored version differs.
  return normalizePersistedKioskState(candidate);
}

function clampInterval(sec: number): number {
  if (!Number.isFinite(sec)) return 120;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(sec)));
}

export const useKioskStore = create<KioskStore>()(
  persist(
    (set, get) => ({
      scenes: cloneDefaultScenes(),
      rotation: { ...DEFAULT_ROTATION },
      breakInLevel: DEFAULT_BREAK_IN_LEVEL,
      presentation: { ...DEFAULT_PRESENTATION },
      active: false,
      activeSceneId: null,

      addScene: (scene) => {
        const created = sanitizeScene({
          ...scene,
          map: scene.map ? { ...scene.map } : undefined,
          id: crypto.randomUUID(),
        });
        if (!created) {
          throw new TypeError("Cannot add an invalid kiosk scene");
        }
        set((state) => ({ scenes: [...state.scenes, created] }));
        return created;
      },

      updateScene: (id, patch) =>
        set((state) => {
          const scenes = state.scenes.map((scene) => {
            if (scene.id !== id) return scene;
            const explicitlyUpdatesMap = Object.prototype.hasOwnProperty.call(
              patch,
              "map",
            );
            return (
              sanitizeScene({
                ...scene,
                ...patch,
                id,
                map:
                  explicitlyUpdatesMap
                    ? patch.map
                      ? { ...patch.map }
                      : undefined
                    : patch.route !== undefined &&
                        patch.route !== scene.route
                      ? undefined
                      : scene.map
                        ? { ...scene.map }
                        : undefined,
              }) ?? scene
            );
          });
          const activeStillEnabled = scenes.some(
            (scene) =>
              scene.id === state.activeSceneId && scene.enabled !== false,
          );
          const shouldRetainResumePosition =
            state.active || state.activeSceneId !== null;
          return {
            scenes,
            activeSceneId: activeStillEnabled
              ? state.activeSceneId
              : shouldRetainResumePosition
                ? (enabledScenes(scenes)[0]?.id ?? null)
                : null,
          };
        }),

      replaceScenes: (incomingScenes) =>
        set((state) => {
          const sanitized = sanitizeSceneList(incomingScenes);
          const scenes = sanitized.length > 0 ? sanitized : cloneDefaultScenes();
          const activeStillEnabled = scenes.some(
            (scene) =>
              scene.id === state.activeSceneId && scene.enabled !== false,
          );
          const shouldRetainResumePosition =
            state.active || state.activeSceneId !== null;
          return {
            scenes,
            activeSceneId: activeStillEnabled
              ? state.activeSceneId
              : shouldRetainResumePosition
                ? (enabledScenes(scenes)[0]?.id ?? null)
                : null,
          };
        }),

      duplicateScene: (id) => {
        const sourceIndex = get().scenes.findIndex((scene) => scene.id === id);
        if (sourceIndex < 0) return null;
        const source = get().scenes[sourceIndex];
        const duplicate = normalizeScene({
          ...source,
          id: crypto.randomUUID(),
          name: `${source.name} Copy`,
          map: source.map ? { ...source.map } : undefined,
        });
        set((state) => {
          const scenes = [...state.scenes];
          scenes.splice(sourceIndex + 1, 0, duplicate);
          return { scenes };
        });
        return duplicate;
      },

      moveScene: (id, direction) =>
        set((state) => {
          const from = state.scenes.findIndex((scene) => scene.id === id);
          const to = from + direction;
          if (from < 0 || to < 0 || to >= state.scenes.length) return state;
          const scenes = [...state.scenes];
          const [scene] = scenes.splice(from, 1);
          scenes.splice(to, 0, scene);
          return { scenes };
        }),

      removeScene: (id) =>
        set((state) => {
          if (state.scenes.length <= 1) return state;
          const scenes = state.scenes.filter((s) => s.id !== id);
          const activeStillEnabled = scenes.some(
            (scene) =>
              scene.id === state.activeSceneId && scene.enabled !== false,
          );
          return {
            scenes,
            activeSceneId: activeStillEnabled
              ? state.activeSceneId
              : state.active || state.activeSceneId !== null
                ? (enabledScenes(scenes)[0]?.id ?? null)
                : null,
          };
        }),

      setRotation: (rotation) =>
        set((state) => ({
          rotation: {
            enabled: rotation.enabled ?? state.rotation.enabled,
            intervalSec:
              rotation.intervalSec !== undefined
                ? clampInterval(rotation.intervalSec)
                : state.rotation.intervalSec,
          },
        })),

      setBreakInLevel: (breakInLevel) => set({ breakInLevel }),

      setPresentation: (patch) =>
        set((state) => ({
          presentation: { ...state.presentation, ...patch },
        })),

      start: (sceneId) => {
        const scenes = enabledScenes(get().scenes);
        if (scenes.length === 0) return null;
        const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];
        set({ active: true, activeSceneId: scene.id });
        return scene;
      },

      stop: () => set({ active: false }),

      advance: (direction) => {
        const { activeSceneId } = get();
        const scenes = enabledScenes(get().scenes);
        if (scenes.length === 0) return null;
        const currentIndex = scenes.findIndex((s) => s.id === activeSceneId);
        const nextIndex =
          currentIndex < 0
            ? direction === 1
              ? 0
              : scenes.length - 1
            : (currentIndex + direction + scenes.length) % scenes.length;
        const scene = scenes[nextIndex];
        set({ activeSceneId: scene.id });
        return scene;
      },

      getActiveScene: () => {
        const { scenes, activeSceneId } = get();
        return (
          scenes.find(
            (scene) =>
              scene.id === activeSceneId && scene.enabled !== false,
          ) ?? null
        );
      },
    }),
    {
      name: "propulse-kiosk",
      version: 6,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        scenes: state.scenes,
        rotation: state.rotation,
        breakInLevel: state.breakInLevel,
        presentation: state.presentation,
        active: state.active,
        activeSceneId: state.activeSceneId,
      }),
      migrate: migrateKioskState,
      merge: (persisted, current) => ({
        // Preserve every live action from the freshly-created store. Persisted
        // payloads contain data only, and must never replace action functions.
        ...current,
        // Unlike migrate, merge runs for every stored version. Keeping the
        // normalizer here repairs manually edited and partially written v4
        // localStorage before any consumer can observe it.
        ...normalizePersistedKioskState(persisted),
      }),
    },
  ),
);
