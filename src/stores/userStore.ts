/**
 * Zustand store for user preferences and station configuration
 * Persists to localStorage with key 'propulse-user'
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  UserStation,
  UserPreferences,
  ITURegion,
  LicenseClass,
} from "../types/user";

/** User experience level */
export type ExperienceLevel = "beginner" | "intermediate" | "expert";

/** UI complexity mode */
export type UIMode = "beginner" | "normal" | "expert";
import type { UserRadio, RadioEquipment } from "../types/radio";
import { getRadioById } from "../lib/data/radios";

/**
 * Saved target location for quick access
 */
export interface SavedTarget {
  id: string;
  name: string;
  lat: number;
  lon: number;
  grid?: string;
  createdAt: string;
}

/** Maximum number of saved targets allowed */
const MAX_SAVED_TARGETS = 10;

/** Maximum number of radios allowed */
const MAX_RADIOS = 10;

/**
 * User store state and actions
 */
interface UserStore {
  /** Current station configuration, null if not set up */
  station: UserStation | null;
  /** User preferences for display and behavior */
  preferences: Omit<UserPreferences, "station">;
  /** Saved target locations for quick access (max 10) */
  savedTargets: SavedTarget[];
  /** Get current UI mode from preferences */
  getUIMode: () => UIMode;
  /** Set or clear the station configuration */
  setStation: (station: UserStation | null) => void;
  /** Partially update user preferences */
  updatePreferences: (prefs: Partial<Omit<UserPreferences, "station">>) => void;
  /** Reset all preferences to defaults */
  resetPreferences: () => void;
  /** Add a new saved target (max 10, oldest removed if full) */
  addTarget: (target: Omit<SavedTarget, "id" | "createdAt">) => void;
  /** Remove a saved target by ID */
  removeTarget: (id: string) => void;
  /** Clear all saved targets */
  clearTargets: () => void;
  /** Set ITU region for band plan compliance */
  setITURegion: (region: ITURegion) => void;
  /** Set license class for privilege checks */
  setLicenseClass: (licenseClass: LicenseClass) => void;
  /** Add a radio to the user's collection */
  addRadio: (radioId: string, nickname?: string) => void;
  /** Remove a radio from the user's collection */
  removeRadio: (radioId: string) => void;
  /** Set the active radio */
  setActiveRadio: (radioId: string | null) => void;
  /** Get the active radio equipment details */
  getActiveRadio: () => RadioEquipment | null;
  /** Set user's experience level */
  setExperienceLevel: (level: ExperienceLevel) => void;
  /** Mark onboarding as completed */
  setHasCompletedOnboarding: (completed: boolean) => void;
  /** Set UI complexity mode */
  setUIMode: (mode: UIMode) => void;
}

/**
 * Default preference values
 */
const defaultPreferences: Omit<UserPreferences, "station"> = {
  units: "imperial",
  timeFormat: "12h",
  theme: "dark",
  ituRegion: "ITU2",
  licenseClass: "GENERAL",
  radios: [],
  activeRadioId: null,
  experienceLevel: "intermediate",
  hasCompletedOnboarding: false,
  uiMode: "normal",
};

/**
 * User preferences store with localStorage persistence
 *
 * @example
 * ```tsx
 * const { station, setStation } = useUserStore();
 *
 * // Set user's station
 * setStation({
 *   callsign: 'N5XXX',
 *   grid: 'EM10fp',
 *   lat: 30.2672,
 *   lon: -97.7431,
 *   name: 'Home'
 * });
 *
 * // Update preferences
 * updatePreferences({ theme: 'light', timeFormat: '24h' });
 * ```
 */
export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      station: null,
      preferences: defaultPreferences,
      savedTargets: [],

      // Get UI mode from preferences
      getUIMode: () => get().preferences.uiMode || "normal",

      setStation: (station) => set({ station }),

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      resetPreferences: () =>
        set({
          station: null,
          preferences: defaultPreferences,
          savedTargets: [],
        }),

      addTarget: (target) =>
        set((state) => {
          const newTarget: SavedTarget = {
            ...target,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
          };
          // Add to beginning, enforce max limit by removing oldest
          const updated = [newTarget, ...state.savedTargets];
          if (updated.length > MAX_SAVED_TARGETS) {
            updated.pop();
          }
          return { savedTargets: updated };
        }),

      removeTarget: (id) =>
        set((state) => ({
          savedTargets: state.savedTargets.filter((t) => t.id !== id),
        })),

      clearTargets: () => set({ savedTargets: [] }),

      setITURegion: (region) =>
        set((state) => ({
          preferences: { ...state.preferences, ituRegion: region },
        })),

      setLicenseClass: (licenseClass) =>
        set((state) => ({
          preferences: { ...state.preferences, licenseClass },
        })),

      addRadio: (radioId, nickname) =>
        set((state) => {
          const currentRadios = state.preferences.radios || [];
          // Check if already added
          if (currentRadios.some((r) => r.radioId === radioId)) {
            return state;
          }
          // Enforce max limit
          if (currentRadios.length >= MAX_RADIOS) {
            return state;
          }
          const newRadio: UserRadio = {
            radioId,
            nickname,
            addedAt: new Date().toISOString(),
          };
          const updatedRadios = [...currentRadios, newRadio];
          // If this is the first radio, make it active
          const activeRadioId =
            state.preferences.activeRadioId ||
            (updatedRadios.length === 1 ? radioId : null);
          return {
            preferences: {
              ...state.preferences,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        }),

      removeRadio: (radioId) =>
        set((state) => {
          const currentRadios = state.preferences.radios || [];
          const updatedRadios = currentRadios.filter(
            (r) => r.radioId !== radioId,
          );
          // If we removed the active radio, select the first available
          const activeRadioId =
            state.preferences.activeRadioId === radioId
              ? updatedRadios.length > 0
                ? updatedRadios[0].radioId
                : null
              : state.preferences.activeRadioId;
          return {
            preferences: {
              ...state.preferences,
              radios: updatedRadios,
              activeRadioId,
            },
          };
        }),

      setActiveRadio: (radioId) =>
        set((state) => ({
          preferences: { ...state.preferences, activeRadioId: radioId },
        })),

      getActiveRadio: () => {
        // Note: This returns null as a placeholder. Use the useActiveRadio hook instead.
        return null;
      },

      setExperienceLevel: (level) =>
        set((state) => ({
          preferences: { ...state.preferences, experienceLevel: level },
        })),

      setHasCompletedOnboarding: (completed) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            hasCompletedOnboarding: completed,
          },
        })),

      setUIMode: (mode) =>
        set((state) => ({
          preferences: { ...state.preferences, uiMode: mode },
        })),
    }),
    {
      name: "propulse-user",
      version: 4,
      partialize: (state) => ({
        station: state.station,
        preferences: state.preferences,
        savedTargets: state.savedTargets,
      }),
    },
  ),
);

/**
 * Hook to get the active radio equipment details
 * Returns null if no radio is active or the radio isn't found
 */
export function useActiveRadio(): RadioEquipment | null {
  const activeRadioId = useUserStore(
    (state) => state.preferences.activeRadioId,
  );
  if (!activeRadioId) return null;
  return getRadioById(activeRadioId) || null;
}

/**
 * Hook to get all user's radios with their equipment details
 */
export function useUserRadios(): Array<{
  userRadio: UserRadio;
  equipment: RadioEquipment | undefined;
}> {
  const radios = useUserStore((state) => state.preferences.radios) || [];
  return radios.map((userRadio) => ({
    userRadio,
    equipment: getRadioById(userRadio.radioId),
  }));
}
