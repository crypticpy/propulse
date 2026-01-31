/**
 * Zustand store for user preferences and station configuration
 * Persists to localStorage with key 'propulse-user'
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserStation, UserPreferences } from "../types/user";

/**
 * User store state and actions
 */
interface UserStore {
  /** Current station configuration, null if not set up */
  station: UserStation | null;
  /** User preferences for display and behavior */
  preferences: Omit<UserPreferences, "station">;
  /** Set or clear the station configuration */
  setStation: (station: UserStation | null) => void;
  /** Partially update user preferences */
  updatePreferences: (prefs: Partial<Omit<UserPreferences, "station">>) => void;
  /** Reset all preferences to defaults */
  resetPreferences: () => void;
}

/**
 * Default preference values
 */
const defaultPreferences: Omit<UserPreferences, "station"> = {
  units: "imperial",
  timeFormat: "12h",
  theme: "dark",
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

      setStation: (station) => set({ station }),

      updatePreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      resetPreferences: () =>
        set({
          station: null,
          preferences: defaultPreferences,
        }),
    }),
    {
      name: "propulse-user",
      version: 1,
      partialize: (state) => ({
        station: state.station,
        preferences: state.preferences,
      }),
    },
  ),
);
