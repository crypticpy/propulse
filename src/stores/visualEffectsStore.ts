import { create } from "zustand";

export type VisualEffectsLevel = "off" | "subtle" | "full";
export type VisualEffect = "celebrations" | "animatedBadges" | "particles" | "glow";
export interface VisualEffectsPreferences {
  level: VisualEffectsLevel;
  celebrations: boolean;
  animatedBadges: boolean;
  particles: boolean;
  glow: boolean;
}

export const VISUAL_EFFECTS_STORAGE_KEY = "propulse-visual-effects";
export const DEFAULT_VISUAL_EFFECTS: Readonly<VisualEffectsPreferences> = Object.freeze({
  level: "subtle",
  celebrations: true,
  animatedBadges: true,
  particles: true,
  glow: true,
});
const effects: VisualEffect[] = ["celebrations", "animatedBadges", "particles", "glow"];
const levels = ["off", "subtle", "full"];

function parse(raw: string | null): VisualEffectsPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    const state = value?.state;
    if (
      value?.version === 1 &&
      Object.keys(value).length === 2 &&
      state && typeof state === "object" && !Array.isArray(state) &&
      Object.keys(state).length === 5 &&
      levels.includes(state.level) &&
      effects.every((effect) => typeof state[effect] === "boolean")
    ) {
      return {
        level: state.level,
        celebrations: state.celebrations,
        animatedBadges: state.animatedBadges,
        particles: state.particles,
        glow: state.glow,
      };
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
  reset: () => void;
  retryPersistence: () => void;
}

/** Device-local choices only. Presets cap effects without erasing saved toggles. */
export const useVisualEffectsStore = create<VisualEffectsState>((set, get) => {
  const save = (patch: Partial<VisualEffectsPreferences>) => {
    set(patch);
    const { level, celebrations, animatedBadges, particles, glow } = get();
    try {
      localStorage.setItem(VISUAL_EFFECTS_STORAGE_KEY, JSON.stringify({
        version: 1,
        state: { level, celebrations, animatedBadges, particles, glow },
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
    reset: () => save({ ...DEFAULT_VISUAL_EFFECTS }),
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
