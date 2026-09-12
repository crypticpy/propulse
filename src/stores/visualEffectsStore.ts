import { create } from "zustand";

export type VisualEffectsLevel = "off" | "subtle" | "full";
export type VisualEffect = "celebrations" | "animatedBadges" | "particles" | "glow";
export type RankPresentationModule = "showRankBadge" | "showAchievements";

export interface VisualEffectsPreferences {
  level: VisualEffectsLevel;
  celebrations: boolean;
  animatedBadges: boolean;
  particles: boolean;
  glow: boolean;
  showRankBadge: boolean;
  showAchievements: boolean;
}

export const VISUAL_EFFECTS_STORAGE_KEY = "propulse-visual-effects";
export const DEFAULT_VISUAL_EFFECTS: Readonly<VisualEffectsPreferences> = Object.freeze({
  level: "subtle",
  celebrations: true,
  animatedBadges: true,
  particles: true,
  glow: true,
  showRankBadge: true,
  showAchievements: true,
});
const effects: VisualEffect[] = ["celebrations", "animatedBadges", "particles", "glow"];
const presentation: RankPresentationModule[] = ["showRankBadge", "showAchievements"];
const levels = ["off", "subtle", "full"];

function parseV1(state: Record<string, unknown>): VisualEffectsPreferences | null {
  if (
    Object.keys(state).length === 5 &&
    levels.includes(state.level as string) &&
    effects.every((effect) => typeof state[effect] === "boolean")
  ) {
    return {
      level: state.level as VisualEffectsLevel,
      celebrations: state.celebrations as boolean,
      animatedBadges: state.animatedBadges as boolean,
      particles: state.particles as boolean,
      glow: state.glow as boolean,
      showRankBadge: true,
      showAchievements: true,
    };
  }
  return null;
}

function parseV2(state: Record<string, unknown>): VisualEffectsPreferences | null {
  if (
    Object.keys(state).length === 7 &&
    levels.includes(state.level as string) &&
    effects.every((effect) => typeof state[effect] === "boolean") &&
    presentation.every((module) => typeof state[module] === "boolean")
  ) {
    return {
      level: state.level as VisualEffectsLevel,
      celebrations: state.celebrations as boolean,
      animatedBadges: state.animatedBadges as boolean,
      particles: state.particles as boolean,
      glow: state.glow as boolean,
      showRankBadge: state.showRankBadge as boolean,
      showAchievements: state.showAchievements as boolean,
    };
  }
  return null;
}

function parse(raw: string | null): VisualEffectsPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    const state = value?.state;
    if (value && typeof value === "object" && state && typeof state === "object" && !Array.isArray(state)) {
      if (value.version === 2 && Object.keys(value).length === 2) {
        const parsed = parseV2(state as Record<string, unknown>);
        if (parsed) return parsed;
      }
      if (value.version === 1 && Object.keys(value).length === 2) {
        const parsed = parseV1(state as Record<string, unknown>);
        if (parsed) return parsed;
      }
    }
  } catch { /* Unavailable or malformed local preferences use calm defaults. */ }
  return { ...DEFAULT_VISUAL_EFFECTS };
}

function load() {
  try {
    return { ...parse(localStorage.getItem(VISUAL_EFFECTS_STORAGE_KEY)), persistenceAvailable: true };
  } catch {
    return { ...DEFAULT_VISUAL_EFFECTS, persistenceAvailable: false };
  }
}

interface VisualEffectsState extends VisualEffectsPreferences {
  persistenceAvailable: boolean;
  setLevel: (level: VisualEffectsLevel) => void;
  setEffect: (effect: VisualEffect, enabled: boolean) => void;
  setPresentation: (module: RankPresentationModule, visible: boolean) => void;
  reset: () => void;
  resetPresentation: () => void;
  retryPersistence: () => void;
}

/** Device-local choices only. Presets cap effects without erasing saved toggles. */
export const useVisualEffectsStore = create<VisualEffectsState>((set, get) => {
  const save = (patch: Partial<VisualEffectsPreferences>) => {
    set(patch);
    const {
      level,
      celebrations,
      animatedBadges,
      particles,
      glow,
      showRankBadge,
      showAchievements,
    } = get();
    try {
      localStorage.setItem(VISUAL_EFFECTS_STORAGE_KEY, JSON.stringify({
        version: 2,
        state: {
          level,
          celebrations,
          animatedBadges,
          particles,
          glow,
          showRankBadge,
          showAchievements,
        },
      }));
      set({ persistenceAvailable: true });
    } catch {
      // Settings remain usable for this session if storage is blocked.
      set({ persistenceAvailable: false });
    }
  };
  return {
    ...load(),
    setLevel: (level) => { if (levels.includes(level)) save({ level }); },
    setEffect: (effect, enabled) => {
      if (effects.includes(effect) && typeof enabled === "boolean") {
        save({ [effect]: enabled });
      }
    },
    setPresentation: (module, visible) => {
      if (presentation.includes(module) && typeof visible === "boolean") {
        save({ [module]: visible });
      }
    },
    reset: () => save({
      level: DEFAULT_VISUAL_EFFECTS.level,
      celebrations: DEFAULT_VISUAL_EFFECTS.celebrations,
      animatedBadges: DEFAULT_VISUAL_EFFECTS.animatedBadges,
      particles: DEFAULT_VISUAL_EFFECTS.particles,
      glow: DEFAULT_VISUAL_EFFECTS.glow,
    }),
    resetPresentation: () => save({
      showRankBadge: DEFAULT_VISUAL_EFFECTS.showRankBadge,
      showAchievements: DEFAULT_VISUAL_EFFECTS.showAchievements,
    }),
    retryPersistence: () => save({}),
  };
});

if (typeof window !== "undefined") {
  const sync = (event: StorageEvent) => {
    if (event.key !== null && event.key !== VISUAL_EFFECTS_STORAGE_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== localStorage) return;
    } catch { return; }
    // Never write back: a storage event must not create cross-tab echo loops.
    useVisualEffectsStore.setState(parse(event.key === null ? null : event.newValue));
  };
  window.addEventListener("storage", sync);
  import.meta.hot?.dispose(() => window.removeEventListener("storage", sync));
}
