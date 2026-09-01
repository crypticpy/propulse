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
import type {
  LayoutMode,
  MapStyle,
  ViewMode,
  PresetName,
} from "@/stores/mapStore";
import type { DisplayQuality } from "@/stores/displayQualityStore";
import type { ThemeId } from "@/lib/themes";

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
}

export type KioskTransition = "fade" | "cut";

export interface KioskScene {
  id: string;
  name: string;
  /** App route this scene displays (must be one of KIOSK_ROUTES) */
  route: string;
  /** Map side effects, only meaningful when route is /map */
  map?: KioskSceneMapConfig;
  /** Disabled scenes stay in the playlist but are skipped at runtime. */
  enabled?: boolean;
  /** Scene-specific dwell time; falls back to the playlist interval. */
  durationSec?: number;
  /** Transition used when entering the scene. */
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
  { route: "/map/photorealistic", label: "Photorealistic 3D (Experimental)" },
  { route: "/", label: "Dashboard" },
  { route: "/solar", label: "Solar Weather" },
  { route: "/dx", label: "DX Wizard" },
  { route: "/atmos", label: "AtmosPulse" },
  { route: "/satellites", label: "Satellites" },
  { route: "/clock", label: "Big Clock" },
  { route: "/stopwatch", label: "Stopwatch" },
];

export function isKioskMapRoute(route: string): boolean {
  return route === "/map" || route === "/map/photorealistic";
}

export function kioskSceneSupportsLiveClouds(
  route: string,
  map?: Pick<KioskSceneMapConfig, "viewMode">,
): boolean {
  return route === "/map" && map?.viewMode === "globe";
}

const MIN_INTERVAL_SEC = 15;
const MAX_INTERVAL_SEC = 3600;
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
    name: "The Wall",
    route: "/map",
    map: { layoutMode: "hamclock" },
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
  return DEFAULT_SCENES.map((scene) => ({
    ...scene,
    ...(scene.map ? { map: { ...scene.map } } : {}),
  }));
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
const VALID_PRESETS = new Set<PresetName>([
  "dx-hunter",
  "contest",
  "vhf",
  "emergency",
  "science",
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

function sanitizeMapConfig(value: unknown): KioskSceneMapConfig | undefined {
  if (!isRecord(value) || !VALID_LAYOUT_MODES.has(value.layoutMode as LayoutMode)) {
    return undefined;
  }

  const config: KioskSceneMapConfig = {
    layoutMode: value.layoutMode as LayoutMode,
  };
  if (VALID_VIEW_MODES.has(value.viewMode as ViewMode)) {
    config.viewMode = value.viewMode as ViewMode;
  }
  if (
    typeof value.preset === "string" &&
    VALID_PRESETS.has(value.preset as PresetName)
  ) {
    config.preset = value.preset as PresetName;
  }
  if (typeof value.autoRotate === "boolean") {
    config.autoRotate = value.autoRotate;
  }
  if (typeof value.autoRotateSpeed === "number" && Number.isFinite(value.autoRotateSpeed)) {
    config.autoRotateSpeed = Math.max(30, Math.min(3600, value.autoRotateSpeed));
  }
  if (VALID_DISPLAY_QUALITIES.has(value.quality as DisplayQuality)) {
    config.quality = value.quality as DisplayQuality;
  }
  if (VALID_MAP_STYLES.has(value.mapStyle as MapStyle)) {
    config.mapStyle = value.mapStyle as MapStyle;
  }
  if (VALID_THEMES.has(value.theme as ThemeId)) {
    config.theme = value.theme as ThemeId;
  }
  if (typeof value.showLiveClouds === "boolean") {
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

  const map = isKioskMapRoute(value.route)
    ? sanitizeMapConfig(value.map)
    : undefined;
  if (map && !kioskSceneSupportsLiveClouds(value.route, map)) {
    delete map.showLiveClouds;
  }
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
  const map = scene.map ? { ...scene.map } : undefined;
  if (map && !kioskSceneSupportsLiveClouds(scene.route, map)) {
    delete map.showLiveClouds;
  }
  return {
    ...scene,
    ...(map ? { map } : {}),
    enabled: scene.enabled !== false,
    ...(scene.durationSec !== undefined && {
      durationSec: clampInterval(scene.durationSec),
    }),
    transition: scene.transition === "cut" ? "cut" : "fade",
  };
}

function enabledScenes(scenes: KioskScene[]): KioskScene[] {
  return scenes.filter((scene) => scene.enabled !== false);
}

function normalizePersistedKioskState(value: unknown): PersistedKioskState {
  const raw = isRecord(value) ? value : {};
  const seenSceneIds = new Set<string>();
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .map(sanitizeScene)
    .filter((scene): scene is KioskScene => {
      if (!scene || seenSceneIds.has(scene.id)) return false;
      seenSceneIds.add(scene.id);
      return true;
    });
  const usableScenes =
    scenes.length > 0 ? scenes : cloneDefaultScenes().map(normalizeScene);
  const rawRotation = isRecord(raw.rotation) ? raw.rotation : {};
  const rawPresentation = isRecord(raw.presentation) ? raw.presentation : {};
  const active = typeof raw.active === "boolean" ? raw.active : false;
  const requestedActiveId =
    typeof raw.activeSceneId === "string" ? raw.activeSceneId : null;
  const activeSceneId = usableScenes.some(
    (scene) => scene.id === requestedActiveId && scene.enabled !== false,
  )
    ? requestedActiveId
    : active
      ? enabledScenes(usableScenes)[0]?.id ?? null
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
 * v1 persisted the store object without an explicit data contract. v2 makes
 * that boundary explicit and repairs missing fields before strict validation,
 * so future schema versions have a known, tested predecessor to migrate from.
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
      scenes: cloneDefaultScenes().map(normalizeScene),
      rotation: { ...DEFAULT_ROTATION },
      breakInLevel: DEFAULT_BREAK_IN_LEVEL,
      presentation: { ...DEFAULT_PRESENTATION },
      active: false,
      activeSceneId: null,

      addScene: (scene) => {
        const created = normalizeScene({ ...scene, id: crypto.randomUUID() });
        set((state) => ({ scenes: [...state.scenes, created] }));
        return created;
      },

      updateScene: (id, patch) =>
        set((state) => {
          const scenes = state.scenes.map((scene) =>
            scene.id === id
              ? normalizeScene({ ...scene, ...patch, id })
              : scene,
          );
          const activeStillEnabled = scenes.some(
            (scene) =>
              scene.id === state.activeSceneId && scene.enabled !== false,
          );
          return {
            scenes,
            ...(!activeStillEnabled && state.activeSceneId !== null && {
              activeSceneId: enabledScenes(scenes)[0]?.id ?? null,
            }),
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
          return {
            scenes,
            activeSceneId:
              state.activeSceneId === id
                ? (enabledScenes(scenes)[0]?.id ?? null)
                : state.activeSceneId,
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
      version: 4,
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
        // normalizer here repairs manually edited and partially written v3
        // localStorage before any consumer can observe it.
        ...normalizePersistedKioskState(persisted),
      }),
    },
  ),
);
