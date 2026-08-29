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
  useMapStore,
  type LayoutMode,
  type ViewMode,
  type PresetName,
} from "@/stores/mapStore";

export interface KioskSceneMapConfig {
  layoutMode: LayoutMode;
  viewMode?: ViewMode;
  preset?: PresetName;
  autoRotate?: boolean;
}

export interface KioskScene {
  id: string;
  name: string;
  /** App route this scene displays (must be one of KIOSK_ROUTES) */
  route: string;
  /** Map side effects, only meaningful when route is /map */
  map?: KioskSceneMapConfig;
}

/** Minimum alert priority that interrupts the rotation */
export type BreakInLevel = "CRITICAL" | "WARNING" | "off";

/** Routes a scene may point at (kiosk-safe: no auth flows, no editors) */
export const KIOSK_ROUTES: ReadonlyArray<{ route: string; label: string }> = [
  { route: "/map", label: "PropSphere Map" },
  { route: "/", label: "Dashboard" },
  { route: "/solar", label: "Solar Weather" },
  { route: "/dx", label: "DX Wizard" },
  { route: "/atmos", label: "AtmosPulse" },
  { route: "/satellites", label: "Satellites" },
];

const MIN_INTERVAL_SEC = 15;
const MAX_INTERVAL_SEC = 3600;

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
];

interface KioskStore {
  scenes: KioskScene[];
  rotation: { enabled: boolean; intervalSec: number };
  breakInLevel: BreakInLevel;
  active: boolean;
  activeSceneId: string | null;

  addScene: (scene: Omit<KioskScene, "id">) => KioskScene;
  updateScene: (id: string, patch: Partial<Omit<KioskScene, "id">>) => void;
  /** Removes a scene; the last remaining scene cannot be removed */
  removeScene: (id: string) => void;
  setRotation: (rotation: Partial<KioskStore["rotation"]>) => void;
  setBreakInLevel: (level: BreakInLevel) => void;

  /** Enter kiosk mode, optionally at a specific scene */
  start: (sceneId?: string) => KioskScene | null;
  /** Leave kiosk mode */
  stop: () => void;
  /** Step to the next/previous scene; returns the new scene */
  advance: (direction: 1 | -1) => KioskScene | null;
  getActiveScene: () => KioskScene | null;
}

/**
 * Apply a scene's map side effects. Callers navigate to `scene.route`
 * themselves (navigation needs the router; stores must stay router-free).
 */
export function applySceneToMap(scene: KioskScene): void {
  if (scene.route !== "/map" || !scene.map) return;
  const map = useMapStore.getState();
  map.setLayoutMode(scene.map.layoutMode);
  if (scene.map.viewMode) map.setViewMode(scene.map.viewMode);
  if (scene.map.preset) map.applyPreset(scene.map.preset);
  if (scene.map.autoRotate !== undefined) {
    map.setAutoRotate(scene.map.autoRotate);
  }
}

function clampInterval(sec: number): number {
  if (!Number.isFinite(sec)) return 120;
  return Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(sec)));
}

export const useKioskStore = create<KioskStore>()(
  persist(
    (set, get) => ({
      scenes: DEFAULT_SCENES,
      rotation: { enabled: true, intervalSec: 120 },
      breakInLevel: "CRITICAL",
      active: false,
      activeSceneId: null,

      addScene: (scene) => {
        const created: KioskScene = { ...scene, id: crypto.randomUUID() };
        set((state) => ({ scenes: [...state.scenes, created] }));
        return created;
      },

      updateScene: (id, patch) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === id ? { ...s, ...patch, id } : s,
          ),
        })),

      removeScene: (id) =>
        set((state) => {
          if (state.scenes.length <= 1) return state;
          const scenes = state.scenes.filter((s) => s.id !== id);
          return {
            scenes,
            activeSceneId:
              state.activeSceneId === id
                ? (scenes[0]?.id ?? null)
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

      start: (sceneId) => {
        const { scenes } = get();
        if (scenes.length === 0) return null;
        const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0];
        set({ active: true, activeSceneId: scene.id });
        return scene;
      },

      stop: () => set({ active: false }),

      advance: (direction) => {
        const { scenes, activeSceneId } = get();
        if (scenes.length === 0) return null;
        const currentIndex = scenes.findIndex((s) => s.id === activeSceneId);
        const nextIndex =
          (currentIndex + direction + scenes.length) % scenes.length;
        const scene = scenes[nextIndex];
        set({ activeSceneId: scene.id });
        return scene;
      },

      getActiveScene: () => {
        const { scenes, activeSceneId } = get();
        return scenes.find((s) => s.id === activeSceneId) ?? null;
      },
    }),
    {
      name: "propulse-kiosk",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as KioskStore;
      },
    },
  ),
);
