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

/**
 * Credentials for QSL confirmation services
 */
export interface ServiceCredentials {
  eqsl?: { username: string; password: string };
  clublog?: { email: string; password: string; callsign: string };
  qrz?: { apiKey: string };
  lotw?: { enabled: boolean };
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
  /** Credentials for QSL services (eQSL, Club Log, etc.) */
  serviceCredentials: ServiceCredentials;
  /** Set or clear the station configuration */
  setStation: (station: UserStation | null) => void;
  /** Update service credentials */
  setServiceCredentials: (creds: Partial<ServiceCredentials>) => void;
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
  /** Add a custom radio equipment definition (returns false if duplicate name) */
  addCustomRadio: (radio: Omit<RadioEquipment, "id">) =>
    | {
        ok: true;
        id: string;
      }
    | { ok: false; error: string };
  /** Update a custom radio equipment definition */
  updateCustomRadio: (
    id: string,
    updates: Partial<Omit<RadioEquipment, "id">>,
  ) => { ok: true } | { ok: false; error: string };
  /** Remove a custom radio equipment definition */
  removeCustomRadio: (id: string) => void;
  /** Remove a radio from the user's collection */
  removeRadio: (radioId: string) => void;
  /** Set the active radio */
  setActiveRadio: (radioId: string | null) => void;
  /** Get the active radio equipment details */
  getActiveRadio: () => RadioEquipment | null;
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
  customRadios: [],
  activeRadioId: null,
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
      serviceCredentials: {},

      setStation: (station) => set({ station }),

      setServiceCredentials: (creds) =>
        set((state) => ({
          serviceCredentials: { ...state.serviceCredentials, ...creds },
        })),

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

      addCustomRadio: (radio) => {
        const id = `custom-${crypto.randomUUID()}`;
        const displayName = radio.displayName?.trim();
        if (!displayName) {
          return { ok: false, error: "Custom radio name is required" };
        }

        let result: { ok: true; id: string } | { ok: false; error: string } = {
          ok: true,
          id,
        };

        set((state) => {
          const existing = state.preferences.customRadios || [];
          const normalized = displayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r) => (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${displayName}" already exists`,
            };
            return state;
          }

          const nextCustom = [
            ...existing,
            {
              ...radio,
              id,
              displayName,
            },
          ];

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
            },
          };
        });

        return result;
      },

      updateCustomRadio: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const existing = state.preferences.customRadios || [];
          const idx = existing.findIndex((r) => r.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Custom radio not found" };
            return state;
          }

          const nextDisplayName =
            typeof updates.displayName === "string"
              ? updates.displayName.trim()
              : existing[idx].displayName;

          if (!nextDisplayName) {
            result = { ok: false, error: "Custom radio name is required" };
            return state;
          }

          const normalized = nextDisplayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r, i) =>
              i !== idx &&
              (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${nextDisplayName}" already exists`,
            };
            return state;
          }

          const nextCustom = existing.map((r, i) =>
            i === idx ? { ...r, ...updates, displayName: nextDisplayName } : r,
          );

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
            },
          };
        });

        return result;
      },

      removeCustomRadio: (id) =>
        set((state) => {
          const existing = state.preferences.customRadios || [];
          const nextCustom = existing.filter((r) => r.id !== id);

          const currentRadios = state.preferences.radios || [];
          const updatedRadios = currentRadios.filter((r) => r.radioId !== id);
          const activeRadioId =
            state.preferences.activeRadioId === id
              ? updatedRadios.length > 0
                ? updatedRadios[0].radioId
                : null
              : state.preferences.activeRadioId;

          return {
            preferences: {
              ...state.preferences,
              customRadios: nextCustom,
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
    }),
    {
      name: "propulse-user",
      version: 5,
      partialize: (state) => ({
        station: state.station,
        preferences: state.preferences,
        savedTargets: state.savedTargets,
        serviceCredentials: state.serviceCredentials,
      }),
    },
  ),
);

function resolveEquipmentById(
  id: string,
  customRadios: RadioEquipment[] | undefined,
): RadioEquipment | undefined {
  const custom = customRadios?.find((r) => r.id === id);
  return custom ?? getRadioById(id);
}

/**
 * Hook to get the active radio equipment details
 * Returns null if no radio is active or the radio isn't found
 */
export function useActiveRadio(): RadioEquipment | null {
  const activeRadioId = useUserStore(
    (state) => state.preferences.activeRadioId,
  );
  const customRadios = useUserStore((state) => state.preferences.customRadios);
  if (!activeRadioId) return null;
  return resolveEquipmentById(activeRadioId, customRadios) || null;
}

/**
 * Hook to get all user's radios with their equipment details
 */
export function useUserRadios(): Array<{
  userRadio: UserRadio;
  equipment: RadioEquipment | undefined;
}> {
  const radios = useUserStore((state) => state.preferences.radios) || [];
  const customRadios = useUserStore((state) => state.preferences.customRadios);
  return radios.map((userRadio) => ({
    userRadio,
    equipment: resolveEquipmentById(userRadio.radioId, customRadios),
  }));
}
