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
    (set) => ({
      station: null,
      preferences: defaultPreferences,
      savedTargets: [],

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
    }),
    {
      name: "propulse-user",
      version: 2,
      partialize: (state) => ({
        station: state.station,
        preferences: state.preferences,
        savedTargets: state.savedTargets,
      }),
    },
  ),
);
